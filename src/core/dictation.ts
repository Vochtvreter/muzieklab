/**
 * Listen & write (DESIGN.md §3.2): rhythm and melodic dictation. The player hears an exercise and writes it down, value
 * by value (Build). This module holds what is written (an Answer), which values still fit a bar, the melody's pitches,
 * and the check: beat by beat, as rhythm and not as spelling, and with Melody the pitch of every note too.
 */
import { MIDDLE_C, type Step } from './pitch';
import { Rng } from './rng';
import { VALUE_TICKS } from './values';
import { NOTE_VALUES, type Bar, type Exercise, type Meter, type NotatedBar, type NotatedSymbol, type NoteValue, type RhythmEvent, type Settings, type Stars } from './types';

/**
 * The plays an exercise has after its first listen, which is free: then a play of the whole exercise or of one bar each
 * uses one. So it can be heard LISTEN_PLAYS + 1 times.
 */
export const LISTEN_PLAYS = 3;
/** The plays used of LISTEN_PLAYS, from the times the exercise was heard (the first listen is free). */
export const playsUsed = (heard: number): number => Math.max(0, Math.min(LISTEN_PLAYS, heard - 1));
/** Listen plays at most this many bars; a higher Bars shows as this while Listen is picked. */
export const LISTEN_MAX_BARS = 8;

/** The notes a melody can use, as degrees of C major from low do: do re mi fa sol la si do'. */
export const MELODY_DEGREES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
/** Low do, mi, sol and la: the default set (a common first melodic dictation). */
export const DEFAULT_MELODY: number[] = [0, 2, 4, 5];

/**
 * Starts on: the note the melody starts on, as a degree, when the player chose one of its notes; undefined for Any (the
 * melody starts on do, now and then mi or sol).
 */
export function melodyStart(s: Pick<Settings, 'melody' | 'startNote'>): number | undefined {
  const d = s.startNote;
  return d !== undefined && melodyDegrees(s).includes(d) ? d : undefined;
}

/** The reference note before every play of a melody: the note it starts on, or do with Any. */
export const referenceDegree = (s: Pick<Settings, 'melody' | 'startNote'>): number => melodyStart(s) ?? 0;

/** The staff step of a melody degree: degree 0 is C4 (middle C), 7 is C5. */
export const degreeStep = (degree: number): Step => MIDDLE_C + degree;
/** MIDI number of a melody step (C major, no signs): C4 = 60. */
export function stepMidi(step: Step): number {
  const pc = [0, 2, 4, 5, 7, 9, 11];
  const oct = Math.floor(step / 7);
  return 12 * (oct + 1) + pc[((step % 7) + 7) % 7];
}

/** Whether the settings ask for a melody (Listen with Write · Melody or Both): the exercise has pitches. */
export const writesMelody = (s: Settings): boolean => s.mode === 'listen' && (s.write === 'melody' || s.write === 'notes');
/** Listen with Write · Melody: the notes alone, every one a quarter, so only the pitches are written. */
export const writesNotesOnly = (s: Settings): boolean => s.mode === 'listen' && s.write === 'notes';

/** The melody's degrees, sorted and valid: at least two, else the default. */
export function melodyDegrees(s: Pick<Settings, 'melody'>): number[] {
  const set = [...new Set((s.melody ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 7))].sort((a, b) => a - b);
  return set.length >= 2 ? set : [...DEFAULT_MELODY];
}

/**
 * The pitches of a melody, one staff step per onset: it starts on do (or the lowest note when do is not picked),
 * moves mostly by step through the notes picked (a step is to the next note of the set), sometimes repeats or leaps,
 * and ends on do. Seeded, so an exercise's code rebuilds the same melody.
 */
