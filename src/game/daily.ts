/**
 * Daily challenge (DESIGN.md §3.4): one exercise per day, built from the date alone, so everyone playing on the same
 * date gets the same exercise. A preset is picked for the day, then a tempo and a bar count, then the seed.
 */
import { Rng } from '../core/rng';
import { DEFAULT_SETTINGS } from '../core/defaults';
import type { Settings } from '../core/types';

/** Mid-path material: every preset is something units 1–8 teach. */
const PRESETS: Partial<Settings>[] = [
  { meters: ['4/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'] },
  { meters: ['3/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'] },
  { meters: ['2/4'], notes: ['quarter', 'eighth'], rests: ['quarter', 'eighth'] },
  { meters: ['4/4'], notes: ['whole', 'half', 'quarter'], rests: ['half', 'quarter'] },
  { meters: ['4/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'], ties: true },
  { meters: ['3/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter'], dotted: true },
  { meters: ['4/4'], notes: ['quarter', 'eighth', 'sixteenth'], rests: ['quarter'] },
  { meters: ['2/4', '3/4', '4/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'] },
];
const TEMPOS = [72, 80, 88, 96, 104];
const BARS = [4, 8];

/** A stable 31-bit number for a string (FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 1;
}

/** The day's challenge: settings (tap mode, tap & hold) and the seed, from a yyyy-mm-dd date. */
export function dailyChallenge(day: string): { settings: Settings; seed: number } {
  const rng = new Rng(hash('daily:' + day));
  const preset = rng.pick(PRESETS);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...preset,
    mode: 'tap',
    hold: true,
    tempo: rng.pick(TEMPOS),
    bars: rng.pick(BARS),
  };
  return { settings: { ...settings, meters: [...settings.meters], notes: [...settings.notes], rests: [...settings.rests] }, seed: rng.int(0x7fffffff) };
}
