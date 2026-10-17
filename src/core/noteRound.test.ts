import fc from 'fast-check';
import {
  DEFAULT_NOTE_SETTINGS,
  generateRound,
  isRight,
  missKind,
  missedIds,
  noteId,
  noteRoundXp,
  noteStars,
  sanitizeNoteSettings,
  scoreRound,
  updateWeak,
  type NoteAnswer,
  type NoteSettings,
  type RoundNote,
} from './noteRound';
import { KEY_ORDER, keyAlter, letterOf, rangeSteps, signShown, type KeyId } from './pitch';

const settingsArb: fc.Arbitrary<NoteSettings> = fc.record({
  clefs: fc.subarray(['treble', 'bass'] as const, { minLength: 1 }).map((c) => [...c]),
  keys: fc.uniqueArray(fc.constantFrom(...KEY_ORDER), { minLength: 1, maxLength: 5 }),
  mixKeys: fc.boolean(),
  input: fc.constantFrom('names', 'piano', 'mixed'),
  range: fc.constantFrom('staff', 'ledger1', 'ledger2'),
  extras: fc.constantFrom('none', 'sharps', 'both'),
  count: fc.integer({ min: 10, max: 50 }),
  timer: fc.constantFrom(0, 5, 3),
});

const corpus = fc.sample(fc.tuple(settingsArb, fc.integer({ min: 1, max: 2 ** 31 - 1 })), { numRuns: 400, seed: 7 });

