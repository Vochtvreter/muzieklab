/**
 * Progress to seed for the Progress tab, its Skill levels and one skill (App design canvas, Mobile · Progress,
 * ProgressTablet and ProgressDesktop, Skills and SkillDetail): the boards' sample player on the boards' "today",
 * Thursday 15 October 2026, and a new player. Seed it as `muzieklab.progress.v1` and fix the clock first:
 *
 *   await page.clock.setFixedTime(new Date(PROGRESS_CLOCK));
 *   await seed(page, { progress: richProgress(), prefs: PROGRESS_PREFS });
 *
 * The rich progress is what the store keeps: sanitizeProgress leaves it as it is, and the store's start-up check
 * (skill levels, the 7-day streak) adds nothing to it (src/ui/screens/progress/fixture.test.ts).
 *
 * What the boards show, and what it gives: a 12-day streak (Oct 4–15; missed Sep 16, 20, 25 and Oct 3; 28 of 32
 * days), rhythm accuracy and timing per day for Oct 2–15 (no rhythm on Oct 3), 14 · 9 · 17 · 11 minutes Monday to
 * today, the skill map (two weak spots: ties 78%, dotted quarter + eighth 72%; sixteenths locked), 3 achievements,
 * Read notes per clef (treble 88%, bass 74%) and its slowest notes (E 3.1 s, F♯ 2.6 s, bass C 2.4 s), the last key
 * G major in treble clef, the board's scale stars, and skill levels rhythm 6, ear 4, treble 5, bass 3, scales 3 and
 * theory 4 (25 of 60), theory last practised 16 days ago. Level 7 · Measure on 1445 XP (the boards' 1445 / 1500 is
 * not a level boundary in the app; level 8 starts at 1750).
 */
// Types only from storage.ts: it loads the i18n catalogs with import.meta.glob, which Vite resolves and Playwright (which
// loads this file in Node) cannot. defaultProgress below is storage's, written out; fixture.test.ts fails if they differ.
import type { DayStats, Progress } from '../src/game/storage';
import { PATH_UNITS } from '../src/game/tracks';

/** What `defaultProgress()` in src/game/storage.ts gives: a new player. */
function defaultProgress(): Progress {
  return {
    lessons: {},
    practiceDays: [],
    lastSettings: null,
    xp: 0,
    daily: null,
    dailyBest: 0,
    notes: { settings: null, weak: {} },
    scales: { settings: null, stars: {} },
    learnRead: [],
    stats: { days: {}, clefs: {}, noteMs: {}, lastKey: null, reading: {}, echo: {}, seen: {} },
    achievements: {},
    skills: {},
  };
}

/** The boards' today, and a time on it for `page.clock.setFixedTime`. */
export const PROGRESS_DAY = '2026-10-15';
export const PROGRESS_CLOCK = '2026-10-15T12:00:00';
/**
 * Prefs to seed with it: letter names, as the boards write notes (progress saved without prefs reads as a player from
 * before letter names, who had do re mi). Add `theme: 'dark'` or `language: 'nl'` as needed.
 */
export const PROGRESS_PREFS = { noteNames: 'letters' } as const;

/** A day of practice: its seconds, and optionally rhythm rounds (mean accuracy %, mean timing offset ms) and cells. */
function day(sec: number, rhythm?: { acc: number; off: number; rounds?: number; hits?: number }, cells: DayStats['cells'] = {}): DayStats {
  const rounds = rhythm ? (rhythm.rounds ?? 3) : 0;
  const hits = rhythm ? (rhythm.hits ?? 48) : 0;
  return { sec, rounds, acc: rhythm ? rhythm.acc * rounds : 0, off: rhythm ? rhythm.off * hits : 0, hits, cells };
}

/**
 * The skill map's eight cells (rolling accuracy over the last 42 days), a quarter of each on each of the last four
 * days: quarter 96%, half 97%, eighths 89%, rests 86%, ties 78%, dotted half 91%, dotted quarter + eighth 72%; no
 * sixteenths (locked: rhythm unit 8 is not open on the path yet). [points earned, points possible], 100 a note.
 */
