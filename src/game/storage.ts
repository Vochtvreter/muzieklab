import type { Leniency, MeterId, NoteValue, Settings, Stars } from '../core/types';
import { DIAMOND, METER_IDS, MODES, NOTE_VALUES } from '../core/types';
import { CLEFS, KEY_IDS, type Clef, type KeyId } from '../core/pitch';
import { DEFAULT_SETTINGS } from '../core/defaults';
import { MAX_WEAK, parseNoteId, sanitizeNoteSettings, type NoteSettings, type WeakSpots } from '../core/noteRound';
import { parseScaleId, type ScaleStars } from '../core/scale';
import { sanitizeScaleSettings, type ScaleSettings } from '../core/scaleRound';
import type { Volumes } from '../audio/engine';
import { isLocale } from '../i18n';
import { LOCALES as ACCOUNT_LOCALES, PERMISSIONS, ROLE_ID_PATTERN, type Me } from '../../shared/api';
import { INTRO_IDS, introsOf } from './intro';

export interface Prefs {
  /** Settings → Language: a locale code ("en", "nl"), or 'system' to follow the device's languages. */
  language: string;
  theme: 'system' | 'light' | 'dark';
  volumes: Volumes;
  metronomeOn: boolean;
  tapSoundOn: boolean;
  leniency: Leniency;
  calibrationMs: number; // device offset
  calibratedAt: string | null; // ISO date
  seenHowTo: boolean;
  /**
   * How to play was shown for an exercise where holding counts. Unit 1 is tap only, so a beginner first sees the tap
   * version; the first exercise that judges holds shows it again (§3.1 First time).
   */
  seenHold: boolean;
  /** The Echo mode's How to play was shown once. */
  seenEchoHowTo: boolean;
  /** The new symbols a lesson's intro sheet has shown ("note:half", "meter:3/4"; game/intro.ts), so each shows once. */
  seenIntros: string[];
  /**
   * Settings → Input: tap & hold (default) or tap only. A lesson preset's `hold: false` wins over 'hold', and free
   * practice only holds once the path has taught it (ui/store.tsx practiceHold).
   */
  holdMode: 'hold' | 'tap';
  /**
   * The setup's "Hold notes for their length" was turned on, also before the path teaches holding (unit 2): the Input
   * mode it replaced, which turning it off before unit 2 puts back. Null until it is turned on, and again once it is
   * turned off or Input is picked in Settings.
   */
  holdEarly: Prefs['holdMode'] | null;
  /** Settings → Metronome look: the beat counter on Play shows digits (default) or a swinging pendulum. */
  metronomeLook: 'digital' | 'analog';
  /** Read notes: the name buttons show do re mi (fixed do) or letters. A new player gets their device language's usual one. */
  noteNames: 'solfege' | 'letters';
  /** Read notes: the piano keys' labels. */
  pianoLabels: 'letters' | 'solfege' | 'off';
  /**
   * Settings → Account → Feedback button: whether the feedback tool's button shows on this device, for an account with
   * feedback.give while feedback mode is on (docs/FEEDBACK-LOOP.md §3). On unless turned off here.
   */
  feedbackButton: boolean;
}

export interface LessonProgress {
  stars: Stars;
  bestAccuracy: number;
}

/** The daily challenge most recently played: its date, its tier and the best result that day. */
export interface DailyProgress {
  day: string; // yyyy-mm-dd
  /** The tier (game/daily.ts) it was first played at, which it keeps for the rest of the day; missing in older saves. */
  tier?: number;
  stars: Stars;
  accuracy: number;
}

/** A rhythm cell of the Progress tab's skill map (game/cells.ts says which notes count for which). */
export type CellId = 'quarter' | 'half' | 'eighths' | 'rests' | 'ties' | 'dottedHalf' | 'dottedQE' | 'sixteenths';
/** The skill map's order. */
export const CELL_IDS: readonly CellId[] = ['quarter', 'half', 'eighths', 'rests', 'ties', 'dottedHalf', 'dottedQE', 'sixteenths'];

