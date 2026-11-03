import type { Settings } from './types';

/** The most bars and the fastest tempo the setup offers (§4): a perfect run there is not told to go further. */
export const MAX_BARS = 16;
export const MAX_TEMPO = 200;

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
