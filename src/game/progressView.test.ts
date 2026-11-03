import {
  accuracyView,
  achievementsView,
  calendarView,
  minutesView,
  notesView,
  progressHeader,
  progressView,
  scalesView,
  skillMap,
  skillsView,
  tendencyOf,
  timingView,
} from './progressView';
import { PATH_UNITS, pathUnitOf } from './tracks';
import { defaultProgress, defaultStats, shiftDay, type DayStats, type Progress } from './storage';

/** The boards' day: Thursday, October 15, 2026. */
const TODAY = '2026-10-15';
const progress = (patch: Partial<Progress> = {}, stats: Partial<Progress['stats']> = {}): Progress => ({ ...defaultProgress(), ...patch, stats: { ...defaultStats(), ...stats } });
const day = (patch: Partial<DayStats>): DayStats => ({ sec: 0, rounds: 0, acc: 0, off: 0, hits: 0, cells: {}, ...patch });
const range = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
};

describe('progressHeader', () => {
  it('gives the level, the XP to the next one and the ranks', () => {
    const h = progressHeader(progress({ xp: 1445, practiceDays: range('2026-10-04', TODAY) }), TODAY);
    // Level 7 runs from 1350 to 1750 XP.
    expect(h).toMatchObject({ streak: 12, level: 7, rank: 'measure', total: 1445, into: 95, span: 400, pct: 23, nextLevel: 8, nextLevelAt: 1750, toNext: 305 });
    expect(h.nextRank).toEqual({ rank: 'groove', level: 8 });
    expect(h.ranks.map((r) => [r.rank, r.from, r.state])).toEqual([
      ['tick', 1, 'done'],
      ['count', 3, 'done'],
      ['measure', 5, 'current'],
      ['groove', 8, 'next'],
      ['metronome', 12, 'later'],
      ['maestro', 16, 'later'],
    ]);
  });

  it('has no next rank at the top, and starts at level 1', () => {
    expect(progressHeader(progress({ xp: 50_000 }), TODAY).nextRank).toBeNull();
    expect(progressHeader(progress(), TODAY)).toMatchObject({ streak: 0, level: 1, rank: 'tick', into: 0, span: 100, pct: 0, nextLevelAt: 100, toNext: 100 });
  });
});

describe('calendarView', () => {
  // The board: practised Sep 14 to Oct 2 but Sep 16, 20 and 25; not on Oct 3; every day since.
  const days = range('2026-09-14', '2026-10-02').filter((d) => !['2026-09-16', '2026-09-20', '2026-09-25'].includes(d)).concat(range('2026-10-04', TODAY));

  it('shows five weeks, Monday first, ending this week, as the board does', () => {
    const c = calendarView(progress({ practiceDays: days }), TODAY);
    expect(c).toMatchObject({ first: '2026-09-14', last: '2026-10-18', today: TODAY, todayIndex: 3, practised: 28, elapsed: 32, streak: 12, streakStart: '2026-10-04', streakEnd: TODAY });
    expect(c.missed).toEqual(['2026-09-16', '2026-09-20', '2026-09-25', '2026-10-03']);
    expect(c.weeks).toHaveLength(5);
    const all = c.weeks.flat();
    expect(all).toHaveLength(35);
    expect(all.every((d, i) => d.date === shiftDay('2026-09-14', i))).toBe(true);
    const at = (date: string) => all.find((d) => d.date === date)!;
    expect(at('2026-09-14')).toEqual({ date: '2026-09-14', day: 14, state: 'practised', isToday: false });
    expect(at('2026-09-16').state).toBe('missed');
    expect(at('2026-10-04').state).toBe('streak');
    expect(at(TODAY)).toEqual({ date: TODAY, day: 15, state: 'streak', isToday: true });
    expect(at('2026-10-16').state).toBe('future');
  });

  it('keeps yesterday’s streak while today has no practice yet', () => {
    const c = calendarView(progress({ practiceDays: range('2026-10-10', '2026-10-14') }), TODAY);
    expect(c).toMatchObject({ streak: 5, streakStart: '2026-10-10', streakEnd: '2026-10-14', practised: 5 });
    expect(c.weeks.flat().find((d) => d.isToday)?.state).toBe('today');
    expect(c.missed).not.toContain(TODAY);
    expect(calendarView(progress(), TODAY)).toMatchObject({ streak: 0, streakStart: null, streakEnd: null, practised: 0, elapsed: 32 });
  });
});

