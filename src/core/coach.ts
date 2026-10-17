import type { Exercise, JudgeResult, Timeline } from './types';

/** One-line coaching tip (§6.4): message key + params for i18n. */
export interface CoachTip {
  key: string;
  params: Record<string, string | number>;
}

export function coachTip(result: JudgeResult, timeline: Timeline, exercise: Exercise): CoachTip {
  throw new Error('not implemented: coachTip ' + result.accuracy + timeline.notes.length + exercise.seed);
}
