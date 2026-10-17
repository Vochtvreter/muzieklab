import { DEFAULT_NOTE_SETTINGS, DEFAULT_SETTINGS, generateExercise, type JudgeResult, type NoteResult } from '../core/api';
import { defaultProgress, DEFAULT_PREFS } from '../game/storage';
import { makeNoteRun, reducer, type AppState } from './store';

const exercise = generateExercise({ ...DEFAULT_SETTINGS, bars: 1 }, 1);
const state = (): AppState => ({
  prefs: DEFAULT_PREFS,
  progress: defaultProgress(),
  settings: DEFAULT_SETTINGS,
  run: { exercise, lessonId: null, daily: null },
  last: null,
  noteSettings: DEFAULT_NOTE_SETTINGS,
  noteRun: null,
  noteLast: null,
});
const result = (judgements: NoteResult['judgement'][], accuracy = 80, stars: JudgeResult['stars'] = 2): JudgeResult =>
  ({
    notes: judgements.map((judgement, index) => ({ index, judgement, offsetMs: null, hold: null, releaseOffsetMs: null, tap: null })),
    accuracy,
    stars,
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

describe('reducer: rewards', () => {
  const daily = (): AppState => ({ ...state(), run: { exercise, lessonId: null, daily: '2026-10-17' } });

  it('adds the XP a run earned and reports it', () => {
    const next = reducer({ ...state(), progress: { ...defaultProgress(), xp: 90 } }, { type: 'finish', result: result(['good']), taps: [], today: '2026-10-17' });
    expect(next.last?.reward.xp).toBeGreaterThan(0);
    expect(next.last?.reward.xpBefore).toBe(90);
    expect(next.progress.xp).toBe(90 + next.last!.reward.xp);
    expect(next.last?.reward.streak).toBe(1);
  });

  it('records the daily challenge, its first-play bonus and a new personal best', () => {
    const first = reducer(daily(), { type: 'finish', result: result(['good'], 70, 1), taps: [], today: '2026-10-17' });
    expect(first.progress.daily).toEqual({ day: '2026-10-17', stars: 1, accuracy: 70 });
    expect(first.last?.reward.dailyBest).toBe(true);
    const again = reducer({ ...first, run: daily().run }, { type: 'finish', result: result(['good'], 60, 2), taps: [], today: '2026-10-17' });
    expect(again.progress.daily).toEqual({ day: '2026-10-17', stars: 2, accuracy: 70 });
    expect(again.last?.reward.dailyBest).toBe(false);
    // The bonus (20 XP) comes once a day.
    expect(first.last!.reward.xp - again.last!.reward.xp).toBeGreaterThanOrEqual(20);
    expect(again.progress.dailyBest).toBe(70);
  });

  it('daily and lesson runs leave the free-practice settings alone', () => {
    const run = daily().run!;
    expect(reducer(state(), { type: 'start', run }).progress.lastSettings).toBeNull();
    expect(reducer(state(), { type: 'start', run: { ...run, daily: null } }).progress.lastSettings).toBe(exercise.settings);
  });
});

describe('reducer: Read notes', () => {
  const run = makeNoteRun({ ...DEFAULT_NOTE_SETTINGS, count: 10 }, 5, {});
  const started = (): AppState => reducer(state(), { type: 'noteStart', run });

  it('scores the round, earns XP, keeps the streak and updates the weak spots', () => {
    const answers = run.notes.map((_, i) => ({ outcome: i < 8 ? ('right' as const) : ('wrong' as const), ms: 1200, given: { kind: 'piano' as const, pc: 0 } }));
    const next = reducer(started(), { type: 'noteFinish', answers, today: '2026-10-17' });
    expect(next.noteLast?.result.accuracy).toBe(80);
    expect(next.noteLast?.reward.xp).toBeGreaterThan(0);
    expect(next.progress.xp).toBe(next.noteLast?.reward.xp);
    expect(next.progress.practiceDays).toEqual(['2026-10-17']);
    expect(next.noteLast?.reward.streak).toBe(1);
    expect(Object.keys(next.progress.notes.weak).length).toBeGreaterThan(0);
  });

  it('does not count a round with no note answered as practice', () => {
    const answers = run.notes.slice(0, 3).map(() => ({ outcome: 'timeout' as const, ms: 5000, given: null }));
    const next = reducer(started(), { type: 'noteFinish', answers, today: '2026-10-17' });
    expect(next.progress.practiceDays).toEqual([]);
    expect(next.noteLast?.reward).toMatchObject({ xp: 0, streak: null });
  });

  it('saves the setup with the progress, and Learn sections once', () => {
    const s = reducer(state(), { type: 'noteSettings', settings: { ...DEFAULT_NOTE_SETTINGS, keys: ['G'] } });
    expect(s.progress.notes.settings?.keys).toEqual(['G']);
    const r = reducer(reducer(s, { type: 'learnRead', ids: ['8.2', '8.1'] }), { type: 'learnRead', ids: ['8.1'] });
    expect(r.progress.learnRead).toEqual(['8.1', '8.2']);
  });
});
