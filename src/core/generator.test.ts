import fc from 'fast-check';
import type { Exercise, NoteValue } from './types';
import { PPQ } from './types';
import { generateExercise, cadenceOk } from './generator';
import { spellExercise } from './speller';
import { buildTimeline } from './timeline';
import { DEFAULT_SETTINGS } from './defaults';
import { VALUE_TICKS } from './values';
import { seedArb, settingsArb } from './test-helpers';

// One shared corpus of random settings × random seeds, checked by every property below.
let corpus: Exercise[] | null = null;
const each = (check: (ex: Exercise) => void): void => {
  corpus ??= fc.sample(fc.tuple(settingsArb, seedArb), { numRuns: 1500, seed: 42 }).map(([s, seed]) => generateExercise(s, seed));
  for (const ex of corpus) {
    try {
      check(ex);
    } catch (err) {
      throw new Error(`seed ${ex.seed}, settings ${JSON.stringify(ex.settings)}: ${(err as Error).message}`);
    }
  }
};

describe('generateExercise (property tests, §10.3)', () => {
  it('fills every bar exactly, with contiguous events', () => {
    each((ex) => {
      expect(ex.bars).toHaveLength(ex.settings.bars);
      for (const bar of ex.bars) {
        let t = 0;
        for (const e of bar.events) {
          expect(e.start).toBe(t);
          expect(e.duration).toBeGreaterThan(0);
          t += e.duration;
        }
        expect(t).toBe(ex.meter.barTicks);
      }
    });
  });

  it('only uses enabled values after spelling', () => {
    each((ex) => {
      const s = ex.settings;
      for (const bar of spellExercise(ex)) {
        for (const sym of bar.symbols) {
          const pool: NoteValue[] = sym.kind === 'note' ? s.notes : s.rests;
          expect(pool).toContain(sym.value);
          if (sym.dots) expect(s.dotted).toBe(true);
          if (sym.tuplet) expect(s.triplets && sym.value === 'eighth').toBe(true);
          if (sym.wholeBarRest) expect(s.rests).toContain('whole');
          if (sym.tieToNext) expect(sym.kind).toBe('note');
        }
      }
    });
  });

  it('puts onsets on positions the metric tree allows', () => {
    each((ex) => {
      const s = ex.settings;
      const grid = Math.min(...[...s.notes, ...s.rests].map((v) => VALUE_TICKS[v]), ex.meter.barTicks);
      for (const bar of ex.bars) {
        for (const e of bar.events) {
          if (e.triplet) {
            expect(s.triplets).toBe(true);
            expect(e.duration).toBe(16);
            expect((e.start % PPQ) % 16).toBe(0);
            continue;
          }
          expect(e.start % Math.min(grid, PPQ)).toBe(0);
          // Without syncopation, values of a beat or longer start on a beat, and nothing hides the middle of 4/4.
          if (!s.ties && e.duration >= PPQ) expect(e.start % PPQ).toBe(0);
          if (!s.ties && ex.meter.id === '4/4' && e.start > 0 && e.start < 96) expect(e.start + e.duration).toBeLessThanOrEqual(96);
          if (e.tieFromPrev) expect(s.ties).toBe(true);
        }
      }
    });
  });

  it('starts with a note on beat 1 and never has more than a bar of continuous rest', () => {
    each((ex) => {
      const first = ex.bars[0].events[0];
      expect(first.kind).toBe('note');
      expect(first.start).toBe(0);
      expect(first.tieFromPrev).toBeFalsy();
      let run = 0;
      for (const e of ex.bars.flatMap((b) => b.events)) {
        run = e.kind === 'rest' ? run + e.duration : 0;
        expect(run).toBeLessThanOrEqual(ex.meter.barTicks);
      }
    });
  });

  it('is seeded and deterministic', () => {
    fc.assert(
      fc.property(settingsArb, seedArb, (s, seed) => {
        expect(generateExercise(s, seed)).toEqual(generateExercise(s, seed));
      }),
      { numRuns: 200, seed: 3 },
    );
  });

  it('rates difficulty between 0 and 10', () => {
    each((ex) => {
      expect(ex.difficulty).toBeGreaterThanOrEqual(0);
      expect(ex.difficulty).toBeLessThanOrEqual(10);
    });
  });
});

describe('generateExercise (musical rules)', () => {
  it('gives different exercises for different seeds', () => {
    const codes = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(generateExercise(DEFAULT_SETTINGS, i).bars)));
    expect(codes.size).toBeGreaterThan(30);
  });

  it('follows a form plan of the right length', () => {
    for (const bars of [1, 2, 3, 4, 5, 7, 8, 12, 16]) {
      const ex = generateExercise({ ...DEFAULT_SETTINGS, bars }, bars);
      expect(ex.form.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)).toHaveLength(bars);
    }
    expect(generateExercise({ ...DEFAULT_SETTINGS, bars: 4 }, 1).form).toMatch(/^a( a'?| b| c){3}$|^a .+$/);
  });

  it('almost always ends with a cadence when long notes are available', () => {
    let ok = 0;
    for (let seed = 0; seed < 200; seed++) {
      const ex = generateExercise({ ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'eighth'], ties: true }, seed);
      if (cadenceOk(ex.meter, ex.bars)) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(198);
  });

  it('uses every enabled value somewhere when there are enough bars', () => {
    const s = { ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'eighth', 'sixteenth'] as NoteValue[], rests: ['quarter', 'eighth'] as NoteValue[], dotted: true, triplets: true, bars: 8 };
    for (let seed = 0; seed < 30; seed++) {
      const symbols = spellExercise(generateExercise(s, seed)).flatMap((b) => b.symbols);
      const has = (pred: (x: (typeof symbols)[number]) => boolean): boolean => symbols.some(pred);
      for (const v of s.notes) expect(has((x) => x.kind === 'note' && x.value === v && !x.dots && !x.tuplet)).toBe(true);
      for (const v of s.rests) expect(has((x) => x.kind === 'rest' && x.value === v)).toBe(true);
      expect(has((x) => x.dots === 1)).toBe(true);
      expect(has((x) => !!x.tuplet)).toBe(true);
    }
  });

  it('respects the density setting on average', () => {
    const s = { ...DEFAULT_SETTINGS, notes: ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as NoteValue[], bars: 8 };
    const avg = (density: 'sparse' | 'busy'): number => {
      let n = 0;
      for (let seed = 0; seed < 40; seed++) n += buildTimeline(generateExercise({ ...s, density }, seed)).notes.length;
      return n / 40;
    };
    expect(avg('busy')).toBeGreaterThan(avg('sparse') * 1.5);
  });

  it('falls back instead of throwing on unplayable settings', () => {
    const ex = generateExercise({ ...DEFAULT_SETTINGS, meters: ['3/4'], notes: ['whole'], rests: [] }, 1);
    expect(ex.meter.id).toBe('3/4');
    expect(ex.settings.notes).toContain('quarter');
  });

  it('ties across bar lines when ties are on', () => {
    let tied = 0;
    for (let seed = 0; seed < 50; seed++) {
      const ex = generateExercise({ ...DEFAULT_SETTINGS, ties: true, notes: ['quarter', 'eighth'] }, seed);
      if (ex.bars.some((b) => b.events[0].tieFromPrev)) tied++;
    }
    expect(tied).toBeGreaterThan(10);
  });
});
