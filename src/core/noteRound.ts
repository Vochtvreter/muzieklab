/**
 * Read notes rounds (DESIGN.md §3.5): the settings, the seeded note generator, judging one answer, and the round's
 * score, weak spots and XP. Pure: the UI passes in the seed, the saved weak spots and the answers.
 */
import {
  CLEFS,
  KEY_IDS,
  KEYS,
  RANGES,
  isLine,
  keyAlter,
  letterOf,
  pitchClass,
  rangeSteps,
  signShown,
  type Alter,
  type Clef,
  type KeyId,
  type Letter,
  type Range,
  type Step,
} from './pitch';
import { Rng } from './rng';

export type NoteInput = 'names' | 'piano' | 'mixed';
export type Extras = 'none' | 'sharps' | 'both';
export type NoteTimer = 0 | 5 | 3;

export interface NoteSettings {
  /** At least one. */
  clefs: Clef[];
  /** At least one; only the first counts unless `mixKeys`. */
  keys: KeyId[];
  mixKeys: boolean;
  input: NoteInput;
  range: Range;
  extras: Extras;
  /** Notes per round, 10–50. */
  count: number;
  /** Seconds per note; 0 = off. */
  timer: NoteTimer;
}

export const DEFAULT_NOTE_SETTINGS: NoteSettings = {
  clefs: ['treble', 'bass'],
  keys: ['C'],
  mixKeys: false,
  input: 'names',
  range: 'staff',
  extras: 'none',
  count: 20,
  timer: 0,
};

export const NOTE_INPUTS: readonly NoteInput[] = ['names', 'piano', 'mixed'];
export const EXTRAS: readonly Extras[] = ['none', 'sharps', 'both'];
export const NOTE_TIMERS: readonly NoteTimer[] = [0, 5, 3];
export const MIN_NOTES = 10;
export const MAX_NOTES = 50;
/** A new key every 5 notes in a Mix keys round; the clef stays for at least 4 notes in a two-clef round. */
export const KEY_RUN = 5;
export const MIN_CLEF_RUN = 4;
/** Mixed input alternates names and piano every 5 notes. */
export const INPUT_RUN = 5;
/** Share of notes that carry an extra sign when Extra sharps and flats is on. */
const EXTRA_SHARE = 0.25;
/** An answer slower than this is "slow" on the summary (and the note comes back more often). */
export const SLOW_MS = 3000;

/** The keys a round uses: all chosen ones with Mix keys, else the first. */
export function roundKeys(s: NoteSettings): KeyId[] {
  return s.mixKeys ? s.keys : s.keys.slice(0, 1);
}

/** A stored or edited NoteSettings object, repaired field by field. */
export function sanitizeNoteSettings(raw: unknown): NoteSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const d = DEFAULT_NOTE_SETTINGS;
  const list = <T extends string>(x: unknown, options: readonly T[]): T[] => (Array.isArray(x) ? options.filter((o) => x.includes(o)) : []);
  const clefs = list(v.clefs, CLEFS);
  // Keep the player's order of keys (the first one is the "one key").
  const keys = Array.isArray(v.keys) ? [...new Set(v.keys.filter((x): x is KeyId => (KEY_IDS as readonly unknown[]).includes(x)))] : [];
  const one = <T>(x: unknown, options: readonly T[], def: T): T => (options.includes(x as T) ? (x as T) : def);
  const count = typeof v.count === 'number' && Number.isFinite(v.count) ? Math.round(Math.min(MAX_NOTES, Math.max(MIN_NOTES, v.count))) : d.count;
  return {
    clefs: clefs.length ? clefs : [...d.clefs],
    keys: keys.length ? keys : [...d.keys],
    mixKeys: typeof v.mixKeys === 'boolean' ? v.mixKeys : d.mixKeys,
    input: one(v.input, NOTE_INPUTS, d.input),
    range: one(v.range, RANGES, d.range),
    extras: one(v.extras, EXTRAS, d.extras),
    count,
    timer: one(v.timer, NOTE_TIMERS, d.timer),
  };
}

export interface RoundNote {
  clef: Clef;
  key: KeyId;
  step: Step;
  /** The full written name's sign (the key signature's included). */
  alter: Alter;
  /** The sign drawn next to the note, or null (the key signature says it, or there is none). */
  sign: Alter | null;
  /** How this note is answered when the round is mixed; otherwise the round's input. */
  input: 'names' | 'piano';
}

