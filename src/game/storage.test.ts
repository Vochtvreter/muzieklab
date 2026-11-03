// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_NOTE_SETTINGS } from '../core/noteRound';
import { DEFAULT_SCALE_SETTINGS } from '../core/scaleRound';
import { DEFAULT_SETTINGS } from '../core/defaults';
import type { Me } from '../../shared/api';
import {
  ACCOUNT_KEY,
  DEFAULT_PREFS,
  loadAccount,
  PREFS_KEY,
  PROGRESS_KEY,
  addPracticeDay,
  defaultNoteNames,
  defaultProgress,
  defaultStats,
  isEmptyProgress,
  loadPrefs,
  loadProgress,
  localDateIso,
  resetProgress,
  saveAccount,
  savePrefs,
  saveProgress,
  shiftDay,
  streak,
  daysBetween,
  mondayOf,
  weekdayOf,
  type Progress,
} from './storage';

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    expect(streak(['2026-10-15', '2026-10-16', '2026-10-17'], '2026-10-17')).toBe(3);
  });
  it('ends yesterday when today has no practice yet', () => {
    expect(streak(['2026-10-15', '2026-10-16'], '2026-10-17')).toBe(2);
  });
  it('is 0 after a missed day', () => {
    expect(streak(['2026-10-14', '2026-10-15'], '2026-10-17')).toBe(0);
    expect(streak([], '2026-10-17')).toBe(0);
  });
  it('stops at a gap and ignores order and duplicates', () => {
    expect(streak(['2026-10-17', '2026-10-12', '2026-10-16', '2026-10-16', '2026-10-14'], '2026-10-17')).toBe(2);
  });
  it('crosses month, year and DST boundaries', () => {
    expect(streak(['2026-02-28', '2026-03-01'], '2026-03-01')).toBe(2);
    expect(streak(['2025-12-31', '2026-01-01', '2026-01-02'], '2026-01-02')).toBe(3);
    expect(streak(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01')).toBe(3);
    expect(streak(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26')).toBe(3); // EU DST change
  });
});

describe('prefs and progress storage', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to defaults when nothing is stored', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(loadProgress()).toEqual(defaultProgress());
  });

  it('round-trips', () => {
    const prefs = { ...DEFAULT_PREFS, language: 'nl', theme: 'dark' as const, calibrationMs: 38, calibratedAt: '2026-10-12', seenHowTo: true, metronomeLook: 'analog' as const, seenIntros: ['meter:3/4', 'note:half'], holdEarly: 'tap' as const };
    savePrefs(prefs);
    expect(loadPrefs()).toEqual(prefs);
    const progress: Progress = {
      lessons: { '1.1': { stars: 3, bestAccuracy: 97 }, '1.2': { stars: 1, bestAccuracy: 61.5 }, '1.3': { stars: 4, bestAccuracy: 98 }, '1.4': { stars: 5, bestAccuracy: 100 } },
      practiceDays: ['2026-10-16', '2026-10-17'],
      lastSettings: { ...DEFAULT_SETTINGS, meters: ['3/4', '4/4'], tempo: 88 },
      xp: 1445,
      daily: { day: '2026-10-17', tier: 3, stars: 3, accuracy: 91.5 },
      dailyBest: 94,
      notes: { settings: { ...DEFAULT_NOTE_SETTINGS, keys: ['G', 'Eb'], mixKeys: true }, weak: { 'treble:38': 3, 'bass:21': 1 } },
      scales: { settings: { ...DEFAULT_SCALE_SETTINGS, keyMode: 'pick', keys: ['D', 'Bb'], types: ['major', 'harmonic'] }, stars: { 'D-major': 3, 'E-harmonic': 1 } },
      learnRead: ['8.1', '8.2'],
      stats: {
        days: {
          '2026-10-16': { sec: 754, rounds: 3, acc: 251, off: -412, hits: 31, cells: { quarter: [1690, 1800], rests: [420, 500] } },
          '2026-10-17': { sec: 60, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} },
        },
        clefs: { treble: [41, 48], bass: [7, 10] },
        noteMs: { 'treble:38': [9400, 4], 'bass:21': [1200, 1] },
        lastKey: { key: 'G', clef: 'treble' },
        reading: { 'treble:1': [95, 1450], 'bass:4': [80, 0] },
        echo: { '1': [3, 4], '5': [0, 2] },
        seen: { rhythm: '2026-10-17', treble: '2026-10-16' },
      },
      achievements: { streak7: '2026-10-12', perfectBar: '2026-10-16' },
      skills: { 'rhythm:1': '2026-10-12', 'theory:10': '2026-10-17' },
    };
    saveProgress(progress);
    expect(loadProgress()).toEqual(progress);
  });

  it('reads a save from before the Progress tab with empty figures, achievements and skill levels', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ xp: 120, practiceDays: ['2026-10-17'] }));
    expect(loadProgress()).toMatchObject({ xp: 120, stats: defaultStats(), achievements: {}, skills: {} });
  });

  it('repairs the Progress tab’s figures field by field, and keeps the newest 42 days', () => {
    const days: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) days[shiftDay('2026-09-01', i)] = { sec: 30, rounds: 1, acc: 80, off: 5, hits: 2, cells: {} };
    days['2026-10-20'] = { sec: 99999.4, rounds: 2.4, acc: 900, off: -12.6, hits: -3, cells: { ties: [7, 5], half: [3.2, 4], bogus: [1, 2], quarter: [1, 0], rests: 'x' } };
    days['not a day'] = { sec: 1 };
    days['2026-10-19'] = 'bad';
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        stats: {
          days,
          clefs: { treble: [12, 10], bass: [3, 0], alto: [1, 1] },
          noteMs: { 'treble:38': [99999, 2], 'x:1': [1, 1], 'bass:21': [100, 1, 3] },
          lastKey: { key: 'H', clef: 'treble' },
          reading: { 'treble:1': [120, -5], 'treble:11': [90, 1], 'bass:3': [88.6, 1499.5] },
          echo: { '1': [2.6, 9], '9': [1, 1], '2': ['x', 1] },
          seen: { rhythm: '2026-10-17', theory: 'yesterday', piano: '2026-10-17' },
        },
        achievements: { streak7: '2026-10-12', perfectBar: 5, hundredTaps: '2026-10-12' },
        skills: { 'rhythm:1': '2026-10-12', 'rhythm:11': '2026-10-12', 'piano:1': '2026-10-12', 'ear:0': '2026-10-12', 'bass:10': 'x' },
      }),
    );
    const s = loadProgress().stats;
    const kept = Object.keys(s.days).sort();
    expect(kept).toHaveLength(42);
    expect(kept[kept.length - 1]).toBe('2026-10-20');
    // 2026-10-19 was not a record: the newest 42 valid days are Sep 8 to Oct 18, and Oct 20.
    expect(kept[0]).toBe('2026-09-08');
    expect(kept).not.toContain('2026-10-19');
    expect(s.days['2026-10-20']).toEqual({ sec: 86400, rounds: 2, acc: 200, off: -13, hits: 0, cells: { ties: [5, 5], half: [3, 4] } });
    expect(s.clefs).toEqual({ treble: [10, 10] });
    expect(s.noteMs).toEqual({ 'treble:38': [30000, 2] });
    expect(s.lastKey).toBeNull();
    expect(s.reading).toEqual({ 'treble:1': [100, 0], 'bass:3': [89, 1500] });
    expect(s.echo).toEqual({ '1': [3, 5] });
    expect(s.seen).toEqual({ rhythm: '2026-10-17' });
    const p = loadProgress();
    expect(p.achievements).toEqual({ streak7: '2026-10-12' });
    expect(p.skills).toEqual({ 'rhythm:1': '2026-10-12' });
  });

  it('keeps valid Read notes weak spots and Learn sections only', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ notes: { weak: { 'treble:38': 9, 'alto:20': 2, 'bass:21': 0, x: 1 } }, learnRead: ['8.1', 'x', '8.1'] }));
    expect(loadProgress().notes).toEqual({ settings: null, weak: { 'treble:38': 5 } });
    expect(loadProgress().learnRead).toEqual(['8.1']);
  });

  it('keeps valid Scales stars only, 1–3 per known scale', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ scales: { settings: { types: ['minor', 'melodic'], keyMode: 'x' }, stars: { 'D-major': 9, 'H-major': 2, 'G#-harmonic': 2, 'E-natural': 0 } } }));
    expect(loadProgress().scales).toEqual({
      settings: { ...DEFAULT_SCALE_SETTINGS, types: ['melodic'] },
      stars: { 'D-major': 3, 'G#-harmonic': 2 },
    });
  });

  it('moves the old chapter 8 sections 8.6 and 8.7 to chapters 9 and 10', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ learnRead: ['8.1', '8.6', '8.7', '9.1'] }));
    expect(loadProgress().learnRead).toEqual(['8.1', '9.1', '10.1', '10.2', '10.3', '10.4']);
  });

  it('keeps the daily\'s tier when it is a unit number, and reads a record without one (older saves)', () => {
    const daily = (tier: unknown): unknown => {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ daily: { day: '2026-10-17', tier, stars: 2, accuracy: 80 } }));
      return loadProgress().daily;
    };
    expect(daily(2)).toEqual({ day: '2026-10-17', tier: 2, stars: 2, accuracy: 80 });
    for (const bad of [undefined, 0, -1, 2.5, '2', null]) expect(daily(bad), String(bad)).toEqual({ day: '2026-10-17', stars: 2, accuracy: 80 });
  });

  it('reads an all-perfect 4 saved before the diamond as the diamond', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ lessons: { '1.1': { stars: 4, bestAccuracy: 100 }, '1.2': { stars: 4, bestAccuracy: 97 } } }));
    expect(loadProgress().lessons).toEqual({ '1.1': { stars: 5, bestAccuracy: 100 }, '1.2': { stars: 4, bestAccuracy: 97 } });
  });

  it('keeps a known language or system, and falls back to system for an unknown one', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ language: 'nl' }));
    expect(loadPrefs().language).toBe('nl');
    localStorage.setItem(PREFS_KEY, JSON.stringify({ language: 'xx' }));
    expect(loadPrefs().language).toBe('system');
    localStorage.setItem(PREFS_KEY, JSON.stringify({ language: 7 }));
    expect(loadPrefs().language).toBe('system');
  });

  it('gives a new player note names by the device language; saved prefs keep theirs', () => {
    const lang = vi.spyOn(navigator, 'language', 'get');
    lang.mockReturnValue('fr-FR');
    expect(loadPrefs().noteNames).toBe('solfege');
    localStorage.clear();
    lang.mockReturnValue('en-GB');
    expect(loadPrefs().noteNames).toBe('letters');
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, noteNames: 'letters' }));
    lang.mockReturnValue('it-IT');
    expect(loadPrefs().noteNames).toBe('letters');
    // Saved before Read notes had the choice: do re mi, as they had it.
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: 'dark' }));
    lang.mockReturnValue('en-US');
    expect(loadPrefs().noteNames).toBe('solfege');
    lang.mockRestore();
  });

  it('a player with progress but no saved prefs is not new: do re mi, as they had it', () => {
    // Prefs are saved only when one changes: a player who only played Read notes from Home has progress and no prefs.
    const lang = vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
    saveProgress({ ...defaultProgress(), xp: 40, notes: { settings: null, weak: { 'treble:38': 2 } } });
    expect(loadPrefs().noteNames).toBe('solfege');
    // Nothing saved at all: a new player gets the device's usual names.
    localStorage.clear();
    expect(loadPrefs().noteNames).toBe('letters');
    lang.mockRestore();
  });

  it('saves a new player\'s note names at once, so they stay once there is progress', () => {
    const lang = vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
    expect(loadPrefs().noteNames).toBe('letters');
    saveProgress({ ...defaultProgress(), xp: 40 });
    expect(loadPrefs().noteNames).toBe('letters');
    lang.mockRestore();
  });

  it('drops the Path tab\'s path pick: there is one Learning path since 0.11.0', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ pathTrack: 'notes' }));
    expect(loadPrefs()).not.toHaveProperty('pathTrack');
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem(PREFS_KEY, '{not json');
    localStorage.setItem(PROGRESS_KEY, '[1,2');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(loadProgress().lessons).toEqual({});
  });

  it('repairs invalid fields and keeps the valid ones', () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ theme: 'purple', leniency: 'relaxed', volumes: { metronome: 3, rhythm: 'x' }, calibrationMs: 41, metronomeLook: 'sundial' }),
    );
    const p = loadPrefs();
    expect(p.theme).toBe('system');
    expect(p.metronomeLook).toBe('digital');
    expect(p.leniency).toBe('relaxed');
    expect(p.volumes).toEqual({ metronome: 1, rhythm: 0.8, tap: 0.5 });
    expect(p.calibrationMs).toBe(41);
    // Settings shows the calibration's day: only a real day (yyyy-mm-dd, as Calibrate saves it), never the stored text.
    for (const [calibratedAt, kept] of [['2026-10-12', '2026-10-12'], ['not a date', null], ['2026-13-45', null], ['2026-02-30', null], ['', null], [12, null]] as const) {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ calibrationMs: 40, calibratedAt }));
      expect(loadPrefs().calibratedAt, String(calibratedAt)).toBe(kept);
      expect(loadPrefs().calibrationMs).toBe(40);
    }

    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        lessons: { '2.1': { stars: 7, bestAccuracy: 50 }, '2.2': 'bad' },
        practiceDays: ['2026-10-17', 'yesterday', 5, '2026-10-16', '2026-10-17'],
        lastSettings: { meters: ['5/4'], notes: ['quarter', 'bogus'], tempo: 999, bars: 0 },
      }),
    );
    const g = loadProgress();
    expect(g.lessons).toEqual({ '2.1': { stars: 0, bestAccuracy: 50 } });
    expect(g.practiceDays).toEqual(['2026-10-16', '2026-10-17']);
    expect(g.lastSettings).toMatchObject({ meters: ['4/4'], notes: ['quarter'], tempo: 200, bars: 1 });
  });

  it('does not throw when localStorage fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow();
    spy.mockRestore();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    get.mockRestore();
  });

  it('prefs saved before seenHold count holds as seen only when the player has played holds', () => {
    const old = (prefs: object, progress: Partial<Progress>): boolean => {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...defaultProgress(), ...progress }));
      return loadPrefs().seenHold;
    };
    // In unit 1 (tap only): the holding version of How to play is still to come.
    expect(old({ seenHowTo: true }, { lessons: { '1.1': { stars: 3, bestAccuracy: 95 } } })).toBe(false);
    // Note lessons have no taps: sol's unit and Read notes do not count as holds.
    expect(old({ seenHowTo: true }, { lessons: { 'pitch:2.1': { stars: 3, bestAccuracy: 95 }, 'notes:3.1': { stars: 2, bestAccuracy: 85 } } })).toBe(false);
    // Past unit 1, or after free practice or a daily challenge (hold by default): holding is known.
    expect(old({ seenHowTo: true }, { lessons: { '2.1': { stars: 2, bestAccuracy: 80 } } })).toBe(true);
    expect(old({ seenHowTo: true }, { lastSettings: { ...DEFAULT_SETTINGS } })).toBe(true);
    expect(old({ seenHowTo: true }, { daily: { day: '2026-10-17', stars: 2, accuracy: 80 } })).toBe(true);
    // Never saw How to play: the first exercise shows it anyway. A saved seenHold is kept as it is.
    expect(old({ seenHowTo: false }, { lessons: { '2.1': { stars: 2, bestAccuracy: 80 } } })).toBe(false);
    expect(old({ seenHowTo: true, seenHold: false }, { lessons: { '2.1': { stars: 2, bestAccuracy: 80 } } })).toBe(false);
  });

  it('keeps known intro ids only', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ seenIntros: ['note:half', 'note:half', 'x', 3, 'ties'], holdEarly: 'yes' }));
    expect(loadPrefs().seenIntros).toEqual(['note:half', 'ties']);
    expect(loadPrefs().holdEarly).toBeNull();
  });

  it('reads the setup hold switch saved as on (true, before it kept the Input it replaced) as replacing tap & hold', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ holdMode: 'hold', holdEarly: true }));
    expect(loadPrefs().holdEarly).toBe('hold');
    localStorage.setItem(PREFS_KEY, JSON.stringify({ holdMode: 'hold', holdEarly: false }));
    expect(loadPrefs().holdEarly).toBeNull();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ holdMode: 'hold', holdEarly: 'tap' }));
    expect(loadPrefs().holdEarly).toBe('tap');
  });

  it('prefs saved before seenIntros count the symbols of the lessons played as shown', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ seenHowTo: true }));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...defaultProgress(), lessons: { '1.2': { stars: 1, bestAccuracy: 60 }, '2.2': { stars: 2, bestAccuracy: 80 } } }));
    expect(loadPrefs().seenIntros.sort()).toEqual(['note:half', 'rest:quarter']);
    // A saved list is kept as it is.
    localStorage.setItem(PREFS_KEY, JSON.stringify({ seenHowTo: true, seenIntros: [] }));
    expect(loadPrefs().seenIntros).toEqual([]);
  });

  it('resetProgress clears progress but keeps prefs', () => {
    savePrefs({ ...DEFAULT_PREFS, calibrationMs: 20 });
    saveProgress({ ...defaultProgress(), lessons: { '1.1': { stars: 2, bestAccuracy: 80 } } });
    resetProgress();
    expect(loadProgress().lessons).toEqual({});
    expect(loadPrefs().calibrationMs).toBe(20);
  });
});

