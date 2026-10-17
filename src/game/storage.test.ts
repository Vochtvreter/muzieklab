// @vitest-environment jsdom
import { DEFAULT_SETTINGS } from '../core/defaults';
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  PROGRESS_KEY,
  addPracticeDay,
  loadPrefs,
  loadProgress,
  localDateIso,
  resetProgress,
  savePrefs,
  saveProgress,
  streak,
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
    expect(loadProgress()).toEqual({ lessons: {}, practiceDays: [], lastSettings: null });
  });

  it('round-trips', () => {
    const prefs = { ...DEFAULT_PREFS, theme: 'dark' as const, calibrationMs: 38, calibratedAt: '2026-10-12', seenHowTo: true, metronomeLook: 'analog' as const };
    savePrefs(prefs);
    expect(loadPrefs()).toEqual(prefs);
    const progress: Progress = {
      lessons: { '1.1': { stars: 3, bestAccuracy: 97 }, '1.2': { stars: 1, bestAccuracy: 61.5 }, '1.3': { stars: 4, bestAccuracy: 98 }, '1.4': { stars: 5, bestAccuracy: 100 } },
      practiceDays: ['2026-10-16', '2026-10-17'],
      lastSettings: { ...DEFAULT_SETTINGS, meters: ['3/4', '4/4'], tempo: 88 },
    };
    saveProgress(progress);
    expect(loadProgress()).toEqual(progress);
  });

  it('reads an all-perfect 4 saved before the diamond as the diamond', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ lessons: { '1.1': { stars: 4, bestAccuracy: 100 }, '1.2': { stars: 4, bestAccuracy: 97 } } }));
    expect(loadProgress().lessons).toEqual({ '1.1': { stars: 5, bestAccuracy: 100 }, '1.2': { stars: 4, bestAccuracy: 97 } });
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

  it('resetProgress clears progress but keeps prefs', () => {
    savePrefs({ ...DEFAULT_PREFS, calibrationMs: 20 });
    saveProgress({ lessons: { '1.1': { stars: 2, bestAccuracy: 80 } }, practiceDays: [], lastSettings: null });
    resetProgress();
    expect(loadProgress().lessons).toEqual({});
    expect(loadPrefs().calibrationMs).toBe(20);
  });
});

describe('helpers', () => {
  it('localDateIso uses the local calendar date', () => {
    expect(localDateIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('addPracticeDay keeps days unique and sorted', () => {
    const p: Progress = { lessons: {}, practiceDays: ['2026-10-17'], lastSettings: null };
    expect(addPracticeDay(p, '2026-10-17')).toBe(p);
    expect(addPracticeDay(p, '2026-10-16').practiceDays).toEqual(['2026-10-16', '2026-10-17']);
  });
});
