import type { MeterId, Settings } from './types';

export interface Feasibility {
  /** Meters among settings.meters that can be filled with the enabled values. */
  playable: MeterId[];
  /** For each meter (chosen or not) that cannot be filled: a hint message key + params, e.g. needs a quarter note. */
  blocked: Partial<Record<MeterId, { key: string; params: Record<string, string> }>>;
  /** True when at least one chosen meter is playable and at least one note value is on. */
  ok: boolean;
}

/** DP feasibility check per meter (§4.1, §5.6). */
export function checkSettings(settings: Settings): Feasibility {
  throw new Error('not implemented: checkSettings ' + settings.bars);
}
