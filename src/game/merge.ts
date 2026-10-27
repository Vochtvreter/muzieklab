/**
 * Progress on the account (BACKEND-PLAN.md §6): what syncs, and how this device's copy and the account's merge.
 *
 * Merging never loses a result: the best stars and accuracy per lesson and per scale, every practice day and Learn
 * section from both, the higher XP and best daily accuracy, the newer daily challenge, every achievement and skill level
 * (on the earlier day), and the Progress tab's figures (per day the fuller record, per total the one with more answers,
 * the best skill checks, the later day practised). What is not a result (a setup as
 * last edited, a pref, the Read notes weak spots, which go down as well as up) is merged against `base`, the copy both
 * sides last agreed on: a side that changed it since wins, and this device wins when both did. Without a base (the
 * first sign-in on a device) the account's prefs win, and this device's setups unless it has none. Against the base
 * too: a day of figures one side dropped stays dropped, and a day practised one side corrected stays corrected (a date
 * a clock set forward wrote, game/stats.ts). A side that cannot have dropped a day (a tab behind the one that recorded
 * it, a copy an app from before 0.19.0 saved) never had it, and the day stays.
 *
 * The rules are pure and tested as properties (merge.test.ts): order-independent for every result, never lower than
 * either side, and merging a copy with itself gives it back.
 */
import type { SyncedData } from '../../shared/api';
import { DIAMOND } from '../core/types';
import type { DayStats, LessonProgress, Prefs, Progress, DailyProgress, Stats } from './storage';
import { HISTORY_DAYS, newestDays, sanitizePrefs, sanitizeProgress } from './storage';

/**
 * The prefs that follow the account (§6.1). Calibration, volumes, the sounds switched on and the How to play and intro
 * flags stay on the device: each device has its own delay and speaker, and a person meets the help once per device.
 */
export const SYNCED_PREFS = ['language', 'theme', 'leniency', 'holdMode', 'holdEarly', 'metronomeLook', 'noteNames', 'pianoLabels'] as const;
export type SyncedPrefKey = (typeof SYNCED_PREFS)[number];
export type SyncedPrefs = Pick<Prefs, SyncedPrefKey>;

/** Prefs that merge as one: the Input mode and the one the setup's early hold replaced only make sense together. */
const PREF_GROUPS: readonly (readonly SyncedPrefKey[])[] = SYNCED_PREFS.filter((k) => k !== 'holdEarly').map((k) =>
  k === 'holdMode' ? (['holdMode', 'holdEarly'] as const) : [k],
);

/** What syncs, as the app reads it: the account's copy after sanitizing, or this device's own. */
export interface Synced {
  prefs: SyncedPrefs;
  progress: Progress;
}

export function syncedPrefs(prefs: Prefs): SyncedPrefs {
  return Object.fromEntries(SYNCED_PREFS.map((k) => [k, prefs[k]])) as SyncedPrefs;
}

export function syncedOf(prefs: Prefs, progress: Progress): Synced {
  return { prefs: syncedPrefs(prefs), progress };
}

/**
 * The account's copy as the app can use it: checked with the same functions as what is read from storage, so a copy
 * saved by an older or newer app, or a broken one, never puts anything invalid in the store. Null when there is none.
 */
export function readSynced(data: SyncedData | null | undefined): Synced | null {
  if (!data || typeof data !== 'object') return null;
  return { prefs: syncedPrefs(sanitizePrefs(data.prefs)), progress: sanitizeProgress(data.progress) };
}

/** JSON with object keys sorted, so two copies compare equal whatever order their keys were written in. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

export const sameValue = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

/** A value that is not a result: the side that changed it since `base` wins; this device when both did. */
function pick<T>(local: T, remote: T, base: T | undefined, hasBase: boolean, noBase: (l: T, r: T) => T): T {
  if (!hasBase) return noBase(local, remote);
  return sameValue(local, base) ? remote : local;
}

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])].sort();

function mergeLessons(a: Progress['lessons'], b: Progress['lessons']): Progress['lessons'] {
  const out: Record<string, LessonProgress> = {};
  for (const id of union(Object.keys(a), Object.keys(b))) {
    const x = a[id];
    const y = b[id];
    if (!x || !y) {
      out[id] = { ...(x ?? y) };
      continue;
    }
    const stars = x.stars >= y.stars ? x.stars : y.stars;
    const bestAccuracy = Math.max(x.bestAccuracy, y.bestAccuracy);
    // As sanitizeProgress reads it: all perfect with a 100% best is the diamond.
    out[id] = { stars: stars === 4 && bestAccuracy >= 100 ? DIAMOND : stars, bestAccuracy };
  }
  return out;
}

