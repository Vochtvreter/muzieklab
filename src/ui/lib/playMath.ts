/** Pure helpers for the Play screen: segments after a pause, staff windows, beats, live score. */
import { EXTRA_TAP_POINTS, noteWindows, POINTS } from '../../core/api';
import type { Judgement, JudgeResult, Leniency, LivePress, NoteResult, Tap, Timeline, TimedNote } from '../../core/api';
import { wholePercent } from './format';

/**
 * The part of a timeline from bar `fromBar` on, re-based so that bar `fromBar` starts at 0 s / tick 0 and
 * onset indices start at 0. Used to resume after a pause: the count-in plays again, then play continues there.
 */
export function sliceTimeline(tl: Timeline, fromBar: number, barTicks: number, barSeconds: number): { timeline: Timeline; firstIndex: number } {
  if (fromBar <= 0) return { timeline: tl, firstIndex: 0 };
  const offS = fromBar * barSeconds;
  const offT = fromBar * barTicks;
  const kept = tl.notes.filter((n) => n.bar >= fromBar);
  const firstIndex = kept.length ? kept[0].index : tl.notes.length;
  const notes: TimedNote[] = kept.map((n) => ({
    ...n,
    index: n.index - firstIndex,
    bar: n.bar - fromBar,
    tick: n.tick - offT,
    onset: n.onset - offS,
    end: n.end - offS,
  }));
  return { timeline: { notes, totalSeconds: Math.max(0, tl.totalSeconds - offS), beatSeconds: tl.beatSeconds }, firstIndex };
}

/**
 * Tells whether a press at a time (global seconds) falls inside the Good window of a note of bar `fromBar` or later, by
 * the final judge's windows. Judged again after a resume at `fromBar`, a press from before the pause in such a window
 * would take that note from the press that plays it again.
 */
export function replayedWindows(tl: Timeline, fromBar: number, leniency: Leniency): (time: number) => boolean {
  const wins = noteWindows(tl, leniency);
  const replayed = tl.notes.flatMap((n, i) => (n.bar >= fromBar ? [{ onset: n.onset, good: wins[i].good }] : []));
  return (time) => replayed.some((n) => Math.abs(time - n.onset) <= n.good + 1e-9);
}

export interface KeptTaps {
  /** The note the live judge matched a press to. */
  noteOf?: (tap: Tap) => TimedNote | undefined;
  /** Whether a press at this time falls in the window of a replayed note (replayedWindows). */
  inReplayedWindow?: (time: number) => boolean;
  /** The press still down at the pause, which ended its hold there. */
  held?: Tap | null;
}

/**
 * Taps kept when resuming at `fromBar` after pausing at `pausedAt` (global seconds). The bar is played again, so the
 * presses that played its notes are dropped and those that played earlier notes stay, by the note the live judge
 * matched (`noteOf`): a press for the bar's first note can come just before the bar line, one for the note before it
 * just after. A press that matched no note (an extra tap) stays when it came before the bar line, unless it falls in the
 * window of a replayed note (`inReplayedWindow`), such as a second press just before the bar's first note: judged
 * again, it would take that note from the press that plays it again. `held` is the press still down at the pause, which
 * ended it there: on a note tied over into the bar and paused before the note's end, it counts as held to that end, as
 * the note is not played again. A hold never released ends at the bar line, or at the pause if that came first.
 */
export function tapsBeforeBar(
  taps: Tap[],
  fromBar: number,
  barSeconds: number,
  pausedAt: number,
  { noteOf = () => undefined, inReplayedWindow = () => false, held = null }: KeptTaps = {},
): Tap[] {
  const cut = fromBar * barSeconds;
  return taps
    .filter((tp) => {
      const note = noteOf(tp);
      return note ? note.bar < fromBar : tp.down < cut && !inReplayedWindow(tp.down);
    })
    .map((tp) => {
      const end = noteOf(tp)?.end ?? -Infinity;
      if (tp === held && end > pausedAt) return { ...tp, up: end };
      // Only a hold never released: a tied hold that an earlier resume ended after this pause keeps its end.
      return tp.up === null ? { ...tp, up: Math.min(pausedAt, Math.max(tp.down, cut)) } : tp;
    });
}

