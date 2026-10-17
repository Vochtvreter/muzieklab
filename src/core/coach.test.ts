import { coachTip } from './coach';
import { judge } from './judge';
import { buildTimeline } from './timeline';
import { makeExercise, perfectTaps } from './test-helpers';

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
    taps[0] = { down: 0, up: 0.7 }; // a smaller cut on a quarter
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
    taps[0] = { down: 0, up: tl2.notes[0].end + 0.5 };
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
});