/** A note position in one clef: the unit of weak spots ("E on the top space"). */
export const noteId = (clef: Clef, step: Step): string => `${clef}:${step}`;

export function parseNoteId(id: string): { clef: Clef; step: Step } | null {
  const m = /^(treble|bass):(\d{1,2})$/.exec(id);
  return m ? { clef: m[1] as Clef, step: Number(m[2]) } : null;
}

/** Weak-spot weights per note id, 0–5: more often in the next rounds. */
export type WeakSpots = Record<string, number>;
export const MAX_WEAK = 5;

/** Runs of `run` items cycling through `items` in a shuffled order, never the same item twice in a row. */
function cycle<T>(rng: Rng, items: readonly T[], total: number, run: number): T[] {
  const out: T[] = [];
  let order = rng.shuffle(items);
  let at = 0;
  let last: T | undefined;
  while (out.length < total) {
    if (at >= order.length) {
      order = rng.shuffle(items);
      at = 0;
      if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
    }
    const item = order[at++];
    last = item;
    for (let i = 0; i < run && out.length < total; i++) out.push(item);
  }
  return out;
}

/** The clef per note: one clef, or runs of 4–6 notes that alternate (a visible clef change each time). */
function clefPlan(rng: Rng, clefs: Clef[], total: number): Clef[] {
  if (clefs.length < 2) return Array.from({ length: total }, () => clefs[0] ?? 'treble');
  const out: Clef[] = [];
  let clef: Clef = rng.pick(CLEFS);
  while (out.length < total) {
    const run = MIN_CLEF_RUN + rng.int(3);
    for (let i = 0; i < run && out.length < total; i++) out.push(clef);
    clef = clef === 'treble' ? 'bass' : 'treble';
  }
  return out;
}

/** The note's sign: the key signature's, or (with extra signs on, now and then) one step up or down from it. */
function pickAlter(rng: Rng, key: KeyId, letter: Letter, extras: Extras): Alter {
  const base = keyAlter(key, letter);
  if (extras === 'none' || !rng.chance(EXTRA_SHARE)) return base;
  const options: Alter[] = [];
  if (base < 1) options.push((base + 1) as Alter); // ♯ on a plain note, ♮ on a flattened one
  if (extras === 'both' && base > -1) options.push((base - 1) as Alter); // ♭ on a plain note, ♮ on a sharpened one
  return options.length ? rng.pick(options) : base;
}

/**
 * A round of notes (§3.5): drawn from the allowed positions, spelled in the key, with no immediate repeats and at most
 * two moves the same way in a row. Weak spots (and `focus`, for *Practice missed notes*) come up more often.
 */
export function generateRound(s: NoteSettings, seed: number, weak: WeakSpots = {}, focus: string[] = []): RoundNote[] {
  const rng = new Rng(seed);
  const total = Math.max(1, Math.round(s.count));
  const keys = cycle(rng, roundKeys(s), total, KEY_RUN);
  const clefs = clefPlan(rng, s.clefs.length ? s.clefs : ['treble'], total);
  const focusSet = new Set(focus);
  const notes: RoundNote[] = [];
  let prev: Step | null = null;
  let dirs: number[] = [];
  for (let i = 0; i < total; i++) {
    const clef = clefs[i];
    const key = keys[i];
    if (i > 0 && clefs[i - 1] !== clef) {
      prev = null;
      dirs = [];
    }
    const all = rangeSteps(clef, s.range);
    const sameWay = dirs.length >= 2 && dirs[dirs.length - 1] === dirs[dirs.length - 2] ? dirs[dirs.length - 1] : 0;
    let options = all.filter((st) => st !== prev && !(prev !== null && sameWay !== 0 && Math.sign(st - prev) === sameWay));
    if (options.length === 0) options = all.filter((st) => st !== prev);
    const weights = options.map((st) => {
      const id = noteId(clef, st);
      return (1 + Math.min(MAX_WEAK, weak[id] ?? 0)) * (focusSet.has(id) ? 8 : 1);
    });
    const step = options[Math.max(0, rng.weighted(weights))];
    if (prev !== null) dirs.push(Math.sign(step - prev));
    prev = step;
    const alter = pickAlter(rng, key, letterOf(step), s.extras);
    const input = s.input === 'mixed' ? (Math.floor(i / INPUT_RUN) % 2 === 0 ? 'names' : 'piano') : s.input;
    notes.push({ clef, key, step, alter, sign: signShown(key, { step, alter }), input });
  }
  return notes;
}

