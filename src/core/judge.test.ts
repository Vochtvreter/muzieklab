import fc from 'fast-check';
import type { JudgeOptions, Tap, Timeline } from './types';
import { createLiveJudge, judge, judgeRelease, noteWindows } from './judge';
import { buildTimeline } from './timeline';
import { generateExercise } from './generator';
import { makeExercise, perfectTaps, seedArb, settingsArb } from './test-helpers';

const NORMAL: JudgeOptions = { hold: true, leniency: 'normal' };
/** Four quarters at 60 BPM (one per second), then a quarter rest: no window shrink. */
const quarters = (): Timeline => buildTimeline(makeExercise('4/4', [[[48, 'n'], [48, 'n'], [48, 'n'], [48, 'r']]], {}, 60));

describe('judge', () => {
  it('gives perfect synthetic taps 100% and the diamond (property over random exercises)', () => {
    fc.assert(
      fc.property(settingsArb, seedArb, fc.boolean(), (s, seed, hold) => {
        const tl = buildTimeline(generateExercise(s, seed));
        const r = judge(tl, perfectTaps(tl), { hold, leniency: 'normal' });
        expect(r.accuracy).toBe(100);
        expect(r.stars).toBe(5);
        expect(r.counts.perfect).toBe(tl.notes.length);
        expect(r.extraTaps).toBe(0);
        expect(r.combo).toBe(tl.notes.length);
        expect(r.maxCombo).toBe(tl.notes.length);
        if (hold) expect(r.holds.right).toBe(tl.notes.length);
        expect(r.tendency).toBe('steady');
      }),
      { numRuns: 300, seed: 5 },
    );
  });

  it('judges taps shifted by x ms as expected (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -300, max: 300 }), fc.constantFrom('strict' as const, 'normal' as const, 'relaxed' as const), (x, leniency) => {
        const tl = quarters();
        const taps = tl.notes.map((n) => ({ down: n.onset + x / 1000, up: n.end - 0.15 + x / 1000 }));
        const r = judge(tl, taps, { hold: false, leniency });
        const f = { strict: 0.75, normal: 1, relaxed: 1.5 }[leniency];
        const a = Math.abs(x);
        const expected = a <= 35 * f ? 'perfect' : a <= 70 * f ? 'great' : a <= 120 * f ? 'good' : 'miss';
        for (const n of r.notes) expect(n.judgement).toBe(expected);
        expect(r.extraTaps).toBe(expected === 'miss' ? 3 : 0);
        if (expected !== 'miss') for (const n of r.notes) expect(n.offsetMs).toBeCloseTo(x, 6);
      }),
      { numRuns: 400, seed: 9 },
    );
  });

  it('shrinks windows for fast passages: min(base, 0.4 × gap)', () => {
    // Sixteenths at 120 BPM are 125 ms apart: every window is capped at 50 ms.
    const tl = buildTimeline(makeExercise('2/4', [[[12, 'n'], [12, 'n'], [12, 'n'], [12, 'n'], [48, 'n']]], {}, 120));
    const w = noteWindows(tl, 'normal');
    expect(w[1].good).toBeCloseTo(0.05);
    expect(w[1].perfect).toBeCloseTo(0.035);
    const r = judge(tl, [{ down: tl.notes[1].onset + 0.06, up: null }], { hold: false, leniency: 'normal' });
    expect(r.notes[1].judgement).toBe('miss');
    expect(r.extraTaps).toBe(1);
  });

  it('matches a tap to the nearest unmatched onset; mashing costs points', () => {
    const tl = quarters();
    const taps: Tap[] = [
      { down: 0, up: 0.5 },
      { down: 0.05, up: 0.6 }, // second tap near note 0: extra
      { down: 1.0, up: 1.9 },
      { down: 2.0, up: 2.9 },
    ];
    const r = judge(tl, taps, { hold: false, leniency: 'normal' });
    expect(r.extraTaps).toBe(1);
    expect(r.points).toBe(300 - 25);
    expect(r.accuracy).toBeCloseTo(275 / 3);
    expect(r.stars).toBe(3); // 91.7%
  });

  it('judges releases (§6.2)', () => {
    const tl = quarters();
    const [n0, , n2] = tl.notes; // n0 is followed by a note, n2 by a rest
    expect(n0.next).toBe('note');
    expect(judgeRelease(n0, n0.end - 0.3, 'normal')).toBe('short'); // earlier than end − max(25%, 120 ms)
    expect(judgeRelease(n0, n0.end - 0.2, 'normal')).toBe('right');
    expect(judgeRelease(n0, n0.end + 0.5, 'normal')).toBe('right'); // a note follows: never "too long"
    expect(judgeRelease(n2, n2.end + 0.1, 'normal')).toBe('right');
    expect(judgeRelease(n2, n2.end + 0.15, 'normal')).toBe('long');
    expect(judgeRelease(n2, n2.end + 0.15, 'relaxed')).toBe('right');
    expect(judgeRelease(n2, null, 'normal')).toBe('long');
  });

  it('scores hold problems and breaks the combo on them', () => {
    const tl = quarters();
    const taps = perfectTaps(tl);
    taps[1] = { down: 1, up: 1.3 }; // cut short
    const r = judge(tl, taps, NORMAL);
    expect(r.notes[1].hold).toBe('short');
    expect(r.notes[1].releaseOffsetMs).toBeCloseTo(-700);
    expect(r.points).toBe(300 - 20);
    expect(r.holds).toEqual({ right: 2, short: 1, long: 0 });
    expect(r.maxCombo).toBe(1);
    expect(r.combo).toBe(1);
  });

  it('reports misses, stars and tendency', () => {
    const tl = quarters();
    const late = judge(tl, tl.notes.map((n) => ({ down: n.onset + 0.05, up: n.end })), { hold: false, leniency: 'normal' });
    expect(late.tendency).toBe('dragging');
    expect(late.meanOffsetMs).toBeCloseTo(50);
    expect(late.sdOffsetMs).toBeCloseTo(0);
    const early = judge(tl, tl.notes.map((n) => ({ down: n.onset - 0.045, up: n.end })), { hold: false, leniency: 'normal' });
    expect(early.tendency).toBe('rushing');
    const slightlyEarly = judge(tl, tl.notes.map((n) => ({ down: n.onset - 0.03, up: n.end })), { hold: false, leniency: 'normal' });
    expect(slightlyEarly.tendency).toBe('steady');
    const missed = judge(tl, perfectTaps(tl).slice(0, 2), NORMAL);
    expect(missed.counts.miss).toBe(1);
    expect(missed.stars).toBe(1); // 66.7%
    const nearlyAll = judge(tl, [], NORMAL);
    expect(nearlyAll.accuracy).toBe(0);
    expect(nearlyAll.stars).toBe(0);
  });

  it('gives stars at 50 / 75 / 90 / 95%, the 4th only without Good or Miss, the diamond for a flawless run (§6.3)', () => {
    const tl = quarters();
    const at = (offsetsMs: number[], hold = false) =>
      judge(tl, tl.notes.map((n, i) => ({ down: n.onset + offsetsMs[i] / 1000, up: n.end - 0.05 })), { hold, leniency: 'normal' });
    expect(at([0, 0, 0]).stars).toBe(5);
    expect(at([0, 0, 0], true).stars).toBe(5);
    // One Great: 290 / 300 = 96.7%. All Great: 90%.
    expect(at([0, 50, 0]).stars).toBe(4);
    expect(at([50, -50, 50]).stars).toBe(3);
    // Perfect + Great + Good: 260 / 300 = 86.7%, the rhythm right but loose.
    expect(at([0, 50, 100]).stars).toBe(2);
    // Two Good: 240 / 300 = 80%.
    expect(at([0, 100, 100]).stars).toBe(2);
    // A wrong hold or an extra tap takes the diamond.
    const taps = perfectTaps(tl);
    taps[2] = { down: 2, up: 2.4 }; // cut short: 280 / 300 = 93.3%
    expect(judge(tl, taps, NORMAL).stars).toBe(3);
    const long = buildTimeline(makeExercise('4/4', Array.from({ length: 4 }, () => [[48, 'n'], [48, 'n'], [48, 'n'], [48, 'n']] as [number, 'n'][]), {}, 60));
    const extra = judge(long, [...perfectTaps(long), { down: 3.5, up: 3.6 }], NORMAL);
    expect(extra.extraTaps).toBe(1);
    expect(extra.stars).toBe(4);
    // One Good or one Miss takes the 4th star, even at 95% or more.
    const goodOne = perfectTaps(long);
    goodOne[5] = { down: goodOne[5].down + 0.1, up: goodOne[5].up };
    const good = judge(long, goodOne, { hold: false, leniency: 'normal' });
    expect(good.counts.good).toBe(1);
    expect(good.accuracy).toBeGreaterThanOrEqual(95);
    expect(good.stars).toBe(3);
    const missOne = judge(long, perfectTaps(long).filter((_, i) => i !== 5), { hold: false, leniency: 'normal' });
    expect(missOne.accuracy).toBeGreaterThanOrEqual(90);
    expect(missOne.stars).toBe(3);
  });
});