describe('the 14-day charts and the week’s minutes', () => {
  const acc = [76, null, 79, 81, 78, 83, 84, 82, 85, 86, 84, 87, 88, 80];
  const ms = [-52, null, -49, -46, -44, -41, -38, -37, -33, -31, -29, -26, -24, -22];
  const days: Record<string, DayStats> = {};
  acc.forEach((a, i) => {
    if (a === null) return;
    // Two rounds a day; the offsets as a sum over 10 hits.
    days[shiftDay(TODAY, i - 13)] = day({ rounds: 2, acc: 2 * a, hits: 10, off: 10 * ms[i]!, sec: 600 });
  });
  const p = progress({}, { days });

  it('gives each day’s rhythm accuracy, the mean, the first, the peak and today', () => {
    const a = accuracyView(p, TODAY);
    expect(a.days.map((d) => d.value)).toEqual(acc);
    expect(a.days[0].date).toBe('2026-10-02');
    // 82.54%, rounded down as Results is (§6.3).
    expect(a.mean).toBe(82);
    expect(a.first).toEqual({ date: '2026-10-02', value: 76 });
    expect(a.peak).toEqual({ date: '2026-10-14', value: 88 });
    expect(a.today).toBe(80);
    expect(a.gaps).toEqual(['2026-10-03']);
  });

  it('gives each day’s timing offset and the tendency, with the judge’s steady band', () => {
    const t = timingView(p, TODAY);
    expect(t.days.map((d) => d.value)).toEqual(ms);
    expect(t).toMatchObject({ latest: { date: TODAY, value: -22 }, tendency: 'steady', first: { date: '2026-10-02', value: -52 }, firstTendency: 'rushing' });
    expect([-41, -40, 30, 31].map(tendencyOf)).toEqual(['rushing', 'steady', 'steady', 'dragging']);
  });

  it('shows 100% only for a day of flawless rounds', () => {
    // A flawless round and one of 31 Perfect and a Great (99.69%, stored as 99): 99.5% that day, shown as 99%.
    const q = progress({}, { days: { [shiftDay(TODAY, -1)]: day({ rounds: 1, acc: 100 }), [TODAY]: day({ rounds: 2, acc: 100 + 99 }) } });
    expect(accuracyView(q, TODAY)).toMatchObject({ today: 99, mean: 99, peak: { date: shiftDay(TODAY, -1), value: 100 } });
  });

  it('counts a day without rhythm rounds as no value, also when it has minutes', () => {
    const q = progress({}, { days: { [TODAY]: day({ sec: 300 }) } });
    expect(accuracyView(q, TODAY)).toMatchObject({ mean: null, first: null, peak: null, today: null });
    expect(timingView(q, TODAY)).toMatchObject({ latest: null, tendency: null });
  });

  it('gives this week’s minutes, Monday to today, and their total', () => {
    const week = { '2026-10-12': day({ sec: 14 * 60 }), '2026-10-13': day({ sec: 9 * 60 + 10 }), '2026-10-14': day({ sec: 17 * 60 - 20 }), [TODAY]: day({ sec: 11 * 60 }), '2026-10-11': day({ sec: 3600 }) };
    const m = minutesView(progress({}, { days: week }), TODAY);
    expect(m.days.map((d) => d.minutes)).toEqual([14, 9, 17, 11, null, null, null]);
    expect(m.days[0].date).toBe('2026-10-12');
    expect(m).toMatchObject({ todayIndex: 3, total: 51 });
  });
});

