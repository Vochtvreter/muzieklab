import { DEFAULT_SETTINGS } from '../core/defaults';
import { generateExercise } from '../core/generator';
import type { JudgeResult, NoteResult, Stars } from '../core/types';
import { DAILY_BONUS, levelInfo, levelStart, rankOf, xpForResult } from './xp';

const exercise = { ...generateExercise({ ...DEFAULT_SETTINGS, bars: 4 }, 1), difficulty: 4 };
const result = (accuracy: number, stars: Stars, judgements: NoteResult['judgement'][] = ['perfect']): JudgeResult =>
  ({ accuracy, stars, notes: judgements.map((judgement, index) => ({ index, judgement })) }) as unknown as JudgeResult;

describe('xpForResult', () => {
  it('is bars × (4 + difficulty) × accuracy', () => {
    expect(xpForResult(exercise, result(50, 1))).toBe(16); // 4 × 8 × 0.5
    expect(xpForResult(exercise, result(100, 2))).toBe(32);
  });
  it('adds the star and daily bonuses', () => {
    expect(xpForResult(exercise, result(90, 3))).toBe(29 + 5);
    expect(xpForResult(exercise, result(100, 5))).toBe(32 + 20);
    expect(xpForResult(exercise, result(100, 2), true)).toBe(32 + DAILY_BONUS);
  });
  it('gives nothing when no note was hit', () => {
    expect(xpForResult(exercise, result(0, 0, ['miss', 'miss']), true)).toBe(0);
  });
});

describe('levels', () => {
  it('starts each level 50 XP further apart', () => {
    expect([1, 2, 3, 4, 8].map(levelStart)).toEqual([0, 100, 250, 450, 1750]);
  });
  it('reads level, progress and rank from total XP', () => {
    expect(levelInfo(0)).toEqual({ level: 1, rank: 'tick', into: 0, span: 100, total: 0 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({ level: 2, into: 0, span: 150 });
    expect(levelInfo(1700)).toMatchObject({ level: 7, rank: 'measure', into: 350, span: 400 });
    expect(levelInfo(1750)).toMatchObject({ level: 8, rank: 'groove', into: 0 });
  });
  it('climbs the six ranks in order', () => {
    expect([1, 3, 5, 8, 12, 16, 40].map(rankOf)).toEqual(['tick', 'count', 'measure', 'groove', 'metronome', 'maestro', 'maestro']);
  });
});
