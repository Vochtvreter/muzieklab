import fc from 'fast-check';
import { decodeCode, encodeCode } from './code';
import { DEFAULT_SETTINGS } from './defaults';
import {
  addValue,
  answerComplete,
  answerNotation,
  checkAnswer,
  currentBar,
  DEFAULT_MELODY,
  degreeStep,
  emptyAnswer,
  fillable,
  firstWrong,
  fitProblem,
  generateMelody,
  listenAccuracy,
  listenStars,
  listenXp,
  LISTEN_MAX_BARS,
  stepMidi,
  undoValue,
  type Answer,
  type Written,
} from './dictation';
import { generateExercise } from './generator';
import { getMeter } from './meters';
import { MIDDLE_C } from './pitch';
import { spellExercise } from './speller';
import { makeExercise } from './test-helpers';
import { PPQ, type Exercise, type NoteValue, type Settings } from './types';

const Q = PPQ;
const n = (value: NoteValue, step?: number, dots: 0 | 1 = 0): Written => ({ value, dots, kind: 'note', ...(step !== undefined ? { step } : {}) });
const r = (value: NoteValue): Written => ({ value, dots: 0, kind: 'rest' });

/** The answer that writes the exercise exactly, value for value. */
function exact(ex: Exercise): Answer {
  let k = 0;
  return ex.bars.map((bar) =>
    bar.events.map((e): Written => {
      const v = (Object.entries({ whole: 192, half: 96, quarter: 48, eighth: 24, sixteenth: 12 }) as [NoteValue, number][]).find(
        ([, t]) => t === e.duration || (t * 3) / 2 === e.duration,
      ) as [NoteValue, number];
      const dots = v[1] === e.duration ? 0 : 1;
      if (e.kind === 'rest') return { value: v[0], dots, kind: 'rest' };
      return { value: v[0], dots, kind: 'note', ...(ex.pitches ? { step: ex.pitches[k++] } : {}) };
    }),
  );
}

const listen = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, mode: 'listen', bars: 2, ...patch });

describe('checkAnswer (§3.2): beat by beat, as rhythm', () => {
  const ex = makeExercise('4/4', [
    [[Q, 'n'], [Q / 2, 'n'], [Q / 2, 'n'], [Q * 2, 'n']],
    [[Q, 'n'], [Q, 'r'], [Q * 2, 'n']],
  ]);

  it('takes the exact answer as all right', () => {
    const c = checkAnswer(ex, exact(ex));
    expect(c.beatsRight).toBe(8);
    expect(listenAccuracy(c)).toBe(100);
    expect(c.valuesRight).toBe(c.valuesTotal);
    expect(firstWrong(c)).toBeNull();
  });

  it('marks the beat that differs, and only that one', () => {
    const answer: Answer = [
      [n('quarter'), n('quarter'), n('half')], // beat 2 was two eighths
      [n('quarter'), r('quarter'), n('half')],
    ];
    const c = checkAnswer(ex, answer);
    expect(c.beatsRight).toBe(7);
    expect(firstWrong(c)).toMatchObject({ bar: 0, beat: 1, pitchOnly: false });
    expect(c.values[0]).toEqual([true, false, true]);
    expect(c.barsRight).toEqual([false, true]);
  });

  it('a half note is wrong in both its beats when it was a quarter and a quarter', () => {
    const answer: Answer = [
      [n('quarter'), n('eighth'), n('eighth'), n('quarter'), n('quarter')],
      [n('quarter'), r('quarter'), n('half')],
    ];
    expect(checkAnswer(ex, answer).beats.filter((b) => !b.right).map((b) => b.beat)).toEqual([2, 3]);
  });

  it('two eighth rests are the silence of a quarter rest', () => {
    const answer: Answer = [
      [n('quarter'), n('eighth'), n('eighth'), n('half')],
      [n('quarter'), r('eighth'), r('eighth'), n('half')],
    ];
    const c = checkAnswer(ex, answer);
    expect(c.beatsRight).toBe(8);
    expect(c.values[1]).toEqual([true, true, true, true]);
  });

  it('an empty bar is wrong in every beat', () => {
    expect(checkAnswer(ex, [exact(ex)[0], []]).beatsRight).toBe(4);
  });
});

