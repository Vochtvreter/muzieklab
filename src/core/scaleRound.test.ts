import fc from 'fast-check';
import { KEY_ORDER } from './pitch';
import { CIRCLE_ORDER, SCALE_TYPES, scaleNotes } from './scale';
import {
  DEFAULT_SCALE_SETTINGS,
  afterScale,
  generateScaleRound,
  isRightNote,
  sanitizeScaleSettings,
  scaleRoundKeys,
  scaleRoundXp,
  scaleStars,
  scoreScaleRound,
  signChoices,
  updateScaleStars,
  type PlayedScale,
  type RoundScale,
  type ScaleSettings,
} from './scaleRound';

const settingsArb: fc.Arbitrary<ScaleSettings> = fc.record({
  keyMode: fc.constantFrom('one', 'circle', 'pick'),
  keys: fc.uniqueArray(fc.constantFrom(...KEY_ORDER), { minLength: 1, maxLength: 6 }),
  types: fc.subarray([...SCALE_TYPES], { minLength: 1 }),
  input: fc.constantFrom('piano', 'names', 'mixed'),
  direction: fc.constantFrom('up', 'upDown'),
  write: fc.constantFrom('signs', 'keySig'),
  showSteps: fc.boolean(),
  playNotes: fc.boolean(),
});

const corpus = fc.sample(fc.tuple(settingsArb, fc.integer({ min: 1, max: 2 ** 31 - 1 })), { numRuns: 300, seed: 11 });

describe('scale settings', () => {
  it('repairs stored settings field by field and keeps the order of the keys', () => {
    expect(sanitizeScaleSettings(null)).toBeNull();
    expect(sanitizeScaleSettings([])).toBeNull();
    expect(sanitizeScaleSettings({})).toEqual(DEFAULT_SCALE_SETTINGS);
    expect(sanitizeScaleSettings({ keyMode: 'pick', keys: ['Bb', 'X', 'D', 'Bb'], types: ['melodic', 'major', 'x'], direction: 'down', showSteps: false })).toEqual({
      ...DEFAULT_SCALE_SETTINGS,
      keyMode: 'pick',
      keys: ['Bb', 'D'],
      types: ['major', 'melodic'],
      showSteps: false,
    });
    for (const [s] of corpus) expect(sanitizeScaleSettings(s)).toEqual({ ...s, types: SCALE_TYPES.filter((t) => s.types.includes(t)) });
  });

  it('uses the selected key, the whole circle, or every chosen key', () => {
    const s = { ...DEFAULT_SCALE_SETTINGS, keys: ['D', 'F'] as const };
    expect(scaleRoundKeys({ ...s, keys: ['D', 'F'], keyMode: 'one' })).toEqual(['D']);
    expect(scaleRoundKeys({ ...s, keys: ['D', 'F'], keyMode: 'pick' })).toEqual(['D', 'F']);
    expect(scaleRoundKeys({ ...s, keys: ['D', 'F'], keyMode: 'circle' })).toEqual(CIRCLE_ORDER);
  });
});

describe('generateScaleRound (property tests)', () => {
  it('is seeded, holds every chosen type in every key once, and alternates mixed input', () => {
    for (const [s, seed] of corpus) {
      const round = generateScaleRound(s, seed);
      expect(generateScaleRound(s, seed)).toEqual(round);
      const keys = scaleRoundKeys(s);
      expect(round).toHaveLength(keys.length * s.types.length);
      const ids = new Set(round.map((r) => r.key + ':' + r.type));
      expect(ids.size).toBe(round.length);
      for (const r of round) {
        expect(keys).toContain(r.key);
        expect(s.types).toContain(r.type);
        expect(r.again).toBe(false);
      }
      round.forEach((r, i) => expect(r.input).toBe(s.input === 'mixed' ? (i % 2 ? 'names' : 'piano') : s.input));
    }
  });

  it('keeps the circle order when going round the circle', () => {
    const s: ScaleSettings = { ...DEFAULT_SCALE_SETTINGS, keyMode: 'circle', types: ['major', 'natural'] };
    const round = generateScaleRound(s, 42);
    expect(round.map((r) => r.key)).toEqual(CIRCLE_ORDER.flatMap((k) => [k, k]));
    expect(round.slice(0, 2).map((r) => r.type)).toEqual(['major', 'natural']);
  });
});

