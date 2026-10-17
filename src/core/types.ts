/**
 * Shared types: the contract between the engine (core), audio, input, rendering and UI.
 * Times inside the engine are integer ticks (PPQ = 48, DESIGN.md §5.1); times at play are seconds.
 */

export const PPQ = 48;

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';
export const NOTE_VALUES: NoteValue[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];

export type MeterId = '2/4' | '3/4' | '4/4';
export const METER_IDS: MeterId[] = ['2/4', '3/4', '4/4'];

export interface Meter {
  id: MeterId;
  barTicks: number; // 96 / 144 / 192
  beatTicks: number; // 48 (all simple meters in the MVP)
  beatsPerBar: number;
  /** Beaming groups in ticks, e.g. 4/4 -> [48, 48, 48, 48]. */
  beamGroups: number[];
  /** Metric weight of a tick position inside the bar (higher = stronger), §5.2. */
  weightAt(tick: number): number;
}

export type Density = 'sparse' | 'balanced' | 'busy';
export type RestAmount = 'few' | 'some' | 'many';
export type Leniency = 'strict' | 'normal' | 'relaxed';

/** Practice settings (§4). Only the Tap mode is in the MVP. */
export interface Settings {
  hold: boolean; // tap & hold (true) or tap only
  meters: MeterId[];
  notes: NoteValue[];
  rests: NoteValue[];
  dotted: boolean;
  ties: boolean; // ties / syncopation
  triplets: boolean;
  bars: number; // 1–16
  tempo: number; // 40–200 BPM, beat = quarter
  metronome: 'on' | 'accent' | 'off';
  countIn: 0 | 1 | 2;
  density: Density;
  restAmount: RestAmount;
}

export interface RhythmEvent {
  start: number; // ticks from the start of the bar
  duration: number; // ticks
  kind: 'note' | 'rest';
  /** Continues the previous note (tie across a bar line or a structural boundary): no onset. */
  tieFromPrev?: boolean;
  /** Part of an eighth-note triplet group (duration 16 ticks). */
  triplet?: boolean;
}

export interface Bar {
  events: RhythmEvent[];
}

export interface Exercise {
  seed: number;
  settings: Settings;
  meter: Meter;
  tempo: number;
  bars: Bar[];
  form: string; // e.g. "a a' b a"
  difficulty: number; // 0–10
}

/** One engraved symbol, output of the speller, input of the renderer (§5.9). */
export interface NotatedSymbol {
  value: NoteValue;
  dots: 0 | 1;
  kind: 'note' | 'rest';
  tieToNext: boolean;
  beamGroup?: number; // symbols with the same id in a bar are beamed together
  tuplet?: { num: 3; den: 2; id: number };
  start: number; // ticks from the start of the bar
  duration: number; // ticks
  /** Index into the exercise's onset list (see Timeline) for notes that start a sound; -1 otherwise. */
  onsetIndex: number;
  /** Whole-bar rest, drawn centred. */
  wholeBarRest?: boolean;
}

export interface NotatedBar {
  symbols: NotatedSymbol[];
}

/** A sounding note on the play timeline (ties merged): what the player must press and hold. */
export interface TimedNote {
  index: number; // onset index, 0..n-1
  bar: number;
  tick: number; // absolute tick from the exercise start (after count-in)
  onset: number; // seconds from the exercise start (after count-in)
  end: number; // seconds: when the sound stops (ties and dots included)
  durationTicks: number;
  /** What the next event is: a note starts right at `end` ('note'), a rest follows ('rest'), or the exercise ends ('end'). */
  next: 'note' | 'rest' | 'end';
}

export interface Timeline {
  notes: TimedNote[];
  totalSeconds: number; // length of the exercise without count-in
  beatSeconds: number;
}

/** One press of the pad or a key, in seconds on the same clock as the timeline (0 = exercise start). */
export interface Tap {
  down: number;
  up: number | null; // null while still held / never released
}

export type Judgement = 'perfect' | 'great' | 'good' | 'miss';
export type HoldJudgement = 'right' | 'short' | 'long';

export interface NoteResult {
  index: number;
  judgement: Judgement;
  offsetMs: number | null; // press - onset, negative = early
  hold: HoldJudgement | null; // null when holding is off or the note was missed
  releaseOffsetMs: number | null; // release - end
  tap: Tap | null;
}

export interface JudgeOptions {
  hold: boolean;
  leniency: Leniency; // strict ×0.75, normal ×1, relaxed ×1.5 on the windows
}

export interface JudgeResult {
  notes: NoteResult[];
  extraTaps: number;
  points: number;
  maxPoints: number;
  accuracy: number; // 0–100
  stars: 0 | 1 | 2 | 3;
  combo: number; // running, at the end
  maxCombo: number;
  counts: Record<Judgement, number>;
  holds: Record<HoldJudgement, number>;
  meanOffsetMs: number;
  sdOffsetMs: number;
  tendency: 'rushing' | 'dragging' | 'steady';
}
