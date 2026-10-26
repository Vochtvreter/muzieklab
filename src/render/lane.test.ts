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
    expect(of(l.shapes, 'note').every((n) => r1(n.y) === 5 && r1(n.h) === 12)).toBe(true);
  });

  it('without a result, draws taps where they happened in the live colour', () => {
    const taps = [{ down: 0, up: 0.5 }, { down: 1.0, up: null }];
    const l = layoutLane({ ...base, barsPerRow: 4, taps, now: 1.2, rowHeight: 26 });
    const holds = of(l.shapes, 'hold');
    expect(holds.map((h) => h.tone)).toEqual(['live', 'live']);
  });

  it('on results, a press that matched no note is an extra (outlined), never a hit-coloured hold', () => {
    const { taps, result } = demoPlay(timeline, null);
    const stray = { down: timeline.notes[0].onset + 0.3, up: timeline.notes[0].onset + 0.4 };
    const l = layoutLane({ ...base, barsPerRow: 2, taps: [...taps, stray], result, rowHeight: 30 });
    const tones = of(l.shapes, 'hold').map((h) => h.tone);
    expect(tones).toContain('extra');
    expect(tones).not.toContain('live');
  });

  it('tap only: presses are short marks where they landed, not holds', () => {
    const taps = [{ down: 0, up: 1.5 }];
    const l = layoutLane({ ...base, barsPerRow: 4, taps, now: 2, rowHeight: 26, hold: false });
    const [mark] = of(l.shapes, 'hold');
    expect(mark.w).toBeLessThanOrEqual(4);
  });

  it('splits notes and holds across rows', () => {
    const tl = { notes: [{ index: 0, bar: 0, tick: 144, onset: 0, end: 0, durationTicks: 96, next: 'end' as const }], totalSeconds: 4 * 0.75 * 2, beatSeconds: 0.75 };
    const taps = [{ down: 3 * 0.75, up: 5 * 0.75 }];
    const l = layoutLane({ timeline: tl, barTicks: 192, barsPerRow: 1, taps, width: 200, rowHeight: 30 });
    expect(of(l.shapes, 'note').map((n) => Math.floor(n.y / 30))).toEqual([0, 1]);
    expect(of(l.shapes, 'hold').map((n) => Math.floor(n.y / 30))).toEqual([0, 1]);
  });

  it('draws only the rows of its window, the first at the top (live Play on a phone)', () => {
    // Sixteen bars of 4/4 half notes at a beat of 0.5 s; the note on beat 3 of bar 4 is tied over into bar 5.
    let tick = 0;
    const notes = Array.from({ length: 31 }, (_, index) => {
      const durationTicks = index === 7 ? 192 : 96;
      const note = { index, bar: Math.floor(tick / 192), tick, onset: tick / 96, end: (tick + durationTicks) / 96, durationTicks, next: 'note' as const };
      tick += durationTicks;
      return note;
    });
    const tl = { notes, totalSeconds: 32, beatSeconds: 0.5 };
    const missed = (index: number) => ({ index, judgement: 'miss' as const, offsetMs: null, hold: null, releaseOffsetMs: null, tap: null });
    // The note on beat 3 of bar 5 (9 to 10 s) is let go after 0.2 s.
    const letGo = { down: 9, up: 9.2 };
    const short = { index: 8, judgement: 'great' as const, offsetMs: 0, hold: 'short' as const, releaseOffsetMs: -800, tap: letGo };
    const result = { ...demoPlay(timeline, null).result, notes: [missed(7), short, missed(20)] };
    // Bars 5–12 (rows 2 and 3) while bar 6 is played; a tap in bar 1 is above the window.
    const win = { timeline: tl, barTicks: 192, barsPerRow: 4, width: 342, rowHeight: 26, fromBar: 4, rowsShown: 2 };
    const l = layoutLane({ ...win, taps: [{ down: 1, up: 1.5 }, letGo, { down: 10, up: 10.5 }], result, now: 10.5 });
    expect(l.height).toBe(52);
    const grid = of(l.shapes, 'grid');
    expect(grid).toHaveLength(2 * 17);
    expect([...new Set(grid.map((g) => g.y1))]).toEqual([2, 28]);
    // The tied note's second half and the 15 notes of bars 5–12, none above or below the window.
    expect(of(l.shapes, 'note')).toHaveLength(16);
    expect(of(l.shapes, 'note').every((n) => n.y > 0 && n.y < 52)).toBe(true);
    expect(of(l.shapes, 'hold')).toHaveLength(2);
    // The note let go early gets its dashed outline in the first row of the window.
    const cut = of(l.shapes, 'short');
    expect(cut).toHaveLength(1);
    expect(cut[0].y).toBeGreaterThan(0);
    expect(cut[0].y + cut[0].h).toBeLessThan(26);
    // The tied note keeps its × in bar 4, above the window; the miss in bar 11 is in the second row.
    const miss = of(l.shapes, 'miss');
    expect(miss).toHaveLength(1);
    expect(miss[0].cy).toBeGreaterThan(26);
    expect(of(l.shapes, 'playhead')).toMatchObject([{ y1: 0, y2: 24 }]);
    // At the end, bars 9–16: the playhead in bar 16 is in the second row.
    const end = layoutLane({ ...win, fromBar: 8, taps: [], now: 31 });
    expect(end.height).toBe(52);
    expect(of(end.shapes, 'playhead')).toMatchObject([{ y1: 26 }]);
    // The playhead above the window is not drawn; without a window every row is.
    expect(of(layoutLane({ ...win, taps: [], now: 1 }).shapes, 'playhead')).toHaveLength(0);
    expect(layoutLane({ ...win, fromBar: undefined, rowsShown: undefined, taps: [] }).height).toBe(104);
  });

  it('picks the board row heights', () => {
    expect(laneRowHeight(344, true)).toBe(30);
    expect(laneRowHeight(342, false)).toBe(26);
    expect(laneRowHeight(1040, false)).toBe(34);
  });
});