export function generateMelody(onsets: number, degrees: readonly number[], seed: number, start?: number): Step[] {
  const set = [...degrees].sort((a, b) => a - b);
  const rng = new Rng((seed ^ 0x5bd1e995) >>> 0);
  const homeIndex = set.includes(0) ? set.indexOf(0) : set.includes(7) ? set.indexOf(7) : 0;
  const out: number[] = [];
  let i = homeIndex;
  let repeats = 0;
  for (let n = 0; n < onsets; n++) {
    if (n === 0 && start !== undefined && set.includes(start)) {
      // The note the player chose to start on (Starts on).
      i = set.indexOf(start);
    } else if (n === 0) {
      // First note: do, or now and then another note of the do chord (mi, sol), as melodies often start.
      const chord = set.map((d, k) => (d === 2 || d === 4 ? k : -1)).filter((k) => k >= 0);
      i = chord.length && rng.chance(0.25) ? rng.pick(chord) : homeIndex;
    } else if (n === onsets - 1 && onsets > 1) {
      // Ends on do: the low do, or the high one when it is nearer.
      const ends = set.map((d, k) => (d === 0 || d === 7 ? k : -1)).filter((k) => k >= 0);
      i = ends.length ? ends.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a)) : homeIndex;
    } else {
      // Repeat, a step, a skip or (rarely) a leap, through the picked notes.
      const moves = [0, 1, -1, 2, -2, 3, -3];
      const weights = moves.map((m) => {
        const k = i + m;
        if (k < 0 || k >= set.length) return 0;
        if (m === 0) return repeats >= 1 ? 0 : 1.2;
        const a = Math.abs(m);
        return a === 1 ? 5 : a === 2 ? 2.2 : 0.6;
      });
      const pick = rng.weighted(weights);
      const m = pick >= 0 ? moves[pick] : 0;
      repeats = m === 0 ? repeats + 1 : 0;
      i += m;
    }
    out.push(degreeStep(set[i]));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The written answer

/** One value the player wrote: a note (with its step in a melody) or a rest, maybe dotted. */
export interface Written {
  value: NoteValue;
  dots: 0 | 1;
  kind: 'note' | 'rest';
  /** The staff step of a note in a melody. */
  step?: Step;
}

/** What has been written: one list of values per bar, in order. */
export type Answer = Written[][];

export const writtenTicks = (w: Pick<Written, 'value' | 'dots'>): number => (VALUE_TICKS[w.value] * (w.dots ? 3 : 2)) / 2;
export const barFilled = (bar: readonly Written[]): number => bar.reduce((t, w) => t + writtenTicks(w), 0);

/** The values a bar can be written with: the notes and the rests that are on, plain and (with dotted notes on) dotted. */
export interface Palette {
  notes: NoteValue[];
  rests: NoteValue[];
  dotted: boolean;
}

export const paletteOf = (s: Settings): Palette => ({ notes: [...s.notes], rests: [...s.rests], dotted: s.dotted });

/** Every length the palette can write, in ticks. */
function lengths(p: Palette): number[] {
  const out = new Set<number>();
  for (const v of NOTE_VALUES) {
    if (!p.notes.includes(v) && !p.rests.includes(v)) continue;
    out.add(VALUE_TICKS[v]);
    if (p.dotted && v !== 'sixteenth') out.add((VALUE_TICKS[v] * 3) / 2);
  }
  return [...out];
}

/** Whether `ticks` can be filled exactly with the palette's lengths (0 always can). */
export function fillable(ticks: number, p: Palette): boolean {
  if (ticks === 0) return true;
  if (ticks < 0) return false;
  const ls = lengths(p);
  const ok = new Array<boolean>(ticks + 1).fill(false);
  ok[0] = true;
  for (let t = 1; t <= ticks; t++) ok[t] = ls.some((l) => l <= t && ok[t - l]);
  return ok[ticks];
}

/** Why a value cannot be added to the current bar now: it is too long, or it would leave a gap nothing fills. */
export type FitProblem = 'tooLong' | 'gap' | null;

export function fitProblem(bar: readonly Written[], meter: Meter, w: Pick<Written, 'value' | 'dots'>, p: Palette): FitProblem {
  const left = meter.barTicks - barFilled(bar) - writtenTicks(w);
  if (left < 0) return 'tooLong';
  return fillable(left, p) ? null : 'gap';
}