describe('checkAnswer with a melody', () => {
  const base = makeExercise('4/4', [[[Q, 'n'], [Q, 'n'], [Q, 'n'], [Q, 'n']]]);
  const ex: Exercise = { ...base, pitches: [28, 30, 32, 33] };

  it('needs the right pitch as well as the right rhythm', () => {
    const answer: Answer = [[n('quarter', 28), n('quarter', 30), n('quarter', 30), n('quarter', 33)]];
    const c = checkAnswer(ex, answer);
    expect(c.beatsRight).toBe(3);
    expect(firstWrong(c)).toMatchObject({ bar: 0, beat: 2, pitchOnly: true });
    expect(c.values[0]).toEqual([true, true, false, true]);
    expect(c.onsetsRight).toEqual([true, true, false, true]);
  });

  it('a wrong rhythm is not a pitch-only difference', () => {
    const answer: Answer = [[n('quarter', 28), n('quarter', 30), n('half', 32)]];
    expect(firstWrong(checkAnswer(ex, answer))).toMatchObject({ beat: 2, pitchOnly: false });
  });
});

describe('writing an answer', () => {
  const m = getMeter('3/4');
  const palette = { notes: ['half', 'quarter', 'eighth'] as NoteValue[], rests: ['quarter'] as NoteValue[], dotted: false };

  it('disables a value that does not fit, or would leave a gap', () => {
    expect(fitProblem([n('half')], m, n('half'), palette)).toBe('tooLong');
    expect(fitProblem([], m, n('half'), palette)).toBeNull();
    // With only halves, a half in 3/4 leaves a quarter nothing can fill.
    expect(fitProblem([], m, n('half'), { notes: ['half'], rests: [], dotted: false })).toBe('gap');
    expect(fillable(Q / 2, palette)).toBe(true);
    expect(fillable(Q / 4, palette)).toBe(false);
  });

  it('fills bar after bar and undoes across bars', () => {
    let a = emptyAnswer(2);
    a = addValue(a, m, n('half'));
    a = addValue(a, m, n('quarter'));
    expect(currentBar(a, m)).toBe(1);
    a = addValue(a, m, n('quarter'));
    expect(a[1]).toHaveLength(1);
    a = undoValue(undoValue(a));
    expect(a).toEqual([[n('half')], []]);
    expect(currentBar(a, m)).toBe(0);
    expect(answerComplete(a, m)).toBe(false);
  });

  it('draws the answer value for value, beaming eighths inside a beat, steps kept', () => {
    const bars = answerNotation([[n('eighth', 28), n('eighth', 30), n('quarter', 32), n('eighth', 33)]], m);
    expect(bars[0].symbols.map((s) => s.onsetIndex)).toEqual([0, 1, 2, 3, -1]);
    expect(bars[0].symbols[4]).toMatchObject({ ghost: true, duration: 24 });
    expect(bars[0].symbols[0].beamGroup).toBe(bars[0].symbols[1].beamGroup);
    expect(bars[0].symbols[2].beamGroup).toBeUndefined();
    expect(bars[0].symbols.slice(0, 3).map((s) => s.step)).toEqual([28, 30, 32]);
  });
});

