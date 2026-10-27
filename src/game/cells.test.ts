import { DEFAULT_SETTINGS } from '../core/defaults';
import { generateExercise } from '../core/generator';
import { judge, judgeHold, POINTS } from '../core/judge';
import { getMeter } from '../core/meters';
import { buildTimeline } from '../core/timeline';
import type { Exercise, JudgeResult, MeterId, NoteResult, RhythmEvent, Settings, Tap } from '../core/types';
import { CELL_UNIT, cellPoints, hasSixteenth, materialLevel, noteCells } from './cells';
import { lessonSettings, UNITS } from './path';
import { CELL_IDS } from './storage';

const note = (start: number, duration: number, extra: Partial<RhythmEvent> = {}): RhythmEvent => ({ start, duration, kind: 'note', ...extra });
const rest = (start: number, duration: number): RhythmEvent => ({ start, duration, kind: 'rest' });

/** An exercise with these bars (ticks: a quarter is 48), as the generator would give it. */
function exercise(meter: MeterId, bars: RhythmEvent[][], settings: Partial<Settings> = {}): Exercise {
  return {
    seed: 1,
    settings: { ...DEFAULT_SETTINGS, meters: [meter], notes: ['whole', 'half', 'quarter', 'eighth', 'sixteenth'], rests: ['half', 'quarter', 'eighth'], ...settings },
    meter: getMeter(meter),
    tempo: 80,
    bars: bars.map((events) => ({ events })),
    form: 'a',
    difficulty: 3,
  };
}

const judged = (judgements: NoteResult['judgement'][]): Pick<JudgeResult, 'notes'> => ({
  notes: judgements.map((judgement, index) => ({ index, judgement, offsetMs: null, hold: null, releaseOffsetMs: null, tap: null })),
});

describe('noteCells', () => {
  it('counts quarters, halves, eighths and sixteenths for their own cell', () => {
    const ex = exercise('4/4', [
      [note(0, 48), note(48, 48), note(96, 96)],
      [note(0, 24), note(24, 24), note(48, 12), note(60, 12), note(72, 12), note(84, 12), note(96, 96)],
    ]);
    expect(noteCells(ex)).toEqual([['quarter'], ['quarter'], ['half'], ['eighths'], ['eighths'], ['sixteenths'], ['sixteenths'], ['sixteenths'], ['sixteenths'], ['half']]);
  });

  it('counts the first note after a rest for rests as well, also across a bar line', () => {
    const ex = exercise('4/4', [
      [note(0, 48), rest(48, 48), note(96, 48), rest(144, 48)],
      [note(0, 96), note(96, 96)],
    ]);
    expect(noteCells(ex)).toEqual([['quarter'], ['quarter', 'rests'], ['half', 'rests'], ['half']]);
  });

  it('counts a tied note for ties, also one the speller ties over the middle of the bar', () => {
    const tied = exercise('4/4', [[note(0, 48), note(48, 48, { tieFromPrev: true }), note(96, 96)]], { ties: true });
    expect(noteCells(tied)).toEqual([['ties'], ['half']]);
    // A half on beat 2 of 4/4 is written as two tied quarters.
    const middle = exercise('4/4', [[note(0, 48), note(48, 96), note(144, 48)]], { ties: true });
    expect(noteCells(middle)).toEqual([['quarter'], ['ties'], ['quarter']]);
  });

  it('counts dotted halves, and dotted quarters with the eighth after them', () => {
    const ex = exercise('3/4', [[note(0, 144)], [note(0, 72), note(72, 24), note(96, 48)]], { dotted: true });
    expect(noteCells(ex)).toEqual([['dottedHalf'], ['dottedQE'], ['dottedQE'], ['quarter']]);
    // A plain eighth after a quarter is an eighth.
    expect(noteCells(exercise('2/4', [[note(0, 48), note(48, 24), note(72, 24)]]))).toEqual([['quarter'], ['eighths'], ['eighths']]);
  });

  it('counts whole notes and triplets for no cell', () => {
    const ex = exercise('4/4', [[note(0, 192)], [note(0, 16, { triplet: true }), note(16, 16, { triplet: true }), note(32, 16, { triplet: true }), note(48, 48), note(96, 96)]], { triplets: true });
    expect(noteCells(ex)).toEqual([[], [], [], [], ['quarter'], ['half']]);
  });

  it('numbers notes as the timeline does, in generated exercises', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ex = generateExercise({ ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'eighth', 'sixteenth'], rests: ['quarter', 'eighth'], ties: true, dotted: true, bars: 8 }, seed);
      const cells = noteCells(ex);
      expect(cells).toHaveLength(buildTimeline(ex).notes.length);
      for (const c of cells) for (const id of c) expect(CELL_IDS).toContain(id);
    }
  });
});

