// @vitest-environment jsdom
import { DEFAULT_NOTE_SETTINGS } from '../core/noteRound';
import { DEFAULT_SCALE_SETTINGS } from '../core/scaleRound';
import { DEFAULT_SETTINGS } from '../core/defaults';
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  PROGRESS_KEY,
  addPracticeDay,
  defaultNoteNames,
  defaultProgress,
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
    expect(loadProgress()).toEqual(defaultProgress());
  });

  it('round-trips', () => {
    const prefs = { ...DEFAULT_PREFS, language: 'nl', theme: 'dark' as const, calibrationMs: 38, calibratedAt: '2026-10-12', seenHowTo: true, metronomeLook: 'analog' as const, pathTrack: 'keys' as const, seenIntros: ['meter:3/4', 'note:half'], holdEarly: true };
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
    };
    saveProgress(progress);
    expect(loadProgress()).toEqual(progress);
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

  it('keeps the Path tab on a known path, else Rhythm', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ pathTrack: 'notes' }));
    expect(loadPrefs().pathTrack).toBe('notes');
    localStorage.setItem(PREFS_KEY, JSON.stringify({ pathTrack: 'scales' }));
    expect(loadPrefs().pathTrack).toBe('rhythm');
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

  it('prefs saved before seenHold count holds as seen only when the player has played holds', () => {
    const old = (prefs: object, progress: Partial<Progress>): boolean => {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...defaultProgress(), ...progress }));
      return loadPrefs().seenHold;
    };
    // In unit 1 (tap only): the holding version of How to play is still to come.
    expect(old({ seenHowTo: true }, { lessons: { '1.1': { stars: 3, bestAccuracy: 95 } } })).toBe(false);
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
    expect(loadPrefs().holdEarly).toBe(false);
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
});
