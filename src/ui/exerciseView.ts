/** Derived data for an exercise (notation, timeline), memoised per exercise object. */
import { buildTimeline, spellExercise, type Exercise, type NotatedBar, type Timeline } from '../core/api';

export interface ExerciseView {
  bars: NotatedBar[];
  timeline: Timeline;
  barSeconds: number;
}

const cache = new WeakMap<Exercise, ExerciseView | null>();

export function exerciseView(ex: Exercise): ExerciseView | null {
  if (cache.has(ex)) return cache.get(ex) ?? null;
  let view: ExerciseView | null = null;
  try {
    const timeline = buildTimeline(ex);
    view = { bars: spellExercise(ex), timeline, barSeconds: timeline.beatSeconds * ex.meter.beatsPerBar };
  } catch (e) {
    console.error('exercise view failed', e);
  }
  cache.set(ex, view);
  return view;
}