describe('skillMap', () => {
  /** Every lesson up to the Learning path's unit `n` at two stars. */
  const pathTo = (n: number): Progress['lessons'] =>
    Object.fromEntries(PATH_UNITS.filter((u) => u.id <= n).flatMap((u) => u.lessons.map((l) => [l.key, { stars: 2 as const, bestAccuracy: 80 }])));

  it('gives each cell’s rolling accuracy, band and lock', () => {
    const cells = { quarter: [1920, 2000], half: [1164, 1200], eighths: [1068, 1200], rests: [1032, 1200], ties: [936, 1200], dottedHalf: [500, 1100] } as DayStats['cells'];
    // Rhythm unit 7 (path unit 14) open; unit 8 (path unit 16) not.
    const map = skillMap(progress({ lessons: pathTo(13) }, { days: { [TODAY]: day({ cells }) } }), TODAY);
    expect(map.map((c) => [c.id, c.accuracy, c.band, c.weak, c.locked])).toEqual([
      ['quarter', 96, 'high', false, false],
      ['half', 97, 'high', false, false],
      ['eighths', 89, 'mid', false, false],
      ['rests', 86, 'mid', false, false],
      ['ties', 78, 'weak', true, false],
      ['dottedHalf', null, null, false, false],
      ['dottedQE', null, null, false, false],
      ['sixteenths', null, null, false, true],
    ]);
    expect(map[5].notes).toBe(11);
    expect(map[7]).toMatchObject({ name: 'skills.cell.sixteenths', notes: 0, unlockUnit: pathUnitOf('rhythm', 8) });
  });

  it('bands a cell by its accuracy rounded down: 89.6% is no 90%, 79.6% is a weak spot', () => {
    const cells = { quarter: [1075, 1200], half: [955, 1200] } as DayStats['cells'];
    const map = skillMap(progress({ lessons: pathTo(13) }, { days: { [TODAY]: day({ cells }) } }), TODAY);
    expect(map.slice(0, 2).map((c) => [c.id, c.accuracy, c.band, c.weak])).toEqual([
      ['quarter', 89, 'mid', false],
      ['half', 79, 'weak', true],
    ]);
  });

  it('locks a cell until its rhythm unit is open, unless it was played', () => {
    const fresh = skillMap(progress(), TODAY);
    expect(fresh.every((c) => c.locked && c.accuracy === null)).toBe(true);
    const played = skillMap(progress({}, { days: { [TODAY]: day({ cells: { sixteenths: [90, 100] } }) } }), TODAY);
    expect(played.find((c) => c.id === 'sixteenths')).toMatchObject({ locked: false, notes: 1, accuracy: null });
    // Played 41 days ago: once its notes leave the 42-day window, it shows "—", and does not lock again.
    const old = progress({}, { days: { [shiftDay(TODAY, -41)]: day({ cells: { sixteenths: [2000, 2400] } }) } });
    expect(skillMap(old, TODAY).find((c) => c.id === 'sixteenths')).toMatchObject({ locked: false, notes: 24, accuracy: 83 });
    expect(skillMap(old, shiftDay(TODAY, 1)).find((c) => c.id === 'sixteenths')).toMatchObject({ locked: false, notes: 0, accuracy: null });
  });
});

describe('achievements, notes and scales', () => {
  it('lists the five achievements with the day each was earned', () => {
    const a = achievementsView(progress({ achievements: { perfectBar: '2026-10-02', streak7: '2026-10-10' } }));
    expect(a.earned).toBe(2);
    expect(a.list.map((x) => [x.id, x.earned])).toEqual([
      ['streak7', '2026-10-10'],
      ['perfectBar', '2026-10-02'],
      ['noReplays', null],
      ['firstSixteenths', null],
      ['tempo160', null],
    ]);
    expect(a.list[0]).toMatchObject({ name: 'achievements.streak7.name', text: 'achievements.streak7.text' });
  });

  it('gives accuracy per clef, the slowest notes and the last key', () => {
    const n = notesView(
      progress({}, {
        clefs: { treble: [44, 50] },
        noteMs: { 'treble:37': [9300, 3], 'treble:38': [7800, 3], 'bass:22': [4800, 2], 'bass:21': [7200, 3], 'treble:30': [3000, 3] },
        lastKey: { key: 'G', clef: 'treble' },
      }),
    );
    expect(n.clefs).toEqual([
      { clef: 'treble', accuracy: 88, answered: 50 },
      { clef: 'bass', accuracy: null, answered: 0 },
    ]);
    // Top space E, top line F (F♯ in G major), then bass C; bass:22 has too few answers.
    expect(n.slowest).toEqual([
      { id: 'treble:37', clef: 'treble', step: 37, letter: 'E', alter: 0, seconds: 3.1, answers: 3 },
      { id: 'treble:38', clef: 'treble', step: 38, letter: 'F', alter: 1, seconds: 2.6, answers: 3 },
      { id: 'bass:21', clef: 'bass', step: 21, letter: 'C', alter: 0, seconds: 2.4, answers: 3 },
    ]);
    expect(n.lastKey).toEqual({ key: 'G', clef: 'treble' });
    // Rounded down, as Read notes' Round done shows a round: 179 of 200 (89.5%) is 89%.
    expect(notesView(progress({}, { clefs: { treble: [179, 200], bass: [57, 100] } })).clefs.map((c) => c.accuracy)).toEqual([89, 57]);
    expect(notesView(progress())).toEqual({ clefs: [{ clef: 'treble', accuracy: null, answered: 0 }, { clef: 'bass', accuracy: null, answered: 0 }], slowest: [], lastKey: null });
  });

  it('gives the 15 majors round the circle and the minor keys started', () => {
    const s = scalesView(progress({ scales: { settings: null, stars: { 'C-major': 3, 'G-major': 3, 'D-major': 2, 'A-major': 1, 'F-major': 3, 'Bb-major': 2, 'B-natural': 1, 'A-natural': 3, 'A-harmonic': 2, 'A-melodic': 1, 'E-natural': 2, 'E-harmonic': 1, 'D-natural': 2 } } }));
    expect(s.majors.map((m) => m.key)).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
    expect(s.majors.slice(0, 4).map((m) => m.stars)).toEqual([3, 3, 2, 1]);
    expect(s.majorsDone).toBe(5);
    // A, E, D and B minor: the keys of C, G, F and D.
    expect(s.minors).toEqual([
      { key: 'C', natural: 3, harmonic: 2, melodic: 1 },
      { key: 'G', natural: 2, harmonic: 1, melodic: 0 },
      { key: 'F', natural: 2, harmonic: 0, melodic: 0 },
      { key: 'D', natural: 1, harmonic: 0, melodic: 0 },
    ]);
    expect(s.minorsStarted).toBe(4);
  });
});

