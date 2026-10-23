import { checkSettings } from '../core/feasibility';
import { generateExercise } from '../core/generator';
import { dailyChallenge, dailyTier, reachedUnit } from './daily';
import { lessonSettings, UNITS } from './path';
import { defaultProgress, type Progress } from './storage';

/** `n` consecutive dates from 2027-01-01. */
const days = (n: number): string[] => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));

/** Progress with two stars on every lesson of units 1 … n. */
function passedUnits(n: number): Progress {
  const lessons: Progress['lessons'] = {};
  for (const u of UNITS.slice(0, n)) for (const l of u.lessons) lessons[l.id] = { stars: 2, bestAccuracy: 80 };
  return { ...defaultProgress(), lessons };
}

/** Everything the path has taught by the end of unit `unit`. */
function taughtBy(unit: number): { notes: Set<string>; rests: Set<string>; meters: Set<string>; dotted: boolean; ties: boolean } {
  const all = UNITS.filter((u) => u.id <= unit).flatMap((u) => u.lessons.map((l) => lessonSettings(l.id)));
  return {
    notes: new Set(all.flatMap((s) => s.notes)),
    rests: new Set(all.flatMap((s) => s.rests)),
    meters: new Set(all.flatMap((s) => s.meters)),
    dotted: all.some((s) => s.dotted),
    ties: all.some((s) => s.ties),
  };
}

describe('reachedUnit', () => {
  it('is the highest open unit of the rhythm path', () => {
    expect(reachedUnit(defaultProgress())).toBe(1);
    expect(reachedUnit({ ...defaultProgress(), lessons: { '1.1': { stars: 3, bestAccuracy: 95 } } })).toBe(1);
    expect(reachedUnit(passedUnits(1))).toBe(2);
    expect(reachedUnit(passedUnits(5))).toBe(6);
    expect(reachedUnit(passedUnits(8))).toBe(8);
  });
});

describe('dailyTier', () => {
  const played = (p: Progress, daily: Progress['daily']): Progress => ({ ...p, daily });

  it('is the highest open unit until the day\'s daily is played', () => {
    expect(dailyTier(defaultProgress(), '2026-10-22')).toBe(1);
    expect(dailyTier(passedUnits(1), '2026-10-22')).toBe(2);
    // Played on another day: today's daily follows the path again.
    expect(dailyTier(played(passedUnits(1), { day: '2026-10-21', tier: 1, stars: 3, accuracy: 92 }), '2026-10-22')).toBe(2);
  });

  it('stays at the tier the daily was first played at that day, also after passing a unit', () => {
    const morning = played(defaultProgress(), { day: '2026-10-22', tier: 1, stars: 3, accuracy: 92 });
    expect(dailyTier(morning, '2026-10-22')).toBe(1);
    const afternoon = { ...passedUnits(1), daily: morning.daily };
    expect(reachedUnit(afternoon)).toBe(2);
    expect(dailyTier(afternoon, '2026-10-22')).toBe(1);
    expect(dailyChallenge('2026-10-22', dailyTier(afternoon, '2026-10-22'))).toEqual(dailyChallenge('2026-10-22', 1));
    // A record saved without its tier (older saves): the highest open unit, as before.
    expect(dailyTier(played(passedUnits(1), { day: '2026-10-22', stars: 3, accuracy: 92 }), '2026-10-22')).toBe(2);
  });
});

describe('dailyChallenge', () => {
  it('is the same for everyone at a unit on a date, and changes with the date', () => {
    for (const unit of [1, 2, 5, 8]) {
      expect(dailyChallenge('2026-10-17', unit)).toEqual(dailyChallenge('2026-10-17', unit));
      const seeds = Array.from({ length: 30 }, (_, i) => dailyChallenge(`2026-11-${String(i + 1).padStart(2, '0')}`, unit).seed);
      expect(new Set(seeds).size).toBe(30);
    }
  });

  it('gives each unit its own exercise', () => {
    const seeds = UNITS.map((u) => dailyChallenge('2026-10-22', u.id).seed);
    expect(new Set(seeds).size).toBe(UNITS.length);
    // Past the last unit the tier stays the last one.
    expect(dailyChallenge('2026-10-22', 12)).toEqual(dailyChallenge('2026-10-22', UNITS[UNITS.length - 1].id));
  });

  it('never uses material from a unit that is not open yet', () => {
    for (const u of UNITS) {
      const taught = taughtBy(u.id);
      for (const day of days(40)) {
        const s = dailyChallenge(day, u.id).settings;
        for (const v of s.notes) expect(taught.notes, `unit ${u.id}, ${day}: ${v}`).toContain(v);
        for (const v of s.rests) expect(taught.rests, `unit ${u.id}, ${day}: ${v} rest`).toContain(v);
        for (const m of s.meters) expect(taught.meters, `unit ${u.id}, ${day}: ${m}`).toContain(m);
        if (s.dotted) expect(taught.dotted, `unit ${u.id}, ${day}: dotted`).toBe(true);
        if (s.ties) expect(taught.ties, `unit ${u.id}, ${day}: ties`).toBe(true);
        expect(s.triplets).toBe(false);
      }
    }
  });

  it('starts short and slow, tap only in unit 1, and holds notes from unit 2', () => {
    for (const day of days(40)) {
      const one = dailyChallenge(day, 1).settings;
      expect(one.hold).toBe(false);
      expect(one.meters).toEqual(['4/4']);
      expect(one.rests).toEqual([]);
      for (const unit of [1, 2]) {
        const s = dailyChallenge(day, unit).settings;
        expect(s.bars).toBe(4);
        expect(s.tempo).toBeGreaterThanOrEqual(60);
        expect(s.tempo).toBeLessThanOrEqual(72);
      }
      for (const unit of [2, 3, 8]) expect(dailyChallenge(day, unit).settings.hold).toBe(true);
    }
  });

  it('from unit 3 on, picks the mid-path material', () => {
    // Over a few months every unit-8 player meets sixteenths at least once, and never only quarter and half notes.
    const all = days(120).map((d) => dailyChallenge(d, 8).settings);
    expect(all.some((s) => s.notes.includes('sixteenth'))).toBe(true);
    expect(all.every((s) => s.notes.some((v) => v !== 'half' && v !== 'quarter') || s.meters.some((m) => m !== '4/4'))).toBe(true);
  });

  it('is always a playable tap exercise', () => {
    for (const u of UNITS) {
      for (const day of days(30)) {
        const { settings, seed } = dailyChallenge(day, u.id);
        expect(settings.mode).toBe('tap');
        expect(checkSettings(settings).ok).toBe(true);
        expect(generateExercise(settings, seed).bars).toHaveLength(settings.bars);
      }
    }
  });
});
