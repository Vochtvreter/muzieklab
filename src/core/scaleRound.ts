/**
 * Scales rounds (DESIGN.md §3.7): the settings, the seeded list of scales, judging one note, and the round's stars and
 * XP. Pure: the UI passes in the seed and the mistakes per scale.
 */
import { KEY_IDS, type KeyId } from './pitch';
import { Rng } from './rng';
import {
  CIRCLE_ORDER,
  DIRECTIONS,
  SCALE_TYPES,
  needsDoubleSharp,
  scaleId,
  type Direction,
  type Scale,
  type ScaleAlter,
  type ScaleNote,
  type ScaleStars,
  type ScaleType,
} from './scale';

/** The hub's selected key, all 15 in circle order (*Go round the circle*), or keys chosen on the Key screen. */
export type ScaleKeys = 'one' | 'circle' | 'pick';
export type ScaleInput = 'piano' | 'names' | 'mixed';
/** The staff writes each sign next to its note, or the key signature once at the start. */
export type ScaleWrite = 'signs' | 'keySig';

export interface ScaleSettings {
  keyMode: ScaleKeys;
  /** At least one: the selected key first; with 'pick', every chosen key. */
  keys: KeyId[];
  /** At least one, in SCALE_TYPES order. */
  types: ScaleType[];
  input: ScaleInput;
  direction: Direction;
  write: ScaleWrite;
  /** W and H between the degree boxes. */
  showSteps: boolean;
  /** Each right note sounds. */
  playNotes: boolean;
}

export const DEFAULT_SCALE_SETTINGS: ScaleSettings = {
  keyMode: 'one',
  keys: ['G'],
  types: ['major'],
  input: 'piano',
  direction: 'up',
  write: 'signs',
  showSteps: true,
  playNotes: true,
};

export const SCALE_KEY_MODES: readonly ScaleKeys[] = ['one', 'circle', 'pick'];
export const SCALE_INPUTS: readonly ScaleInput[] = ['piano', 'names', 'mixed'];
export const SCALE_WRITES: readonly ScaleWrite[] = ['signs', 'keySig'];

/** A stored or edited ScaleSettings object, repaired field by field. */
export function sanitizeScaleSettings(raw: unknown): ScaleSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const d = DEFAULT_SCALE_SETTINGS;
  const one = <T>(x: unknown, options: readonly T[], def: T): T => (options.includes(x as T) ? (x as T) : def);
  // Keep the player's order of keys (the first one is the selected key).
  const keys = Array.isArray(v.keys) ? [...new Set(v.keys.filter((x): x is KeyId => (KEY_IDS as readonly unknown[]).includes(x)))] : [];
  const types = Array.isArray(v.types) ? SCALE_TYPES.filter((t) => (v.types as unknown[]).includes(t)) : [];
  return {
    keyMode: one(v.keyMode, SCALE_KEY_MODES, d.keyMode),
    keys: keys.length ? keys : [...d.keys],
    types: types.length ? types : [...d.types],
    input: one(v.input, SCALE_INPUTS, d.input),
    direction: one(v.direction, DIRECTIONS, d.direction),
    write: one(v.write, SCALE_WRITES, d.write),
    showSteps: typeof v.showSteps === 'boolean' ? v.showSteps : d.showSteps,
    playNotes: typeof v.playNotes === 'boolean' ? v.playNotes : d.playNotes,
  };
}

/** The keys a round uses: the selected key, all 15 in circle order, or every chosen key. */
export function scaleRoundKeys(s: ScaleSettings): KeyId[] {
  if (s.keyMode === 'circle') return [...CIRCLE_ORDER];
  return s.keyMode === 'pick' ? s.keys : s.keys.slice(0, 1);
}

export interface RoundScale extends Scale {
  /** How this scale is answered: the round's input, or (mixed) piano and names in turn. */
  input: 'piano' | 'names';
  /** A scale that had mistakes, played once more at the end of the round. */
  again: boolean;
}

/**
 * A round (§3.7): every chosen type in every key of the round. Shuffled, except *Go round the circle*, which keeps the
 * circle's order (each key's types together). Mixed input alternates piano and names, scale by scale.
 */
