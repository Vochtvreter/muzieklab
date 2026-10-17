import type { HoldJudgement, JudgeOptions, JudgeResult, Judgement, Leniency, NoteResult, Tap, TimedNote, Timeline } from './types';

/** Press windows in ms (§6.2), before leniency and the fast-passage shrink. */
export const WINDOWS_MS = { perfect: 35, great: 70, good: 120 } as const;
export const POINTS: Record<Judgement, number> = { perfect: 100, great: 80, good: 50, miss: 0 };
export const EXTRA_TAP_POINTS = -25;
export const HOLD_PENALTY = -20;
/** Release tolerance in ms (also scaled by leniency) and the "25% of the note" early limit. */
export const RELEASE_MS = 120;
export const RELEASE_EARLY_FRACTION = 0.25;
export const LENIENCY: Record<Leniency, number> = { strict: 0.75, normal: 1, relaxed: 1.5 };
/** Tendency thresholds (§6.3): a small early average is normal anticipation. */
export const RUSHING_MS = -40;
export const DRAGGING_MS = 30;

interface Windows {
  perfect: number;
  great: number;
  good: number;
} // seconds

/** window = min(base × leniency, 0.4 × gap to the nearest neighbouring onset). */
export function noteWindows(timeline: Timeline, leniency: Leniency): Windows[] {
  const f = LENIENCY[leniency];
  const n = timeline.notes;
  return n.map((note, i) => {
    const gap = Math.min(i > 0 ? note.onset - n[i - 1].onset : Infinity, i + 1 < n.length ? n[i + 1].onset - note.onset : Infinity);
    const cap = 0.4 * gap;
    return {
      perfect: Math.min((WINDOWS_MS.perfect * f) / 1000, cap),
      great: Math.min((WINDOWS_MS.great * f) / 1000, cap),
      good: Math.min((WINDOWS_MS.good * f) / 1000, cap),
    };
  });
}

/** Release judgement (§6.2). `up` null = never released. */
export function judgeRelease(note: TimedNote, up: number | null, leniency: Leniency): HoldJudgement {
  const tol = (RELEASE_MS * LENIENCY[leniency]) / 1000;
  if (up === null) return note.next === 'note' ? 'right' : 'long';
  const early = note.end - Math.max(RELEASE_EARLY_FRACTION * (note.end - note.onset), tol);
  if (up < early) return 'short';
  // With a note right after, the player must lift to press again, so "too long" cannot happen.
  if (note.next !== 'note' && up > note.end + tol) return 'long';
  return 'right';
}

export interface LivePress {
  index: number | null; // matched note, or null for an extra tap
  judgement: Judgement | 'extra';
  offsetMs: number | null;
}

/** Incremental judging for live feedback while playing. */
export interface LiveJudge {
  press(time: number): LivePress;
  release(time: number): void;
  /** Notes whose window has passed without a press, up to `time` (to show misses live). Cumulative, sorted. */
  missedUntil(time: number): number[];
  combo(): number;
  finish(): JudgeResult;
}

/** The matching state shared by the batch and the live judge, so both give the same result. */
class Session {
  readonly wins: Windows[];
  readonly taps: Tap[] = [];
  readonly tapNote: (number | null)[] = [];
  readonly noteTap: (number | null)[];
  private held: number | null = null;
  now = -Infinity;

  constructor(
    readonly timeline: Timeline,
    readonly opts: JudgeOptions,
  ) {
    this.wins = noteWindows(timeline, opts.leniency);
    this.noteTap = timeline.notes.map(() => null);
  }

