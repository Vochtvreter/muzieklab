/**
 * Calibration maths (§6.1): the player taps along with a click track; the median signed
 * offset (tap − click) is this device's delay. Times are seconds on one clock; offsets are ms,
 * positive = the tap arrived late.
 */

/** Signed offset (ms) of each tap from its nearest click, in tap order (for the dot plot). */
export function tapOffsetsMs(tapTimes: number[], clickTimes: number[]): number[] {
  if (clickTimes.length === 0) return [];
  return tapTimes.map((tap) => {
    let best = clickTimes[0];
    for (const c of clickTimes) if (Math.abs(tap - c) < Math.abs(tap - best)) best = c;
    return (tap - best) * 1000;
  });
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median signed offset in whole ms; 0 when there are no taps or clicks. */
export function medianOffsetMs(tapTimes: number[], clickTimes: number[]): number {
  const m = Math.round(median(tapOffsetsMs(tapTimes, clickTimes)));
  return m === 0 ? 0 : m; // no -0
}