/** Per key, the higher number (scale stars). */
function maxPerKey(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  return out;
}

/**
 * The weak spots per note go up with a miss and down with a hit: per note, the side that changed it since the base
 * wins, the higher one when both did (it is practised again soon, the safer side). Without a base, the higher one.
 */
function mergeWeak(a: Record<string, number>, b: Record<string, number>, base: Record<string, number> | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    const was = base ? (base[k] ?? 0) : null;
    const v = was === null ? Math.max(x, y) : x === was ? y : y === was ? x : Math.max(x, y);
    if (v > 0) out[k] = v;
  }
  return out;
}

/** The newer day's challenge; on the same day, the best of both, at the lower tier (the day's first play set it). */
function mergeDaily(a: DailyProgress | null, b: DailyProgress | null): DailyProgress | null {
  if (!a || !b) return a ?? b ? { ...(a ?? b)! } : null;
  if (a.day !== b.day) return { ...(a.day > b.day ? a : b) };
  const tiers = [a.tier, b.tier].filter((t): t is number => t !== undefined);
  return {
    day: a.day,
    ...(tiers.length ? { tier: Math.min(...tiers) } : {}),
    stars: a.stars >= b.stars ? a.stars : b.stars,
    accuracy: Math.max(a.accuracy, b.accuracy),
  };
}

/** Per key, the pair from the side with the larger count (the second number); on a tie, the larger first number. */
function moreCounted(a: Record<string, [number, number]>, b: Record<string, [number, number]>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) {
    const x = a[k];
    const y = b[k];
    const win = !x || !y ? (x ?? y) : x[1] !== y[1] ? (x[1] > y[1] ? x : y) : x[0] >= y[0] ? x : y;
    out[k] = [win[0], win[1]];
  }
  return out;
}

/** Per key, the higher of each number (Echo's rounds and best stars). */
function maxPairs(a: Record<string, [number, number]>, b: Record<string, [number, number]>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) {
    const x = a[k] ?? [0, 0];
    const y = b[k] ?? [0, 0];
    out[k] = [Math.max(x[0], y[0]), Math.max(x[1], y[1])];
  }
  return out;
}

/** Per "clef:level", the best accuracy and the fastest average answer (0 = none yet). */
function mergeReading(a: Record<string, [number, number]>, b: Record<string, [number, number]>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) {
    const x = a[k];
    const y = b[k];
    if (!x || !y) {
      out[k] = [...(x ?? y)] as [number, number];
      continue;
    }
    out[k] = [Math.max(x[0], y[0]), x[1] === 0 ? y[1] : y[1] === 0 ? x[1] : Math.min(x[1], y[1])];
  }
  return out;
}

/** Per key, the earlier day (an achievement or skill level counts from when it was first earned). */
function earlierPerKey(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) {
    const x = a[k];
    const y = b[k];
    out[k] = x === undefined ? y : y === undefined ? x : x < y ? x : y;
  }
  return out;
}

/** Orders two records of one day: the more seconds, then rounds, then hits; then by their JSON, so any two compare. */
function fuller(x: DayStats, y: DayStats): DayStats {
  if (x.sec !== y.sec) return x.sec > y.sec ? x : y;
  if (x.rounds !== y.rounds) return x.rounds > y.rounds ? x : y;
  if (x.hits !== y.hits) return x.hits > y.hits ? x : y;
  return stableJson(x) >= stableJson(y) ? x : y;
}

/**
 * Whether a copy without day `d` can have dropped it: the recorders drop a date only for HISTORY_DAYS others, a later
 * one among them (game/stats.ts). A copy with fewer, or only earlier ones, never had it: a tab behind the one that
 * recorded it (ui/sync.ts brings that tab's results in against the base), or a copy an app from before 0.19.0 saved,
 * which has no figures.
 */
function couldDrop(days: Record<string, DayStats>, d: string): boolean {
  const dates = Object.keys(days);
  return dates.length >= HISTORY_DAYS && dates.some((k) => k > d);
}

/**
 * Per day, the whole record of the side that has more of it (a day played on two devices keeps one device's figures,
 * as XP keeps the higher total); then the newest HISTORY_DAYS days, as sanitizeProgress keeps them. A day one side
 * dropped since the base (gone from its window, or written by a clock set forward: game/stats.ts) stays dropped
 * unless the other side changed it since, so a dropped day does not come back from the base.
 */
