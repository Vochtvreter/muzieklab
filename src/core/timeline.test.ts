import { buildTimeline } from './timeline';
import { makeExercise } from './test-helpers';

describe('buildTimeline', () => {
  it('converts ticks to seconds with the quarter as the beat', () => {
    const tl = buildTimeline(makeExercise('4/4', [[[48, 'n'], [48, 'n'], [96, 'n']]], {}, 120));
    expect(tl.beatSeconds).toBe(0.5);
    expect(tl.totalSeconds).toBe(2);
    expect(tl.notes.map((n) => [n.onset, n.end, n.durationTicks, n.next])).toEqual([
      [0, 0.5, 48, 'note'],
      [0.5, 1, 48, 'note'],
      [1, 2, 96, 'end'],
    ]);
  });

  it('merges ties into one note, also across bar lines', () => {
    const tl = buildTimeline(makeExercise('2/4', [[[48, 'n'], [48, 'n']], [[24, 'n', 't'], [24, 'r'], [48, 'n']]], {}, 60));
    expect(tl.notes).toEqual([
      { index: 0, bar: 0, tick: 0, onset: 0, end: 1, durationTicks: 48, next: 'note' },
      { index: 1, bar: 0, tick: 48, onset: 1, end: 2.5, durationTicks: 72, next: 'rest' },
      { index: 2, bar: 1, tick: 144, onset: 3, end: 4, durationTicks: 48, next: 'end' },
    ]);
    expect(tl.totalSeconds).toBe(4);
  });

  it('says what follows each note', () => {
    const tl = buildTimeline(makeExercise('3/4', [[[48, 'n'], [48, 'r'], [24, 'n'], [24, 'n']]]));
    expect(tl.notes.map((n) => n.next)).toEqual(['rest', 'note', 'end']);
  });
});