export function generateScaleRound(s: ScaleSettings, seed: number): RoundScale[] {
  const keys = scaleRoundKeys(s);
  const types = SCALE_TYPES.filter((t) => s.types.includes(t));
  const all: Scale[] = keys.flatMap((key) => types.map((type) => ({ key, type })));
  const order = s.keyMode === 'circle' ? all : new Rng(seed).shuffle(all);
  return order.map((sc, i) => ({ ...sc, input: s.input === 'mixed' ? (i % 2 === 0 ? 'piano' : 'names') : s.input, again: false }));
}

/** The round after a scale is finished: one with mistakes comes back once, at the end. */
export function afterScale(round: RoundScale[], index: number, mistakes: number): RoundScale[] {
  const sc = round[index];
  if (!sc || sc.again || mistakes === 0) return round;
  return [...round, { ...sc, again: true }];
}

// --- Judging -------------------------------------------------------------------------------------------------------

/** A piano key (MIDI number, so the octave counts) or, with the letter given, the sign chosen for it. */
export type ScaleGiven = { kind: 'piano'; midi: number } | { kind: 'sign'; alter: ScaleAlter };

export function isRightNote(note: ScaleNote, given: ScaleGiven): boolean {
  return given.kind === 'piano' ? given.midi === note.midi : given.alter === note.alter;
}

/** The sign buttons: ♭ ♮ ♯, and 𝄪 only in the scales that need one (G♯, D♯ and A♯ minor, §3.7). */
export function signChoices(s: Scale, direction: Direction = 'up'): ScaleAlter[] {
  return needsDoubleSharp(s, direction) ? [-1, 0, 1, 2] : [-1, 0, 1];
}

// --- Score -----------------------------------------------------------------------------------------------------------

/** Stars by mistakes (§3.7): 0 → ★★★, 1 → ★★, 2–3 → ★, more → none. */
export function scaleStars(mistakes: number): 0 | 1 | 2 | 3 {
  return mistakes === 0 ? 3 : mistakes === 1 ? 2 : mistakes <= 3 ? 1 : 0;
}

/** One finished scale of the round, in the order played (a scale that came back appears twice). */
export interface PlayedScale {
  scale: RoundScale;
  mistakes: number;
}

export interface ScaleRoundResult {
  /** Each scale once, scored on its first try; `cameBack` when it was played again at the end. */
  scales: { scale: Scale; mistakes: number; stars: 0 | 1 | 2 | 3; cameBack: boolean }[];
  total: number;
  /** Scales finished without a mistake on the first try. */
  clean: number;
  mistakes: number;
}

export function scoreScaleRound(played: PlayedScale[]): ScaleRoundResult {
  const first = played.filter((p) => !p.scale.again);
  const back = new Set(played.filter((p) => p.scale.again).map((p) => scaleId(p.scale)));
  const scales = first.map((p) => ({
    scale: { key: p.scale.key, type: p.scale.type },
    mistakes: p.mistakes,
    stars: scaleStars(p.mistakes),
    cameBack: back.has(scaleId(p.scale)),
  }));
  return {
    scales,
    total: scales.length,
    clean: scales.filter((x) => x.mistakes === 0).length,
    mistakes: scales.reduce((a, x) => a + x.mistakes, 0),
  };
}

/** XP (§3.7, starting values): 2 per star for each scale, doubled for up and down, + 5 when every scale has ★★★. */
export function scaleRoundXp(s: ScaleSettings, r: ScaleRoundResult): number {
  const per = s.direction === 'upDown' ? 4 : 2;
  const core = r.scales.reduce((a, x) => a + x.stars * per, 0);
  return core + (r.total > 0 && r.clean === r.total ? 5 : 0);
}

/** Best stars per scale after a round: a first try only raises what was saved. */
export function updateScaleStars(stars: ScaleStars, r: ScaleRoundResult): ScaleStars {
  const out: ScaleStars = { ...stars };
  for (const x of r.scales) {
    const id = scaleId(x.scale);
    if (x.stars > (out[id] ?? 0)) out[id] = x.stars;
  }
  return out;
}
