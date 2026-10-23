import { DEFAULT_NOTE_SETTINGS, DEFAULT_SCALE_SETTINGS, DEFAULT_SETTINGS, generateExercise, scaleId, type JudgeResult, type NoteResult, type ScaleSettings } from '../core/api';
import { noteLessonSettings } from '../game/notesPath';
import { defaultProgress, DEFAULT_PREFS } from '../game/storage';
import { makeNoteRun, makeScaleRun, practiceHold, practiceHoldPatch, practiceSettings, reducer, runSettings, type AppState } from './store';

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
  scaleSettings: DEFAULT_SCALE_SETTINGS,
  scaleHub: { tab: 'major', key: 'G' },
  scaleRun: null,
  scaleLast: null,
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

  it('remembers the lesson\'s stars before the run, so Results can tell a first pass from a replay', () => {
    const lesson = (stars: 0 | 1 | 2 | 3): AppState => ({
      ...state(),
      run: { exercise, lessonId: '1.1', daily: null },
      progress: { ...defaultProgress(), lessons: stars ? { '1.1': { stars, bestAccuracy: 70 } } : {} },
    });
    const first = reducer(lesson(1), { type: 'finish', result: result(['good'], 80, 2), taps: [], today: '2026-10-17' });
    expect(first.last?.lessonStarsBefore).toBe(1);
    expect(first.progress.lessons['1.1'].stars).toBe(2);
    expect(reducer(lesson(0), { type: 'finish', result: result(['good']), taps: [], today: '2026-10-17' }).last?.lessonStarsBefore).toBe(0);
    expect(reducer(state(), { type: 'finish', result: result(['good']), taps: [], today: '2026-10-17' }).last?.lessonStarsBefore).toBe(0);
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
    expect(first.progress.daily).toEqual({ day: '2026-10-17', tier: 1, stars: 1, accuracy: 70 });
    expect(first.last?.reward.dailyBest).toBe(true);
    const again = reducer({ ...first, run: daily().run }, { type: 'finish', result: result(['good'], 60, 2), taps: [], today: '2026-10-17' });
    expect(again.progress.daily).toEqual({ day: '2026-10-17', tier: 1, stars: 2, accuracy: 70 });
    expect(again.last?.reward.dailyBest).toBe(false);
    // The bonus (20 XP) comes once a day.
    expect(first.last!.reward.xp - again.last!.reward.xp).toBeGreaterThanOrEqual(20);
    expect(again.progress.dailyBest).toBe(70);
  });

  it('keeps the tier the daily was first played at that day, also after passing a unit', () => {
    const first = reducer(daily(), { type: 'finish', result: result(['good'], 92, 3), taps: [], today: '2026-10-17' });
    expect(first.progress.daily?.tier).toBe(1);
    // Unit 1 passed that afternoon: the daily played again is still the tier-1 one, and so is its record.
    const lessons = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`1.${n}`, { stars: 2 as const, bestAccuracy: 80 }]));
    const later = { ...first, run: daily().run, progress: { ...first.progress, lessons } };
    const again = reducer(later, { type: 'finish', result: result(['good'], 60, 1), taps: [], today: '2026-10-17' });
    expect(again.progress.daily).toEqual({ day: '2026-10-17', tier: 1, stars: 3, accuracy: 92 });
    // The next day's daily is played at the new tier.
    const next = reducer({ ...later, run: { exercise, lessonId: null, daily: '2026-10-18' } }, { type: 'finish', result: result(['good'], 80, 2), taps: [], today: '2026-10-18' });
    expect(next.progress.daily?.tier).toBe(2);
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

  it('scores a round once: a second finish of the same round changes nothing', () => {
    const answers = run.notes.map(() => ({ outcome: 'right' as const, ms: 900, given: { kind: 'piano' as const, pc: 0 } }));
    const once = reducer(started(), { type: 'noteFinish', answers, today: '2026-10-17' });
    expect(reducer(once, { type: 'noteFinish', answers, today: '2026-10-17' })).toBe(once);
  });

  it('a lesson round records its stars under its path, and counts the notes left as missed', () => {
    const settings = noteLessonSettings('notes', '1.1')!;
    const lessonRun = makeNoteRun(settings, 7, {}, [], { track: 'notes', id: '1.1' });
    const s = reducer(state(), { type: 'noteStart', run: lessonRun });
    // All ten right: three stars on "notes:1.1", not on the rhythm lesson "1.1".
    const right = lessonRun.notes.map(() => ({ outcome: 'right' as const, ms: 900, given: { kind: 'piano' as const, pc: 0 } }));
    const done = reducer(s, { type: 'noteFinish', answers: right, today: '2026-10-22' });
    expect(done.progress.lessons['notes:1.1']?.stars).toBe(3);
    expect(done.progress.lessons['1.1']).toBeUndefined();
    expect(done.noteLast?.lessonStarsBefore).toBe(0);
    // Three answered right, then skipped: 3 of 10, no stars; the summary keeps the three answered.
    const skipped = reducer(s, { type: 'noteFinish', answers: right.slice(0, 3), today: '2026-10-22' });
    expect(skipped.noteLast?.result).toMatchObject({ total: 10, right: 3, stars: 0 });
    expect(skipped.noteLast?.answers).toHaveLength(3);
    expect(skipped.progress.lessons['notes:1.1']?.stars).toBe(0);
    // Played again: the stars before this round are kept for Round done.
    const again = reducer({ ...s, progress: done.progress }, { type: 'noteFinish', answers: right.slice(0, 3), today: '2026-10-22' });
    expect(again.noteLast?.lessonStarsBefore).toBe(3);
    expect(again.progress.lessons['notes:1.1']?.stars).toBe(3);
  });

  it('free practice scores the notes answered only', () => {
    const answers = run.notes.slice(0, 3).map(() => ({ outcome: 'right' as const, ms: 900, given: { kind: 'piano' as const, pc: 0 } }));
    const next = reducer(started(), { type: 'noteFinish', answers, today: '2026-10-22' });
    expect(next.noteLast?.result).toMatchObject({ total: 3, right: 3 });
    expect(Object.keys(next.progress.lessons)).toEqual([]);
  });

  it('saves the setup with the progress, and Learn sections once', () => {
    const s = reducer(state(), { type: 'noteSettings', settings: { ...DEFAULT_NOTE_SETTINGS, keys: ['G'] } });
    expect(s.progress.notes.settings?.keys).toEqual(['G']);
    const r = reducer(reducer(s, { type: 'learnRead', ids: ['8.2', '8.1'] }), { type: 'learnRead', ids: ['8.1'] });
    expect(r.progress.learnRead).toEqual(['8.1', '8.2']);
  });
});

