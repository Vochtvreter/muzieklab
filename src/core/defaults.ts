import type { Settings } from './types';

/** Practice setup defaults (§4). */
export const DEFAULT_SETTINGS: Settings = {
  mode: 'tap',
  hold: true,
  meters: ['4/4'],
  notes: ['half', 'quarter'],
  rests: ['quarter'],
  dotted: false,
  ties: false,
  triplets: false,
  bars: 4,
  tempo: 80,
  metronome: 'on',
  countIn: 1,
  density: 'balanced',
  restAmount: 'some',
};
