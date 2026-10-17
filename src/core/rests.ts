import type { Meter, RhythmEvent, Settings } from './types';
import { PPQ } from './types';

/**
 * Rest grouping: rests that exactly fill an eighth, a beat, or (4/4) a half bar on beat 1 or 3 become one rest,
 * when that rest value is on.
 */
export function groupRests(meter: Meter, s: Settings, events: RhythmEvent[]): RhythmEvent[] {
  let list = events.slice();
  const levels: [number, 'eighth' | 'quarter' | 'half'][] = [
    [PPQ / 2, 'eighth'],
    [PPQ, 'quarter'],
  ];
  if (meter.id === '4/4') levels.push([2 * PPQ, 'half']);
  for (const [len, value] of levels) {
    if (!s.rests.includes(value)) continue;
    const merged: RhythmEvent[] = [];
    let i = 0;
    while (i < list.length) {
      const e = list[i];
      if (e.kind === 'rest' && !e.triplet && e.start % len === 0 && e.duration < len) {
        let j = i;
        let end = e.start;
        while (j < list.length && list[j].kind === 'rest' && !list[j].triplet && end < e.start + len) {
          end = list[j].start + list[j].duration;
          j++;
        }
        if (end === e.start + len && j - i > 1) {
          merged.push({ start: e.start, duration: len, kind: 'rest' });
          i = j;
          continue;
        }
      }
      merged.push(e);
      i++;
    }
    list = merged;
  }
  return list;
}
