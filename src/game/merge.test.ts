import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_SETTINGS, DEFAULT_SCALE_SETTINGS, DEFAULT_SETTINGS } from '../core/api';
import { mergePrefs, mergeProgress, mergeSynced, readSynced, sameValue, stableJson, syncedPrefs, type SyncedPrefs } from './merge';
import { recordScales } from './stats';
import { ACHIEVEMENT_IDS, CELL_IDS, DEFAULT_PREFS, defaultProgress, sanitizeProgress, shiftDay, SKILL_IDS, type DayStats, type Progress, type SkillId } from './storage';

// --- arbitraries: valid Progress, made the way the app reads it (sanitizeProgress) ---------------------------------

const LESSONS = ['1.1', '1.2', '2.1', '7.3', 'pitch:1.1', 'keys:2.4'];
const DAYS = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
const NOTES = ['treble:3', 'treble:7', 'bass:2', 'bass:10'];
const SCALES = ['C-major', 'D-major', 'E-harmonic', 'G#-harmonic'];
const SECTIONS = ['1.1', '2.3', '8.2', '10.4'];
/** More days than a copy keeps (42), so merging two copies drops the oldest. */
const STAT_DAYS = Array.from({ length: 48 }, (_, i) => shiftDay('2026-09-01', i));
const READING = ['treble:1', 'treble:4', 'bass:10'];
const LEVELS = ['rhythm:1', 'rhythm:2', 'treble:1', 'theory:10'];

const subset = (items: string[]) => fc.subarray(items);
const record = <T>(keys: string[], value: fc.Arbitrary<T>) =>
  subset(keys).chain((ks) => fc.tuple(...ks.map(() => value)).map((vs) => Object.fromEntries(ks.map((k, i) => [k, vs[i]]))));

/** A [part, whole] pair: whole ≥ 1, part ≤ whole × perUnit. */
const partArb = (perUnit = 1, max = 500) => fc.integer({ min: 1, max }).chain((whole) => fc.tuple(fc.integer({ min: 0, max: whole * perUnit }), fc.constant(whole)));

const dayArb: fc.Arbitrary<DayStats> = fc
  .record({ sec: fc.constantFrom(0, 60, 600), rounds: fc.integer({ min: 0, max: 2 }), off: fc.integer({ min: -900, max: 900 }), hits: fc.integer({ min: 0, max: 2 }), cells: record([...CELL_IDS], partArb(1, 4)) })
  // Few distinct values, so two records of one day often tie on seconds, rounds and hits.
  .chain((d) => fc.integer({ min: 0, max: 100 * d.rounds }).map((acc) => ({ ...d, acc })));

const statsArb = fc.record({
  days: record(STAT_DAYS, dayArb),
  clefs: record(['treble', 'bass'], partArb(1, 6)),
  noteMs: record(NOTES, partArb(15000, 6)),
  lastKey: fc.option(fc.record({ key: fc.constantFrom('C', 'G', 'Bb'), clef: fc.constantFrom('treble', 'bass') })),
  reading: record(READING, fc.tuple(fc.integer({ min: 0, max: 100 }), fc.constantFrom(0, 1400, 1800, 2600))),
  echo: record(['1', '3', '8'], fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }))),
  seen: record([...SKILL_IDS], fc.constantFrom(...DAYS)),
});