describe('generateRound (property tests)', () => {
  it('is seeded and deterministic, with the right length', () => {
    for (const [s, seed] of corpus) {
      const a = generateRound(s, seed);
      expect(a).toHaveLength(s.count);
      expect(generateRound(s, seed)).toEqual(a);
    }
  });

  it('draws only allowed positions and clefs, spelled in the key (signs only where Extra signs allows)', () => {
    for (const [s, seed] of corpus) {
      const keys = s.mixKeys ? s.keys : s.keys.slice(0, 1);
      for (const n of generateRound(s, seed)) {
        expect(s.clefs).toContain(n.clef);
        expect(keys).toContain(n.key);
        expect(rangeSteps(n.clef, s.range)).toContain(n.step);
        const base = keyAlter(n.key, letterOf(n.step));
        expect(n.sign).toBe(signShown(n.key, n));
        if (s.extras === 'none') expect(n.alter).toBe(base);
        if (s.extras === 'sharps') expect(n.alter === base || n.alter === base + 1).toBe(true);
        expect(Math.abs(n.alter - base)).toBeLessThanOrEqual(1);
        expect(Math.abs(n.alter)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never repeats a note at once, and never moves the same way three times in a row', () => {
    for (const [s, seed] of corpus) {
      const notes = generateRound(s, seed);
      for (let i = 1; i < notes.length; i++) {
        if (notes[i].clef !== notes[i - 1].clef) continue;
        expect(notes[i].step).not.toBe(notes[i - 1].step);
        if (i >= 3 && notes[i - 3].clef === notes[i].clef && notes[i - 2].clef === notes[i].clef) {
          const d = [1, 2, 3].map((j) => Math.sign(notes[i - j + 1].step - notes[i - j].step));
          expect(d[0] === d[1] && d[1] === d[2]).toBe(false);
        }
      }
    }
  });

  it('keeps a clef for at least 4 notes and a mixed key for 5', () => {
    for (const [s, seed] of corpus) {
      const notes = generateRound(s, seed);
      let run = 1;
      for (let i = 1; i < notes.length; i++) {
        if (notes[i].clef === notes[i - 1].clef) run++;
        else {
          expect(run).toBeGreaterThanOrEqual(4);
          run = 1;
        }
      }
      notes.forEach((n, i) => {
        if (i % 5 !== 0 && i > 0) expect(n.key).toBe(notes[i - 1].key);
      });
    }
  });

  it('alternates names and piano every 5 notes when the input is mixed', () => {
    const notes = generateRound({ ...DEFAULT_NOTE_SETTINGS, input: 'mixed' }, 3);
    expect(notes.slice(0, 5).every((n) => n.input === 'names')).toBe(true);
    expect(notes.slice(5, 10).every((n) => n.input === 'piano')).toBe(true);
  });

  it('brings weak spots and focus notes up more often', () => {
    const s: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, clefs: ['treble'], count: 50 };
    const target = noteId('treble', 38);
    const plain = [1, 2, 3, 4, 5].reduce((n, seed) => n + generateRound(s, seed).filter((x) => noteId(x.clef, x.step) === target).length, 0);
    const boosted = [1, 2, 3, 4, 5].reduce((n, seed) => n + generateRound(s, seed, {}, [target]).filter((x) => noteId(x.clef, x.step) === target).length, 0);
    expect(boosted).toBeGreaterThan(plain * 2);
  });
});

const fSharp5: RoundNote = { clef: 'treble', key: 'G', step: 38, alter: 1, sign: null, input: 'names' };

describe('answers', () => {
  it('needs the written spelling for names, and the sounding key on the piano', () => {
    expect(isRight(fSharp5, { kind: 'name', letter: 'F', alter: 1 })).toBe(true);
    expect(isRight(fSharp5, { kind: 'name', letter: 'F', alter: 0 })).toBe(false);
    expect(isRight(fSharp5, { kind: 'name', letter: 'G', alter: -1 })).toBe(false);
    expect(isRight(fSharp5, { kind: 'piano', pc: 6 })).toBe(true);
    const cFlat: RoundNote = { clef: 'treble', key: 'Cb', step: 35, alter: -1, sign: null, input: 'piano' };
    expect(isRight(cFlat, { kind: 'piano', pc: 11 })).toBe(true);
  });

  it('says why an answer was wrong', () => {
    expect(missKind(fSharp5, { kind: 'name', letter: 'F', alter: 0 })).toBe('keySign');
    expect(missKind(fSharp5, { kind: 'piano', pc: 5 })).toBe('keySign');
    expect(missKind(fSharp5, { kind: 'name', letter: 'E', alter: 0 })).toBe('letter');
    const fNat: RoundNote = { ...fSharp5, alter: 0, sign: 0 };
    expect(missKind(fNat, { kind: 'name', letter: 'F', alter: 1 })).toBe('noteSign');
    const c: RoundNote = { clef: 'bass', key: 'C', step: 21, alter: 0, sign: null, input: 'names' };
    expect(missKind(c, { kind: 'name', letter: 'C', alter: 1 })).toBe('extraSign');
  });
});

describe('scoreRound', () => {
  const notes: RoundNote[] = [fSharp5, { ...fSharp5, step: 32, alter: 0 }, fSharp5, { ...fSharp5, step: 34, alter: 0 }];
  const a = (outcome: NoteAnswer['outcome'], ms: number, given: NoteAnswer['given'] = null): NoteAnswer => ({ outcome, ms, given });

  it('counts right answers without a hint, the average time, misses, slow notes and signs', () => {
    const answers = [a('wrong', 1500, { kind: 'name', letter: 'F', alter: 0 }), a('right', 3400), a('wrong', 1000, { kind: 'name', letter: 'F', alter: 0 }), a('hinted', 2100)];
    const r = scoreRound(notes, answers);
    expect(r.total).toBe(4);
    expect(r.right).toBe(1);
    expect(r.hinted).toBe(1);
    expect(r.wrong).toBe(2);
    expect(r.accuracy).toBe(25);
    expect(r.avgMs).toBe(2000);
    expect(r.missed).toEqual([expect.objectContaining({ step: 38, alter: 1, count: 2 })]);
    expect(r.slow).toEqual([expect.objectContaining({ step: 32, ms: 3400 })]);
    expect(r.keySignMisses).toBe(2);
    expect(r.bySign).toEqual([
      { group: 'key', right: 0, total: 2 },
      { group: 'plain', right: 1, total: 2 },
    ]);
  });

  it('scores only the notes answered when the round ends early', () => {
    const r = scoreRound(notes, [a('right', 900)]);
    expect(r.total).toBe(1);
    expect(r.accuracy).toBe(100);
    expect(scoreRound(notes, []).stars).toBe(0);
  });

  it('gives stars at 70, 85 and 95% (3 stars only under 2 s on average)', () => {
    expect(noteStars(69, 1000)).toBe(0);
    expect(noteStars(70, 1000)).toBe(1);
    expect(noteStars(85, 1000)).toBe(2);
    expect(noteStars(95, 1999)).toBe(3);
    expect(noteStars(100, 2500)).toBe(2);
  });

  it('earns XP for answered notes, and none without one right', () => {
    const r = scoreRound(notes, notes.map(() => a('right', 1000)));
    expect(noteRoundXp(DEFAULT_NOTE_SETTINGS, r)).toBeGreaterThan(0);
    expect(noteRoundXp(DEFAULT_NOTE_SETTINGS, scoreRound(notes, notes.map(() => a('timeout', 3000))))).toBe(0);
  });

  it('keeps weak spots between 0 and 5 and lists missed notes for practice', () => {
    const answers = [a('wrong', 1000), a('right', 500), a('timeout', 3000), a('hinted', 1000)];
    const weak = updateWeak({ 'treble:32': 1 }, notes, answers);
    expect(weak['treble:38']).toBe(4);
    expect(weak['treble:32']).toBeUndefined();
    expect(weak['treble:34']).toBe(1);
    expect(updateWeak({ 'treble:38': 5 }, notes, answers)['treble:38']).toBe(5);
    expect(missedIds(notes, answers).sort()).toEqual(['treble:34', 'treble:38']);
  });
});

describe('sanitizeNoteSettings', () => {
  it('repairs stored settings field by field', () => {
    expect(sanitizeNoteSettings(null)).toBeNull();
    expect(sanitizeNoteSettings({})).toEqual(DEFAULT_NOTE_SETTINGS);
    const s = sanitizeNoteSettings({ clefs: ['bass', 'alto'], keys: ['Eb', 'X', 'G', 'Eb'], count: 99, timer: 4, input: 'piano' });
    expect(s).toMatchObject({ clefs: ['bass'], keys: ['Eb', 'G'] as KeyId[], count: 50, timer: 0, input: 'piano' });
  });
});