const CELLS: DayStats['cells'] = {
  quarter: [1440, 1500],
  half: [970, 1000],
  eighths: [890, 1000],
  rests: [860, 1000],
  ties: [780, 1000],
  dottedHalf: [910, 1000],
  dottedQE: [720, 1000],
};

/** Practice days: some in the summer (the days skill levels were passed), then Sep 10 and Sep 14 – Oct 15 but four. */
const PRACTICE_DAYS = [
  '2026-07-20', '2026-07-25', '2026-07-28', '2026-07-30', '2026-08-05', '2026-08-06', '2026-08-12', '2026-08-13',
  '2026-08-14', '2026-08-19', '2026-08-20', '2026-08-27', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10',
  '2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-21', '2026-09-22', '2026-09-23',
  '2026-09-24', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
  '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
  '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
];

/** The figures per day since Sep 10 (the Progress tab's charts read the last 14 days, the skill map the last 42). */
const DAYS: Record<string, DayStats> = {
  '2026-09-10': day(720, { acc: 71, off: -61 }),
  '2026-09-14': day(600, { acc: 72, off: -60 }),
  '2026-09-15': day(480),
  '2026-09-17': day(900, { acc: 73, off: -58 }),
  '2026-09-18': day(540, { acc: 74, off: -57, rounds: 2 }),
  '2026-09-19': day(360),
  '2026-09-21': day(780, { acc: 72, off: -59 }),
  '2026-09-22': day(660, { acc: 75, off: -56 }),
  '2026-09-23': day(420),
  '2026-09-24': day(840, { acc: 74, off: -57 }),
  '2026-09-26': day(600, { acc: 76, off: -55, rounds: 2 }),
  '2026-09-27': day(300),
  '2026-09-28': day(960, { acc: 75, off: -54 }),
  '2026-09-29': day(720, { acc: 77, off: -54 }),
  '2026-09-30': day(660, { acc: 76, off: -53 }),
  '2026-10-01': day(540, { acc: 77, off: -53, rounds: 2 }),
  '2026-10-02': day(600, { acc: 76, off: -52 }),
  '2026-10-04': day(720, { acc: 79, off: -49 }),
  '2026-10-05': day(840, { acc: 81, off: -46 }),
  '2026-10-06': day(660, { acc: 78, off: -44 }),
  '2026-10-07': day(900, { acc: 83, off: -41 }),
  '2026-10-08': day(780, { acc: 84, off: -38 }),
  '2026-10-09': day(600, { acc: 82, off: -37 }),
  '2026-10-10': day(1080, { acc: 85, off: -33 }),
  '2026-10-11': day(720, { acc: 86, off: -31 }),
  '2026-10-12': day(840, { acc: 84, off: -29 }, CELLS),
  '2026-10-13': day(540, { acc: 87, off: -26 }, CELLS),
  '2026-10-14': day(1020, { acc: 88, off: -24 }, CELLS),
  '2026-10-15': day(660, { acc: 80, off: -22 }, CELLS),
};

/** Every Learning path lesson of path units 1–13 (sol to si and rhythm units 1–6) at ★★★, then rhythm 7.1 and 7.2. */
function lessons(): Progress['lessons'] {
  const out: Progress['lessons'] = {};
  for (const u of PATH_UNITS.filter((x) => x.id <= 13)) for (const l of u.lessons) out[l.key] = { stars: 3, bestAccuracy: 94 };
  out['7.1'] = { stars: 2, bestAccuracy: 86 };
  out['7.2'] = { stars: 2, bestAccuracy: 84 };
  return out;
}

/** Read notes: average answer ms per note ([sum, answers]); the slowest three are E5, F5 (F♯ in G major) and bass C3. */
const NOTE_MS: Record<string, [number, number]> = {
  'treble:30': [9600, 8],
  'treble:31': [10400, 8],
  'treble:32': [11200, 8],
  'treble:33': [13600, 8],
  'treble:34': [12000, 8],
  'treble:35': [12800, 8],
  'treble:36': [14400, 8],
  'treble:37': [24800, 8],
  'treble:38': [15600, 6],
  'bass:18': [9000, 5],
  'bass:20': [10000, 5],
  'bass:21': [12000, 5],
  'bass:22': [9500, 5],
  'bass:24': [8000, 5],
  'bass:26': [11000, 5],
};