/** The six skills with ten levels each (game/skills.ts), in their order. */
export type SkillId = 'rhythm' | 'ear' | 'treble' | 'bass' | 'scales' | 'theory';
export const SKILL_IDS: readonly SkillId[] = ['rhythm', 'ear', 'treble', 'bass', 'scales', 'theory'];

/** The achievements (game/achievements.ts), in the Progress tab's order. */
export type AchievementId = 'streak7' | 'perfectBar' | 'noReplays' | 'firstSixteenths' | 'tempo160';
export const ACHIEVEMENT_IDS: readonly AchievementId[] = ['streak7', 'perfectBar', 'noReplays', 'firstSixteenths', 'tempo160'];

/** What one local day added to the Progress tab's figures (game/stats.ts records it). Whole numbers only. */
export interface DayStats {
  /** Seconds practised that day, all modes. */
  sec: number;
  /** Rhythm rounds finished (tap and Echo: free practice, lessons and the daily challenge), and their accuracies' sum (whole %). */
  rounds: number;
  acc: number;
  /** Timing: the sum of the hit notes' signed offsets (each rounded to whole ms; negative = early), and how many. */
  off: number;
  hits: number;
  /** Skill-map cells: [points earned, points possible] per cell, with the points the accuracy uses. */
  cells: Partial<Record<CellId, [number, number]>>;
}

/** Days of figures kept: the newest dates, so the account copy stays small (about 250 bytes a day). */
export const HISTORY_DAYS = 42;
/** The longest answer time a Read notes note counts with (ms): a note left on screen is not minutes practised. */
export const ANSWER_CAP_MS = 15000;
/** The most seconds one day can hold. */
export const DAY_SECONDS = 86400;

/** The Progress tab's figures (DESIGN.md §8.5). */
export interface Stats {
  /** Per local day (yyyy-mm-dd): at most HISTORY_DAYS entries, the newest dates kept. */
  days: Record<string, DayStats>;
  /** Read notes, every round: [right, answered] per clef. */
  clefs: Partial<Record<Clef, [number, number]>>;
  /** Read notes, every round: [sum of answer ms (each capped at ANSWER_CAP_MS), answers] per note id ("treble:38"). */
  noteMs: Record<string, [number, number]>;
  /** The key and clef of the last Read notes round. */
  lastKey: { key: KeyId; clef: Clef } | null;
  /** Read notes skill checks: per "clef:level" (level 1–10), [best accuracy %, best average answer ms (0 = none)]. */
  reading: Record<string, [number, number]>;
  /** Rhythm by ear (Echo): per material level "1"…"8", [Echo rounds at ★★ or more, best stars in an Echo round of 4+ bars]. */
  echo: Record<string, [number, number]>;
  /** The last day each skill was practised. */
  seen: Partial<Record<SkillId, string>>;
}

export interface Progress {
  lessons: Record<string, LessonProgress>; // key: lesson id, e.g. "7.3"
  practiceDays: string[]; // ISO dates (yyyy-mm-dd) with at least one finished exercise
  lastSettings: Settings | null;
  /** Total XP earned (levels follow from it, game/xp.ts). */
  xp: number;
  daily: DailyProgress | null;
  /** Best accuracy on any daily challenge so far (0 before the first). */
  dailyBest: number;
  /** Read notes: the setup as last edited, and the weak spots per note (§3.5 spaced repetition). */
  notes: { settings: NoteSettings | null; weak: WeakSpots };
  /** Scales: the setup as last edited, and the best stars per scale id ("D-major", §3.7). */
  scales: { settings: ScaleSettings | null; stars: ScaleStars };
  /** Learn sections read, e.g. "8.2". */
  learnRead: string[];
  /** The Progress tab's figures (DESIGN.md §8.5). */
  stats: Stats;
  /** Achievements earned: id → the day it was earned. */
  achievements: Partial<Record<AchievementId, string>>;
  /** Skill levels passed: "skill:level" (level 1–10) → the day it was passed. A passed level stays passed. */
  skills: Record<string, string>;
}