/** The bar being written: the first bar that is not full, or the last bar when every bar is. */
export function currentBar(answer: Answer, meter: Meter): number {
  const i = answer.findIndex((b) => barFilled(b) < meter.barTicks);
  return i < 0 ? answer.length - 1 : i;
}

export const answerComplete = (answer: Answer, meter: Meter): boolean => answer.every((b) => barFilled(b) === meter.barTicks);

export const emptyAnswer = (bars: number): Answer => Array.from({ length: bars }, () => []);

/** The answer with `w` added to the current bar (nothing changes when every bar is full). */
export function addValue(answer: Answer, meter: Meter, w: Written): Answer {
  if (answerComplete(answer, meter)) return answer;
  const i = currentBar(answer, meter);
  return answer.map((b, k) => (k === i ? [...b, w] : b));
}

/** The answer without its last value, across bars. */
export function undoValue(answer: Answer): Answer {
  for (let i = answer.length - 1; i >= 0; i--) {
    if (answer[i].length) return answer.map((b, k) => (k === i ? b.slice(0, -1) : b));
  }
  return answer;
}

/** The answer as rhythm events per bar (for the check, the staff and Play yours). */
export function answerBars(answer: Answer): Bar[] {
  return answer.map((bar) => {
    let t = 0;
    return {
      events: bar.map((w) => {
        const e: RhythmEvent = { start: t, duration: writtenTicks(w), kind: w.kind };
        t += e.duration;
        return e;
      }),
    };
  });
}

/** The answer's steps per onset, in order (a melody's notes), for its staff and Play yours. */
export const answerSteps = (answer: Answer): Step[] => answer.flat().filter((w) => w.kind === 'note').map((w) => w.step ?? 0);

/**
 * The answer drawn as notation, value for value as written (not respelled): eighths and sixteenths inside one beat
 * group are beamed. `marks` gets the onset index of each note, as the exercise's notation does.
 */
