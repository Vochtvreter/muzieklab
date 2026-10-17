/** Difficulty rating (§5.8), 0–10. */
import type { Bar, Meter } from './types';
import { PPQ } from './types';

interface Onset {
  tick: number; // absolute
  triplet: boolean;
}

function onsets(meter: Meter, bars: Bar[]): Onset[] {
  const out: Onset[] = [];
  bars.forEach((bar, b) => {
    for (const e of bar.events) {
      if (e.kind === 'note' && !e.tieFromPrev) out.push({ tick: b * meter.barTicks + e.start, triplet: !!e.triplet });
    }
  });
  return out;
}

/**
 * Longuet-Higgins & Lee (1984) syncopation, as formalised by Fitch & Rosenfeld (2007): a note on a weak position
 * followed by silence (a rest or a held note) on a stronger position, before the next onset, scores
 * weight(strong) − weight(weak). Positions are the sixteenth grid; from a triplet note only beats are checked.
 * Returns the total over the exercise.
 */
export function syncopation(meter: Meter, bars: Bar[]): number {
  const list = onsets(meter, bars);
  const total = bars.length * meter.barTicks;
  let score = 0;
  list.forEach((o, i) => {
    const next = i + 1 < list.length ? list[i + 1].tick : total;
    const w = meter.weightAt(o.tick);
    const step = o.triplet ? PPQ : PPQ / 4;
    let strongest = -1;
    for (let t = Math.floor(o.tick / step) * step + step; t < next; t += step) strongest = Math.max(strongest, meter.weightAt(t));
    if (strongest > w) score += strongest - w;
  });
  return score;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface DifficultyParts {
  subdivisionDepth: number;
  onsetsPerBeat: number;
  syncopation: number;
  restRatio: number;
  ties: number;
  distinctValues: number;
  tempoFactor: number;
}

/** Each component normalised to 0–1. */
export function difficultyParts(meter: Meter, bars: Bar[], tempo: number): DifficultyParts {
  let shortest = Infinity;
  let restTicks = 0;
  let ties = 0;
  let triplet = false;
  const kinds = new Set<string>();
  for (const bar of bars) {
    for (const e of bar.events) {
      if (e.kind === 'rest') restTicks += e.duration;
      if (e.tieFromPrev) ties++;
      if (e.triplet) triplet = true;
      else shortest = Math.min(shortest, e.duration);
      kinds.add(e.kind + e.duration + (e.triplet ? 't' : ''));
    }
  }
  const depth = shortest <= PPQ / 4 ? 2 : triplet ? 1.5 : shortest <= PPQ / 2 || shortest === 0.75 * PPQ ? 1 : 0;
  const beats = bars.length * meter.beatsPerBar;
  const n = onsets(meter, bars).length;
  return {
    subdivisionDepth: clamp01(depth / 2),
    onsetsPerBeat: clamp01(n / beats / 3),
    syncopation: clamp01(syncopation(meter, bars) / bars.length / 3),
    restRatio: clamp01(restTicks / (bars.length * meter.barTicks) / 0.4),
    ties: clamp01(ties / bars.length),
    distinctValues: clamp01((kinds.size - 1) / 7),
    tempoFactor: clamp01((tempo - 40) / 160),
  };
}

const W: DifficultyParts = {
  subdivisionDepth: 0.22,
  onsetsPerBeat: 0.18,
  syncopation: 0.16,
  restRatio: 0.08,
  ties: 0.08,
  distinctValues: 0.12,
  tempoFactor: 0.16,
};

export function rateDifficulty(meter: Meter, bars: Bar[], tempo: number): number {
  if (!bars.length) return 0;
  const p = difficultyParts(meter, bars, tempo);
  let sum = 0;
  for (const k of Object.keys(W) as (keyof DifficultyParts)[]) sum += W[k] * p[k];
  return Math.round(sum * 100) / 10;
}
