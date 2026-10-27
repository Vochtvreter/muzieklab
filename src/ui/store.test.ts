import { DEFAULT_NOTE_SETTINGS, DEFAULT_SCALE_SETTINGS, DEFAULT_SETTINGS, generateExercise, scaleId, type JudgeResult, type NoteResult, type ScaleSettings } from '../core/api';
import { exerciseHas, introId, lessonIntros } from '../game/intro';
import { noteLessonSettings } from '../game/notesPath';
import { lessonSettings } from '../game/path';
import { PATH_UNITS } from '../game/tracks';
import { defaultProgress, defaultStats, DEFAULT_PREFS, sanitizeProgress, shiftDay, type DayStats, type Prefs, type Progress } from '../game/storage';
import { CHAPTERS } from './learn/chapters';
import type { Me } from '../../shared/api';
import { makeLessonRun, makeNoteRun, makeRun, makeScaleRun, practiceHold, practiceHoldPatch, practiceSettings, reducer, runSettings, type Action, type AppState } from './store';

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
  account: { me: null, api: 'unknown', notice: null, sync: 'idle' },
});
const result = (judgements: NoteResult['judgement'][], accuracy = 80, stars: JudgeResult['stars'] = 2): JudgeResult =>
  ({
    notes: judgements.map((judgement, index) => ({ index, judgement, offsetMs: null, hold: null, releaseOffsetMs: null, tap: null })),
    accuracy,
    stars,
  }) as unknown as JudgeResult;

/** Two stars on every lesson of the Learning path's first `units` units, under their progress keys. */
const pathPassed = (units: number): Progress['lessons'] =>
  Object.fromEntries(PATH_UNITS.slice(0, units).flatMap((u) => u.lessons.map((l) => [l.key, { stars: 2 as const, bestAccuracy: 80 }])));

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

  it('keeps the calibration the run was played with, so calibrating from Results does not change its tip', () => {
    const finish: Action = { type: 'finish', result: result(['good']), taps: [], today: '2026-10-17' };
    const before = reducer(state(), finish).last;
    expect(before).toMatchObject({ calibrationMs: 0, calibrated: false });
    const calibrated = reducer({ ...state(), prefs: { ...DEFAULT_PREFS, calibrationMs: 120, calibratedAt: '2026-10-12' } }, finish).last;
    expect(calibrated).toMatchObject({ calibrationMs: 120, calibrated: true });
    // Calibrating afterwards changes the prefs, not the finished run.
    const after = reducer({ ...state(), last: before }, { type: 'prefs', patch: { calibrationMs: 130, calibratedAt: '2026-10-17' } });
    expect(after.last).toBe(before);
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
    const lessons = pathPassed(3);
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
    const r = reducer(reducer(s, { type: 'learnRead', ids: ['8.2', '8.1'], today: '2026-10-22' }), { type: 'learnRead', ids: ['8.1'], today: '2026-10-22' });
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
    const next = reducer({ ...s, progress: { ...s.progress, scales: { settings: null, stars: { 'G-major': 3 } } } }, { type: 'scaleFinish', played, today: '2026-10-21', seconds: 40 });
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
    const once = reducer(s, { type: 'scaleFinish', played, today: '2026-10-21', seconds: 40 });
    expect(reducer(once, { type: 'scaleFinish', played, today: '2026-10-21', seconds: 40 })).toBe(once);
  });

  it('a round with no scale finished keeps no streak and earns nothing', () => {
    const next = reducer(started(), { type: 'scaleFinish', played: [], today: '2026-10-21', seconds: 5 });
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
    expect(reducer({ ...custom, prefs: { ...DEFAULT_PREFS, holdEarly: 'hold' } }, { type: 'resetProgress' }).settings.hold).toBe(true);
    expect(reducer({ ...custom, prefs: { ...DEFAULT_PREFS, holdMode: 'tap', holdEarly: 'hold' } }, { type: 'resetProgress' }).settings.hold).toBe(false);
  });
});

