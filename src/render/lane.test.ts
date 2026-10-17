import { describe, expect, it } from 'vitest';
import { DEMO_44, DEMO_LESSON, demoPlay, demoTimeline } from './demoFixtures';
import { laneRowHeight, layoutLane, type LaneShape } from './lane';

const timeline = demoTimeline(DEMO_44, DEMO_LESSON, 80); // the design's lesson 7.3 exercise
const base = { timeline, barTicks: DEMO_44.barTicks, taps: [], width: 344 };
const r1 = (n: number) => Math.round(n * 10) / 10;
const of = <K extends LaneShape['kind']>(shapes: LaneShape[], kind: K) =>
  shapes.filter((s): s is Extract<LaneShape, { kind: K }> => s.kind === kind);

describe('layoutLane', () => {
  it('matches the Results board geometry (344 wide, two bars per row)', () => {
    const { taps, result } = demoPlay(timeline, null);
    const l = layoutLane({ ...base, barsPerRow: 2, taps, result, rowHeight: 30 });
    expect(l.height).toBe(60);
    const grid = of(l.shapes, 'grid');
    expect(grid).toHaveLength(18);
    expect(grid.filter((g) => g.strong).map((g) => r1(g.x))).toEqual([2, 172, 342, 2, 172, 342]);
    expect(grid[0]).toMatchObject({ y1: 2, y2: 26 });
    const notes = of(l.shapes, 'note');
    expect(notes).toHaveLength(14);
    // Dotted quarter at the start: x 3.0, width 61.8, y 6.1, height 13.8 on the board.
    expect([r1(notes[0].x), r1(notes[0].w), r1(notes[0].y), r1(notes[0].h)]).toEqual([3, 61.8, 6.1, 13.8]);
    // The cut-short dotted quarter in bar 2 gets a dashed outline up to its end; the missed eighth an ×.
    const short = of(l.shapes, 'short');
    expect(short).toHaveLength(1);
    expect(r1(short[0].x + short[0].w)).toBe(r1(2 + 5.5 * 42.5 - 1.5));
    const miss = of(l.shapes, 'miss');
    expect(miss).toHaveLength(1);
    expect(r1(miss[0].cx)).toBe(r1(2 + 5.75 * 42.5));
    expect(of(l.shapes, 'playhead')).toHaveLength(0);
    // Good (late) presses are gold; the rest green.
    expect(of(l.shapes, 'hold').filter((h) => h.tone === 'early').length).toBe(result.counts.good);
  });

  it('draws a still-held press up to the playhead', () => {
    const now = timeline.notes[9].onset + 0.16;
    const { taps, result } = demoPlay(timeline, now);
    const l = layoutLane({ ...base, width: 342, barsPerRow: 4, taps, result, now, rowHeight: 26 });
    expect(l.height).toBe(26);
    const head = of(l.shapes, 'playhead');
    expect(head).toHaveLength(1);
    expect(head[0]).toMatchObject({ y1: 0, y2: 24 });
    const holds = of(l.shapes, 'hold');
    const last = holds[holds.length - 1];
    expect(r1(last.x + last.w + 1)).toBe(r1(head[0].x));
    expect(of(l.shapes, 'note').every((n) => n.y === 5 && n.h === 12)).toBe(true);
  });

  it('without a result, draws taps where they happened in the live colour', () => {
    const taps = [{ down: 0, up: 0.5 }, { down: 1.0, up: null }];
    const l = layoutLane({ ...base, barsPerRow: 4, taps, now: 1.2, rowHeight: 26 });
    const holds = of(l.shapes, 'hold');
    expect(holds.map((h) => h.tone)).toEqual(['live', 'live']);
  });

  it('splits notes and holds across rows', () => {
    const tl = { notes: [{ index: 0, bar: 0, tick: 144, onset: 0, end: 0, durationTicks: 96, next: 'end' as const }], totalSeconds: 4 * 0.75 * 2, beatSeconds: 0.75 };
    const taps = [{ down: 3 * 0.75, up: 5 * 0.75 }];
    const l = layoutLane({ timeline: tl, barTicks: 192, barsPerRow: 1, taps, width: 200, rowHeight: 30 });
    expect(of(l.shapes, 'note').map((n) => Math.floor(n.y / 30))).toEqual([0, 1]);
    expect(of(l.shapes, 'hold').map((n) => Math.floor(n.y / 30))).toEqual([0, 1]);
  });

  it('picks the board row heights', () => {
    expect(laneRowHeight(344, true)).toBe(30);
    expect(laneRowHeight(342, false)).toBe(26);
    expect(laneRowHeight(1040, false)).toBe(34);
  });
});