describe('defaultNoteNames', () => {
  it('is do re mi where music lessons use it, letters elsewhere', () => {
    for (const tag of ['fr', 'fr-CA', 'it-IT', 'es-419', 'pt-BR', 'ro', 'nl-BE', 'nl_BE']) expect(defaultNoteNames(tag), tag).toBe('solfege');
    for (const tag of ['en', 'en-US', 'nl', 'nl-NL', 'de-DE', 'ja', '', undefined]) expect(defaultNoteNames(tag), String(tag)).toBe('letters');
  });
});

describe('helpers', () => {
  it('localDateIso uses the local calendar date', () => {
    expect(localDateIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('addPracticeDay keeps days unique and sorted', () => {
    const p: Progress = { ...defaultProgress(), practiceDays: ['2026-10-17'] };
    expect(addPracticeDay(p, '2026-10-17')).toBe(p);
    expect(addPracticeDay(p, '2026-10-16').practiceDays).toEqual(['2026-10-16', '2026-10-17']);
  });
  it('counts days and weekdays across months, years and DST changes', () => {
    expect(shiftDay('2026-10-25', 1)).toBe('2026-10-26'); // EU DST change
    expect(daysBetween('2026-10-17', '2026-10-17')).toBe(0);
    expect(daysBetween('2026-10-01', '2026-10-25')).toBe(24);
    expect(daysBetween('2025-12-31', '2026-03-01')).toBe(60);
    expect(daysBetween('2026-10-25', '2026-10-01')).toBe(-24);
    expect(weekdayOf('2026-10-19')).toBe(0); // a Monday
    expect(weekdayOf('2026-10-25')).toBe(6); // a Sunday
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
  });
  it('isEmptyProgress sees progress that only has the Progress tab’s figures, an achievement or a skill level', () => {
    expect(isEmptyProgress(defaultProgress())).toBe(true);
    const day = { sec: 20, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} };
    expect(isEmptyProgress({ ...defaultProgress(), stats: { ...defaultStats(), days: { '2026-10-17': day } } })).toBe(false);
    expect(isEmptyProgress({ ...defaultProgress(), stats: { ...defaultStats(), seen: { theory: '2026-10-17' } } })).toBe(false);
    expect(isEmptyProgress({ ...defaultProgress(), stats: { ...defaultStats(), lastKey: { key: 'C', clef: 'bass' } } })).toBe(false);
    expect(isEmptyProgress({ ...defaultProgress(), achievements: { perfectBar: '2026-10-17' } })).toBe(false);
    expect(isEmptyProgress({ ...defaultProgress(), skills: { 'scales:1': '2026-10-17' } })).toBe(false);
  });
});

describe('account storage (muzieklab.account.v1)', () => {
  const me: Me = {
    id: '6718f0c2a1b2c3d4e5f60002',
    email: 'ann@example.com',
    name: 'Ann de Vries',
    locale: 'nl',
    roles: ['admin'],
    roleNames: {},
    permissions: ['self.manage', 'accounts.read'],
    premium: { active: true, until: '2027-01-31' },
    createdAt: '2026-10-01T09:00:00.000Z',
    feedbackMode: false,
  };
  beforeEach(() => localStorage.clear());

  it('keeps the signed-in account for offline use, and forgets it on sign-out', () => {
    expect(loadAccount()).toBeNull();
    saveAccount(me);
    expect(loadAccount()).toEqual(me);
    saveAccount(null);
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull();
    expect(loadAccount()).toBeNull();
  });

  it("stores only Me's fields: never a password or a token", () => {
    saveAccount({ ...me, password: 'hunter2hunter2', token: 'abc', session: 'xyz' } as unknown as Me);
    const raw = localStorage.getItem(ACCOUNT_KEY) ?? '';
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['createdAt', 'email', 'feedbackMode', 'id', 'locale', 'name', 'permissions', 'premium', 'roleNames', 'roles']);
    expect(raw).not.toMatch(/hunter2|password|token|session/);
  });

  it('repairs or drops what is not an account', () => {
    localStorage.setItem(ACCOUNT_KEY, '{broken');
    expect(loadAccount()).toBeNull();
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ name: 'No id' }));
    expect(loadAccount()).toBeNull();
    localStorage.setItem(
      ACCOUNT_KEY,
      JSON.stringify({
        ...me,
        roles: ['admin', 'King of all', 'testers', 7],
        roleNames: { testers: 'Testers', 'Bad id': 'x', other: 5 },
        permissions: ['fly', 'accounts.read'],
        locale: 'xx',
        premium: 'yes',
      }),
    );
    expect(loadAccount()).toEqual({
      ...me,
      roles: ['admin', 'testers'],
      roleNames: { testers: 'Testers' },
      permissions: ['accounts.read'],
      locale: null,
      premium: { active: false, until: null },
    });
  });

  it('resetting progress keeps the account', () => {
    saveAccount(me);
    resetProgress();
    expect(loadAccount()).toEqual(me);
  });

  it('does not throw when storage fails', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveAccount(me)).not.toThrow();
    expect(() => saveAccount(null)).not.toThrow();
    set.mockRestore();
    remove.mockRestore();
  });
});

