/**
 * Progress on the account (BACKEND-PLAN.md §6): what syncs, and how this device's copy and the account's merge.
 *
 * Merging never loses a result: the best stars and accuracy per lesson and per scale, every practice day and Learn
 * section from both, the higher XP and best daily accuracy, the newer daily challenge. What is not a result (a setup as
 * last edited, a pref, the Read notes weak spots, which go down as well as up) is merged against `base`, the copy both
 * sides last agreed on: a side that changed it since wins, and this device wins when both did. Without a base (the
 * first sign-in on a device) the account's prefs win, and this device's setups unless it has none.
 *
 * The rules are pure and tested as properties (merge.test.ts): order-independent for every result, never lower than
 * either side, and merging a copy with itself gives it back.
 */
import type { SyncedData } from '../../shared/api';
import { DIAMOND } from '../core/types';
import type { LessonProgress, Prefs, Progress, DailyProgress } from './storage';
import { sanitizePrefs, sanitizeProgress } from './storage';

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