describe('createLiveJudge', () => {
  /** Random, sometimes sloppy playing: offsets, drops, extra taps, early or late releases. */
  const playArb = (tl: Timeline): fc.Arbitrary<Tap[]> =>
    fc
      .tuple(
        fc.array(fc.record({ off: fc.integer({ min: -160, max: 160 }), drop: fc.boolean(), rel: fc.double({ min: 0.05, max: 1.3, noNaN: true }) }), {
          minLength: tl.notes.length,
          maxLength: tl.notes.length,
        }),
        fc.array(fc.double({ min: 0, max: tl.totalSeconds, noNaN: true }), { maxLength: 4 }),
      )
      .map(([per, extras]) => {
        const downs = [
          ...tl.notes.flatMap((n, i) => (per[i].drop && i % 3 === 0 ? [] : [{ down: n.onset + per[i].off / 1000, rel: per[i].rel }])),
          ...extras.map((d) => ({ down: d, rel: 0.5 })),
        ].sort((a, b) => a.down - b.down);
        return downs.map((d, i) => {
          const next = downs[i + 1]?.down ?? Infinity;
          const len = (tl.notes.find((n) => Math.abs(n.onset - d.down) < 0.2)?.end ?? d.down + 0.2) - d.down;
          const up = Math.min(d.down + Math.max(0.001, len * d.rel), next - 0.0005);
          return { down: d.down, up: up > d.down ? up : null };
        });
      });

  it('gives exactly the batch result for the same taps (property)', () => {
    fc.assert(
      fc.property(
        settingsArb,
        seedArb,
        fc.boolean(),
        fc.constantFrom('strict' as const, 'normal' as const, 'relaxed' as const),
        (s, seed, hold, leniency) => {
          const tl = buildTimeline(generateExercise({ ...s, bars: Math.min(s.bars, 4) }, seed));
          const taps = fc.sample(playArb(tl), { numRuns: 1, seed })[0];
          const opts = { hold, leniency };
          const live = createLiveJudge(tl, opts);
          const presses = [];
          // Interleave presses, releases and miss polling in time order, as the play screen would.
          const events = taps.flatMap((t) => [{ t: t.down, kind: 'down' as const }, ...(t.up === null ? [] : [{ t: t.up, kind: 'up' as const }])]);
          events.sort((a, b) => a.t - b.t || (a.kind === 'up' ? -1 : 1));
          for (const e of events) {
            live.missedUntil(e.t);
            if (e.kind === 'down') presses.push(live.press(e.t));
            else live.release(e.t);
            live.combo();
          }
          const fromLive = live.finish();
          const batch = judge(tl, taps, opts);
          expect(fromLive).toEqual(batch);
          // Live press judgements agree with the final per-note judgements.
          for (const p of presses) {
            if (p.index === null) continue;
            expect(batch.notes[p.index].judgement).toBe(p.judgement);
          }
          expect(presses.filter((p) => p.index === null).length).toBe(batch.extraTaps);
          // After the end, the live combo equals the final combo, and live misses equal final misses.
          live.missedUntil(tl.totalSeconds + 10);
          if (taps.every((t) => t.up !== null) || !hold) expect(live.combo()).toBe(batch.combo);
          expect(live.missedUntil(tl.totalSeconds + 10)).toEqual(batch.notes.filter((n) => n.judgement === 'miss').map((n) => n.index));
        },
      ),
      { numRuns: 300, seed: 21 },
    );
  });

  it('reports presses, extra taps and live misses', () => {
    const tl = quarters();
    const live = createLiveJudge(tl, NORMAL);
    expect(live.press(0.02)).toEqual({ index: 0, judgement: 'perfect', offsetMs: expect.closeTo(20, 6) });
    live.release(0.9);
    expect(live.combo()).toBe(1);
    expect(live.press(0.5)).toEqual({ index: null, judgement: 'extra', offsetMs: null });
    live.release(0.6);
    expect(live.missedUntil(1.1)).toEqual([]);
    expect(live.missedUntil(1.2)).toEqual([1]);
    expect(live.combo()).toBe(0);
    expect(live.press(2.1).judgement).toBe('good');
    live.release(2.9);
    const r = live.finish();
    expect(r.counts).toEqual({ perfect: 1, great: 0, good: 1, miss: 1 });
    expect(r.extraTaps).toBe(1);
  });
});