describe('melodies', () => {
  it('use only the notes picked, start and end on do', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 30 }), fc.integer({ min: 0, max: 0x7fffffff }), (len, seed) => {
        const m = generateMelody(len, DEFAULT_MELODY, seed);
        expect(m).toHaveLength(len);
        const allowed = DEFAULT_MELODY.map(degreeStep);
        expect(m.every((s) => allowed.includes(s))).toBe(true);
        expect(m[len - 1]).toBe(MIDDLE_C);
      }),
      { numRuns: 300 },
    );
  });

  it('never repeat a note three times in a row inside the melody', () => {
    for (let seed = 0; seed < 200; seed++) {
      const m = generateMelody(16, [0, 2, 4, 5], seed);
      for (let i = 2; i < m.length - 1; i++) expect(m[i] === m[i - 1] && m[i] === m[i - 2]).toBe(false);
    }
  });

  it('are made by the generator for Listen · Melody, one step per onset, and drawn with their steps', () => {
    for (let seed = 1; seed < 40; seed++) {
      const ex = generateExercise(listen({ write: 'melody', melody: [0, 2, 4, 5], notes: ['quarter', 'eighth', 'half'] }), seed);
      const onsets = ex.bars.flatMap((b) => b.events).filter((e) => e.kind === 'note' && !e.tieFromPrev).length;
      expect(ex.pitches).toHaveLength(onsets);
      const notes = spellExercise(ex).flatMap((b) => b.symbols).filter((s) => s.kind === 'note');
      expect(notes.every((s) => typeof s.step === 'number')).toBe(true);
      expect(checkAnswer(ex, exact(ex)).beatsRight).toBe(ex.bars.length * ex.meter.beatsPerBar);
    }
  });

  it('MIDI of the steps: C4 60, E4 64, A4 69, C5 72', () => {
    expect([0, 2, 5, 7].map((d) => stepMidi(degreeStep(d)))).toEqual([60, 64, 69, 72]);
  });
});

describe('Listen exercises', () => {
  it('have no ties or triplets and at most 8 bars, keeping the player settings', () => {
    for (let seed = 1; seed < 40; seed++) {
      const ex = generateExercise(listen({ ties: true, triplets: true, bars: 12, notes: ['quarter', 'eighth'] }), seed);
      expect(ex.bars).toHaveLength(LISTEN_MAX_BARS);
      expect(ex.bars.flatMap((b) => b.events).some((e) => e.tieFromPrev || e.triplet)).toBe(false);
      expect(ex.settings.ties).toBe(true);
      expect(ex.settings.bars).toBe(12);
      expect(ex.pitches).toBeUndefined();
    }
  });

  it('round-trip through their code, melody notes too', () => {
    const s = listen({ write: 'melody', melody: [0, 2, 4, 5] });
    const code = encodeCode(s, 12345);
    expect(code).toMatch(/^L44-.*-N0245-/);
    const back = decodeCode(code);
    expect(back?.settings.mode).toBe('listen');
    expect(back?.settings.write).toBe('melody');
    expect(back?.settings.melody).toEqual([0, 2, 4, 5]);
    expect(back?.seed).toBe(12345);
    expect(generateExercise(back!.settings, 12345).pitches).toEqual(generateExercise(s, 12345).pitches);
    expect(decodeCode(encodeCode(listen({ dotted: true }), 7))?.settings).toMatchObject({ mode: 'listen', dotted: true });
    expect(decodeCode('T44-HQ-RQ-2B-80-N02-7')).toBeNull();
  });
});

describe('scoring', () => {
  it('stars: 90% needs at most 2 plays; the 4th star all right heard once', () => {
    expect(listenStars(100, 1)).toBe(4);
    expect(listenStars(100, 2)).toBe(3);
    expect(listenStars(95, 3)).toBe(2);
    expect(listenStars(80, 1)).toBe(2);
    expect(listenStars(50, 3)).toBe(1);
    expect(listenStars(49, 1)).toBe(0);
  });

  it('XP: nothing without a beat right, 5 for each play not used', () => {
    const ex = makeExercise('4/4', [[[Q * 4, 'n']]]);
    expect(listenXp(ex, 0, 0, 1)).toBe(0);
    expect(listenXp(ex, 100, 4, 1) - listenXp(ex, 100, 4, 3)).toBe(10);
    // Not heard at all, or no star: no bonus for plays saved.
    expect(listenXp(ex, 40, 0, 1)).toBe(listenXp(ex, 40, 0, 3));
    expect(listenXp(ex, 100, 4, 0)).toBe(listenXp(ex, 100, 4, 3));
  });
});

