import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_SETTINGS, DEFAULT_SCALE_SETTINGS, DEFAULT_SETTINGS } from '../core/api';
import { mergePrefs, mergeProgress, mergeSynced, readSynced, sameValue, stableJson, syncedPrefs, type SyncedPrefs } from './merge';
import { DEFAULT_PREFS, defaultProgress, sanitizeProgress, type Progress } from './storage';

// --- arbitraries: valid Progress, made the way the app reads it (sanitizeProgress) ---------------------------------

const LESSONS = ['1.1', '1.2', '2.1', '7.3', 'pitch:1.1', 'keys:2.4'];
const DAYS = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
const NOTES = ['treble:3', 'treble:7', 'bass:2', 'bass:10'];
const SCALES = ['C-major', 'D-major', 'E-harmonic', 'G#-harmonic'];
const SECTIONS = ['1.1', '2.3', '8.2', '10.4'];

const subset = (items: string[]) => fc.subarray(items);
const record = <T>(keys: string[], value: fc.Arbitrary<T>) =>
  subset(keys).chain((ks) => fc.tuple(...ks.map(() => value)).map((vs) => Object.fromEntries(ks.map((k, i) => [k, vs[i]]))));

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
});

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
