import fc from 'fast-check';
import { decodeCode, encodeCode } from './code';
import { DEFAULT_SETTINGS } from './defaults';
import { generateExercise, normaliseSettings } from './generator';
import { seedArb, settingsArb } from './test-helpers';

describe('exercise codes (§4.2)', () => {
  it('writes the default settings without a flags segment', () => {
    expect(encodeCode(DEFAULT_SETTINGS, 0)).toBe('T44-HQ-RQ-4B-80-0');
    expect(encodeCode({ ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'eighth'], tempo: 120 }, 7 * 32 ** 4 + 20 * 32 ** 3 + 2 * 32 ** 2 + 23 * 32 + 15)).toBe(
      'T44-HQE-RQ-4B-120-7M2QF',
    );
  });

  it('lists settings off their default as flags', () => {
    const s = { ...DEFAULT_SETTINGS, mode: 'echo' as const, meters: ['2/4', '4/4'] as const, rests: [], dotted: true, ties: true, hold: false, density: 'busy' as const, countIn: 2 as const };
    expect(encodeCode({ ...s, meters: [...s.meters] }, 31)).toBe('E2444-HQ-R-4B-80-XDTNB2-Z');
  });

  it('round-trips any settings and seed', () => {
    fc.assert(
      fc.property(settingsArb, seedArb, (s, seed) => {
        const n = normaliseSettings(s);
        const decoded = decodeCode(encodeCode(n, seed));
        expect(decoded).toEqual({ settings: n, seed });
      }),
      { numRuns: 300 },
    );
  });

  it('rebuilds the same exercise from its code', () => {
    const ex = generateExercise({ ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'eighth'], bars: 8, ties: true }, 123456789);
    const d = decodeCode(encodeCode(ex.settings, ex.seed))!;
    expect(generateExercise(d.settings, d.seed).bars).toEqual(ex.bars);
  });

  it('ignores case and spaces, and reads I, L and O as 1, 1 and 0', () => {
    expect(decodeCode('  t44-hq-rq-4b-80-1o  ')).toEqual({ settings: DEFAULT_SETTINGS, seed: 32 });
    expect(decodeCode('T44-HQ-RQ-4B-80-L')?.seed).toBe(1);
  });

  it('rejects malformed codes', () => {
    for (const bad of ['', 'T44', 'X44-HQ-RQ-4B-80-0', 'T45-HQ-RQ-4B-80-0', 'T4444-HQ-RQ-4B-80-0', 'T44--RQ-4B-80-0', 'T44-HQ-Q-4B-80-0',
      'T44-HQ-RQ-0B-80-0', 'T44-HQ-RQ-17B-80-0', 'T44-HQ-RQ-4B-30-0', 'T44-HQ-RQ-4B-201-0', 'T44-HQ-RQ-4B-80-D-0', 'T44-HQ-RQ-4B-80-XK-0',
      'T44-HQ-RQ-4B-80-ZZZZZZZZ', 'T44-HQQ-RQ-4B-80-0']) {
      expect(decodeCode(bad), bad).toBeNull();
    }
  });
});