describe('eighths and sixteenths apart (mixSixteenths off)', () => {
  /** The durations starting in each beat that hold an eighth or a sixteenth, note or rest. */
  const smallBeats = (ex: Exercise): number[][] =>
    ex.bars.flatMap((bar) =>
      Array.from({ length: ex.meter.beatsPerBar }, (_, b) =>
        bar.events.filter((e) => e.start >= b * Q && e.start < (b + 1) * Q && e.duration < Q).map((e) => e.duration),
      ).filter((d) => d.length > 0),
    );
  const busy = { notes: ['quarter', 'eighth', 'sixteenth'] as NoteValue[], rests: ['quarter', 'eighth', 'sixteenth'] as NoteValue[], dotted: true, density: 'busy' as const, bars: 4 };

  it('fills a beat with eighths or with four sixteenths, never both, in every mode', () => {
    for (const mode of ['tap', 'listen'] as const) {
      for (let seed = 1; seed < 120; seed++) {
        const ex = generateExercise({ ...DEFAULT_SETTINGS, ...busy, mode, mixSixteenths: false }, seed);
        for (const beat of smallBeats(ex)) {
          // Eighths only (two, or one after a dotted quarter), or four sixteenths: no sixteenth next to an eighth, no
          // dotted eighth.
          const ok = beat.every((d) => d === Q / 2) || (beat.length === 4 && beat.every((d) => d === Q / 4));
          expect(ok, `seed ${seed} (${mode}): a beat of ${beat.join(' + ')}`).toBe(true);
        }
      }
    }
  });

  it('still has both eighths and sixteenths, and mixes them when on (the default)', () => {
    const apart = Array.from({ length: 60 }, (_, i) => generateExercise({ ...DEFAULT_SETTINGS, ...busy, mixSixteenths: false }, i + 1));
    const durs = new Set(apart.flatMap((ex) => ex.bars.flatMap((b) => b.events.map((e) => e.duration))));
    expect(durs.has(Q / 2) && durs.has(Q / 4)).toBe(true);
    const mixed = Array.from({ length: 60 }, (_, i) => generateExercise({ ...DEFAULT_SETTINGS, ...busy }, i + 1));
    expect(mixed.some((ex) => smallBeats(ex).some((b) => new Set(b).size > 1))).toBe(true);
  });

  it('is kept in the code', () => {
    const code = encodeCode({ ...DEFAULT_SETTINGS, ...busy, mixSixteenths: false }, 99);
    expect(code).toMatch(/-X[A-Z0-9]*P/);
    expect(decodeCode(code)?.settings.mixSixteenths).toBe(false);
    expect(decodeCode(encodeCode({ ...DEFAULT_SETTINGS, ...busy }, 99))?.settings.mixSixteenths).toBeUndefined();
  });
});

describe('Write · Melody: the notes alone', () => {
  it('makes quarters only, with no rests, whatever the note values picked, and a pitch for each', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = listen({ write: 'notes', melody: [0, 2, 4, 5], notes: ['half', 'eighth', 'sixteenth'], rests: ['quarter'], dotted: true, bars: 3 });
      const ex = generateExercise(s, seed);
      const events = ex.bars.flatMap((b) => b.events);
      expect(events.every((e) => e.kind === 'note' && e.duration === Q)).toBe(true);
      expect(ex.pitches).toHaveLength(events.length);
      expect(ex.settings.notes).toEqual(['half', 'eighth', 'sixteenth']);
    }
  });

  it('round-trips through its code with a Q segment, apart from Both (N)', () => {
    const code = encodeCode(listen({ write: 'notes', melody: [0, 2, 4, 5] }), 4321);
    expect(code).toMatch(/-Q0245-/);
    expect(decodeCode(code)?.settings.write).toBe('notes');
    expect(decodeCode(encodeCode(listen({ write: 'melody', melody: [0, 2, 4, 5] }), 4321))?.settings.write).toBe('melody');
  });
});