function mergeDays(a: Record<string, DayStats>, b: Record<string, DayStats>, base: Record<string, DayStats> | null): Record<string, DayStats> {
  const out: Record<string, DayStats> = {};
  for (const d of union(Object.keys(a), Object.keys(b))) {
    const x = a[d];
    const y = b[d];
    const was = base?.[d];
    if ((!x || !y) && was && sameValue(x ?? y, was) && couldDrop(x ? b : a, d)) continue;
    const win = !x || !y ? (x ?? y) : fuller(x, y);
    out[d] = { ...win, cells: Object.fromEntries(Object.entries(win.cells).map(([k, v]) => [k, [v[0], v[1]]])) };
  }
  return newestDays(out);
}

/**
 * Per skill, the later day it was practised; against the base, the side that changed it since, the later when both
 * did. So a day a clock set forward wrote, once corrected on one device (markSeen), stays corrected.
 */
function mergeSeen(a: Stats['seen'], b: Stats['seen'], base: Stats['seen'] | null): Stats['seen'] {
  const out: Stats['seen'] = {};
  for (const k of union(Object.keys(a), Object.keys(b)) as (keyof Stats['seen'])[]) {
    const x = a[k];
    const y = b[k];
    const was = base?.[k];
    out[k] = x === undefined ? y : y === undefined ? x : x === was ? y : y === was ? x : x > y ? x : y;
  }
  return out;
}

function mergeStats(local: Stats, remote: Stats, base: Stats | null, hasBase: boolean): Stats {
  return {
    days: mergeDays(local.days, remote.days, base?.days ?? null),
    clefs: moreCounted(local.clefs, remote.clefs),
    noteMs: moreCounted(local.noteMs, remote.noteMs),
    // The Notes view's Key card shows the last round's key: a choice, like a setup. Never back to none: only a copy
    // without figures (an app from before 0.19.0 saved it) has none after a round.
    lastKey: pick(local.lastKey, remote.lastKey, base?.lastKey, hasBase, (x, y) => x ?? y) ?? local.lastKey ?? remote.lastKey,
    reading: mergeReading(local.reading, remote.reading),
    echo: maxPairs(local.echo, remote.echo),
    seen: mergeSeen(local.seen, remote.seen, base?.seen ?? null),
  };
}

/** This device's progress and the account's, merged; `base` is the copy both last agreed on (null: none yet). */
export function mergeProgress(local: Progress, remote: Progress, base: Progress | null): Progress {
  const has = base !== null;
  const setup = <T>(l: T, r: T, b: T | undefined): T => pick(l, r, b, has, (x, y) => x ?? y);
  return {
    lessons: mergeLessons(local.lessons, remote.lessons),
    practiceDays: union(local.practiceDays, remote.practiceDays),
    lastSettings: setup(local.lastSettings, remote.lastSettings, base?.lastSettings),
    xp: Math.max(local.xp, remote.xp),
    daily: mergeDaily(local.daily, remote.daily),
    dailyBest: Math.max(local.dailyBest, remote.dailyBest),
    notes: {
      settings: setup(local.notes.settings, remote.notes.settings, base?.notes.settings),
      weak: mergeWeak(local.notes.weak, remote.notes.weak, base?.notes.weak ?? null),
    },
    scales: {
      settings: setup(local.scales.settings, remote.scales.settings, base?.scales.settings),
      stars: maxPerKey(local.scales.stars, remote.scales.stars),
    },
    learnRead: union(local.learnRead, remote.learnRead),
    stats: mergeStats(local.stats, remote.stats, base?.stats ?? null, has),
    achievements: earlierPerKey(local.achievements, remote.achievements),
    skills: earlierPerKey(local.skills, remote.skills),
  };
}

/** The synced prefs, one by one; without a base (the first sign-in on a device), the account's. */
export function mergePrefs(local: SyncedPrefs, remote: SyncedPrefs, base: SyncedPrefs | null): SyncedPrefs {
  const out = {} as Record<SyncedPrefKey, unknown>;
  const part = (p: SyncedPrefs | null, keys: readonly SyncedPrefKey[]) => p && keys.map((k) => p[k]);
  for (const keys of PREF_GROUPS) {
    // Compared as a group, so a side that changed either one of the pair brings both.
    const winner = base === null ? remote : sameValue(part(local, keys), part(base, keys)) ? remote : local;
    for (const k of keys) out[k] = winner[k];
  }
  return out as SyncedPrefs;
}

export function mergeSynced(local: Synced, remote: Synced, base: Synced | null): Synced {
  return {
    prefs: mergePrefs(local.prefs, remote.prefs, base?.prefs ?? null),
    progress: mergeProgress(local.progress, remote.progress, base?.progress ?? null),
  };
}