describe('cellPoints', () => {
  it('adds each note’s points per cell, of 100 possible', () => {
    const ex = exercise('4/4', [[note(0, 48), rest(48, 48), note(96, 48), note(144, 24), note(168, 24)]]);
    expect(cellPoints(ex, judged(['perfect', 'great', 'good', 'miss']), 'normal')).toEqual({
      quarter: [POINTS.perfect + POINTS.great, 200],
      rests: [POINTS.great, 100],
      eighths: [POINTS.good, 200],
    });
  });

  it('uses the points the accuracy uses: holds included, extra taps not', () => {
    // Every note counts for exactly one cell here, so the cells add up to the run's points.
    const ex = exercise('4/4', [[note(0, 48), note(48, 48), note(96, 96)], [note(0, 96), note(96, 48), note(144, 48)]]);
    const timeline = buildTimeline(ex);
    // Pressed on time, a little late and early, and let go too soon on the halves.
    const taps: Tap[] = timeline.notes.map((n, i) => ({ down: n.onset + [0, 0.03, -0.05, 0.01, 0.06, 0][i], up: i === 2 || i === 3 ? n.onset + 0.1 : n.end - 0.05 }));
    const result = judge(timeline, taps, { hold: true, leniency: 'normal' });
    expect(result.holds.short).toBeGreaterThan(0);
    const cells = cellPoints(ex, result, 'normal');
    const earned = Object.values(cells).reduce((s, x) => s + x![0], 0);
    const possible = Object.values(cells).reduce((s, x) => s + x![1], 0);
    expect(earned).toBe(result.points);
    expect(possible).toBe(result.maxPoints);
    // The cost of a short hold is the judge's.
    const half = timeline.notes[2];
    expect(cells.half![0]).toBe(POINTS[result.notes[2].judgement] + judgeHold(half, taps[2].up, 'normal').points + POINTS[result.notes[3].judgement] + judgeHold(timeline.notes[3], taps[3].up, 'normal').points);
  });

  it('skips results without a note on the timeline', () => {
    const ex = exercise('4/4', [[note(0, 192)]]);
    expect(cellPoints(ex, judged(['perfect', 'perfect', 'good']), 'normal')).toEqual({});
  });
});

describe('materialLevel', () => {
  const q = (n: number): RhythmEvent[] => Array.from({ length: n }, (_, i) => note(48 * i, 48));
  it('is the highest rhythm unit whose material the exercise has', () => {
    expect(materialLevel(exercise('4/4', [q(4)]))).toBe(1);
    expect(materialLevel(exercise('4/4', [[note(0, 96), note(96, 96)]]))).toBe(1);
    expect(materialLevel(exercise('4/4', [[note(0, 96), rest(96, 48), note(144, 48)]]))).toBe(2);
    expect(materialLevel(exercise('3/4', [q(3)]))).toBe(3);
    expect(materialLevel(exercise('4/4', [[note(0, 192)]]))).toBe(3);
    expect(materialLevel(exercise('4/4', [[note(0, 24), note(24, 24), note(48, 48), note(96, 96)]]))).toBe(4);
    expect(materialLevel(exercise('4/4', [[note(0, 24), rest(24, 24), note(48, 48), note(96, 96)]]))).toBe(5);
    expect(materialLevel(exercise('2/4', [q(2)]))).toBe(5);
    expect(materialLevel(exercise('4/4', [[note(0, 48), note(48, 48, { tieFromPrev: true }), note(96, 96)]], { ties: true }))).toBe(6);
    expect(materialLevel(exercise('3/4', [[note(0, 144)]], { dotted: true }))).toBe(7);
    expect(materialLevel(exercise('4/4', [[note(0, 12), note(12, 12), note(24, 24), note(48, 48), note(96, 96)]]))).toBe(8);
  });

  it('puts every rhythm lesson at its own unit or below', () => {
    for (const unit of UNITS) {
      for (const lesson of unit.lessons) {
        for (const seed of [1, 2, 3]) {
          const ex = generateExercise(lessonSettings(lesson.id), seed);
          expect(materialLevel(ex), `${lesson.id} seed ${seed}`).toBeLessThanOrEqual(unit.id);
        }
      }
    }
  });
});

describe('the cells and their units', () => {
  it('opens each cell with the rhythm unit that teaches it', () => {
    expect(CELL_UNIT).toEqual({ quarter: 1, half: 1, rests: 2, eighths: 4, ties: 6, dottedHalf: 7, dottedQE: 7, sixteenths: 8 });
    expect(Object.keys(CELL_UNIT).sort()).toEqual([...CELL_IDS].sort());
  });

  it('finds a sixteenth note as written', () => {
    expect(hasSixteenth(exercise('4/4', [[note(0, 12), note(12, 12), note(24, 24), note(48, 144)]]))).toBe(true);
    expect(hasSixteenth(exercise('4/4', [[note(0, 24), note(24, 24), note(48, 144)]]))).toBe(false);
  });
});