/** The boards' sample player on PROGRESS_DAY. A new object on every call. */
export function richProgress(): Progress {
  return {
    ...defaultProgress(),
    lessons: lessons(),
    practiceDays: [...PRACTICE_DAYS],
    xp: 1445,
    scales: {
      settings: null,
      stars: {
        'C-major': 3, 'G-major': 3, 'D-major': 2, 'A-major': 1, 'F-major': 3, 'Bb-major': 2, 'Eb-major': 1,
        'A-natural': 3, 'A-harmonic': 2, 'A-melodic': 1, 'E-natural': 2, 'E-harmonic': 1, 'D-natural': 2, 'B-natural': 1,
      },
    },
    // Chapters 1–4 read, and the first section of chapter 5 (theory level 4, one of three checks for level 5).
    learnRead: ['1.1', '1.2', '1.3', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '4.3', '5.1'],
    stats: {
      days: Object.fromEntries(Object.entries(DAYS).map(([d, s]) => [d, { ...s, cells: { ...s.cells } }])),
      clefs: { treble: [264, 300], bass: [148, 200] },
      noteMs: Object.fromEntries(Object.entries(NOTE_MS).map(([id, v]) => [id, [...v]])),
      lastKey: { key: 'G', clef: 'treble' },
      // Best accuracy and average answer ms per Read notes level: the next level of each clef is not met yet.
      reading: {
        'treble:1': [96, 1500], 'treble:2': [94, 1600], 'treble:3': [93, 1800], 'treble:4': [92, 1900], 'treble:5': [91, 1950],
        'treble:6': [84, 2200],
        'bass:1': [93, 1700], 'bass:2': [92, 1900], 'bass:3': [90, 2000], 'bass:4': [74, 2400],
      },
      // Echo rounds at ★★ and the best stars on 4 bars, per material level: level 5 has its rounds but not ★★★ yet.
      echo: { '1': [8, 3], '2': [7, 3], '3': [5, 3], '4': [4, 3], '5': [3, 2], '6': [1, 1] },
      seen: { rhythm: '2026-10-15', ear: '2026-10-14', treble: '2026-10-15', bass: '2026-10-12', scales: '2026-10-13', theory: '2026-09-29' },
    },
    // The 7-day streak on the 7th day of the first 7 days in a row (Sep 26 – Oct 2), as the store's check gives it.
    achievements: { streak7: '2026-10-02', perfectBar: '2026-09-18', noReplays: '2026-10-06' },
    // The days each level was passed, for the boards' 12-week histories and "+4 levels up in 30 days".
    skills: {
      'rhythm:1': '2026-07-20', 'rhythm:2': '2026-07-25', 'rhythm:3': '2026-07-30', 'rhythm:4': '2026-08-12', 'rhythm:5': '2026-09-03',
      'rhythm:6': '2026-10-01',
      'ear:1': '2026-07-25', 'ear:2': '2026-07-30', 'ear:3': '2026-08-20', 'ear:4': '2026-09-30',
      'treble:1': '2026-07-20', 'treble:2': '2026-07-28', 'treble:3': '2026-08-06', 'treble:4': '2026-08-27', 'treble:5': '2026-10-08',
      'bass:1': '2026-07-28', 'bass:2': '2026-08-14', 'bass:3': '2026-09-10',
      'scales:1': '2026-08-13', 'scales:2': '2026-09-02', 'scales:3': '2026-10-07',
      'theory:1': '2026-07-28', 'theory:2': '2026-08-05', 'theory:3': '2026-08-19', 'theory:4': '2026-09-01',
    },
  };
}

/** A new player: nothing played yet. */
export function emptyProgress(): Progress {
  return defaultProgress();
}
