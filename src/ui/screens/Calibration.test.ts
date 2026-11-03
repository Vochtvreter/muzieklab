import { describe, expect, it } from 'vitest';
import { plotDots } from './Calibration';

describe('plotDots', () => {
  it('stacks taps past ±100 ms at the ends of the axis, five high at most, under the early and late labels', () => {
    // A steady late tapper with Bluetooth headphones, +143 to +198 ms: all at the axis' end, in one stack.
    const late = plotDots([143, 150, 160, 171, 180, 186, 190, 198, 166, 155]);
    expect(new Set(late.map((d) => d.left))).toEqual(new Set(['100.00%']));
    expect(late.map((d) => d.top)).toEqual([56, 46, 36, 26, 16, 16, 16, 16, 16, 16]);
    // The other end the same way. The labels' box is 14 px tall at the top: the stack reached 6 px, over them.
    const early = plotDots(Array.from({ length: 16 }, () => -244));
    expect(early.every((d) => d.left === '0.00%' && d.top >= 16)).toBe(true);
  });

  it('stacks the dots within 5 ms of each other where they are drawn, and spreads the others along the axis', () => {
    expect(plotDots([-20, -18, 30, -23, 0])).toEqual([
      { left: '40.00%', top: 56 },
      { left: '41.00%', top: 46 },
      { left: '65.00%', top: 56 },
      { left: '38.50%', top: 46 },
      { left: '50.00%', top: 56 },
    ]);
  });
});
