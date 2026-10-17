import fc from 'fast-check';
import { median, medianOffsetMs, tapOffsetsMs } from './calibration';
import { clickTimes } from './schedule';

describe('calibration', () => {
  const clicks = clickTimes(16, 100, 1); // every 0.6 s from 1 s

  it('measures signed offsets against the nearest click', () => {
    const taps = [1.04, 1.6 - 0.02, 2.2 + 0.1];
    const off = tapOffsetsMs(taps, clicks);
    expect(off[0]).toBeCloseTo(40);
    expect(off[1]).toBeCloseTo(-20);
    expect(off[2]).toBeCloseTo(100);
  });

  it('takes the median and is robust to an outlier', () => {
    const offsMs = [42, 31, 55, 36, 40, 29, 47, 38, 22, 61, 35, 44, 38, 27, 50, 33]; // the design's example, median 38
    const taps = clicks.map((c, i) => c + offsMs[i] / 1000);
    expect(medianOffsetMs(taps, clicks)).toBe(38);
    taps[3] = clicks[3] + 0.29; // a stray late tap
    expect(medianOffsetMs(taps, clicks)).toBe(39);
  });

  it('handles empty input and taps outside the click range', () => {
    expect(medianOffsetMs([], clicks)).toBe(0);
    expect(medianOffsetMs([1, 2], [])).toBe(0);
    expect(tapOffsetsMs([0.5], clicks)[0]).toBeCloseTo(-500);
  });

  it('median of even and odd lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('a constant delay is recovered exactly (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -200, max: 200 }), fc.integer({ min: 60, max: 140 }), (delay, bpm) => {
        const cs = clickTimes(16, bpm, 0.5);
        const taps = cs.map((c) => c + delay / 1000);
        expect(medianOffsetMs(taps, cs)).toBe(delay);
      }),
    );
  });
});
