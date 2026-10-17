/**
 * Public engine API (implemented in the sibling modules). The UI imports only from here.
 */
export { getMeter } from './meters';
export { DEFAULT_SETTINGS } from './defaults';
export { checkSettings } from './feasibility';
export type { Feasibility } from './feasibility';
export { generateExercise } from './generator';
export { spellExercise } from './speller';
export { buildTimeline } from './timeline';
export { judge, createLiveJudge } from './judge';
export type { LiveJudge, LivePress } from './judge';
export { coachTip } from './coach';
export type { CoachTip } from './coach';
export * from './types';
