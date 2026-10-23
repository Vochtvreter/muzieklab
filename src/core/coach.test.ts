import { coachTip } from './coach';
import { judge } from './judge';
import { buildTimeline } from './timeline';
import { makeExercise, perfectTaps } from './test-helpers';
import type { Tap, Timeline } from './types';

// Bar 1: four quarters. Bar 2: dotted quarter + eighth, half. 60 BPM.
const ex = makeExercise('4/4', [
  [[48, 'n'], [48, 'n'], [48, 'n'], [48, 'n']],
  [[72, 'n'], [24, 'n'], [96, 'n']],
]);
const tl = buildTimeline(ex);
const opts = { hold: true, leniency: 'normal' as const };

describe('coachTip', () => {
  it('names the worst hold problem first: the dotted quarter in bar 2', () => {
    const taps = perfectTaps(tl);
    taps[4] = { down: tl.notes[4].onset, up: tl.notes[4].onset + 0.6 }; // dotted quarter (1.5 s) let go after 0.6 s
    taps[0] = { down: 0, up: 0.45 }; // a smaller cut on a quarter
    taps.forEach((t) => (t.down -= 0.06)); // also rushing, but holds come first
    const tip = coachTip(judge(tl, taps, opts), tl, ex);
    expect(tip).toEqual({
      key: 'tip.cutShort',
      params: { value: 'value.dottedQuarter', bar: 2, beat: 1, liftBeat: 2, liftPart: 'count.and', count: 2 },
    });
  });

  it('reports held too long before a rest', () => {
    const ex2 = makeExercise('4/4', [[[96, 'n'], [48, 'r'], [48, 'n']]]);
    const tl2 = buildTimeline(ex2);
    const taps = perfectTaps(tl2);
    taps[0] = { down: 0, up: tl2.notes[0].end + 0.7 }; // half a beat (500 ms) late is still right
    expect(coachTip(judge(tl2, taps, opts), tl2, ex2)).toMatchObject({ key: 'tip.heldLong', params: { value: 'value.half', bar: 1, liftBeat: 3, liftPart: 'count.beat' } });
  });

  it('then the tendency', () => {
    const taps = perfectTaps(tl).map((t) => ({ down: t.down - 0.06, up: (t.up as number) - 0.06 }));
    expect(coachTip(judge(tl, taps, opts), tl, ex)).toEqual({ key: 'tip.rushing', params: { ms: 60 } });
    const late = perfectTaps(tl).map((t) => ({ down: t.down + 0.05, up: (t.up as number) + 0.05 }));
    expect(coachTip(judge(tl, late, { hold: false, leniency: 'normal' }), tl, ex)).toEqual({ key: 'tip.dragging', params: { ms: 50 } });
  });

  it('then misses, with the bar that had most', () => {
    const taps = perfectTaps(tl).filter((_, i) => i !== 5 && i !== 6);
    expect(coachTip(judge(tl, taps, opts), tl, ex)).toEqual({ key: 'tip.missed', params: { count: 2, bar: 2 } });
  });

  it('an off-track run names the misses, not the timing of the few notes that were hit', () => {
    // The QA case: most notes missed, the hits late. "You were dragging" was the tip.
    const taps = perfectTaps(tl)
      .slice(0, 2)
      .map((t) => ({ down: t.down + 0.06, up: (t.up as number) + 0.06 }));
    expect(coachTip(judge(tl, taps, opts), tl, ex)).toMatchObject({ key: 'tip.missed', params: { count: 5 } });
  });

  it('an off-track run with more extra taps than misses names the extra taps', () => {
    const taps = [...perfectTaps(tl), ...[0.5, 1.5, 2.5].map((d) => ({ down: d, up: d + 0.1 }))];
    expect(coachTip(judge(tl, taps, { hold: false, leniency: 'normal' }), tl, ex)).toEqual({ key: 'tip.extraTaps', params: { count: 3 } });
  });

  it('a low score from cut-short holds is still a hold tip, even with one miss', () => {
    const ex5 = makeExercise('4/4', [[[48, 'n'], [48, 'n'], [48, 'n'], [48, 'n']], [[48, 'n'], [48, 'n'], [48, 'n'], [48, 'n']]]);
    const tl5 = buildTimeline(ex5);
    const taps = perfectTaps(tl5)
      .slice(0, 7)
      .map((t) => ({ down: t.down, up: t.down + 0.2 }));
    const r = judge(tl5, taps, opts);
    expect(r.counts.miss).toBe(1);
    expect(coachTip(r, tl5, ex5).key).toBe('tip.cutShort');
  });

  it('no tendency tip from too few hits', () => {
    const ex4 = makeExercise('4/4', [[[96, 'n'], [96, 'n']]]);
    const tl4 = buildTimeline(ex4);
    const late = perfectTaps(tl4).map((t) => ({ down: t.down + 0.06, up: (t.up as number) + 0.06 }));
    expect(coachTip(judge(tl4, late, opts), tl4, ex4).key).not.toBe('tip.dragging');
  });

  it('praises a clean run', () => {
    expect(coachTip(judge(tl, perfectTaps(tl), opts), tl, ex)).toEqual({ key: 'tip.perfect', params: {} });
  });

  it('calls a tied note a tied note', () => {
    const ex3 = makeExercise('2/4', [[[48, 'n'], [48, 'n']], [[48, 'n', 't'], [48, 'r']]]);
    const tl3 = buildTimeline(ex3);
    const taps = perfectTaps(tl3);
    taps[1] = { down: tl3.notes[1].onset, up: tl3.notes[1].onset + 0.5 };
    expect(coachTip(judge(tl3, taps, opts), tl3, ex3)).toMatchObject({ key: 'tip.cutShort', params: { value: 'value.tiedNote', bar: 1, beat: 2, liftBeat: 2 } });
  });

  it('a lesson with a next lesson praises a clean run without tempo or bars advice', () => {
    expect(coachTip(judge(tl, perfectTaps(tl), opts), tl, ex, { nextLesson: true })).toEqual({ key: 'tip.perfectLesson', params: {} });
  });

  it('no taps at all says so, not "read one beat ahead"', () => {
    expect(coachTip(judge(tl, [], opts), tl, ex, { taps: [] })).toEqual({ key: 'tip.noTaps', params: {} });
  });

  it('misses spread evenly over the bars name no bar', () => {
    const taps = perfectTaps(tl).filter((_, i) => i !== 1 && i !== 5);
    expect(coachTip(judge(tl, taps, opts), tl, ex)).toEqual({ key: 'tip.missedSpread', params: { count: 2 } });
  });
});

