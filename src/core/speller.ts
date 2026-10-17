import type { Exercise, NotatedBar } from './types';

/** Rhythm -> notation (§5.7). onsetIndex numbering matches buildTimeline(). */
export function spellExercise(exercise: Exercise): NotatedBar[] {
  throw new Error('not implemented: spellExercise ' + exercise.seed);
}