const progressArb: fc.Arbitrary<Progress> = fc
  .record({
    lessons: record(LESSONS, fc.record({ stars: fc.integer({ min: 0, max: 5 }), bestAccuracy: fc.integer({ min: 0, max: 100 }) })),
    practiceDays: subset(DAYS),
    lastSettings: fc.option(fc.integer({ min: 40, max: 200 }).map((tempo) => ({ ...DEFAULT_SETTINGS, tempo }))),
    xp: fc.nat({ max: 100_000 }),
    daily: fc.option(
      fc.record({
        day: fc.constantFrom(...DAYS),
        tier: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
        stars: fc.integer({ min: 0, max: 5 }),
        accuracy: fc.integer({ min: 0, max: 100 }),
      }),
    ),
    dailyBest: fc.integer({ min: 0, max: 100 }),
    notes: fc.record({
      settings: fc.option(fc.integer({ min: 5, max: 50 }).map((count) => ({ ...DEFAULT_NOTE_SETTINGS, count }))),
      weak: record(NOTES, fc.integer({ min: 1, max: 5 })),
    }),
    scales: fc.record({
      settings: fc.option(fc.constantFrom('up', 'down', 'both').map((direction) => ({ ...DEFAULT_SCALE_SETTINGS, direction }))),
      stars: record(SCALES, fc.integer({ min: 1, max: 3 })),
    }),
    // Sorted, as the store keeps them.
    learnRead: subset(SECTIONS).map((ids) => [...ids].sort()),
    stats: statsArb,
    achievements: record([...ACHIEVEMENT_IDS], fc.constantFrom(...DAYS)),
    skills: record(LEVELS, fc.constantFrom(...DAYS)),
  })
  .map((raw) => sanitizeProgress(raw));

const prefsArb: fc.Arbitrary<SyncedPrefs> = fc
  .record({
    theme: fc.constantFrom('system', 'light', 'dark'),
    noteNames: fc.constantFrom('solfege', 'letters'),
    holdMode: fc.constantFrom('hold', 'tap'),
    holdEarly: fc.constantFrom('hold', 'tap', null),
    leniency: fc.constantFrom('strict', 'normal', 'relaxed'),
  })
  .map((p) => syncedPrefs({ ...DEFAULT_PREFS, ...p } as typeof DEFAULT_PREFS));

const baseArb = fc.option(progressArb);

/** The results in a Progress: everything merging must keep, whichever side it came from. */
const results = (p: Progress) => ({
  lessons: p.lessons,
  practiceDays: p.practiceDays,
  xp: p.xp,
  daily: p.daily,
  dailyBest: p.dailyBest,
  scaleStars: p.scales.stars,
  learnRead: p.learnRead,
  days: p.stats.days,
  clefs: p.stats.clefs,
  noteMs: p.stats.noteMs,
  reading: p.stats.reading,
  echo: p.stats.echo,
  seen: p.stats.seen,
  achievements: p.achievements,
  skills: p.skills,
});

/** The order merging keeps one day's record by: more seconds, then rounds, then hits, then the JSON. */
const fullerDay = (x: DayStats, y: DayStats): DayStats =>
  x.sec !== y.sec ? (x.sec > y.sec ? x : y) : x.rounds !== y.rounds ? (x.rounds > y.rounds ? x : y) : x.hits !== y.hits ? (x.hits > y.hits ? x : y) : stableJson(x) >= stableJson(y) ? x : y;

const RUNS = { numRuns: 300 };

