import type { Meter, MeterId } from './types';
import { PPQ } from './types';

const SIXTEENTH = PPQ / 4;
const EIGHTH = PPQ / 2;

/**
 * Metric weight of a tick inside a bar (§5.2, after Lerdahl & Jackendoff):
 * downbeat strongest, then (4/4 only) the half-bar, then the other beats, the "&", the "e"/"a".
 * Positions off the sixteenth grid (triplet notes) get 0.
 */
function weights(id: MeterId, barTicks: number): (tick: number) => number {
  const downbeat = id === '4/4' ? 4 : 3;
  return (tick: number): number => {
    const t = ((tick % barTicks) + barTicks) % barTicks;
    if (t === 0) return downbeat;
    if (id === '4/4' && t === 2 * PPQ) return 3;
    if (t % PPQ === 0) return 2;
    if (t % EIGHTH === 0) return 1;
    return 0;
  };
}

function make(id: MeterId, beatsPerBar: number): Meter {
  const barTicks = beatsPerBar * PPQ;
  return {
    id,
    barTicks,
    beatTicks: PPQ,
    beatsPerBar,
    beamGroups: Array.from({ length: beatsPerBar }, () => PPQ),
    weightAt: weights(id, barTicks),
  };
}

const METERS: Record<MeterId, Meter> = {
  '2/4': make('2/4', 2),
  '3/4': make('3/4', 3),
  '4/4': make('4/4', 4),
};

/** Meter definitions with metric weights (§5.2). Returns a shared, immutable object per id. */
export function getMeter(id: MeterId): Meter {
  const m = METERS[id];
  if (!m) throw new Error('unknown meter: ' + id);
  return m;
}

/** Positions that count as strong for the cadence rule: beats 1 and 3 in 4/4, beats 1 and 2 in 2/4 and 3/4. */
export function isCadencePosition(meter: Meter, tick: number): boolean {
  if (meter.id === '4/4') return tick === 0 || tick === 2 * PPQ;
  return tick === 0 || tick === PPQ;
}

export { SIXTEENTH, EIGHTH };