describe('practice hold', () => {
  // Rhythm unit 1 and the note unit after it (mi) passed: rhythm unit 2, which teaches holding, is open.
  const unit1Done = { ...defaultProgress(), lessons: pathPassed(3) };
  const unit1Half = { ...defaultProgress(), lessons: { '1.1': { stars: 3 as const, bestAccuracy: 95 }, '1.2': { stars: 2 as const, bestAccuracy: 80 } } };

  it('follows the path: tap only until unit 2 (the unit that teaches holding) is open', () => {
    expect(practiceHold(DEFAULT_PREFS, defaultProgress())).toBe(false);
    expect(practiceHold(DEFAULT_PREFS, unit1Half)).toBe(false);
    expect(practiceHold(DEFAULT_PREFS, unit1Done)).toBe(true);
  });

  it('tap only in Settings → Input always wins; the setup switch can turn holding on early', () => {
    expect(practiceHold({ ...DEFAULT_PREFS, holdMode: 'tap' }, unit1Done)).toBe(false);
    expect(practiceHold({ ...DEFAULT_PREFS, holdMode: 'tap', holdEarly: 'hold' }, unit1Done)).toBe(false);
    expect(practiceHold({ ...DEFAULT_PREFS, holdEarly: 'tap' }, defaultProgress())).toBe(true);
  });

  it('the setup switch: on holds now and remembers the Input it replaced; off puts that back before unit 2, else sets tap only', () => {
    const before = defaultProgress();
    const tap: Prefs = { ...DEFAULT_PREFS, holdMode: 'tap' };
    expect(practiceHoldPatch({ prefs: tap, progress: before }, true)).toEqual({ holdMode: 'hold', holdEarly: 'tap' });
    expect(practiceHoldPatch({ prefs: { ...tap, holdMode: 'hold', holdEarly: 'tap' }, progress: before }, false)).toEqual({ holdMode: 'tap', holdEarly: null });
    expect(practiceHoldPatch({ prefs: DEFAULT_PREFS, progress: before }, true)).toEqual({ holdMode: 'hold', holdEarly: 'hold' });
    expect(practiceHoldPatch({ prefs: { ...DEFAULT_PREFS, holdEarly: 'hold' }, progress: before }, false)).toEqual({ holdMode: 'hold', holdEarly: null });
    expect(practiceHoldPatch({ prefs: DEFAULT_PREFS, progress: unit1Done }, false)).toEqual({ holdMode: 'tap', holdEarly: null });
    for (const progress of [before, unit1Done]) {
      for (const prefs of [DEFAULT_PREFS, tap]) {
        for (const on of [true, false]) {
          expect(practiceHold({ ...prefs, ...practiceHoldPatch({ prefs, progress }, on) }, progress), `on: ${on}`).toBe(on);
        }
      }
    }
  });

  it('turned on and off again, the switch leaves Settings → Input as it was (tap or hold, before or after unit 2)', () => {
    const toggle = (prefs: Prefs, progress: Progress): Prefs => ({ ...prefs, ...practiceHoldPatch({ prefs, progress }, !practiceHold(prefs, progress)) });
    for (const progress of [defaultProgress(), unit1Done]) {
      for (const holdMode of ['tap', 'hold'] as const) {
        const start: Prefs = { ...DEFAULT_PREFS, holdMode };
        const once = toggle(start, progress);
        const twice = toggle(once, progress);
        const where = `${holdMode}, unit 2 ${progress === unit1Done ? 'open' : 'locked'}`;
        expect(practiceHold(once, progress), where).toBe(!practiceHold(start, progress));
        expect(twice.holdMode, where).toBe(holdMode);
        expect(practiceHold(twice, progress), where).toBe(practiceHold(start, progress));
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

describe('makeLessonRun', () => {
  const ids = (lessonId: string): string[] => lessonIntros(lessonId).map(introId);
  /** Start seeds as newSeed gives them: spread over 31 bits. */
  const seeds = Array.from({ length: 150 }, (_, i) => (Math.imul(i + 1, 2654435761) >>> 1) || 1);

  it('a lesson that introduces a symbol starts with an exercise that shows it (3.4 the whole rest, 7.1 the dot)', () => {
    // 3.4 tries about 22 seeds a start (its whole rest is in about 1 exercise in 22), so it gets fewer starts here.
    for (const [lessonId, starts] of [['3.4', seeds.slice(0, 50)], ['7.1', seeds]] as const) {
      const settings = lessonSettings(lessonId);
      // Without the search many would not.
      expect(starts.filter((seed) => exerciseHas(makeRun(settings, seed, lessonId)!.exercise, ids(lessonId))).length).toBeLessThan(starts.length / 2);
      for (const seed of starts) {
        const run = makeLessonRun(settings, seed, lessonId)!;
        expect(exerciseHas(run.exercise, ids(lessonId)), `${lessonId}, seed ${seed}`).toBe(true);
        expect(run).toMatchObject({ lessonId, daily: null });
        expect(run.exercise.settings).toEqual(settings);
      }
    }
  });

  it('keeps the first seed when the exercise already shows it all, or the lesson introduces nothing', () => {
    for (const lessonId of ['1.1', '1.3', '1.2', '3.1']) {
      for (const seed of seeds.slice(0, 20)) expect(makeLessonRun(lessonSettings(lessonId), seed, lessonId)!.exercise.seed).toBe(seed);
    }
  });
});

const ME: Me = {
  id: '6718f0c2a1b2c3d4e5f60001',
  email: 'sam@example.com',
  name: 'Sam Jansen',
  locale: null,
  roles: [],
  roleNames: {},
  permissions: ['self.manage', 'progress.own', 'class.join'],
  premium: { active: false, until: null },
  createdAt: '2026-10-20T09:00:00.000Z',
  feedbackMode: false,
};

describe('reducer: account', () => {
  it('starts unknown, and a signed-in answer makes the API reachable', () => {
    const next = reducer(state(), { type: 'signedIn', me: ME });
    expect(next.account).toEqual({ me: ME, api: 'reachable', notice: null, sync: 'idle' });
  });

  it('signing out forgets the account and can leave a notice for Settings', () => {
    const inState = reducer(state(), { type: 'signedIn', me: ME });
    const out = reducer(inState, { type: 'signedOut', notice: 'deleted' });
    expect(out.account).toEqual({ me: null, api: 'reachable', notice: 'deleted', sync: 'idle' });
    expect(reducer(out, { type: 'accountNotice', notice: null }).account.notice).toBeNull();
  });

  it('no answer keeps the cached account, shown as offline', () => {
    const cached: AppState = { ...state(), account: { me: ME, api: 'unknown', notice: null, sync: 'idle' } };
    const next = reducer(cached, { type: 'apiUnreachable' });
    expect(next.account).toEqual({ me: ME, api: 'unreachable', notice: null, sync: 'idle' });
    expect(reducer(next, { type: 'apiUnreachable' })).toBe(next);
  });

  it('a new account answer replaces the old one (a saved name)', () => {
    const inState = reducer(state(), { type: 'signedIn', me: ME, notice: 'welcome' });
    expect(inState.account.notice).toBe('welcome');
    const renamed = reducer(inState, { type: 'signedIn', me: { ...ME, name: 'Sam J.' } });
    expect(renamed.account.me?.name).toBe('Sam J.');
    expect(renamed.account.notice).toBeNull();
  });

  it('resetting progress keeps the account', () => {
    const inState = reducer(state(), { type: 'signedIn', me: ME });
    expect(reducer(inState, { type: 'resetProgress' }).account).toBe(inState.account);
  });
});

// --- The Progress tab: figures, achievements, skill levels and personal bests ---------------------------------------

const TODAY = '2026-10-25';
/** What the store keeps is what storage and the account read back (game/merge.ts: a saved copy stays saved). */
const readsBack = (p: Progress): void => expect(sanitizeProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
const finish = (patch: Partial<Extract<Action, { type: 'finish' }>> = {}): Action => ({ type: 'finish', result: result(['perfect', 'good']), taps: [], today: TODAY, ...patch });
const withRun = (run: Partial<AppState['run'] & object>, progress: Progress = defaultProgress()): AppState => ({ ...state(), progress, run: { exercise, lessonId: null, daily: null, ...run } });
const day = (patch: Partial<DayStats>): DayStats => ({ sec: 0, rounds: 0, acc: 0, off: 0, hits: 0, cells: {}, ...patch });

describe('reducer: the Progress tab’s figures', () => {
  it('a rhythm round adds its seconds, accuracy and cells to today, and rhythm reading as practised', () => {
    const next = reducer(state(), finish());
    const d = next.progress.stats.days[TODAY];
    expect(d).toMatchObject({ rounds: 1, acc: 80 });
    expect(d.sec).toBeGreaterThan(0);
    expect(Object.keys(d.cells).length).toBeGreaterThan(0);
    expect(next.progress.stats.seen).toEqual({ rhythm: TODAY });
    readsBack(next.progress);
  });

  it('a run left to play out adds no figures', () => {
    const next = reducer(state(), finish({ result: result(['miss', 'miss']) }));
    expect(next.progress.stats).toEqual(defaultStats());
  });

  it('finishes a run once: a second finish of the same run changes nothing', () => {
    const once = reducer(state(), finish());
    expect(reducer(once, finish())).toBe(once);
    // A new attempt (Retry, or Echo's Tap it back) is a new run.
    expect(reducer({ ...once, run: { ...once.run! } }, finish()).progress.stats.days[TODAY].rounds).toBe(2);
  });

  it('an Echo round counts its listening as minutes, its material level, and rhythm by ear', () => {
    const echo = generateExercise({ ...DEFAULT_SETTINGS, mode: 'echo', bars: 4 }, 3);
    const s = withRun({ exercise: echo });
    const once = reducer(s, finish({ result: result(['perfect', 'great', 'great', 'great'], 92, 3), echo: { plays: 1, replays: 0 } }));
    const twice = reducer(withRun({ exercise: echo }), finish({ result: result(['perfect', 'great', 'great', 'great'], 92, 3), echo: { plays: 2, replays: 1 } }));
    expect(twice.progress.stats.days[TODAY].sec).toBeGreaterThan(once.progress.stats.days[TODAY].sec);
    expect(once.progress.stats.seen).toEqual({ ear: TODAY });
    expect(Object.values(once.progress.stats.echo)).toEqual([[1, 3]]);
    // Heard once at ★★★: No replays needed.
    expect(once.last?.reward.achievements).toEqual(['noReplays']);
    expect(twice.last?.reward.achievements).toEqual([]);
    readsBack(once.progress);
  });

  it('a Read notes round adds the clefs, the answer times, the key and the seconds', () => {
    const run = makeNoteRun({ ...DEFAULT_NOTE_SETTINGS, count: 10, keys: ['G'] }, 5, {});
    const answers = run.notes.map((_, i) => ({ outcome: i < 9 ? ('right' as const) : ('wrong' as const), ms: 1500, given: { kind: 'piano' as const, pc: 0 } }));
    const next = reducer(reducer(state(), { type: 'noteStart', run }), { type: 'noteFinish', answers, today: TODAY });
    const s = next.progress.stats;
    expect(s.clefs).toEqual({ treble: [9, 10] });
    expect(s.lastKey).toEqual({ key: 'G', clef: 'treble' });
    expect(s.days[TODAY].sec).toBe(15);
    expect(s.seen).toEqual({ treble: TODAY });
    // Whole staff in G major at 90%: treble levels 1, 2, 3 and 6 have a round.
    expect(Object.keys(s.reading).sort()).toEqual(['treble:1', 'treble:2', 'treble:3', 'treble:6']);
    // Levels 1–3 are passed; level 4 (middle C) needs a round with a ledger line.
    expect(next.progress.skills).toEqual({ 'treble:1': TODAY, 'treble:2': TODAY, 'treble:3': TODAY });
    readsBack(next.progress);
  });

  it('a Scales round adds its seconds (at most 90 a scale) and scales as practised', () => {
    const run = makeScaleRun({ ...DEFAULT_SCALE_SETTINGS, keys: ['C'] }, 5);
    const s = reducer(state(), { type: 'scaleStart', run });
    const played = [{ scale: run.scales[0], mistakes: 0 }];
    const next = reducer(s, { type: 'scaleFinish', played, today: TODAY, seconds: 250 });
    expect(next.progress.stats.days[TODAY].sec).toBe(90);
    expect(next.progress.stats.seen).toEqual({ scales: TODAY });
    // C major at three stars: scales level 1.
    expect(next.progress.skills).toEqual({ 'scales:1': TODAY });
    readsBack(next.progress);
    expect(reducer(s, { type: 'scaleFinish', played: [], today: TODAY, seconds: 30 }).progress.stats.days).toEqual({});
  });

  it('marking a Learn section read is theory practised, and passes theory levels', () => {
    let s = state();
    for (const id of ['1.1', '1.2']) s = reducer(s, { type: 'learnRead', ids: [id], today: TODAY });
    expect(s.progress.stats.seen).toEqual({ theory: TODAY });
    expect(s.progress.skills).toEqual({});
    s = reducer(s, { type: 'learnRead', ids: ['1.3'], today: TODAY });
    expect(s.progress.skills).toEqual({ 'theory:1': TODAY });
    // A section read again the same day changes nothing; on a later day it clears a review.
    expect(reducer(s, { type: 'learnRead', ids: ['1.1'], today: TODAY })).toBe(s);
    const later = reducer(s, { type: 'learnRead', ids: ['1.1'], today: '2026-11-20' });
    expect(later.progress.learnRead).toBe(s.progress.learnRead);
    expect(later.progress.stats.seen.theory).toBe('2026-11-20');
    readsBack(later.progress);
  });
});

describe('reducer: achievements, skill levels and personal bests', () => {
  it('a round earns its achievements and lists them on the reward', () => {
    const fast = generateExercise({ ...DEFAULT_SETTINGS, tempo: 160, bars: 1 }, 1);
    const next = reducer(withRun({ exercise: fast }), finish({ result: result(['good', 'good'], 80, 2) }));
    expect(next.last?.reward.achievements).toEqual(['tempo160']);
    expect(next.progress.achievements).toEqual({ tempo160: TODAY });
    // Earned once.
    expect(reducer({ ...next, run: { ...next.run! } }, finish({ result: result(['good', 'good'], 80, 2) })).last?.reward.achievements).toEqual([]);
  });

  it('the 7th practice day in a row earns the 7-day streak', () => {
    const six = { ...defaultProgress(), practiceDays: Array.from({ length: 6 }, (_, i) => shiftDay(TODAY, i - 6)) };
    const next = reducer(withRun({}, six), finish());
    expect(next.last?.reward.achievements).toEqual(['streak7']);
    expect(next.progress.achievements.streak7).toBe(TODAY);
    // A day missed in between: no streak yet.
    expect(reducer(withRun({}, six), finish({ today: shiftDay(TODAY, 1) })).last?.reward.achievements).toEqual([]);
  });

  it('passes a skill level when a round meets its last check', () => {
    // Rhythm unit 1: lessons 1.1–1.4 at ★★ and the half notes at 85% already; the unit review at ★★★ passes level 1.
    const lessons = Object.fromEntries(['1.1', '1.2', '1.3', '1.4'].map((id) => [id, { stars: 2 as const, bestAccuracy: 85 }]));
    const progress = { ...defaultProgress(), lessons, stats: { ...defaultStats(), days: { [TODAY]: day({ rounds: 1, acc: 90, cells: { half: [1100, 1200] } }) } } };
    const next = reducer(withRun({ lessonId: '1.5' }, progress), finish({ result: result(['perfect', 'perfect'], 93, 3) }));
    expect(next.progress.skills).toEqual({ 'rhythm:1': TODAY });
    readsBack(next.progress);
  });

  it('reports a new personal best on a lesson played before, by its Learning path number, and the daily’s', () => {
    const played = { ...defaultProgress(), lessons: { '1.1': { stars: 2 as const, bestAccuracy: 78 } } };
    expect(reducer(withRun({ lessonId: '1.1' }, played), finish({ result: result(['perfect'], 84.4, 2) })).last?.reward.best).toEqual({ kind: 'lesson', lesson: '2.1', accuracy: 84 });
    expect(reducer(withRun({ lessonId: '1.1' }, played), finish({ result: result(['perfect'], 70, 1) })).last?.reward.best).toBeNull();
    // Beaten as shown, in whole %: 87.45% after 87.4% is still 87%, no new best; 87.5% shows 88%.
    const close = { ...defaultProgress(), lessons: { '1.1': { stars: 2 as const, bestAccuracy: 87.4 } } };
    expect(reducer(withRun({ lessonId: '1.1' }, close), finish({ result: result(['perfect'], 87.45, 2) })).last?.reward.best).toBeNull();
    expect(reducer(withRun({ lessonId: '1.1' }, close), finish({ result: result(['perfect'], 87.5, 2) })).last?.reward.best).toEqual({ kind: 'lesson', lesson: '2.1', accuracy: 88 });
    // The first play of a lesson is no personal best.
    expect(reducer(withRun({ lessonId: '1.1' }), finish({ result: result(['perfect'], 90, 3) })).last?.reward.best).toBeNull();
    const daily = reducer(withRun({ daily: TODAY }), finish({ result: result(['perfect'], 88, 2) })).last?.reward;
    expect(daily).toMatchObject({ dailyBest: true, best: { kind: 'daily', accuracy: 88 } });
    expect(reducer(state(), finish()).last?.reward).toMatchObject({ achievements: [], best: null });
  });

  it('a note lesson played before reports its personal best too', () => {
    const settings = noteLessonSettings('notes', '1.1')!;
    const run = makeNoteRun(settings, 7, {}, [], { track: 'notes', id: '1.1' });
    const right = run.notes.map(() => ({ outcome: 'right' as const, ms: 900, given: { kind: 'piano' as const, pc: 0 } }));
    const before = { ...defaultProgress(), lessons: { 'notes:1.1': { stars: 1 as const, bestAccuracy: 70 } } };
    const next = reducer(reducer({ ...state(), progress: before }, { type: 'noteStart', run }), { type: 'noteFinish', answers: right, today: TODAY });
    expect(next.noteLast?.reward.best).toMatchObject({ kind: 'lesson', accuracy: 100 });
    expect(next.noteLast?.reward.best).not.toMatchObject({ lesson: 'notes:1.1' });
  });

  it('on start, gives progress from before the achievements and levels it meets (once: nothing new, nothing changes)', () => {
    const days = Array.from({ length: 9 }, (_, i) => shiftDay('2026-09-01', i));
    const learnRead = CHAPTERS[0].sections.map((s) => s.id);
    const before = { ...state(), progress: { ...defaultProgress(), practiceDays: days, learnRead, scales: { settings: null, stars: { 'C-major': 2 } } } };
    const next = reducer(before, { type: 'evaluate', today: TODAY });
    expect(next.progress.achievements).toEqual({ streak7: '2026-09-07' });
    expect(next.progress.skills).toEqual({ 'theory:1': TODAY, 'scales:1': TODAY });
    expect(reducer(next, { type: 'evaluate', today: '2026-10-26' })).toBe(next);
    const empty = state();
    expect(reducer(empty, { type: 'evaluate', today: TODAY })).toBe(empty);
    readsBack(next.progress);
  });
});


describe('reducer: what it saves reads back unchanged (the account sees a saved copy as saved)', () => {
  it('after rhythm, Echo, Read notes, Scales and Learn, one after another, over several days', () => {
    let s = state();
    const check = (): void => readsBack(s.progress);
    const echo = generateExercise({ ...DEFAULT_SETTINGS, mode: 'echo', notes: ['quarter', 'eighth', 'sixteenth'], bars: 4, tempo: 132 }, 9);
    for (let i = 0; i < 3; i++) {
      const today = shiftDay(TODAY, i);
      s = reducer({ ...s, run: { exercise, lessonId: '1.1', daily: null } }, { type: 'finish', result: result(['perfect', 'great', 'good', 'miss'], 77.7, 2), taps: [], today });
      check();
      s = reducer({ ...s, run: { exercise: echo, lessonId: null, daily: today } }, { type: 'finish', result: result(['perfect', 'perfect', 'great'], 95.2, 4), taps: [], today, echo: { plays: 1, replays: 0 } });
      check();
      const notes = makeNoteRun({ ...DEFAULT_NOTE_SETTINGS, clefs: ['treble', 'bass'], range: 'ledger1', keys: ['D', 'Bb'], mixKeys: true, count: 20 }, 40 + i, s.progress.notes.weak);
      s = reducer(s, { type: 'noteStart', run: notes });
      s = reducer(s, { type: 'noteFinish', answers: notes.notes.map((_, j) => ({ outcome: j % 6 ? ('right' as const) : ('timeout' as const), ms: 700 + 333 * j, given: j % 6 ? { kind: 'piano' as const, pc: 0 } : null })), today });
      check();
      const scales = makeScaleRun({ ...DEFAULT_SCALE_SETTINGS, keyMode: 'pick', keys: ['C', 'G', 'F'], types: ['major', 'natural'] }, 3 + i);
      s = reducer(s, { type: 'scaleStart', run: scales });
      s = reducer(s, { type: 'scaleFinish', played: scales.scales.map((scale, j) => ({ scale, mistakes: j % 3 })), today, seconds: 123.4 });
      check();
      s = reducer(s, { type: 'learnRead', ids: [`${i + 1}.1`], today });
      check();
      s = reducer(s, { type: 'evaluate', today });
      check();
    }
    expect(Object.keys(s.progress.stats.days)).toHaveLength(3);
    expect(Object.keys(s.progress.stats.seen).sort()).toEqual(['bass', 'ear', 'rhythm', 'scales', 'theory', 'treble']);
  });
});
