import type { Meter, MeterId } from './types';

/** Meter definitions with metric weights (§5.2). */
export function getMeter(id: MeterId): Meter {
  throw new Error('not implemented: getMeter ' + id);
}
