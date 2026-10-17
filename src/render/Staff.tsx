import type { Meter, NotatedBar } from '../core/types';

export type NoteMark = 'perfect' | 'great' | 'good' | 'miss' | 'pending';

export interface StaffProps {
  bars: NotatedBar[];
  meter: Meter;
  /** Colour per onset index (judgement so far). */
  marks?: Record<number, NoteMark>;
  /** Onset index under the cursor (highlighted), or null. */
  cursor?: number | null;
  /** Bars per system: 2 on phones, 4 on wide screens. */
  barsPerRow: number;
  /** Accessible description, e.g. "quarter, quarter, half". */
  label: string;
}

/** VexFlow staff (one-line percussion staff), coloured from the theme tokens (§3.1, §9 notation colour rule). */
export function Staff(props: StaffProps): JSX.Element {
  throw new Error('not implemented: Staff ' + props.bars.length);
}