/** Versioned keys: a future format gets a new key (and may migrate from the old one). */
export const PREFS_KEY = 'muzieklab.prefs.v1';
export const PROGRESS_KEY = 'muzieklab.progress.v1';
/**
 * The signed-in account as GET /me last gave it, so Settings → Account can show who is signed in while offline. Only
 * what Me holds: never a password or a token (the session cookie is HttpOnly; JavaScript cannot read it).
 */
export const ACCOUNT_KEY = 'muzieklab.account.v1';

export const DEFAULT_PREFS: Prefs = {
  language: 'system',
  theme: 'system',
  volumes: { metronome: 0.7, rhythm: 0.8, tap: 0.5 },
  metronomeOn: true,
  tapSoundOn: true,
  leniency: 'normal',
  calibrationMs: 0,
  calibratedAt: null,
  seenHowTo: false,
  seenHold: false,
  seenEchoHowTo: false,
  seenIntros: [],
  holdMode: 'hold',
  holdEarly: null,
  metronomeLook: 'digital',
  noteNames: 'letters',
  pianoLabels: 'letters',
  feedbackButton: true,
};

export function defaultProgress(): Progress {
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
    stats: defaultStats(),
    achievements: {},
    skills: {},
  };
}

export function defaultStats(): Stats {
  return { days: {}, clefs: {}, noteMs: {}, lastKey: null, reading: {}, echo: {}, seen: {} };
}

/** True when nothing has been earned or saved yet (storage can then be cleared). */
export function isEmptyProgress(p: Progress): boolean {
  return (
    p.practiceDays.length === 0 &&
    Object.keys(p.lessons).length === 0 &&
    !p.lastSettings &&
    p.xp === 0 &&
    !p.daily &&
    !p.notes.settings &&
    Object.keys(p.notes.weak).length === 0 &&
    !p.scales.settings &&
    Object.keys(p.scales.stars).length === 0 &&
    p.learnRead.length === 0 &&
    Object.keys(p.stats.days).length === 0 &&
    Object.keys(p.stats.clefs).length === 0 &&
    Object.keys(p.stats.noteMs).length === 0 &&
    !p.stats.lastKey &&
    Object.keys(p.stats.reading).length === 0 &&
    Object.keys(p.stats.echo).length === 0 &&
    Object.keys(p.stats.seen).length === 0 &&
    Object.keys(p.achievements).length === 0 &&
    Object.keys(p.skills).length === 0
  );
}