describe('reducer: scales', () => {
  const settings: ScaleSettings = { ...DEFAULT_SCALE_SETTINGS, keyMode: 'pick', keys: ['G', 'D', 'A'] };
  const started = (): AppState => reducer(state(), { type: 'scaleStart', run: makeScaleRun(settings, 5) });

  it('scores a round on first tries, saves the best stars and adds the XP', () => {
    const s = started();
    const [a, b] = s.scaleRun!.scales;
    const played = [
      { scale: a, mistakes: 0 },
      { scale: b, mistakes: 1 },
      { scale: { ...b, again: true }, mistakes: 0 },
    ];
    const next = reducer({ ...s, progress: { ...s.progress, scales: { settings: null, stars: { 'G-major': 3 } } } }, { type: 'scaleFinish', played, today: '2026-10-21' });
    expect(next.scaleLast!.result.total).toBe(2);
    expect(next.scaleLast!.starsBefore).toEqual({ 'G-major': 3 });
    expect(next.progress.scales.stars[scaleId(a)]).toBe(3);
    expect(next.progress.scales.stars[scaleId(b)]).toBe(2);
    expect(next.scaleLast!.reward.xp).toBe(2 * (3 + 2));
    expect(next.progress.xp).toBe(10);
    expect(next.progress.practiceDays).toEqual(['2026-10-21']);
  });

  it('scores a round once', () => {
    const s = started();
    const played = [{ scale: s.scaleRun!.scales[0], mistakes: 0 }];
    const once = reducer(s, { type: 'scaleFinish', played, today: '2026-10-21' });
    expect(reducer(once, { type: 'scaleFinish', played, today: '2026-10-21' })).toBe(once);
  });

  it('a round with no scale finished keeps no streak and earns nothing', () => {
    const next = reducer(started(), { type: 'scaleFinish', played: [], today: '2026-10-21' });
    expect(next.progress.practiceDays).toEqual([]);
    expect(next.scaleLast!.reward.xp).toBe(0);
  });

  it('with one key, the setup follows the key picked on the circle', () => {
    const one = reducer(state(), { type: 'scaleHub', hub: { tab: 'minor', key: 'D' } });
    expect(one.scaleSettings.keys).toEqual(['D']);
    expect(one.progress.scales.settings?.keys).toEqual(['D']);
    const picked = reducer({ ...state(), scaleSettings: settings }, { type: 'scaleHub', hub: { tab: 'major', key: 'F' } });
    expect(picked.scaleSettings.keys).toEqual(['G', 'D', 'A']);
    expect(picked.scaleHub).toEqual({ tab: 'major', key: 'F' });
  });
});