export function answerNotation(answer: Answer, meter: Meter): NotatedBar[] {
  let onset = 0;
  let beam = 0;
  return answer.map((bar) => {
    let t = 0;
    const filled = barFilled(bar);
    const symbols: NotatedSymbol[] = bar.map((w) => {
      const duration = writtenTicks(w);
      const sym: NotatedSymbol = {
        value: w.value,
        dots: w.dots,
        kind: w.kind,
        tieToNext: false,
        start: t,
        duration,
        onsetIndex: w.kind === 'note' ? onset++ : -1,
        ...(w.kind === 'note' && w.step !== undefined ? { step: w.step } : {}),
      };
      t += duration;
      return sym;
    });
    // What is not written yet takes its time unseen, so the bar keeps its width and the written values their places.
    for (let left = meter.barTicks - filled; left > 0; ) {
      const v = (['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as NoteValue[]).find((x) => VALUE_TICKS[x] <= left) ?? 'sixteenth';
      const d = VALUE_TICKS[v];
      symbols.push({ value: v, dots: 0, kind: 'rest', tieToNext: false, start: t, duration: d, onsetIndex: -1, ghost: true });
      t += d;
      left -= d;
    }
    // Beam runs of eighths and sixteenths that sit inside one beat group.
    let groupStart = 0;
    for (const g of meter.beamGroups) {
      const inside = symbols.filter((s) => s.start >= groupStart && s.start + s.duration <= groupStart + g);
      const beamable = inside.filter((s) => s.kind === 'note' && (s.value === 'eighth' || s.value === 'sixteenth'));
      if (beamable.length >= 2) {
        beam++;
        for (const s of beamable) s.beamGroup = beam;
      }
      groupStart += g;
    }
    return { symbols };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The check

/** One sounding value inside a beat: where it starts and ends (in the bar), note or rest, and a note's step. */
interface Span {
  start: number;
  end: number;
  kind: 'note' | 'rest';
  step?: Step;
}

/** A bar's values as spans, with rests side by side merged (two eighth rests are the silence of a quarter rest). */
function spans(events: readonly RhythmEvent[], steps: (Step | undefined)[]): Span[] {
  const out: Span[] = [];
  let note = 0;
  for (const e of events) {
    if (e.kind === 'rest') {
      const prev = out[out.length - 1];
      if (prev && prev.kind === 'rest' && prev.end === e.start) prev.end = e.start + e.duration;
      else out.push({ start: e.start, end: e.start + e.duration, kind: 'rest' });
    } else if (e.tieFromPrev && out.length && out[out.length - 1].kind === 'note') {
      out[out.length - 1].end = e.start + e.duration;
    } else {
      out.push({ start: e.start, end: e.start + e.duration, kind: 'note', step: steps[note++] });
    }
  }
  return out;
}

const sameSpans = (a: Span[], b: Span[], melody: boolean): boolean =>
  a.length === b.length && a.every((x, i) => x.start === b[i].start && x.end === b[i].end && x.kind === b[i].kind && (!melody || x.kind === 'rest' || x.step === b[i].step));

/** How one beat compares, for the tip: the rhythm differs, or only a pitch. */
export interface BeatCheck {
  bar: number;
  beat: number;
  right: boolean;
  /** With the rhythm right, the pitch of a note is wrong (Melody). */
  pitchOnly: boolean;
}

export interface ListenCheck {
  beats: BeatCheck[];
  beatsRight: number;
  /** Per written value (answer order, bar by bar): whether it matches a value that was played. */
  values: boolean[][];
  valuesRight: number;
  valuesTotal: number;
  /** Per bar: every beat right. */
  barsRight: boolean[];
  /** Per onset of the exercise: whether the beat it starts in is right (Results colours the notes so). */
  onsetsRight: boolean[];
}

/** The steps of each bar's notes, from a flat list of steps per onset. */
function stepsPerBar(bars: readonly Bar[], steps: readonly Step[] | undefined): (Step | undefined)[][] {
  let k = 0;
  return bars.map((b) => b.events.filter((e) => e.kind === 'note' && !e.tieFromPrev).map(() => steps?.[k++]));
}

/**
 * Checks the answer against the exercise, beat by beat: a beat is right when the values sounding in it (cut to the
 * beat) start and end in the same places, are notes or rests alike, and with Melody the notes have the same steps.
 * A written value is right when the exercise has the same value in the same place (a rest: silence over its length).
 */
export function checkAnswer(ex: Exercise, answer: Answer): ListenCheck {
  const melody = !!ex.pitches;
  const meter = ex.meter;
  const mine = answerBars(answer);
  const myStepsAll = answerSteps(answer);
  const theirSteps = stepsPerBar(ex.bars, ex.pitches);
  const mySteps = stepsPerBar(mine, myStepsAll);
  const beats: BeatCheck[] = [];
  const values: boolean[][] = [];
  const barsRight: boolean[] = [];
  const onsetsRight: boolean[] = [];
  ex.bars.forEach((bar, b) => {
    const theirs = spans(bar.events, theirSteps[b]);
    const ours = spans(mine[b]?.events ?? [], mySteps[b] ?? []);
    let all = true;
    const beatRight: boolean[] = [];
    for (let k = 0; k < meter.beatsPerBar; k++) {
      const s = k * meter.beatTicks;
      const e = s + meter.beatTicks;
      // Cut to the beat, keeping whether a value began before it or goes on after it: a half note is not two quarters.
      const cut = (list: Span[]): Span[] =>
        list.filter((x) => x.start < e && x.end > s).map((x) => ({ ...x, start: x.start < s ? -1 : x.start, end: x.end > e ? -1 : x.end }));
      const a = cut(theirs);
      const o = cut(ours);
      const right = sameSpans(a, o, melody);
      const pitchOnly = !right && melody && sameSpans(a, o, false);
      beats.push({ bar: b, beat: k, right, pitchOnly });
      beatRight.push(right);
      if (!right) all = false;
    }
    barsRight.push(all);
    // Onsets of the exercise, coloured by the beat they start in.
    for (const sp of theirs) if (sp.kind === 'note') onsetsRight.push(beatRight[Math.floor(sp.start / meter.beatTicks)]);
    // Written values: a note right when the exercise has the same note there; a rest when it is silent there.
    let t = 0;
    let n = 0;
    values.push(
      (answer[b] ?? []).map((w) => {
        const start = t;
        const end = t + writtenTicks(w);
        t = end;
        if (w.kind === 'rest') return theirs.some((x) => x.kind === 'rest' && x.start <= start && x.end >= end);
        const step = mySteps[b]?.[n++];
        return theirs.some((x) => x.kind === 'note' && x.start === start && x.end === end && (!melody || x.step === step));
      }),
    );
  });
  const flat = values.flat();
  return {
    beats,
    beatsRight: beats.filter((x) => x.right).length,
    values,
    valuesRight: flat.filter(Boolean).length,
    valuesTotal: flat.length,
    barsRight,
    onsetsRight,
  };
}

/** Accuracy: beats right of the beats in the exercise, 0–100. */
export const listenAccuracy = (c: ListenCheck): number => (c.beats.length ? (100 * c.beatsRight) / c.beats.length : 0);

/**
 * Stars (§6.3), from the times the exercise was heard: ★ 50% · ★★ 75% · ★★★ 90% with at most 2 of the 3 plays used
 * (all 3 cap it at ★★) · the 4th star every beat right, heard once (no play used after the free listen). No diamond.
 */
export function listenStars(accuracy: number, heard: number): Stars {
  const used = playsUsed(heard);
  if (accuracy >= 100 && used === 0) return 4;
  if (accuracy >= 90 && used <= 2) return 3;
  if (accuracy >= 75) return 2;
  if (accuracy >= 50) return 1;
  return 0;
}

/**
 * XP = bars × (4 + difficulty) × accuracy, the star bonus (5 / 10 for ★★★ / the 4th), and 5 per play not used (the
 * free first listen is none of them). The plays bonus needs a round that was heard and earned a star: a guess written
 * without listening earns none.
 */
export function listenXp(ex: Exercise, accuracy: number, stars: Stars, heard: number): number {
  if (accuracy <= 0) return 0;
  const base = Math.round(ex.bars.length * (4 + ex.difficulty) * (accuracy / 100));
  const bonus = stars >= 4 ? 10 : stars >= 3 ? 5 : 0;
  const saved = heard >= 1 && stars >= 1 ? 5 * (LISTEN_PLAYS - playsUsed(heard)) : 0;
  return base + bonus + saved;
}

/** The first wrong beat, for "Beat 3 of bar 2 differs" and the tip. */
export const firstWrong = (c: ListenCheck): BeatCheck | null => c.beats.find((b) => !b.right) ?? null;

/** The values sounding from a beat on in a bar, as written (for the tip: "you wrote a quarter; it was two eighths"). */
export function valuesInBeat(events: readonly RhythmEvent[], meter: Meter, beat: number): RhythmEvent[] {
  const s = beat * meter.beatTicks;
  const e = s + meter.beatTicks;
  return events.filter((x) => x.start >= s && x.start < e);
}

/** The steps of the notes starting in a beat of a bar. */
export function stepsInBeat(bars: readonly Bar[], steps: readonly Step[] | undefined, bar: number, meter: Meter, beat: number): Step[] {
  const per = stepsPerBar(bars, steps)[bar] ?? [];
  const notes = (bars[bar]?.events ?? []).filter((x) => x.kind === 'note' && !x.tieFromPrev);
  const s = beat * meter.beatTicks;
  const e = s + meter.beatTicks;
  return notes.map((x, i) => ({ x, step: per[i] })).filter(({ x }) => x.start >= s && x.start < e).map(({ step }) => step as Step);
}
