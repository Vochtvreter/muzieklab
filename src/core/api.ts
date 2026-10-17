/**
 * Public engine API (implemented in the sibling modules). The UI imports only from here.
 */
export { getMeter } from './meters';
export { DEFAULT_SETTINGS } from './defaults';
export { checkSettings } from './feasibility';
export type { Feasibility } from './feasibility';
export { generateExercise, normaliseSettings } from './generator';
export { spellExercise } from './speller';
export { buildTimeline } from './timeline';
export { judge, createLiveJudge, POINTS, EXTRA_TAP_POINTS } from './judge';
export type { LiveJudge, LivePress } from './judge';
export { coachTip } from './coach';
export { valueKey, restKey } from './values';
export { encodeCode, decodeCode } from './code';
export type { CoachTip } from './coach';
export * from './types';
export * from './pitch';
export * from './noteRound';
