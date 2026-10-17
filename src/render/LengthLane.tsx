import type { JudgeResult, Tap, Timeline } from '../core/types';

export interface LengthLaneProps {
  timeline: Timeline;
  barTicks: number;
  barsPerRow: number;
  /** Taps so far (live) or all taps (results). */
  taps: Tap[];
  result?: JudgeResult; // when present: colour by judgement, dashed cut-short parts, × for misses
  /** Current play position in seconds (live), draws the playhead. */
  now?: number | null;
}

/** Timing and length lane (§3.1 live, §6.4 results): every note to scale in gray, holds on top in colour. */
export function LengthLane(props: LengthLaneProps): JSX.Element {
  throw new Error('not implemented: LengthLane ' + props.taps.length);
}