describe('the theme before the app runs (index.html)', () => {
  // index.html's own script sets data-theme from the saved prefs, before the first paint, as App.tsx does after it, and
  // the browser bar's colour too.
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  /** The browser bar's colour on a light or a dark device: the first theme-color meta that matches, in document order. */
  const bar = (device: 'light' | 'dark'): string | undefined =>
    [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
      .find((m) => [null, `(prefers-color-scheme: ${device})`].includes(m.getAttribute('media')))?.content;
  const run = (saved: string | null): string | null => {
    document.documentElement.removeAttribute('data-theme');
    // The head as index.html has it (a script set this way does not run).
    document.head.innerHTML = head;
    if (saved === null) localStorage.removeItem(PREFS_KEY);
    else localStorage.setItem(PREFS_KEY, saved);
    new Function(script)();
    return document.documentElement.getAttribute('data-theme');
  };
  afterEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
  });

  it('sets the theme picked in Settings, page and browser bar, and leaves System to the device', () => {
    expect(script).toContain(PREFS_KEY);
    expect(run(JSON.stringify(DEFAULT_PREFS))).toBeNull();
    // Each device's own colour, which App.tsx forces for that theme too.
    const own = { light: bar('light'), dark: bar('dark') };
    expect(own).toEqual({ light: '#eef1f0', dark: '#101415' });
    for (const theme of ['light', 'dark'] as const) {
      expect(run(JSON.stringify({ ...DEFAULT_PREFS, theme }))).toBe(theme);
      expect([bar('light'), bar('dark')], theme).toEqual([own[theme], own[theme]]);
    }
    expect(run(JSON.stringify({ theme: 'light' }))).toBe('light');
  });

  it('leaves it to the device when nothing usable is saved', () => {
    for (const saved of [null, 'null', '{not json', JSON.stringify({ theme: 'blue' }), '[]']) {
      expect(run(saved), String(saved)).toBeNull();
      expect([bar('light'), bar('dark')], String(saved)).toEqual(['#eef1f0', '#101415']);
    }
  });
});
