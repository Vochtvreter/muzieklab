import { PPQ, type JudgeResult, type Meter, type MeterId, type NotatedBar, type NoteResult, type Tap, type TimedNote, type Timeline } from '../core/types';
import { parseBars } from './notationText';

/** Hand-written fixtures for the render demo (dev only), so Staff and LengthLane can be checked before the engine exists. */

export function demoMeter(id: MeterId): Meter {
  const beatsPerBar = Number(id.split('/')[0]);
  return {
    id,
    barTicks: beatsPerBar * PPQ,
    beatTicks: PPQ,
    beatsPerBar,
    beamGroups: Array.from({ length: beatsPerBar }, () => PPQ),
    weightAt: (tick) => (tick === 0 ? 3 : tick % PPQ === 0 ? 2 : tick % (PPQ / 2) === 0 ? 1 : 0),
  };
}

/** Timeline from notated bars (ties merged), as the engine would build it. */
export function demoTimeline(meter: Meter, bars: NotatedBar[], tempo: number): Timeline {
  const beatSeconds = 60 / tempo;
  const sec = (t: number) => (t / PPQ) * beatSeconds;
  const notes: TimedNote[] = [];
  bars.forEach((bar, b) => {
    for (const s of bar.symbols) {
      const tick = b * meter.barTicks + s.start;
      if (s.kind === 'rest') {
        const prev = notes[notes.length - 1];
        if (prev && prev.tick + prev.durationTicks === tick) prev.next = 'rest';
        continue;
      }
      if (s.onsetIndex < 0) {
        const prev = notes[notes.length - 1];
        prev.durationTicks += s.duration;
        prev.end = sec(prev.tick + prev.durationTicks);
        continue;
      }
      notes.push({ index: s.onsetIndex, bar: b, tick, onset: sec(tick), end: sec(tick + s.duration), durationTicks: s.duration, next: 'note' });
    }
  });
  const last = notes[notes.length - 1];
  if (last) last.next = 'end';
  return { notes, totalSeconds: sec(bars.length * meter.barTicks), beatSeconds };
}

/**
 * Deterministic taps and judgements for the demo: mostly on time, a late tap, an early one, one cut-short hold
 * and a miss. With `now`, only what happened before `now` is returned and the last press is still held.
 */
export function demoPlay(timeline: Timeline, now: number | null): { taps: Tap[]; result: JudgeResult } {
  const offsets = [-12, 84, -8, -20, -48, null, -4, -18, -10, -44, 96, -15, -52, -6, 10, -22, 30, -9, 14, -30];
  const notes: NoteResult[] = [];
  const taps: Tap[] = [];
  timeline.notes.forEach((n, i) => {
    const off = offsets[i % offsets.length];
    if (off === null) {
      if (now === null || n.end < now) notes.push({ index: n.index, judgement: 'miss', offsetMs: null, hold: null, releaseOffsetMs: null, tap: null });
      return;
    }
    const down = n.onset + off / 1000;
    if (now !== null && down > now) return;
    const short = i === 4;
    let up: number | null = short ? n.onset + (n.end - n.onset) * 0.6 : n.end - 0.04;
    if (now !== null && up > now) up = null;
    const tap: Tap = { down, up };
    taps.push(tap);
    const a = Math.abs(off);
    const judgement = a <= 35 ? 'perfect' : a <= 70 ? 'great' : 'good';
    const hold = up === null ? null : short ? 'short' : 'right';
    notes.push({ index: n.index, judgement, offsetMs: off, hold, releaseOffsetMs: up === null ? null : (up - n.end) * 1000, tap });
  });
  const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  notes.forEach((n) => counts[n.judgement]++);
  const result: JudgeResult = {
    notes, extraTaps: 0, points: 0, maxPoints: notes.length * 100, accuracy: 80, stars: 2, combo: 0, maxCombo: 4,
    counts, holds: { right: 0, short: 1, long: 0 }, meanOffsetMs: 0, sdOffsetMs: 0, tendency: 'steady',
  };
  return { taps, result };
}

export const DEMO_44 = demoMeter('4/4');
export const DEMO_34 = demoMeter('3/4');

/** 4/4: beams, dotted quarter + eighth, a tie across beat 3, rests, a whole-bar rest, a triplet, a tie across rows. */
export const DEMO_BARS_44 = parseBars(DEMO_44, [
  'q [8 8] q [8 8]',
  'q. 8 h',
  'q q~ q q',
  'q qr 8 8r [16 16 8]',
  'W',
  '[8t 8t 8t] q qr h~',
  'q [8 8] q. 8',
]);

/** 3/4: a whole-bar rest is centred in every time signature. */
export const DEMO_BARS_34 = parseBars(DEMO_34, ['q [8 8] q', 'W', 'hr q', 'h.']);

/** The design's lesson 7.3 exercise (Play and Results boards). */
export const DEMO_LESSON = parseBars(DEMO_44, ['q. 8 q q', 'q. 8 h', 'q q [8 8] qr', 'q. 8 h']);
