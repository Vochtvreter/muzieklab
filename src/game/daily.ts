/**
 * Daily challenge (DESIGN.md §3.4): one exercise per day that follows the player's place on the rhythm path. The date
 * and the highest open unit (the tier) pick a preset, then a tempo and a bar count, then the seed, so everyone at the
 * same unit on the same date gets the same exercise.
 */
import { Rng } from '../core/rng';
import { DEFAULT_SETTINGS } from '../core/defaults';
import type { Settings } from '../core/types';
import { RHYTHM_TRACK } from './path';
import type { Progress } from './storage';
import { lessonOpen } from './track';

/** A preset and the path unit that teaches its hardest material: it is picked once that unit is open. */
interface Preset {
  unit: number;
  settings: Partial<Settings>;
}

const PRESETS: Preset[] = [
  // Units 1–2: 4/4 with quarter and half notes; the quarter rest from unit 2, the half rest with it.
  { unit: 1, settings: { meters: ['4/4'], notes: ['half', 'quarter'], rests: [] } },
  { unit: 2, settings: { meters: ['4/4'], notes: ['half', 'quarter'], rests: ['quarter'] } },
  { unit: 2, settings: { meters: ['4/4'], notes: ['half', 'quarter'], rests: ['half', 'quarter'] } },
  // From unit 3: mid-path material, one preset per thing a unit adds.
  { unit: 3, settings: { meters: ['3/4'], notes: ['half', 'quarter'], rests: ['quarter'] } },
  { unit: 3, settings: { meters: ['4/4'], notes: ['whole', 'half', 'quarter'], rests: ['half', 'quarter'] } },
  { unit: 4, settings: { meters: ['4/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'] } },
  { unit: 4, settings: { meters: ['3/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'] } },
  { unit: 5, settings: { meters: ['2/4'], notes: ['quarter', 'eighth'], rests: ['quarter', 'eighth'] } },
  { unit: 5, settings: { meters: ['2/4', '3/4', '4/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'] } },
  { unit: 6, settings: { meters: ['4/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'], ties: true } },
  { unit: 7, settings: { meters: ['3/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'], dotted: true } },
  { unit: 8, settings: { meters: ['4/4'], notes: ['quarter', 'eighth', 'sixteenth'], rests: ['quarter'] } },
];
const TOP_UNIT = Math.max(...PRESETS.map((p) => p.unit));
/** Below unit 3 the daily stays short and slow, like the path's first lessons. */
const FIRST_MID_UNIT = 3;
const EASY_TEMPOS = [60, 66, 72];
const EASY_BARS = [4];
const TEMPOS = [72, 80, 88, 96, 104];
const BARS = [4, 8];
/** The path teaches holding notes from unit 2; before that the daily is tap only. */
const HOLD_FROM_UNIT = 2;

/** A stable 31-bit number for a string (FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 1;
}

/** The highest open unit of the rhythm path (1 on day one, the last unit once it is open). */
export function reachedUnit(progress: Progress): number {
  let reached = 1;
  for (const u of RHYTHM_TRACK.units) if (u.lessons.length && lessonOpen(progress, RHYTHM_TRACK, u.lessons[0].id)) reached = u.id;
  return reached;
}

/**
 * The day's challenge for a player who has reached unit `reached`: settings (tap mode; hold from unit 2) and the seed,
 * from a yyyy-mm-dd date. Below unit 3 it picks from the beginner presets, from unit 3 from the mid-path ones; never
 * from a unit that is not open yet.
 */
export function dailyChallenge(day: string, reached: number): { settings: Settings; seed: number } {
  const tier = Math.max(1, Math.min(TOP_UNIT, Math.floor(reached) || 1));
  const easy = tier < FIRST_MID_UNIT;
  const pool = PRESETS.filter((p) => p.unit <= tier && (p.unit < FIRST_MID_UNIT) === easy);
  const rng = new Rng(hash(`daily:${day}:${tier}`));
  const preset = rng.pick(pool).settings;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...preset,
    mode: 'tap',
    hold: tier >= HOLD_FROM_UNIT,
    tempo: rng.pick(easy ? EASY_TEMPOS : TEMPOS),
    bars: rng.pick(easy ? EASY_BARS : BARS),
  };
  return { settings: { ...settings, meters: [...settings.meters], notes: [...settings.notes], rests: [...settings.rests] }, seed: rng.int(0x7fffffff) };
}
