import type { JudgeOptions, JudgeResult, Judgement, Tap, Timeline } from './types';

/** Final judgement of a whole run (§6.2–6.3). */
export function judge(timeline: Timeline, taps: Tap[], opts: JudgeOptions): JudgeResult {
  throw new Error('not implemented: judge ' + timeline.notes.length + taps.length + opts.hold);
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
  /** Notes whose window has passed without a press, up to `time` (to show misses live). */
  missedUntil(time: number): number[];
  combo(): number;
  finish(): JudgeResult;
}

export function createLiveJudge(timeline: Timeline, opts: JudgeOptions): LiveJudge {
  throw new Error('not implemented: createLiveJudge ' + timeline.notes.length + opts.hold);
}
