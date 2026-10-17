import fc from 'fast-check';
import type { NotatedBar } from './types';
import { spellExercise } from './speller';
import { buildTimeline } from './timeline';
import { generateExercise } from './generator';
import { makeExercise, seedArb, settingsArb } from './test-helpers';

const brief = (bars: NotatedBar[]): string =>
  bars
    .map((b) =>
      b.symbols
        .map((s) => (s.kind === 'rest' ? 'r' : '') + s.value[0] + (s.dots ? '.' : '') + (s.tuplet ? '3' : '') + (s.tieToNext ? '~' : ''))
        .join(' '),
    )
    .join(' | ');

describe('spellExercise (strict style, §5.7)', () => {
  it('ties a note across the middle of 4/4: quarter–half–quarter', () => {
    const bars = spellExercise(makeExercise('4/4', [[[48, 'n'], [96, 'n'], [48, 'n']]]));
    expect(brief(bars)).toBe('q q~ q q');
    expect(bars[0].symbols.map((s) => s.onsetIndex)).toEqual([0, 1, -1, 2]);
  });

  it('lets a note starting on beat 1 cover the middle', () => {
    expect(brief(spellExercise(makeExercise('4/4', [[[144, 'n'], [48, 'n']]])))).toBe('h. q');
    expect(brief(spellExercise(makeExercise('4/4', [[[192, 'n']]])))).toBe('w');
  });

  it('splits a dotted quarter on beat 2 of 4/4 at the middle', () => {
    expect(brief(spellExercise(makeExercise('4/4', [[[48, 'n'], [72, 'n'], [24, 'n'], [48, 'n']]])))).toBe('q q~ e e q');
  });

  it('does not tie in 3/4 (no half-bar level)', () => {
    expect(brief(spellExercise(makeExercise('3/4', [[[48, 'n'], [96, 'n']]])))).toBe('q h');
  });

  it('writes a fully empty bar as one centred whole rest, in every meter', () => {
    for (const m of ['2/4', '3/4', '4/4'] as const) {
      const ticks = { '2/4': 96, '3/4': 144, '4/4': 192 }[m];
      const [bar] = spellExercise(makeExercise(m, [[[ticks, 'r']]]));
      expect(bar.symbols).toEqual([
        { value: 'whole', dots: 0, kind: 'rest', tieToNext: false, start: 0, duration: ticks, onsetIndex: -1, wholeBarRest: true },
      ]);
    }
  });

  it('groups rests to show the beat: a half rest only on beat 1 or 3 of 4/4', () => {
    expect(brief(spellExercise(makeExercise('4/4', [[[48, 'r'], [48, 'r'], [96, 'n']]])))).toBe('rh h');
    expect(brief(spellExercise(makeExercise('4/4', [[[48, 'n'], [48, 'r'], [48, 'r'], [48, 'n']]])))).toBe('q rq rq q');
    expect(brief(spellExercise(makeExercise('4/4', [[[48, 'r'], [48, 'r'], [96, 'n']]], { rests: ['quarter'] })))).toBe('rq rq h');
  });

  it('splits a half rest on beat 2 of 3/4 into quarter rests, and never ties rests', () => {
    const bars = spellExercise(makeExercise('3/4', [[[48, 'n'], [96, 'r']]]));
    expect(brief(bars)).toBe('q rq rq');
    expect(bars[0].symbols.every((s) => !s.tieToNext)).toBe(true);
  });

  it('beams per beat, never across beats', () => {
    const [bar] = spellExercise(makeExercise('4/4', [[[24, 'n'], [24, 'n'], [24, 'n'], [12, 'n'], [12, 'n'], [48, 'n'], [24, 'n'], [24, 'r']]]));
    expect(bar.symbols.map((s) => s.beamGroup)).toEqual([0, 0, 1, 1, 1, undefined, undefined, undefined]);
  });

  it('beams dotted eighth + sixteenth, flags a lone eighth', () => {
    const [bar] = spellExercise(makeExercise('3/4', [[[36, 'n'], [12, 'n'], [72, 'n'], [24, 'n']]]));
    expect(brief([bar])).toBe('e. s q. e');
    expect(bar.symbols.map((s) => s.beamGroup)).toEqual([0, 0, undefined, undefined]);
  });

  it('gives each triplet beat a tuplet bracket', () => {
    const [bar] = spellExercise(makeExercise('2/4', [[[16, 'n', '3'], [16, 'r', '3'], [16, 'n', '3'], [16, 'n', '3'], [16, 'n', '3'], [16, 'n', '3']]]));
    expect(bar.symbols.map((s) => s.tuplet?.id)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(bar.symbols.every((s) => s.value === 'eighth' && s.tuplet?.num === 3 && s.tuplet.den === 2)).toBe(true);
    expect(bar.symbols.map((s) => s.onsetIndex)).toEqual([0, -1, 1, 2, 3, 4]);
  });

  it('ties across a bar line', () => {
    const bars = spellExercise(makeExercise('2/4', [[[48, 'n'], [48, 'n']], [[48, 'n', 't'], [48, 'n']]]));
    expect(brief(bars)).toBe('q q~ | q q');
    expect(bars.flatMap((b) => b.symbols.map((s) => s.onsetIndex))).toEqual([0, 1, -1, 2]);
  });
});

describe('spellExercise round trip (property)', () => {
  it('re-sums every bar and gives back the same sounding rhythm as the timeline', () => {
    fc.assert(
      fc.property(settingsArb, seedArb, (s, seed) => {
        const ex = generateExercise(s, seed);
        const spelled = spellExercise(ex);
        const sounds: { index: number; tick: number; ticks: number }[] = [];
        let open: { index: number; tick: number; ticks: number } | null = null;
        spelled.forEach((bar, b) => {
          let t = 0;
          for (const sym of bar.symbols) {
            expect(sym.start).toBe(t);
            t += sym.duration;
            if (sym.kind === 'rest') {
              open = null;
              continue;
            }
            if (sym.onsetIndex >= 0) {
              open = { index: sym.onsetIndex, tick: b * ex.meter.barTicks + sym.start, ticks: 0 };
              sounds.push(open);
            }
            expect(open).not.toBeNull();
            open!.ticks += sym.duration;
            if (!sym.tieToNext) open = null;
          }
          expect(t).toBe(ex.meter.barTicks);
        });
        const timeline = buildTimeline(ex);
        expect(sounds).toEqual(timeline.notes.map((n) => ({ index: n.index, tick: n.tick, ticks: n.durationTicks })));
        // Rest time is preserved too.
        ex.bars.forEach((bar, b) => {
          const rest = (xs: { kind: string; duration: number }[]): number => xs.filter((x) => x.kind === 'rest').reduce((a, x) => a + x.duration, 0);
          expect(rest(spelled[b].symbols)).toBe(rest(bar.events));
        });
      }),
      { numRuns: 500, seed: 11 },
    );
  });
});
