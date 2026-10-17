import { rateDifficulty, syncopation } from './difficulty';
import { generateExercise } from './generator';
import { DEFAULT_SETTINGS } from './defaults';
import { makeExercise } from './test-helpers';

describe('syncopation (Longuet-Higgins & Lee)', () => {
  it('is 0 for notes on the beat', () => {
    const ex = makeExercise('4/4', [[[48, 'n'], [48, 'n'], [96, 'n']]]);
    expect(syncopation(ex.meter, ex.bars)).toBe(0);
  });

  it('scores weight(strong) − weight(weak) for a held or silent stronger position', () => {
    const qhq = makeExercise('4/4', [[[48, 'n'], [96, 'n'], [48, 'n']]]); // half on beat 2 holds through beat 3: 3 − 2
    expect(syncopation(qhq.meter, qhq.bars)).toBe(1);
    const eqe = makeExercise('2/4', [[[24, 'n'], [48, 'n'], [24, 'n']]]); // quarter on the "&" holds beat 2: 2 − 1
    expect(syncopation(eqe.meter, eqe.bars)).toBe(1);
    const rest = makeExercise('4/4', [[[24, 'r'], [24, 'n'], [48, 'r'], [96, 'n']]]); // "&" of 1 then a rest on beat 2
    expect(syncopation(rest.meter, rest.bars)).toBe(1);
    const tie = makeExercise('4/4', [[[144, 'n'], [48, 'n']], [[48, 'n', 't'], [48, 'n'], [96, 'n']]]); // beat 4 tied over the bar line: 4 − 2
    expect(syncopation(tie.meter, tie.bars)).toBe(2);
  });

  it('does not count triplets as syncopated', () => {
    const ex = makeExercise('2/4', [[[16, 'n', '3'], [16, 'n', '3'], [16, 'n', '3'], [48, 'n']]]);
    expect(syncopation(ex.meter, ex.bars)).toBe(0);
  });
});

describe('rateDifficulty', () => {
  it('stays in 0–10 and rises with harder settings and tempo', () => {
    const avg = (s: typeof DEFAULT_SETTINGS): number => {
      let sum = 0;
      for (let seed = 0; seed < 30; seed++) sum += generateExercise(s, seed).difficulty;
      return sum / 30;
    };
    const easy = avg(DEFAULT_SETTINGS);
    const hard = avg({ ...DEFAULT_SETTINGS, notes: ['quarter', 'eighth', 'sixteenth'], rests: ['quarter', 'eighth'], dotted: true, ties: true, triplets: true, tempo: 140 });
    expect(easy).toBeGreaterThan(0);
    expect(easy).toBeLessThan(3);
    expect(hard).toBeGreaterThan(easy + 2);
    expect(hard).toBeLessThanOrEqual(10);
    const ex = generateExercise(DEFAULT_SETTINGS, 1);
    expect(rateDifficulty(ex.meter, ex.bars, 200)).toBeGreaterThan(rateDifficulty(ex.meter, ex.bars, 40));
  });
});