/** Lesson 1.1: eight quarter notes at 60 BPM, tap only. */
const ex8 = makeExercise('4/4', [[[48, 'n'], [48, 'n'], [48, 'n'], [48, 'n']], [[48, 'n'], [48, 'n'], [48, 'n'], [48, 'n']]], { hold: false });
const tl8 = buildTimeline(ex8);
const tapOnly = { hold: false, leniency: 'normal' as const };

/** Taps at each note's onset plus its offset in ms (null skips the note); held to the end of the note when `hold`. */
function played(timeline: Timeline, offsets: (number | null)[], hold = false): Tap[] {
  return timeline.notes.flatMap((n, i) => {
    const o = offsets[i];
    if (o === null || o === undefined) return [];
    const down = n.onset + o / 1000;
    return [{ down, up: hold ? (n.next === 'note' ? n.end - 0.005 : n.end) + o / 1000 : down + 0.1 }];
  });
}

/** A small seeded random generator (mulberry32), so a sloppy run is the same every time. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const tipFor = (offsets: (number | null)[], context = {}, timeline = tl8, judgeOpts = tapOnly) => {
  const taps = played(timeline, offsets, judgeOpts.hold);
  return coachTip(judge(timeline, taps, judgeOpts), timeline, ex8, { taps, ...context });
};

describe('coachTip: latency', () => {
  const steady = (ms: number): number[] => tl8.notes.map((_, i) => ms + [5, -2, 3, 1, 0, -3, -2, -2][i]);

  it('a steady late tapper (every note about 125 ms late: 0%, all Miss and Extra) hears about latency', () => {
    const taps = played(tl8, steady(125));
    const r = judge(tl8, taps, tapOnly);
    expect(r.counts.miss).toBe(8);
    expect(r.extraTaps).toBe(8);
    expect(coachTip(r, tl8, ex8, { taps })).toEqual({ key: 'tip.latency', params: { ms: 125, dir: 'late' } });
    // Without the taps the extra taps cannot be paired with their notes: the misses are all there is to go on.
    expect(coachTip(r, tl8, ex8).key).toBe('tip.missedSpread');
  });

  it('steady early, hit (−110 ms) or missed (−170 ms), is latency when the run was played calibrated', () => {
    // The calibration no longer fits (made with Bluetooth, now on the speaker): it shifts every tap early.
    expect(tipFor(steady(-110))).toEqual({ key: 'tip.latency', params: { ms: 110, dir: 'early' } });
    expect(tipFor(steady(-170), { uncalibrated: false })).toEqual({ key: 'tip.latency', params: { ms: 170, dir: 'early' } });
  });

  it('steady early before a calibration is the player rushing: a device delay only makes taps late', () => {
    expect(tipFor(steady(-110), { uncalibrated: true })).toEqual({ key: 'tip.rushing', params: { ms: 110 } });
    expect(tipFor(steady(-170), { uncalibrated: true })).toEqual({ key: 'tip.rushing', params: { ms: 170 } });
  });

  it('steady early on evenly spaced notes is early, not the next note late', () => {
    // Every note Miss + Extra; each early tap is also the previous note's tap, late (0.5 s − 0.2 s = 300 ms).
    const run = (meter: '4/4', bar: [number, 'n'][], tempo: number, ms: number) => {
      const ex = makeExercise(meter, [bar, bar], { hold: false }, tempo);
      const timeline = buildTimeline(ex);
      const taps = played(timeline, timeline.notes.map(() => ms));
      return coachTip(judge(timeline, taps, tapOnly), timeline, ex, { taps });
    };
    const eighths = Array.from({ length: 8 }, (): [number, 'n'] => [24, 'n']);
    const quarters = Array.from({ length: 4 }, (): [number, 'n'] => [48, 'n']);
    expect(run('4/4', eighths, 60, -200)).toEqual({ key: 'tip.latency', params: { ms: 200, dir: 'early' } });
    expect(run('4/4', eighths, 60, -160)).toEqual({ key: 'tip.latency', params: { ms: 160, dir: 'early' } });
    expect(run('4/4', quarters, 120, -200)).toEqual({ key: 'tip.latency', params: { ms: 200, dir: 'early' } });
    expect(run('4/4', quarters, 150, -170)).toEqual({ key: 'tip.latency', params: { ms: 170, dir: 'early' } });
    // Late by more than half the gap: the early pairing is the nearer one, but it leaves the first note unpaired.
    expect(run('4/4', quarters, 120, 300)).toEqual({ key: 'tip.latency', params: { ms: 300, dir: 'late' } });
    expect(run('4/4', quarters, 150, 230)).toEqual({ key: 'tip.latency', params: { ms: 230, dir: 'late' } });
  });

  it('hits and misses at one steady offset, with a skipped note; and Bluetooth-sized lag', () => {
    expect(tipFor([110, 130, 115, 135, null, 125, 118, 128])).toEqual({ key: 'tip.latency', params: { ms: 123, dir: 'late' } });
    expect(tipFor(steady(240))).toEqual({ key: 'tip.latency', params: { ms: 240, dir: 'late' } });
  });

  it('in hold mode too, each note held its full length, late', () => {
    const hold = { hold: true, leniency: 'normal' as const };
    expect(tipFor(steady(125), {}, tl8, hold)).toEqual({ key: 'tip.latency', params: { ms: 125, dir: 'late' } });
    expect(tipFor(steady(95), {}, tl8, hold)).toEqual({ key: 'tip.latency', params: { ms: 95, dir: 'late' } });
  });

  it('a steady 60 ms is dragging, not latency; uncalibrated, the tip points to calibration', () => {
    expect(tipFor(steady(60))).toEqual({ key: 'tip.dragging', params: { ms: 60 } });
    expect(tipFor(steady(60), { uncalibrated: true })).toEqual({ key: 'tip.draggingCalibrate', params: { ms: 60 } });
    // Rushing is never the device: "wait for each note", calibrated or not.
    expect(tipFor(steady(-60), { uncalibrated: true })).toEqual({ key: 'tip.rushing', params: { ms: 60 } });
  });

  it('dragging that wanders is the player: no calibration hint', () => {
    expect(tipFor([100, -40, 110, -20, 115, 90, -30, 105], { uncalibrated: true })).toEqual({ key: 'tip.dragging', params: { ms: 54 } });
    // Taps on both sides of the beat (SD 53, then 42): not "about the same on every note".
    expect(tipFor([-30, 100, 30, 110, -20, 90, 20, -10], { uncalibrated: true })).toEqual({ key: 'tip.dragging', params: { ms: 36 } });
    expect(tipFor([-20, 90, 10, 100, 0, 80, 40, 20], { uncalibrated: true })).toEqual({ key: 'tip.dragging', params: { ms: 40 } });
    // Late every time, but spread wider than the coach calls steady (SD 47).
    expect(tipFor([20, 118, 22, 118, 20, 115, 22, 20], { uncalibrated: true })).toEqual({ key: 'tip.dragging', params: { ms: 57 } });
  });

  it('perfect play is not latency', () => {
    expect(tipFor(tl8.notes.map(() => 0))).toEqual({ key: 'tip.perfect', params: {} });
  });

  it('sloppy play (±140 ms both ways, a quarter of the notes skipped) is not latency', () => {
    const ex16 = makeExercise('4/4', [0, 1, 2, 3].map(() => [[48, 'n'], [48, 'n'], [48, 'n'], [48, 'n']] as [number, 'n'][]), { hold: false });
    const tl16 = buildTimeline(ex16);
    for (const timeline of [tl8, tl16]) {
      const n = timeline.notes.length;
      for (let seed = 1; seed <= 200; seed++) {
        const rnd = random(seed);
        // Errors spread over the whole range, early and late, in a random order; a quarter of the notes skipped.
        const spread = Array.from({ length: n }, (_, i) => Math.round(-140 + (280 * i) / (n - 1) + (rnd() - 0.5) * 20)).sort(() => rnd() - 0.5);
        const offsets = spread.map((o) => (rnd() < 0.25 ? null : o));
        expect(tipFor(offsets, { uncalibrated: true }, timeline).key, `seed ${seed}: ${offsets.join(' ')}`).not.toBe('tip.latency');
      }
    }
  });

  it('random timing is only called latency when every tap really was late (or early) by a steady amount', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rnd = random(seed);
      const offsets = tl8.notes.map(() => (rnd() < 0.25 ? null : Math.round((rnd() * 2 - 1) * 140)));
      const tip = tipFor(offsets);
      if (tip.key !== 'tip.latency') continue;
      // Each tap the tip counts is 20 ms or more off the same way; at most a quarter of the notes' taps are left over.
      const kept = offsets.filter((o): o is number => o !== null).map((o) => (tip.params.dir === 'late' ? o : -o));
      expect(kept.filter((o) => o >= 20).length, `seed ${seed}: ${offsets.join(' ')}`).toBeGreaterThanOrEqual(kept.length - 2);
    }
  });

  it('mashing the pad hits at a steady offset too, but the extra taps say what happened', () => {
    const taps = Array.from({ length: 170 }, (_, i) => ({ down: -0.25 + i * 0.05, up: -0.25 + i * 0.05 + 0.02 }));
    const r = judge(tl8, taps, tapOnly);
    expect(coachTip(r, tl8, ex8, { taps }).key).toBe('tip.extraTaps');
  });
});