describe('reducer: reset progress', () => {
  it('also puts the free-practice setup back to the defaults (it is kept with the progress)', () => {
    const custom = { ...state(), settings: { ...DEFAULT_SETTINGS, meters: ['3/4' as const], tempo: 132 } };
    const reset = reducer(custom, { type: 'resetProgress' });
    // Back at lesson 1.1: tap only until the path teaches holding again.
    expect(reset.settings).toEqual({ ...DEFAULT_SETTINGS, hold: false });
    expect(reducer({ ...custom, prefs: { ...DEFAULT_PREFS, holdEarly: true } }, { type: 'resetProgress' }).settings.hold).toBe(true);
    expect(reducer({ ...custom, prefs: { ...DEFAULT_PREFS, holdMode: 'tap', holdEarly: true } }, { type: 'resetProgress' }).settings.hold).toBe(false);
  });
});

describe('practice hold', () => {
  const unit1Done = { ...defaultProgress(), lessons: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`1.${n}`, { stars: 2 as const, bestAccuracy: 80 }])) };
  const unit1Half = { ...defaultProgress(), lessons: { '1.1': { stars: 3 as const, bestAccuracy: 95 }, '1.2': { stars: 2 as const, bestAccuracy: 80 } } };

  it('follows the path: tap only until unit 2 (the unit that teaches holding) is open', () => {
    expect(practiceHold(DEFAULT_PREFS, defaultProgress())).toBe(false);
    expect(practiceHold(DEFAULT_PREFS, unit1Half)).toBe(false);
    expect(practiceHold(DEFAULT_PREFS, unit1Done)).toBe(true);
  });

  it('tap only in Settings → Input always wins; the setup switch can turn holding on early', () => {
    expect(practiceHold({ ...DEFAULT_PREFS, holdMode: 'tap' }, unit1Done)).toBe(false);
    expect(practiceHold({ ...DEFAULT_PREFS, holdMode: 'tap', holdEarly: true }, unit1Done)).toBe(false);
    expect(practiceHold({ ...DEFAULT_PREFS, holdEarly: true }, defaultProgress())).toBe(true);
  });

  it('the setup switch: on holds now; off takes back the early choice before unit 2, else sets tap only', () => {
    expect(practiceHoldPatch({ progress: defaultProgress() }, true)).toEqual({ holdMode: 'hold', holdEarly: true });
    expect(practiceHoldPatch({ progress: defaultProgress() }, false)).toEqual({ holdEarly: false });
    expect(practiceHoldPatch({ progress: unit1Done }, false)).toEqual({ holdMode: 'tap', holdEarly: false });
    for (const progress of [defaultProgress(), unit1Done]) {
      for (const on of [true, false]) {
        const prefs = { ...DEFAULT_PREFS, ...practiceHoldPatch({ progress }, on) };
        expect(practiceHold(prefs, progress), `on: ${on}`).toBe(on);
      }
    }
  });

  it('every free-practice start uses it; lessons keep their own hold', () => {
    const s = { prefs: DEFAULT_PREFS, progress: defaultProgress(), settings: { ...DEFAULT_SETTINGS, hold: true } };
    expect(practiceSettings(s, s.settings).hold).toBe(false);
    expect(runSettings(s, null).hold).toBe(false);
    expect(runSettings({ ...s, progress: unit1Done }, null).hold).toBe(true);
    expect(runSettings(s, '1.1').hold).toBe(false);
    expect(runSettings(s, '2.1').hold).toBe(true);
  });
});
