import type { Exercise, TimedNote, Timeline } from './types';
import { PPQ } from './types';

/**
 * Sounding notes in seconds from the exercise start (ties merged). The beat is the quarter note.
 * `bar` is 0-based. Note indexes count onsets (notes that are not tie continuations) in time order,
 * the same numbering as NotatedSymbol.onsetIndex.
 */
export function buildTimeline(exercise: Exercise): Timeline {
  const { meter, bars } = exercise;
  const beatSeconds = 60 / exercise.tempo;
  const tickSeconds = beatSeconds / PPQ;
  const notes: TimedNote[] = [];
  const flat = bars.flatMap((bar, b) => bar.events.map((e) => ({ e, b, tick: b * meter.barTicks + e.start })));

  let current: TimedNote | null = null;
  flat.forEach(({ e, b, tick }, i) => {
    if (e.kind === 'rest') {
      current = null;
      return;
    }
    if (e.tieFromPrev && current) {
      current.durationTicks += e.duration;
    } else {
      current = { index: notes.length, bar: b, tick, onset: tick * tickSeconds, end: 0, durationTicks: e.duration, next: 'end' };
      notes.push(current);
    }
    current.end = (current.tick + current.durationTicks) * tickSeconds;
    const after = flat[i + 1];
    current.next = !after ? 'end' : after.e.kind === 'rest' ? 'rest' : 'note';
  });

  return { notes, totalSeconds: bars.length * meter.barTicks * tickSeconds, beatSeconds };
}