/** Learn sections that moved when chapter 8 split into chapters 8–10 (0.3.4): the piano, and key signatures. */
const MOVED_SECTIONS: Record<string, string[]> = { '8.6': ['9.1'], '8.7': ['10.1', '10.2', '10.3', '10.4'] };

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
/** A stored day that is a real one (2026-13-45 is not, and would be shown as Feb 14), else null. */
function calendarDay(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  return localDateIso(new Date(y, m - 1, d)) === v ? v : null;
}

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
  if (!isObj(raw)) return { ...d, volumes: { ...d.volumes }, seenIntros: [] };
  const v = isObj(raw.volumes) ? raw.volumes : {};
  return {
    language: raw.language === 'system' || isLocale(raw.language) ? raw.language : d.language,
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
    // Settings shows its day: text that is not one (storage edited or broken) would be shown as it is.
    calibratedAt: calendarDay(raw.calibratedAt),
    seenHowTo: bool(raw.seenHowTo, d.seenHowTo),
    seenHold: bool(raw.seenHold, d.seenHold),
    seenEchoHowTo: bool(raw.seenEchoHowTo, d.seenEchoHowTo),
    seenIntros: Array.isArray(raw.seenIntros) ? INTRO_IDS.filter((id) => (raw.seenIntros as unknown[]).includes(id)) : [],
    holdMode: oneOf(raw.holdMode, ['hold', 'tap'] as const, d.holdMode),
    // Saved as true before it kept the mode it replaced: tap & hold, the default, so turning it off keeps Input as is.
    holdEarly: raw.holdEarly === 'hold' || raw.holdEarly === 'tap' ? raw.holdEarly : raw.holdEarly === true ? 'hold' : null,
    metronomeLook: oneOf(raw.metronomeLook, ['digital', 'analog'] as const, d.metronomeLook),
    noteNames: oneOf(raw.noteNames, ['solfege', 'letters'] as const, d.noteNames),
    pianoLabels: oneOf(raw.pianoLabels, ['letters', 'solfege', 'off'] as const, d.pianoLabels),
    feedbackButton: bool(raw.feedbackButton, d.feedbackButton),
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
    mode: oneOf(raw.mode, MODES, d.mode),
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
      const bestAccuracy = num(l.bestAccuracy, 0, 0, 100);
      const stars = oneOf(l.stars, [0, 1, 2, 3, 4, DIAMOND] as const, 0);
      // Saved before the diamond, 4 meant all perfect. Now a 100% best is always the diamond, so 4 with 100% is that.
      lessons[id] = { stars: stars === 4 && bestAccuracy >= 100 ? DIAMOND : stars, bestAccuracy };
    }
  }
  const days = Array.isArray(raw.practiceDays)
    ? [...new Set(raw.practiceDays.filter((x): x is string => typeof x === 'string' && ISO_DATE.test(x)))].sort()
    : [];
  const d = isObj(raw.daily) ? raw.daily : null;
  const daily: DailyProgress | null =
    d && typeof d.day === 'string' && ISO_DATE.test(d.day)
      ? {
          day: d.day,
          ...(typeof d.tier === 'number' && Number.isInteger(d.tier) && d.tier >= 1 ? { tier: d.tier } : {}),
          stars: oneOf(d.stars, [0, 1, 2, 3, 4, DIAMOND] as const, 0),
          accuracy: num(d.accuracy, 0, 0, 100),
        }
      : null;
  return {
    lessons,
    practiceDays: days,
    lastSettings: sanitizeSettings(raw.lastSettings),
    xp: Math.floor(num(raw.xp, 0, 0, 1e9)),
    daily,
    dailyBest: num(raw.dailyBest, 0, 0, 100),
    notes: sanitizeNotes(raw.notes),
    scales: sanitizeScales(raw.scales),
    learnRead: Array.isArray(raw.learnRead)
      ? [...new Set(raw.learnRead.filter((x): x is string => typeof x === 'string' && /^\d{1,2}\.\d{1,2}$/.test(x)).flatMap((x) => MOVED_SECTIONS[x] ?? [x]))]
      : [],
    stats: sanitizeStats(raw.stats),
    achievements: datesOf(raw.achievements, (id) => (ACHIEVEMENT_IDS as readonly string[]).includes(id)),
    skills: datesOf(raw.skills, (id) => SKILL_LEVEL_KEY.test(id)),
  };
}

/** "treble:3": a skill and one of its levels, 1–10. */
const SKILL_LEVEL_KEY = /^(rhythm|ear|treble|bass|scales|theory):([1-9]|10)$/;
/** "bass:10": a Read notes skill level. */
const READING_KEY = /^(treble|bass):([1-9]|10)$/;
/** "1"…"8": an Echo material level (a rhythm unit). */
const ECHO_KEY = /^[1-8]$/;

/** A whole number in [min, max], or null when it is not a number. */
function int(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : null;
}

/** A [part, whole] pair of whole numbers: whole ≥ 1, part from 0 to whole × perUnit; null when it is not one. */
function partOf(v: unknown, perUnit: number): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const whole = int(v[1], 0, 1e9);
  const part = whole ? int(v[0], 0, whole * perUnit) : null;
  return whole && part !== null ? [part, whole] : null;
}

/** A pair of whole numbers, each in its own range; null when it is not one. */
function pairOf(v: unknown, first: [number, number], second: [number, number]): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = int(v[0], first[0], first[1]);
  const b = int(v[1], second[0], second[1]);
  return a === null || b === null ? null : [a, b];
}

/** Entries of an object whose keys pass `keep` and whose values `read` accepts. */
function entriesOf<T>(raw: unknown, keep: (key: string) => boolean, read: (v: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!keep(k)) continue;
    const x = read(v);
    if (x !== null) out[k] = x;
  }
  return out;
}