describe('a scale with mistakes comes back at the end of the round', () => {
  const round = generateScaleRound({ ...DEFAULT_SCALE_SETTINGS, keyMode: 'pick', keys: ['G', 'D', 'F'] }, 3);

  it('appends it once, and only after mistakes', () => {
    expect(afterScale(round, 0, 0)).toBe(round);
    const next = afterScale(round, 1, 2);
    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({ ...round[1], again: true });
    expect(afterScale(next, 3, 1)).toBe(next);
  });
});

describe('judging a note', () => {
  const d = scaleNotes({ key: 'D', type: 'major' });

  it('needs the right key in the right octave on the piano, and the right sign by name', () => {
    expect(isRightNote(d[2], { kind: 'piano', midi: 66 })).toBe(true);
    expect(isRightNote(d[2], { kind: 'piano', midi: 65 })).toBe(false);
    expect(isRightNote(d[7], { kind: 'piano', midi: 62 })).toBe(false);
    expect(isRightNote(d[7], { kind: 'piano', midi: 74 })).toBe(true);
    expect(isRightNote(d[2], { kind: 'sign', alter: 1 })).toBe(true);
    expect(isRightNote(d[2], { kind: 'sign', alter: 0 })).toBe(false);
  });

  it('offers 𝄪 only where a scale needs it', () => {
    expect(signChoices({ key: 'G', type: 'harmonic' })).toEqual([-1, 0, 1]);
    expect(signChoices({ key: 'B', type: 'harmonic' })).toEqual([-1, 0, 1, 2]);
    expect(signChoices({ key: 'B', type: 'natural' })).toEqual([-1, 0, 1]);
  });
});

describe('scoring a round', () => {
  it('gives stars by mistakes: 0 → ★★★, 1 → ★★, 2–3 → ★', () => {
    expect([0, 1, 2, 3, 4, 9].map(scaleStars)).toEqual([3, 2, 1, 1, 0, 0]);
  });

  const sc = (key: RoundScale['key'], again = false): RoundScale => ({ key, type: 'major', input: 'piano', again });
  const played: PlayedScale[] = [
    { scale: sc('G'), mistakes: 0 },
    { scale: sc('D'), mistakes: 0 },
    { scale: sc('A'), mistakes: 1 },
    { scale: sc('E'), mistakes: 2 },
    { scale: sc('A', true), mistakes: 0 },
    { scale: sc('E', true), mistakes: 1 },
  ];

  it('scores each scale on its first try and marks the ones that came back', () => {
    const r = scoreScaleRound(played);
    expect(r.total).toBe(4);
    expect(r.clean).toBe(2);
    expect(r.mistakes).toBe(3);
    expect(r.scales.map((x) => [x.scale.key, x.stars, x.cameBack])).toEqual([
      ['G', 3, false],
      ['D', 3, false],
      ['A', 2, true],
      ['E', 1, true],
    ]);
  });

  it('earns 2 XP per star (4 up and down), + 5 when every scale has ★★★', () => {
    const r = scoreScaleRound(played);
    expect(scaleRoundXp(DEFAULT_SCALE_SETTINGS, r)).toBe(2 * (3 + 3 + 2 + 1));
    expect(scaleRoundXp({ ...DEFAULT_SCALE_SETTINGS, direction: 'upDown' }, r)).toBe(4 * 9);
    const clean = scoreScaleRound(played.slice(0, 2));
    expect(scaleRoundXp(DEFAULT_SCALE_SETTINGS, clean)).toBe(12 + 5);
    expect(scaleRoundXp(DEFAULT_SCALE_SETTINGS, scoreScaleRound([]))).toBe(0);
  });

  it('only raises the saved stars', () => {
    const r = scoreScaleRound(played);
    expect(updateScaleStars({ 'G-major': 1, 'E-major': 3, 'F-major': 2 }, r)).toEqual({ 'G-major': 3, 'D-major': 3, 'A-major': 2, 'E-major': 3, 'F-major': 2 });
  });
});
