import { PPQ, type JudgeResult, type Tap, type Timeline } from '../core/types';

/**
 * Pure layout of the timing and length lane (§3.1 step 4, §6.4): rows of bars drawn to scale, every note's
 * length in gray, the player's holds on top. Geometry follows the design's lane generator (hold/lane.py).
 */

export interface LaneInput {
  timeline: Timeline;
  barTicks: number;
  barsPerRow: number;
  taps: Tap[];
  result?: JudgeResult;
  now?: number | null;
  width: number;
  rowHeight: number;
}

export type HoldTone = 'hit' | 'early' | 'live';

export type LaneShape =
  | { kind: 'grid'; x: number; y1: number; y2: number; strong: boolean }
  | { kind: 'note'; x: number; y: number; w: number; h: number }
  | { kind: 'hold'; x: number; y: number; w: number; h: number; tone: HoldTone }
  | { kind: 'short'; x: number; y: number; w: number; h: number }
  | { kind: 'miss'; cx: number; cy: number }
  | { kind: 'playhead'; x: number; y1: number; y2: number };

export interface LaneLayout {
  width: number;
  height: number;
  shapes: LaneShape[];
}

const PAD_X = 2;

/** Row height of the boards: Results 30; live Play 26 on narrow lanes, 34 on the wide desktop lane. */
export function laneRowHeight(width: number, hasResult: boolean): number {
  if (hasResult) return 30;
  return width >= 600 ? 34 : 26;
}

interface Segment {
  row: number;
  x0: number;
  x1: number;
  /** The segment begins / ends at the real start / end (not at a row break). */
  head: boolean;
  tail: boolean;
}

export function layoutLane(input: LaneInput): LaneLayout {
  const { timeline, barTicks, width, rowHeight: rowH } = input;
  const beatSec = timeline.beatSeconds;
  const toTick = (sec: number) => (sec / beatSec) * PPQ;

  const lastNoteEnd = timeline.notes.reduce((m, n) => Math.max(m, n.tick + n.durationTicks), 0);
  const totalTicks = Math.max(toTick(timeline.totalSeconds), lastNoteEnd, barTicks);
  const bars = Math.max(1, Math.ceil(totalTicks / barTicks - 1e-6));
  const per = Math.max(1, Math.min(input.barsPerRow, bars));
  const rows = Math.ceil(bars / per);
  const rowTicks = per * barTicks;
  const endTick = bars * barTicks;
  const unit = (width - 2 * PAD_X) / rowTicks;
  const X = (tickInRow: number) => PAD_X + tickInRow * unit;
  const clampTick = (t: number) => Math.min(Math.max(t, 0), endTick);
  const rowOf = (t: number) => Math.min(Math.floor(t / rowTicks), rows - 1);

  // Vertical metrics, relative to the top of a row.
  const eh = rowH * 0.46;
  const ey = (rowH - 6 - eh) / 2 + 1;
  const hh = eh * 0.55;
  const hy = ey + (eh - hh) / 2;

  const segments = (t0: number, t1: number): Segment[] => {
    const a = clampTick(t0);
    const b = clampTick(t1);
    if (b <= a) return [];
    const out: Segment[] = [];
    for (let r = rowOf(a); r < rows && r * rowTicks < b; r++) {
      const s = Math.max(a, r * rowTicks);
      const e = Math.min(b, (r + 1) * rowTicks);
      if (e <= s) continue;
      out.push({ row: r, x0: X(s - r * rowTicks), x1: X(e - r * rowTicks), head: s === a, tail: e === b });
    }
    return out;
  };

  const shapes: LaneShape[] = [];

  // Beat grid, stronger at bar lines.
  const beatsPerBar = Math.round(barTicks / PPQ);
  for (let r = 0; r < rows; r++) {
    const barsInRow = Math.min(per, bars - r * per);
    for (let b = 0; b <= barsInRow * beatsPerBar; b++) {
      shapes.push({ kind: 'grid', x: X(b * PPQ), y1: r * rowH + 2, y2: r * rowH + rowH - 4, strong: b % beatsPerBar === 0 });
    }
  }

  // Every note's length in gray.
  for (const n of timeline.notes) {
    for (const s of segments(n.tick, n.tick + n.durationTicks)) {
      const x = s.x0 + (s.head ? 1 : 0);
      const w = s.x1 - (s.tail ? 1 : 0) - x;
      shapes.push({ kind: 'note', x, y: s.row * rowH + ey, w, h: eh });
    }
  }

  const holdUntil = (tap: Tap): number => {
    if (tap.up !== null) return input.now != null ? Math.min(tap.up, input.now) : tap.up;
    return input.now ?? timeline.totalSeconds; // still held: grows to the playhead
  };

  const pushHold = (t0: number, t1: number, tone: HoldTone) => {
    // A zero-length press still shows as a short mark (min width 2, as in the design).
    for (const s of segments(t0, Math.max(t1, t0 + 1e-6))) {
      const x = s.x0 + (s.head ? 1 : 0);
      let x1 = s.x1 - (s.tail ? 1 : 0);
      if (x1 < x + 2) x1 = x + 2;
      shapes.push({ kind: 'hold', x, y: s.row * rowH + hy, w: x1 - x, h: hh, tone });
    }
  };

  // Holds judged against a note: coloured by judgement, from the press, within the note's row and later rows.
  const judgedDowns = new Set<number>();
  for (const nr of input.result?.notes ?? []) {
    const note = timeline.notes[nr.index];
    if (!note) continue;
    const noteEnd = note.tick + note.durationTicks;
    if (nr.judgement === 'miss' || !nr.tap) {
      const s = segments(note.tick, noteEnd)[0];
      if (s) shapes.push({ kind: 'miss', cx: (s.x0 + s.x1) / 2, cy: s.row * rowH + ey + eh / 2 });
      continue;
    }
    judgedDowns.add(nr.tap.down);
    const rowStart = rowOf(note.tick) * rowTicks;
    const press = Math.max(toTick(nr.tap.down), rowStart);
    const release = toTick(holdUntil(nr.tap));
    pushHold(press, release, nr.judgement === 'good' ? 'early' : 'hit');
    if (nr.hold === 'short' && nr.tap.up !== null && release < noteEnd) {
      for (const s of segments(release, noteEnd)) {
        const x = s.x0 - (s.head ? 1 : 0);
        const w = s.x1 - x - (s.tail ? 1.5 : 0);
        if (w > 0) shapes.push({ kind: 'short', x, y: s.row * rowH + ey + 0.75, w, h: eh - 1.5 });
      }
    }
  }

  // Taps not (yet) judged against a note: drawn where they happened, in the neutral live colour.
  for (const tap of input.taps) {
    if (judgedDowns.has(tap.down)) continue;
    if (input.now != null && tap.down > input.now) continue;
    pushHold(toTick(tap.down), toTick(holdUntil(tap)), 'live');
  }

  if (input.now != null) {
    const t = clampTick(toTick(input.now));
    const r = rowOf(t);
    shapes.push({ kind: 'playhead', x: X(t - r * rowTicks), y1: r * rowH, y2: r * rowH + rowH - 2 });
  }

  return { width, height: rows * rowH, shapes };
}