describe('mergeProgress', () => {
  it('gives the same results in either order, with or without a base', () => {
    fc.assert(
      fc.property(progressArb, progressArb, baseArb, (a, b, base) => {
        expect(stableJson(results(mergeProgress(a, b, base)))).toBe(stableJson(results(mergeProgress(b, a, base))));
      }),
      RUNS,
    );
  });

  it('never lowers a result of either side', () => {
    fc.assert(
      fc.property(progressArb, progressArb, baseArb, (a, b, base) => {
        const m = mergeProgress(a, b, base);
        for (const side of [a, b]) {
          for (const [id, l] of Object.entries(side.lessons)) {
            expect(m.lessons[id].stars).toBeGreaterThanOrEqual(l.stars);
            expect(m.lessons[id].bestAccuracy).toBeGreaterThanOrEqual(l.bestAccuracy);
          }
          for (const [id, s] of Object.entries(side.scales.stars)) expect(m.scales.stars[id]).toBeGreaterThanOrEqual(s);
          expect(m.practiceDays).toEqual(expect.arrayContaining(side.practiceDays));
          expect(m.learnRead).toEqual(expect.arrayContaining(side.learnRead));
          expect(m.xp).toBeGreaterThanOrEqual(side.xp);
          expect(m.dailyBest).toBeGreaterThanOrEqual(side.dailyBest);
          if (side.daily) {
            expect(m.daily!.day >= side.daily.day).toBe(true);
            if (m.daily!.day === side.daily.day) {
              expect(m.daily!.stars).toBeGreaterThanOrEqual(side.daily.stars);
              expect(m.daily!.accuracy).toBeGreaterThanOrEqual(side.daily.accuracy);
            }
          }
          const other = side === a ? b : a;
          // The Progress tab's figures: a day dropped for 42 newer ones, or because the other side dropped it since the
          // base and this side did not change it; a kept day never a smaller record.
          const kept = Object.keys(m.stats.days).sort();
          for (const [d, rec] of Object.entries(side.stats.days)) {
            const droppedThere = !other.stats.days[d] && !!base?.stats.days[d] && sameValue(base.stats.days[d], rec);
            if (m.stats.days[d]) expect(fullerDay(m.stats.days[d], rec)).toEqual(m.stats.days[d]);
            else expect((kept.length === 42 && d < kept[0]) || droppedThere).toBe(true);
          }
          for (const key of ['clefs', 'noteMs'] as const) {
            for (const [k, [part, whole]] of Object.entries(side.stats[key] as Record<string, [number, number]>)) {
              const [mp, mw] = (m.stats[key] as Record<string, [number, number]>)[k];
              expect(mw > whole || (mw === whole && mp >= part)).toBe(true);
            }
          }
          for (const [k, [acc, ms]] of Object.entries(side.stats.reading)) {
            expect(m.stats.reading[k][0]).toBeGreaterThanOrEqual(acc);
            if (ms > 0) expect(m.stats.reading[k][1] > 0 && m.stats.reading[k][1] <= ms).toBe(true);
          }
          for (const [k, [n, stars]] of Object.entries(side.stats.echo)) {
            expect(m.stats.echo[k][0]).toBeGreaterThanOrEqual(n);
            expect(m.stats.echo[k][1]).toBeGreaterThanOrEqual(stars);
          }
          // The later day practised, unless this side still has the base's and the other side changed it.
          for (const [k, d] of Object.entries(side.stats.seen) as [SkillId, string][]) {
            const there = other.stats.seen[k];
            if (there !== undefined && d === base?.stats.seen[k]) expect(m.stats.seen[k]).toBe(there);
            else expect(m.stats.seen[k]! >= d).toBe(true);
          }
          for (const [k, d] of Object.entries(side.achievements)) expect(m.achievements[k as keyof typeof side.achievements]! <= d).toBe(true);
          for (const [k, d] of Object.entries(side.skills)) expect(m.skills[k] <= d).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('gives a copy back when merged with itself, and makes nothing up', () => {
    fc.assert(
      fc.property(progressArb, baseArb, (a, base) => {
        expect(mergeProgress(a, a, base)).toEqual(a);
        expect(mergeProgress(a, defaultProgress(), null)).toEqual(a);
      }),
      RUNS,
    );
  });

  it('is a Progress the app reads back unchanged', () => {
    fc.assert(
      fc.property(progressArb, progressArb, baseArb, (a, b, base) => {
        const m = mergeProgress(a, b, base);
        expect(sanitizeProgress(JSON.parse(JSON.stringify(m)))).toEqual(m);
      }),
      RUNS,
    );
  });

  it('keeps the setup a side changed since the base, and this device’s when both did', () => {
    const base = { ...defaultProgress(), lastSettings: { ...DEFAULT_SETTINGS, tempo: 80 } };
    const changed = { ...base, lastSettings: { ...DEFAULT_SETTINGS, tempo: 120 } };
    const other = { ...base, lastSettings: { ...DEFAULT_SETTINGS, tempo: 60 } };
    expect(mergeProgress(base, changed, base).lastSettings?.tempo).toBe(120);
    expect(mergeProgress(changed, base, base).lastSettings?.tempo).toBe(120);
    expect(mergeProgress(changed, other, base).lastSettings?.tempo).toBe(120);
    // No base: this device's, unless it has none.
    expect(mergeProgress(changed, other, null).lastSettings?.tempo).toBe(120);
    expect(mergeProgress(defaultProgress(), other, null).lastSettings?.tempo).toBe(60);
  });

  it('follows the side that practised a note since the base, also down', () => {
    const weak = (w: Record<string, number>) => ({ ...defaultProgress(), notes: { settings: null, weak: w } });
    const base = weak({ 'treble:3': 3, 'bass:2': 2, 'bass:10': 1 });
    const local = weak({ 'treble:3': 1, 'bass:2': 2, 'bass:10': 1 }); // treble:3 practised here
    const remote = weak({ 'treble:3': 3, 'bass:2': 4 }); // bass:2 missed there, bass:10 learnt
    expect(mergeProgress(local, remote, base).notes.weak).toEqual({ 'treble:3': 1, 'bass:2': 4 });
    // Both changed one: the higher.
    expect(mergeProgress(weak({ 'treble:3': 1 }), weak({ 'treble:3': 2 }), base).notes.weak).toEqual({ 'treble:3': 2 });
    // Without a base, the higher one per note.
    expect(mergeProgress(local, remote, null).notes.weak).toEqual({ 'treble:3': 3, 'bass:2': 4, 'bass:10': 1 });
  });

  it('takes the newer daily challenge, and the best of one day at its first tier', () => {
    const p = (daily: Progress['daily']) => ({ ...defaultProgress(), daily });
    expect(mergeProgress(p({ day: '2026-10-23', stars: 3, accuracy: 90 }), p({ day: '2026-10-24', stars: 1, accuracy: 40 }), null).daily).toEqual({
      day: '2026-10-24', stars: 1, accuracy: 40,
    });
    expect(mergeProgress(p({ day: '2026-10-24', tier: 3, stars: 3, accuracy: 70 }), p({ day: '2026-10-24', tier: 2, stars: 2, accuracy: 85 }), null).daily).toEqual({
      day: '2026-10-24', tier: 2, stars: 3, accuracy: 85,
    });
  });
});

describe('mergeProgress: the Progress tab', () => {
  const stats = (patch: Partial<Progress['stats']>): Progress => ({ ...defaultProgress(), stats: { ...defaultProgress().stats, ...patch } });
  const day = (sec: number, rounds = 1): DayStats => ({ sec, rounds, acc: 80 * rounds, off: 0, hits: rounds, cells: { quarter: [80, 100] } });

  it('keeps per day the record with more of it, and the newest 42 days', () => {
    const local = stats({ days: { '2026-10-24': day(300), '2026-10-25': day(60) } });
    const remote = stats({ days: { '2026-10-25': day(120, 2), '2026-10-23': day(30) } });
    expect(mergeProgress(local, remote, null).stats.days).toEqual({ '2026-10-23': day(30), '2026-10-24': day(300), '2026-10-25': day(120, 2) });
    const old = stats({ days: Object.fromEntries(STAT_DAYS.slice(0, 42).map((d) => [d, day(60)])) });
    const merged = mergeProgress(old, remote, null).stats.days;
    expect(Object.keys(merged)).toHaveLength(42);
    expect(merged[STAT_DAYS[0]]).toBeUndefined();
    expect(merged['2026-10-25']).toEqual(day(120, 2));
  });

  it('takes the totals with more answers, the best reading checks, Echo’s highest, the later day practised', () => {
    const local = stats({ clefs: { treble: [8, 10], bass: [3, 4] }, reading: { 'treble:1': [92, 0], 'bass:4': [80, 2100] }, echo: { '2': [3, 1] }, seen: { treble: '2026-10-20', ear: '2026-10-02' } });
    const remote = stats({ clefs: { treble: [9, 12] }, reading: { 'treble:1': [85, 1900], 'bass:4': [70, 1800] }, echo: { '2': [1, 3], '5': [2, 0] }, seen: { treble: '2026-10-11', ear: '2026-10-24' } });
    const m = mergeProgress(local, remote, null).stats;
    expect(m.clefs).toEqual({ treble: [9, 12], bass: [3, 4] });
    expect(m.reading).toEqual({ 'treble:1': [92, 1900], 'bass:4': [80, 1800] });
    expect(m.echo).toEqual({ '2': [3, 3], '5': [2, 0] });
    expect(m.seen).toEqual({ treble: '2026-10-20', ear: '2026-10-24' });
  });

  it('keeps every achievement and skill level on the earlier day', () => {
    const local = { ...defaultProgress(), achievements: { perfectBar: '2026-10-20' }, skills: { 'rhythm:1': '2026-10-20', 'rhythm:2': '2026-10-22' } };
    const remote = { ...defaultProgress(), achievements: { perfectBar: '2026-10-18', streak7: '2026-10-24' }, skills: { 'rhythm:1': '2026-10-21', 'theory:1': '2026-10-01' } };
    const m = mergeProgress(local, remote, null);
    expect(m.achievements).toEqual({ perfectBar: '2026-10-18', streak7: '2026-10-24' });
    expect(m.skills).toEqual({ 'rhythm:1': '2026-10-20', 'rhythm:2': '2026-10-22', 'theory:1': '2026-10-01' });
  });

  it('keeps a day one side dropped since the base dropped, unless the other side changed it', () => {
    // 40 days played and two a clock set forward wrote; today's round drops the earlier of those two (game/stats.ts).
    const real = Object.fromEntries(STAT_DAYS.slice(0, 40).map((d) => [d, day(60)]));
    const base = stats({ days: { ...real, '2027-03-01': day(60), '2027-03-02': day(60) } });
    const dropped = recordScales(base, 30, '2026-10-25');
    expect(dropped.stats.days['2027-03-01']).toBeUndefined();
    expect(mergeProgress(dropped, base, base).stats.days).toEqual(dropped.stats.days);
    expect(mergeProgress(base, dropped, base).stats.days).toEqual(dropped.stats.days);
    // Played again there since the base: kept (and the oldest day makes room for it).
    const playedThere = stats({ days: { ...base.stats.days, '2027-03-01': day(120, 2) } });
    expect(mergeProgress(dropped, playedThere, base).stats.days['2027-03-01']).toEqual(day(120, 2));
    // Without a base, every day of both, the newest 42.
    expect(mergeProgress(dropped, base, null).stats.days['2027-03-01']).toEqual(day(60));
  });

  it('keeps a day a copy without it never had: a tab behind the one that played it, a copy from before 0.16.0', () => {
    // Another tab played on the 24th and saved; this tab, behind it, brings that in with the base as the account's copy.
    const played = recordScales(defaultProgress(), 40, '2026-10-24');
    expect(mergeProgress(defaultProgress(), played, played).stats.days).toEqual(played.stats.days);
    // Also with a full 42 days here, all of them earlier: the oldest makes room.
    const full = stats({ days: Object.fromEntries(STAT_DAYS.slice(0, 42).map((d) => [d, day(60)])) });
    const later = recordScales(full, 40, '2026-10-24');
    expect(mergeProgress(full, later, later).stats.days).toEqual(later.stats.days);
    // An app from before 0.16.0 saved the account's copy without the Progress tab's figures.
    const agreed = stats({ days: Object.fromEntries(STAT_DAYS.slice(0, 14).map((d) => [d, day(60)])), lastKey: { key: 'G', clef: 'treble' }, seen: { treble: '2026-09-14' } });
    const old = readSynced({ prefs: {}, progress: { lessons: { '1.1': { stars: 3, bestAccuracy: 90 } }, practiceDays: ['2026-10-24'], xp: 900 } })!.progress;
    const m = mergeProgress(agreed, old, agreed);
    expect(m.stats).toEqual(agreed.stats);
    expect(m.lessons).toEqual(old.lessons);
  });

  it('lets the clock right again win over 42 days a clock set forward wrote, on this device and the next merges', () => {
    // The account's copy: 42 days a year ahead. This device, with its clock right, plays today.
    const ahead = Object.fromEntries(Array.from({ length: 42 }, (_, i) => [shiftDay('2027-10-01', i), day(60)]));
    const base = stats({ days: ahead, seen: { rhythm: '2027-11-11' } });
    const local = recordScales({ ...base, stats: { ...base.stats, seen: { rhythm: '2026-10-25' } } }, 120, '2026-10-25');
    expect(local.stats.days['2026-10-25']).toBeDefined();
    // The sync's check for results another tab saved (ui/sync.ts) sees nothing to bring in: no save loop.
    expect(mergeProgress(local, base, base)).toEqual(local);
    // Another device that has not played since takes this device's copy.
    expect(mergeProgress(base, local, base).stats).toEqual(local.stats);
  });

  it('keeps the day practised as corrected on one side, the later when both changed it, the later without a base', () => {
    const seen = (s: Progress['stats']['seen']) => stats({ seen: s });
    const base = seen({ rhythm: '2027-01-15', ear: '2026-10-02' });
    const corrected = seen({ rhythm: '2026-10-25', ear: '2026-10-02' });
    expect(mergeProgress(corrected, base, base).stats.seen).toEqual(corrected.stats.seen);
    expect(mergeProgress(base, corrected, base).stats.seen).toEqual(corrected.stats.seen);
    expect(mergeProgress(corrected, seen({ rhythm: '2026-10-20', ear: '2026-10-24' }), base).stats.seen).toEqual({ rhythm: '2026-10-25', ear: '2026-10-24' });
    expect(mergeProgress(corrected, base, null).stats.seen).toEqual(base.stats.seen);
  });

  it('keeps the last Read notes key of the side that played since the base', () => {
    const base = stats({ lastKey: { key: 'C', clef: 'treble' } });
    const played = stats({ lastKey: { key: 'G', clef: 'bass' } });
    expect(mergeProgress(base, played, base).stats.lastKey).toEqual({ key: 'G', clef: 'bass' });
    expect(mergeProgress(played, base, base).stats.lastKey).toEqual({ key: 'G', clef: 'bass' });
    expect(mergeProgress(defaultProgress(), played, null).stats.lastKey).toEqual({ key: 'G', clef: 'bass' });
  });
});

describe('mergePrefs', () => {
  it('takes a pref from the side that changed it since the base, this device’s when both did', () => {
    fc.assert(
      fc.property(prefsArb, prefsArb, prefsArb, (a, b, base) => {
        const m = mergePrefs(a, b, base);
        for (const k of Object.keys(m) as (keyof SyncedPrefs)[]) {
          // Hold mode and its early hold move as a pair.
          const pair = k === 'holdMode' || k === 'holdEarly' ? (['holdMode', 'holdEarly'] as const) : [k];
          const localChanged = !sameValue(pair.map((x) => a[x]), pair.map((x) => base[x]));
          expect(m[k]).toEqual(localChanged ? a[k] : b[k]);
        }
        expect(mergePrefs(a, a, base)).toEqual(a);
      }),
      RUNS,
    );
  });

  it('takes the account’s on a device’s first sign-in', () => {
    const local = syncedPrefs({ ...DEFAULT_PREFS, theme: 'light' });
    const remote = syncedPrefs({ ...DEFAULT_PREFS, theme: 'dark', noteNames: 'solfege' });
    expect(mergePrefs(local, remote, null)).toEqual(remote);
  });
});

describe('readSynced', () => {
  it('checks the account copy as the app checks its own storage', () => {
    expect(readSynced(null)).toBeNull();
    const read = readSynced({ prefs: { theme: 'dark', volumes: { tap: 0 }, seenHowTo: true, nonsense: 1 }, progress: { xp: -5, lessons: { '7.3': { stars: 9 } } } });
    expect(read?.prefs).toEqual(syncedPrefs({ ...DEFAULT_PREFS, theme: 'dark', noteNames: read!.prefs.noteNames }));
    expect(read?.progress).toMatchObject({ xp: 0, lessons: { '7.3': { stars: 0, bestAccuracy: 0 } } });
    // Device settings never come from the account.
    expect(read?.prefs).not.toHaveProperty('volumes');
    expect(read?.prefs).not.toHaveProperty('seenHowTo');
  });

  it('merges a full copy both ways', () => {
    const local = { prefs: syncedPrefs(DEFAULT_PREFS), progress: { ...defaultProgress(), xp: 10 } };
    const remote = { prefs: syncedPrefs({ ...DEFAULT_PREFS, theme: 'dark' }), progress: { ...defaultProgress(), xp: 30, learnRead: ['8.2'] } };
    expect(mergeSynced(local, remote, local)).toEqual({ prefs: remote.prefs, progress: { ...remote.progress } });
  });
});
