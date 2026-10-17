import type { Exercise, Settings } from './types';

/** Seeded, deterministic exercise generator (§5.3–5.5). */
export function generateExercise(settings: Settings, seed: number): Exercise {
  throw new Error('not implemented: generateExercise ' + settings.bars + seed);
}
