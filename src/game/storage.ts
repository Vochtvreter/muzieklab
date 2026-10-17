import type { Leniency, MeterId, NoteValue, Settings } from '../core/types';
import { METER_IDS, NOTE_VALUES } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/defaults';
import type { Volumes } from '../audio/engine';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  volumes: Volumes;
  metronomeOn: boolean;
  tapSoundOn: boolean;
  leniency: Leniency;
  calibrationMs: number; // device offset
  calibratedAt: string | null; // ISO date
  seenHowTo: boolean;
  /** Settings → Input: tap & hold (default) or tap only. A lesson preset's `hold: false` wins over 'hold'. */
  holdMode: 'hold' | 'tap';
  /** Settings → Metronome look: the beat counter on Play shows digits (default) or a swinging pendulum. */
  metronomeLook: 'digital' | 'analog';
}

export interface LessonProgress {
  stars: 0 | 1 | 2 | 3;
  bestAccuracy: number;
}

export interface Progress {
  lessons: Record<string, LessonProgress>; // key: lesson id, e.g. "7.3"
  practiceDays: string[]; // ISO dates (yyyy-mm-dd) with at least one finished exercise
  lastSettings: Settings | null;
}

/** Versioned keys: a future format gets a new key (and may migrate from the old one). */
export const PREFS_KEY = 'muzieklab.prefs.v1';
export const PROGRESS_KEY = 'muzieklab.progress.v1';

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  volumes: { metronome: 0.7, rhythm: 0.8, tap: 0.5 },
  metronomeOn: true,
  tapSoundOn: true,
  leniency: 'normal',
  calibrationMs: 0,
  calibratedAt: null,
  seenHowTo: false,
  holdMode: 'hold',
  metronomeLook: 'digital',
};

export function defaultProgress(): Progress {
  return { lessons: {}, practiceDays: [], lastSettings: null };
}

// --- validation helpers: keep what is valid, fall back to the default for the rest ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
function oneOf<T extends string | number>(v: unknown, options: readonly T[], d: T): T {
  return options.includes(v as T) ? (v as T) : d;
}
function subset<T extends string>(v: unknown, options: readonly T[]): T[] | null {
  if (!Array.isArray(v)) return null;
  return options.filter((o) => v.includes(o));
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full, blocked or unavailable: the app keeps working for this session */
  }
}

export function sanitizePrefs(raw: unknown): Prefs {
  const d = DEFAULT_PREFS;
  if (!isObj(raw)) return { ...d, volumes: { ...d.volumes } };
  const v = isObj(raw.volumes) ? raw.volumes : {};
  return {
    theme: oneOf(raw.theme, ['system', 'light', 'dark'] as const, d.theme),
    volumes: {
      metronome: num(v.metronome, d.volumes.metronome, 0, 1),
      rhythm: num(v.rhythm, d.volumes.rhythm, 0, 1),
      tap: num(v.tap, d.volumes.tap, 0, 1),
    },
    metronomeOn: bool(raw.metronomeOn, d.metronomeOn),
    tapSoundOn: bool(raw.tapSoundOn, d.tapSoundOn),
    leniency: oneOf(raw.leniency, ['strict', 'normal', 'relaxed'] as const, d.leniency),
    calibrationMs: num(raw.calibrationMs, d.calibrationMs, -500, 500),
    calibratedAt: typeof raw.calibratedAt === 'string' ? raw.calibratedAt : null,
    seenHowTo: bool(raw.seenHowTo, d.seenHowTo),
    holdMode: oneOf(raw.holdMode, ['hold', 'tap'] as const, d.holdMode),
    metronomeLook: oneOf(raw.metronomeLook, ['digital', 'analog'] as const, d.metronomeLook),
  };
}

/** A stored Settings object, repaired field by field; null when it is not an object at all. */
export function sanitizeSettings(raw: unknown): Settings | null {
  if (!isObj(raw)) return null;
  const d = DEFAULT_SETTINGS;
  const meters = subset<MeterId>(raw.meters, METER_IDS);
  const notes = subset<NoteValue>(raw.notes, NOTE_VALUES);
  const rests = subset<NoteValue>(raw.rests, NOTE_VALUES);
  return {
    hold: bool(raw.hold, d.hold),
    meters: meters && meters.length ? meters : [...d.meters],
    notes: notes && notes.length ? notes : [...d.notes],
    rests: rests ?? [...d.rests],
    dotted: bool(raw.dotted, d.dotted),
    ties: bool(raw.ties, d.ties),
    triplets: bool(raw.triplets, d.triplets),
    bars: Math.round(num(raw.bars, d.bars, 1, 16)),
    tempo: Math.round(num(raw.tempo, d.tempo, 40, 200)),
    metronome: oneOf(raw.metronome, ['on', 'accent', 'off'] as const, d.metronome),
    countIn: oneOf(raw.countIn, [0, 1, 2] as const, d.countIn),
    density: oneOf(raw.density, ['sparse', 'balanced', 'busy'] as const, d.density),
    restAmount: oneOf(raw.restAmount, ['few', 'some', 'many'] as const, d.restAmount),
  };
}

export function sanitizeProgress(raw: unknown): Progress {
  if (!isObj(raw)) return defaultProgress();
  const lessons: Record<string, LessonProgress> = {};
  if (isObj(raw.lessons)) {
    for (const [id, l] of Object.entries(raw.lessons)) {
      if (!isObj(l)) continue;
      lessons[id] = { stars: oneOf(l.stars, [0, 1, 2, 3] as const, 0), bestAccuracy: num(l.bestAccuracy, 0, 0, 100) };
    }
  }
  const days = Array.isArray(raw.practiceDays)
    ? [...new Set(raw.practiceDays.filter((x): x is string => typeof x === 'string' && ISO_DATE.test(x)))].sort()
    : [];
  return { lessons, practiceDays: days, lastSettings: sanitizeSettings(raw.lastSettings) };
}

export function loadPrefs(): Prefs {
  return sanitizePrefs(readJson(PREFS_KEY));
}
export function savePrefs(p: Prefs): void {
  writeJson(PREFS_KEY, p);
}
export function loadProgress(): Progress {
  return sanitizeProgress(readJson(PROGRESS_KEY));
}
export function saveProgress(p: Progress): void {
  writeJson(PROGRESS_KEY, p);
}
/** Settings → Reset progress: stars, streak and last settings (prefs and calibration are kept). */
export function resetProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* unavailable storage: nothing to reset */
  }
}

/** Local calendar date as yyyy-mm-dd (the player's day, not UTC). */
export function localDateIso(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Progress with `day` added to the practice days (kept unique and sorted). */
export function addPracticeDay(p: Progress, day: string): Progress {
  if (p.practiceDays.includes(day)) return p;
  return { ...p, practiceDays: [...p.practiceDays, day].sort() };
}

/** yyyy-mm-dd shifted by whole days; UTC arithmetic so DST never skips or repeats a day. */
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Current streak in days ending today (or yesterday if today has no practice yet). */
export function streak(days: string[], today: string): number {
  const set = new Set(days);
  let day = set.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}