// --- Answers ---------------------------------------------------------------------------------------------------

/** A name (letter + sign) or a piano key (pitch class). */
export type Given = { kind: 'name'; letter: Letter; alter: Alter } | { kind: 'piano'; pc: number };

export type Outcome = 'right' | 'hinted' | 'wrong' | 'timeout';

export interface NoteAnswer {
  outcome: Outcome;
  /** Response time in ms (the time limit for a timeout). */
  ms: number;
  given: Given | null;
}

/** Why an answer was wrong, for the feedback line. */
export type Miss = 'none' | 'keySign' | 'noteSign' | 'extraSign' | 'letter';

/**
 * Names need the written spelling: right letter with the wrong sign is wrong, and F♯ is not a written G♭. The piano
 * plays a pitch, so either name of a black key (and B for a written C♭) is right.
 */
export function isRight(note: RoundNote, given: Given): boolean {
  if (given.kind === 'piano') return given.pc === pitchClass(letterOf(note.step), note.alter);
  return given.letter === letterOf(note.step) && given.alter === note.alter;
}

/** What went wrong: the letter, a sign the key signature gives, a sign next to the note, or a sign that is not there. */
export function missKind(note: RoundNote, given: Given): Miss {
  if (isRight(note, given)) return 'none';
  if (given.kind === 'piano') {
    // The natural key of the right letter: the sign (from the key or next to the note) was not played.
    if (given.pc === pitchClass(letterOf(note.step), 0) && note.alter !== 0) return note.sign !== null ? 'noteSign' : 'keySign';
    return 'letter';
  }
  if (given.letter !== letterOf(note.step)) return 'letter';
  if (note.sign !== null) return 'noteSign';
  if (note.alter !== 0) return 'keySign';
  return 'extraSign';
}

// --- The round's score -----------------------------------------------------------------------------------------

/** ★ ≥ 70% · ★★ ≥ 85% · ★★★ ≥ 95% with an average under 2 s (§3.5, starting values). */
export function noteStars(accuracy: number, avgMs: number): 0 | 1 | 2 | 3 {
  if (accuracy >= 95 && avgMs < 2000) return 3;
  if (accuracy >= 85) return 2;
  if (accuracy >= 70) return 1;
  return 0;
}

export interface NoteChip {
  id: string;
  clef: Clef;
  step: Step;
  alter: Alter;
  /** Misses of this note, or the slowest right answer's time. */
  count: number;
  ms: number;
}

export type SignGroup = 'key' | 'extra' | 'plain';

export interface RoundResult {
  /** Notes answered (a round ended early counts only those). */
  total: number;
  right: number;
  hinted: number;
  wrong: number;
  /** Right without a hint, in % of the notes answered. */
  accuracy: number;
  avgMs: number;
  stars: 0 | 1 | 2 | 3;
  missed: NoteChip[];
  slow: NoteChip[];
  bySign: { group: SignGroup; right: number; total: number }[];
  /** Misses that had the right letter but not the key signature's sign. */
  keySignMisses: number;
}

/** The sign group a note is in: a sign from the key signature, a sign next to the note, or no sign at all. */
export function signGroup(n: RoundNote): SignGroup {
  if (n.sign !== null) return 'extra';
  return n.alter !== 0 ? 'key' : 'plain';
}