const datesOf = (raw: unknown, keep: (key: string) => boolean): Record<string, string> =>
  entriesOf(raw, keep, (v) => (typeof v === 'string' && ISO_DATE.test(v) ? v : null));

/** One day's figures, repaired, or null when it is not an object. */
export function sanitizeDayStats(raw: unknown): DayStats | null {
  if (!isObj(raw)) return null;
  const rounds = int(raw.rounds, 0, 1e6) ?? 0;
  return {
    sec: int(raw.sec, 0, DAY_SECONDS) ?? 0,
    rounds,
    acc: int(raw.acc, 0, 100 * rounds) ?? 0,
    off: int(raw.off, -1e9, 1e9) ?? 0,
    hits: int(raw.hits, 0, 1e8) ?? 0,
    cells: entriesOf(raw.cells, (k) => (CELL_IDS as readonly string[]).includes(k), (v) => partOf(v, 1)),
  };
}

/** The newest HISTORY_DAYS dates of a day map (the merge keeps the same ones; the recorders keep no more). */
export function newestDays<T>(days: Record<string, T>): Record<string, T> {
  const keep = Object.keys(days).sort().slice(-HISTORY_DAYS);
  return Object.fromEntries(keep.map((d) => [d, days[d]]));
}

function sanitizeStats(raw: unknown): Stats {
  if (!isObj(raw)) return defaultStats();
  const k = isObj(raw.lastKey) ? raw.lastKey : null;
  return {
    days: newestDays(entriesOf(raw.days, (d) => ISO_DATE.test(d), sanitizeDayStats)),
    clefs: entriesOf(raw.clefs, (c) => (CLEFS as readonly string[]).includes(c), (v) => partOf(v, 1)),
    noteMs: entriesOf(raw.noteMs, (id) => parseNoteId(id) !== null, (v) => partOf(v, ANSWER_CAP_MS)),
    lastKey:
      k && (KEY_IDS as readonly unknown[]).includes(k.key) && (CLEFS as readonly unknown[]).includes(k.clef) ? { key: k.key as KeyId, clef: k.clef as Clef } : null,
    reading: entriesOf(raw.reading, (id) => READING_KEY.test(id), (v) => pairOf(v, [0, 100], [0, ANSWER_CAP_MS])),
    echo: entriesOf(raw.echo, (id) => ECHO_KEY.test(id), (v) => pairOf(v, [0, 1e6], [0, DIAMOND])),
    seen: datesOf(raw.seen, (id) => (SKILL_IDS as readonly string[]).includes(id)),
  };
}

function sanitizeNotes(raw: unknown): Progress['notes'] {
  if (!isObj(raw)) return { settings: null, weak: {} };
  const weak: WeakSpots = {};
  if (isObj(raw.weak)) {
    for (const [id, w] of Object.entries(raw.weak)) {
      const v = Math.round(num(w, 0, 0, MAX_WEAK));
      if (v > 0 && parseNoteId(id)) weak[id] = v;
    }
  }
  return { settings: sanitizeNoteSettings(raw.settings), weak };
}

function sanitizeScales(raw: unknown): Progress['scales'] {
  if (!isObj(raw)) return { settings: null, stars: {} };
  const stars: ScaleStars = {};
  if (isObj(raw.stars)) {
    for (const [id, s] of Object.entries(raw.stars)) {
      const v = Math.round(num(s, 0, 0, 3));
      if (v > 0 && parseScaleId(id)) stars[id] = v;
    }
  }
  return { settings: sanitizeScaleSettings(raw.settings), stars };
}

/**
 * Played an exercise that judges holds: a rhythm lesson after rhythm unit 1 (note lessons, "pitch:1.1", have no taps),
 * free practice or a daily challenge (hold by default).
 */
export function playedHolds(p: Progress): boolean {
  return Object.keys(p.lessons).some((id) => !id.includes(':') && !id.startsWith('1.')) || p.lastSettings !== null || p.daily !== null;
}

/** Languages where music lessons name notes do re mi (fixed do): French, Italian, Spanish, Portuguese, Romanian. */
const SOLFEGE_LANGUAGES = ['fr', 'it', 'es', 'pt', 'ro'];