  /** Greedy in time order: the nearest unmatched onset inside its own good window (§6.2). */
  press(time: number): LivePress {
    if (this.held !== null) this.release(time);
    this.now = Math.max(this.now, time);
    let best = -1;
    let bestDist = Infinity;
    this.timeline.notes.forEach((note, i) => {
      if (this.noteTap[i] !== null) return;
      const dist = Math.abs(time - note.onset);
      if (dist <= this.wins[i].good + 1e-9 && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    const tapIndex = this.taps.length;
    this.taps.push({ down: time, up: null });
    this.held = tapIndex;
    if (best < 0) {
      this.tapNote.push(null);
      return { index: null, judgement: 'extra', offsetMs: null };
    }
    this.tapNote.push(best);
    this.noteTap[best] = tapIndex;
    const offset = time - this.timeline.notes[best].onset;
    return { index: best, judgement: pressJudgement(Math.abs(offset), this.wins[best]), offsetMs: offset * 1000 };
  }

  release(time: number): void {
    if (this.held === null) return;
    const tap = this.taps[this.held];
    tap.up = Math.max(tap.down, time);
    this.now = Math.max(this.now, time);
    this.held = null;
  }

  missedUntil(time: number): number[] {
    this.now = Math.max(this.now, time);
    const out: number[] = [];
    this.timeline.notes.forEach((note, i) => {
      if (this.noteTap[i] === null && time > note.onset + this.wins[i].good) out.push(i);
    });
    return out;
  }

  /** Per-note result, or null while the note is still open (press window or hold not finished). */
  noteResult(i: number, final: boolean): NoteResult | null {
    const note = this.timeline.notes[i];
    const t = this.noteTap[i];
    if (t === null) {
      if (!final && this.now <= note.onset + this.wins[i].good) return null;
      return { index: i, judgement: 'miss', offsetMs: null, hold: null, releaseOffsetMs: null, tap: null };
    }
    const tap = this.taps[t];
    if (!final && this.opts.hold && tap.up === null) return null;
    const offset = tap.down - note.onset;
    return {
      index: i,
      judgement: pressJudgement(Math.abs(offset), this.wins[i]),
      offsetMs: offset * 1000,
      hold: this.opts.hold ? judgeRelease(note, tap.up, this.opts.leniency) : null,
      releaseOffsetMs: tap.up === null ? null : (tap.up - note.end) * 1000,
      tap: { ...tap },
    };
  }

  liveCombo(): number {
    let combo = 0;
    for (let i = 0; i < this.timeline.notes.length; i++) {
      const r = this.noteResult(i, false);
      if (!r) break;
      combo = keepsCombo(r) ? combo + 1 : 0;
    }
    return combo;
  }

  finish(): JudgeResult {
    const notes = this.timeline.notes.map((_, i) => this.noteResult(i, true) as NoteResult);
    const extraTaps = this.tapNote.filter((n) => n === null).length;
    return summarise(notes, extraTaps);
  }
}

function pressJudgement(dist: number, w: Windows): Judgement {
  if (dist <= w.perfect + 1e-9) return 'perfect';
  if (dist <= w.great + 1e-9) return 'great';
  return 'good';
}

const keepsCombo = (r: NoteResult): boolean =>
  (r.judgement === 'perfect' || r.judgement === 'great') && (r.hold === null || r.hold === 'right');

function summarise(notes: NoteResult[], extraTaps: number): JudgeResult {
  const counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  const holds: Record<HoldJudgement, number> = { right: 0, short: 0, long: 0 };
  let points = extraTaps * EXTRA_TAP_POINTS;
  let combo = 0;
  let maxCombo = 0;
  const offsets: number[] = [];
  for (const r of notes) {
    counts[r.judgement]++;
    points += POINTS[r.judgement];
    if (r.hold) {
      holds[r.hold]++;
      if (r.hold !== 'right') points += HOLD_PENALTY;
    }
    if (r.offsetMs !== null) offsets.push(r.offsetMs);
    combo = keepsCombo(r) ? combo + 1 : 0;
    maxCombo = Math.max(maxCombo, combo);
  }
  const maxPoints = notes.length * POINTS.perfect;
  const accuracy = maxPoints > 0 ? Math.max(0, Math.min(100, (points / maxPoints) * 100)) : 0;
  const stars: JudgeResult['stars'] = accuracy >= 95 && counts.miss === 0 ? 3 : accuracy >= 80 ? 2 : accuracy >= 60 ? 1 : 0;
  const mean = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;
  const sd = offsets.length ? Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length) : 0;
  return {
    notes,
    extraTaps,
    points,
    maxPoints,
    accuracy,
    stars,
    combo,
    maxCombo,
    counts,
    holds,
    meanOffsetMs: mean,
    sdOffsetMs: sd,
    tendency: mean < RUSHING_MS ? 'rushing' : mean > DRAGGING_MS ? 'dragging' : 'steady',
  };
}

/**
 * Final judgement of a whole run (§6.2–6.3). Taps are taken in time order; a tap still down when the next one
 * starts is treated as released at that moment (the input layer normally guarantees this).
 */
export function judge(timeline: Timeline, taps: Tap[], opts: JudgeOptions): JudgeResult {
  const session = new Session(timeline, opts);
  const sorted = taps.slice().sort((a, b) => a.down - b.down);
  sorted.forEach((tap, i) => {
    session.press(tap.down);
    const next = sorted[i + 1];
    if (tap.up !== null && (!next || tap.up <= next.down)) session.release(tap.up);
  });
  return session.finish();
}

export function createLiveJudge(timeline: Timeline, opts: JudgeOptions): LiveJudge {
  const session = new Session(timeline, opts);
  return {
    press: (time) => session.press(time),
    release: (time) => session.release(time),
    missedUntil: (time) => session.missedUntil(time),
    combo: () => session.liveCombo(),
    finish: () => session.finish(),
  };
}