export function scoreRound(notes: RoundNote[], answers: NoteAnswer[]): RoundResult {
  const done = answers.slice(0, notes.length);
  const total = done.length;
  const count = (o: Outcome) => done.filter((a) => a.outcome === o).length;
  const right = count('right');
  const hinted = count('hinted');
  const accuracy = total ? (right / total) * 100 : 0;
  const avgMs = total ? done.reduce((s, a) => s + a.ms, 0) / total : 0;

  const missed = new Map<string, NoteChip>();
  const slow = new Map<string, NoteChip>();
  let keySignMisses = 0;
  const groups: Record<SignGroup, { right: number; total: number }> = { key: { right: 0, total: 0 }, extra: { right: 0, total: 0 }, plain: { right: 0, total: 0 } };
  done.forEach((a, i) => {
    const n = notes[i];
    const id = `${noteId(n.clef, n.step)}:${n.alter}`;
    const chip = (): NoteChip => ({ id, clef: n.clef, step: n.step, alter: n.alter, count: 0, ms: 0 });
    const g = groups[signGroup(n)];
    g.total++;
    if (a.outcome === 'right') g.right++;
    if (a.outcome === 'wrong' || a.outcome === 'timeout') {
      const c = missed.get(id) ?? chip();
      c.count++;
      missed.set(id, c);
      if (a.given && missKind(n, a.given) === 'keySign') keySignMisses++;
    } else if (a.outcome === 'right' && a.ms > SLOW_MS) {
      const c = slow.get(id) ?? chip();
      c.count++;
      c.ms = Math.max(c.ms, a.ms);
      slow.set(id, c);
    }
  });
  const order: SignGroup[] = ['key', 'extra', 'plain'];
  return {
    total,
    right,
    hinted,
    wrong: total - right - hinted,
    accuracy,
    avgMs,
    stars: total ? noteStars(accuracy, avgMs) : 0,
    missed: [...missed.values()].sort((a, b) => b.count - a.count),
    slow: [...slow.values()].filter((c) => !missed.has(c.id)).sort((a, b) => b.ms - a.ms),
    bySign: order.filter((g) => groups[g].total > 0).map((group) => ({ group, ...groups[group] })),
    keySignMisses,
  };
}

/** Weak spots after a round: misses +2, hints and slow answers +1, quick right answers −1 (0–5; zeros dropped). */
export function updateWeak(weak: WeakSpots, notes: RoundNote[], answers: NoteAnswer[]): WeakSpots {
  const out: WeakSpots = { ...weak };
  answers.slice(0, notes.length).forEach((a, i) => {
    const id = noteId(notes[i].clef, notes[i].step);
    const delta = a.outcome === 'wrong' || a.outcome === 'timeout' ? 2 : a.outcome === 'hinted' || a.ms > SLOW_MS ? 1 : -1;
    const v = Math.max(0, Math.min(MAX_WEAK, (out[id] ?? 0) + delta));
    if (v === 0) delete out[id];
    else out[id] = v;
  });
  return out;
}

/** Note ids missed in a round, for *Practice missed notes*. */
export function missedIds(notes: RoundNote[], answers: NoteAnswer[]): string[] {
  const ids = new Set<string>();
  answers.slice(0, notes.length).forEach((a, i) => {
    if (a.outcome !== 'right') ids.add(noteId(notes[i].clef, notes[i].step));
  });
  return [...ids];
}

/** 0–10: wider range, more signs in the key, extra signs, two clefs, mixed keys and a time limit make it harder. */
export function noteDifficulty(s: NoteSettings): number {
  const keys = roundKeys(s);
  const signs = Math.max(...keys.map((id) => Math.abs(KEYS[id].fifths)));
  const d =
    { staff: 0, ledger1: 1.5, ledger2: 3 }[s.range] +
    signs * 0.4 +
    { none: 0, sharps: 1, both: 1.5 }[s.extras] +
    (s.clefs.length > 1 ? 0.5 : 0) +
    (keys.length > 1 ? 1 : 0) +
    (s.timer === 3 ? 1.5 : s.timer === 5 ? 0.75 : 0);
  return Math.min(10, Math.round(d * 10) / 10);
}

/** Bonus XP by stars (index = stars), as in the rhythm modes for 3 stars. */
const NOTE_STAR_BONUS = [0, 0, 0, 5];

/** XP for a round (§8.3, as in the rhythm modes): notes × (2 + difficulty / 4) × accuracy, plus 5 for 3 stars. */
export function noteRoundXp(s: NoteSettings, r: RoundResult): number {
  if (r.right + r.hinted === 0) return 0;
  const core = Math.round((r.total * (2 + noteDifficulty(s) / 4) * r.accuracy) / 100);
  return core + NOTE_STAR_BONUS[r.stars];
}

/** "on a line" or "in a space", for feedback wording. */
export const placeKind = (clef: Clef, step: Step): 'line' | 'space' => (isLine(clef, step) ? 'line' : 'space');