/**
 * The bar being played at `tg` (exercise seconds) in a segment that starts at bar `fromBar`. After a pause the clock
 * is still in the bar before during the lead-in and the count-in, which lead into `fromBar`: Resume plays it again from
 * there, and Play shows it.
 */
export function barAt(tg: number, barSeconds: number, fromBar: number): number {
  return Math.max(fromBar, Math.floor(tg / barSeconds));
}

/** First bar of the staff window: the current row, so the row being played sits on top with the next one below. */
export function windowStart(currentBar: number, barsPerRow: number, rowsShown: number, totalBars: number): number {
  const perRow = Math.max(1, barsPerRow);
  const shown = perRow * Math.max(1, rowsShown);
  if (totalBars <= shown) return 0;
  const start = Math.floor(Math.max(0, currentBar) / perRow) * perRow;
  // Near the end, keep the window full instead of showing a single last row.
  return Math.min(start, Math.ceil((totalBars - shown) / perRow) * perRow);
}

export interface BeatState {
  /** 0-based beat in the bar, or null before the count-in starts / after the end. */
  inBar: number | null;
  countIn: boolean;
}

/** Beat under the playhead, from the exercise clock (t = 0 at the first beat, negative during the count-in). */
export function beatAt(t: number, beatSeconds: number, beatsPerBar: number, countInBeats: number, totalSeconds: number): BeatState {
  if (beatSeconds <= 0) return { inBar: null, countIn: false };
  const beat = Math.floor(t / beatSeconds + 1e-6);
  if (beat < -countInBeats || t >= totalSeconds) return { inBar: null, countIn: false };
  const inBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  return { inBar, countIn: beat < 0 };
}

/** Pad ring fill: how much of the held note's length has been held so far (0–1). */
export function holdProgress(note: TimedNote | null, t: number): number {
  if (!note) return 0;
  const len = note.end - note.onset;
  if (len <= 0) return 1;
  return Math.max(0, Math.min(1, (t - note.onset) / len));
}

/** Onset index under the playhead: the last note that has started (with a small look-ahead), or null at the end. */
export function cursorAt(notes: TimedNote[], t: number, totalSeconds: number, lookAhead = 0.05): number | null {
  if (notes.length === 0 || t >= totalSeconds) return null;
  let idx = 0;
  for (const n of notes) {
    if (n.onset <= t + lookAhead) idx = n.index;
    else break;
  }
  return idx;
}

/**
 * "So far" accuracy while playing, from the starts judged up to now (holds are added in the final result), in whole
 * percent rounded down as Results shows it (§6.3): 31 Perfect and a Great read 99%, not 100%.
 * null before anything was judged or tapped: there is no score yet (shown as a dash, not 100%).
 */
export function liveAccuracy(judged: Judgement[], extraTaps: number): number | null {
  if (judged.length === 0) return extraTaps > 0 ? 0 : null;
  const pts = judged.reduce((s, j) => s + POINTS[j], 0) + extraTaps * EXTRA_TAP_POINTS;
  return wholePercent(pts / judged.length);
}

/** Judgement line above the pad: message key + colour role. */
export function pressFeedback(p: LivePress): { key: string; tone: 'good' | 'gold' | 'miss' | 'muted' } {
  switch (p.judgement) {
    case 'perfect':
      return { key: 'judge.perfect', tone: 'good' };
    case 'great':
      return { key: 'judge.great', tone: 'good' };
    case 'good':
      if (p.offsetMs === null) return { key: 'judge.good', tone: 'gold' };
      return { key: p.offsetMs < 0 ? 'judge.goodEarly' : 'judge.goodLate', tone: 'gold' };
    case 'miss':
      return { key: 'judge.miss', tone: 'miss' };
    default:
      return { key: 'judge.extra', tone: 'muted' };
  }
}

/** A JudgeResult holding only the notes judged so far, for the live length lane. */
export function partialResult(notes: NoteResult[], extraTaps: number): JudgeResult {
  const counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  for (const n of notes) counts[n.judgement]++;
  return {
    notes,
    extraTaps,
    points: 0,
    maxPoints: 0,
    accuracy: 0,
    stars: 0,
    combo: 0,
    maxCombo: 0,
    counts,
    holds: { right: 0, short: 0, long: 0 },
    meanOffsetMs: 0,
    sdOffsetMs: 0,
    tendency: 'steady',
  };
}