/** Note names for a new player: do re mi where it is the norm (those languages, and Dutch in Belgium), else letters. */
export function defaultNoteNames(language: string | undefined): Prefs['noteNames'] {
  const tag = (language ?? '').toLowerCase().replace('_', '-');
  return tag.startsWith('nl-be') || SOLFEGE_LANGUAGES.includes(tag.split('-')[0]) ? 'solfege' : 'letters';
}

const deviceLanguage = (): string | undefined => (typeof navigator === 'undefined' ? undefined : navigator.language);

export function loadPrefs(): Prefs {
  const raw = readJson(PREFS_KEY);
  const prefs = sanitizePrefs(raw);
  if (!isObj(raw)) {
    // No prefs saved yet (the store saves them when one changes). Nothing saved at all: a new player, who gets the
    // device language's note names. Progress without prefs: a player from before who never changed one, and had do re
    // mi. Saved now, so a new player's names stay once there is progress.
    prefs.noteNames = isEmptyProgress(loadProgress()) ? defaultNoteNames(deviceLanguage()) : 'solfege';
    savePrefs(prefs);
  }
  // Saved prefs keep their note names (do re mi, everyone's default before, if unset).
  else if (raw.noteNames !== 'letters' && raw.noteNames !== 'solfege') prefs.noteNames = 'solfege';
  // Saved before seenHold (0.8.0): a player who has seen How to play and has played holds since knows them already.
  if (isObj(raw) && typeof raw.seenHold !== 'boolean' && prefs.seenHowTo) prefs.seenHold = playedHolds(loadProgress());
  // Saved before seenIntros: the symbols of the lessons played already were met there.
  if (isObj(raw) && !Array.isArray(raw.seenIntros)) prefs.seenIntros = introsOf(Object.keys(loadProgress().lessons));
  return prefs;
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
const str = (v: unknown): v is string => typeof v === 'string';
const ROLE_ID = new RegExp(ROLE_ID_PATTERN);

/** A stored Me, field by field; null when it is not one (or names no account). Unknown fields are dropped. */
export function sanitizeMe(v: unknown): Me | null {
  if (!isObj(v) || !str(v.id) || !v.id || !str(v.email) || !v.email || !str(v.name) || !str(v.createdAt)) return null;
  const premium = isObj(v.premium) && v.premium.active === true ? { active: true, until: str(v.premium.until) ? v.premium.until : null } : { active: false, until: null };
  return {
    id: v.id,
    email: v.email,
    name: v.name,
    locale: (ACCOUNT_LOCALES as readonly unknown[]).includes(v.locale) ? (v.locale as Me['locale']) : null,
    roles: Array.isArray(v.roles) ? v.roles.filter((r): r is string => str(r) && ROLE_ID.test(r)) : [],
    roleNames: isObj(v.roleNames)
      ? Object.fromEntries(Object.entries(v.roleNames).filter((e): e is [string, string] => ROLE_ID.test(e[0]) && str(e[1])))
      : {},
    permissions: subset(v.permissions, PERMISSIONS) ?? [],
    premium,
    createdAt: v.createdAt,
    feedbackMode: v.feedbackMode === true,
  };
}
export function loadAccount(): Me | null {
  return sanitizeMe(readJson(ACCOUNT_KEY));
}
/** Saves the account (only Me's fields), or forgets it for null (signed out, the session ended, the account deleted). */
export function saveAccount(me: Me | null): void {
  const clean = sanitizeMe(me);
  if (clean) {
    writeJson(ACCOUNT_KEY, clean);
    return;
  }
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* unavailable storage: nothing was saved */
  }
}

/** Settings → Reset progress: stars, XP, streak, daily results and last settings (prefs and calibration are kept). */
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
export function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Whole days from `from` to `to` (both yyyy-mm-dd): 1 from yesterday to today, negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number => Math.round(dayNumber(to) - dayNumber(from));

/** The weekday of a yyyy-mm-dd, Monday first: 0 Monday … 6 Sunday. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday of the week a yyyy-mm-dd is in. */
export const mondayOf = (iso: string): string => shiftDay(iso, -weekdayOf(iso));

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
