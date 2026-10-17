import { DEFAULT_SETTINGS, generateExercise, type JudgeResult, type NoteResult } from '../core/api';
import { defaultProgress, DEFAULT_PREFS } from '../game/storage';
import { reducer, type AppState } from './store';

const exercise = generateExercise({ ...DEFAULT_SETTINGS, bars: 1 }, 1);
const state = (): AppState => ({
  prefs: DEFAULT_PREFS,
  progress: defaultProgress(),
  settings: DEFAULT_SETTINGS,
  run: { exercise, lessonId: null },
  last: null,
});
const result = (judgements: NoteResult['judgement'][]): JudgeResult =>
  ({
    notes: judgements.map((judgement, index) => ({ index, judgement, offsetMs: null, hold: null, releaseOffsetMs: null, tap: null })),
  }) as unknown as JudgeResult;

describe('reducer: finish', () => {
  it('a run with at least one hit note counts as a practice day', () => {
    const next = reducer(state(), { type: 'finish', result: result(['miss', 'good']), taps: [], today: '2026-10-17' });
    expect(next.progress.practiceDays).toEqual(['2026-10-17']);
  });

  it('a run left to play out with nothing hit does not keep the streak', () => {
    const next = reducer(state(), { type: 'finish', result: result(['miss', 'miss']), taps: [], today: '2026-10-17' });
    expect(next.progress.practiceDays).toEqual([]);
    expect(next.last).not.toBeNull();
  });
});