describe('skillsView', () => {
  it('gives each skill’s level, next level, chip, history and button, the totals and the focus', () => {
    const skills: Record<string, string> = {};
    const add = (skill: string, n: number, on: string) => {
      for (let i = 1; i <= n; i++) skills[`${skill}:${i}`] = on;
    };
    add('rhythm', 5, '2026-08-01');
    skills['rhythm:6'] = '2026-10-01';
    add('treble', 2, '2026-08-01');
    add('theory', 1, '2026-08-01');
    const p = progress({ skills, learnRead: ['1.1', '1.2', '1.3', '2.1'] }, { seen: { theory: '2026-09-29', rhythm: TODAY } });
    const v = skillsView(p, TODAY);
    expect(v.total).toBe(9);
    expect(v.max).toBe(60);
    expect(v.gained).toBe(1);
    expect(v.reviewDue).toEqual(['theory']);
    const rhythm = v.skills[0];
    expect(rhythm).toMatchObject({ id: 'rhythm', name: 'skills.name.rhythm', level: 6, gain: 1, chip: { kind: 'gain', label: { key: 'skills.chip.gain', params: { count: 1 } } } });
    expect(rhythm.next).toMatchObject({ n: 7, name: 'path.u7.title', total: 3, done: 0, later: false });
    expect(rhythm.levels.map((l) => l.state)).toEqual(['passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'next', 'later', 'later', 'later']);
    expect(rhythm.levels[5].day).toBe('2026-10-01');
    expect(rhythm.history).toHaveLength(12);
    expect(rhythm.history[11]).toBe(6);
    expect(rhythm.cta.label).toEqual({ key: 'skills.cta.rhythm', params: { unit: 14 } });
    const theory = v.skills[5];
    expect(theory).toMatchObject({ level: 1, review: { due: true, days: 16 }, chip: { kind: 'review' } });
    expect(theory.next?.checks.map((c) => c.done)).toEqual([true, false]);
    expect(v.skills[1]).toMatchObject({ id: 'ear', level: 0, chip: null, review: { due: false, days: null } });
    expect(v.focus).toMatchObject({ skill: 'ear', other: 'rhythm', behind: 6 });
  });

  it('says a level comes later once rhythm level 8 is passed', () => {
    const skills = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`rhythm:${i + 1}`, '2026-08-01']));
    const r = skillsView(progress({ skills }), TODAY).skills[0];
    expect(r.next).toEqual({ n: 9, name: 'skills.level.rhythm.9', checks: [], done: 0, total: 0, later: true });
  });
});

describe('progressView', () => {
  it('has every card for a new player', () => {
    const v = progressView(defaultProgress(), TODAY);
    expect(v.header.level).toBe(1);
    expect(v.calendar.weeks.flat().filter((d) => d.state === 'missed')).toHaveLength(31);
    expect(v.accuracy.mean).toBeNull();
    expect(v.timing.latest).toBeNull();
    expect(v.minutes.total).toBe(0);
    expect(v.cells).toHaveLength(8);
    expect(v.achievements.earned).toBe(0);
    expect(v.notes.slowest).toEqual([]);
    expect(v.scales.majorsDone).toBe(0);
    expect(v.skills.total).toBe(0);
    expect(v.skills.focus.label.key).toBe('skills.focus.equal');
  });
});
