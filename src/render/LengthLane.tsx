import { useRef } from 'react';
import { t } from '../i18n';
import type { JudgeResult, Tap, Timeline } from '../core/types';
import { layoutLane, laneRowHeight, type LaneShape } from './lane';
import { cssVar, useElementWidth } from './theme';

export interface LengthLaneProps {
  timeline: Timeline;
  barTicks: number;
  barsPerRow: number;
  /** Taps so far (live) or all taps (results). */
  taps: Tap[];
  result?: JudgeResult; // when present: colour by judgement, dashed cut-short parts, × for misses
  /** Current play position in seconds (live), draws the playhead. */
  now?: number | null;
  /** false for tap-only exercises: presses show as marks, not holds, and the lane's name says it compares taps. */
  hold?: boolean;
  /**
   * On Play: keep the playing row height all the time. The playhead is gone during the count-in and while paused,
   * and without this the lane took the results height then, so it jumped when the first beat came. A press that
   * matched no note is neutral then too: it may still match one (layoutLane).
   */
  live?: boolean;
  /** Live on a phone: only `rowsShown` rows, from the row of bar `fromBar` (layoutLane). */
  fromBar?: number;
  rowsShown?: number;
}

const DEFAULT_WIDTH = 342;

const HOLD_FILL = { hit: cssVar('hit'), early: cssVar('early'), live: cssVar('slate') } as const;

function renderShape(s: LaneShape, key: number): JSX.Element {
  const r = (n: number) => Math.round(n * 10) / 10;
  switch (s.kind) {
    case 'grid':
      return (
        <line key={key} x1={r(s.x)} x2={r(s.x)} y1={s.y1} y2={s.y2} strokeWidth={s.strong ? 1.5 : 1}
          style={{ stroke: cssVar(s.strong ? 'laneBar' : 'laneGrid') }} />
      );
    case 'note':
      return <rect key={key} x={r(s.x)} y={r(s.y)} width={r(s.w)} height={r(s.h)} rx={3} style={{ fill: cssVar('laneNote') }} />;
    case 'hold':
      if (s.tone === 'extra') {
        return (
          <rect key={key} x={r(s.x)} y={r(s.y)} width={r(s.w)} height={r(s.h)} rx={2} fill="none" strokeWidth={1.5}
            style={{ stroke: cssVar('miss') }} />
        );
      }
      return <rect key={key} x={r(s.x)} y={r(s.y)} width={r(s.w)} height={r(s.h)} rx={2} style={{ fill: HOLD_FILL[s.tone] }} />;
    case 'short':
      return (
        <rect key={key} x={r(s.x)} y={r(s.y)} width={r(s.w)} height={r(s.h)} rx={3} fill="none" strokeWidth={1.5}
          strokeDasharray="3 2" style={{ stroke: cssVar('early') }} />
      );
    case 'miss':
      return (
        <path key={key} d={`M${r(s.cx - 4)} ${r(s.cy - 4)}l8 8M${r(s.cx + 4)} ${r(s.cy - 4)}l-8 8`} fill="none" strokeWidth={2}
          strokeLinecap="round" style={{ stroke: cssVar('miss') }} />
      );
    case 'playhead':
      return (
        <line key={key} x1={r(s.x)} x2={r(s.x)} y1={s.y1} y2={s.y2} strokeWidth={2.5} strokeLinecap="round"
          style={{ stroke: cssVar('slate') }} />
      );
  }
}

/** Timing and length lane (§3.1 live, §6.4 results): every note to scale in gray, holds on top in colour. */
export function LengthLane(props: LengthLaneProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(hostRef);
  const width = measured > 0 ? measured : DEFAULT_WIDTH;
  const layout = layoutLane({
    timeline: props.timeline,
    barTicks: props.barTicks,
    barsPerRow: props.barsPerRow,
    taps: props.taps,
    result: props.result,
    now: props.now,
    hold: props.hold,
    fromBar: props.fromBar,
    rowsShown: props.rowsShown,
    live: props.live,
    width,
    rowHeight: laneRowHeight(width, !props.live && props.result !== undefined && props.now == null),
  });
  return (
    <div ref={hostRef} style={{ width: '100%', minWidth: 0 }}>
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img"
        aria-label={t(props.hold === false ? 'results.laneLabelTap' : 'results.laneLabel')} style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
        {layout.shapes.map(renderShape)}
      </svg>
    </div>
  );
}
