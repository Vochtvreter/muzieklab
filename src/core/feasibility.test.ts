import fc from 'fast-check';
import { checkSettings } from './feasibility';
import { generateExercise } from './generator';
import { DEFAULT_SETTINGS } from './defaults';
import { seedArb, settingsArb } from './test-helpers';

describe('checkSettings', () => {
  it('accepts the defaults', () => {
    const f = checkSettings(DEFAULT_SETTINGS);
    expect(f.ok).toBe(true);
    expect(f.playable).toEqual(['4/4']);
    expect(f.blocked).toEqual({});
  });

  it('blocks 3/4 with only half notes and names what would help', () => {
    const f = checkSettings({ ...DEFAULT_SETTINGS, meters: ['3/4', '4/4'], notes: ['half'], rests: [] });
    expect(f.playable).toEqual(['4/4']);
    expect(f.blocked['3/4']).toEqual({
      key: 'setup.needs',
      params: { meter: '3/4', values: 'value.quarter,rest.quarter,value.dottedHalf' },
      values: ['value.quarter', 'rest.quarter', 'value.dottedHalf'],
    });
    expect(f.ok).toBe(true);
  });

  it('allows 3/4 with half notes and a quarter rest, or a dotted half', () => {
    expect(checkSettings({ ...DEFAULT_SETTINGS, meters: ['3/4'], notes: ['half'], rests: ['quarter'] }).ok).toBe(true);
    expect(checkSettings({ ...DEFAULT_SETTINGS, meters: ['3/4'], notes: ['half'], rests: [], dotted: true }).ok).toBe(true);
  });

  it('never uses a whole note outside 4/4', () => {
    const f = checkSettings({ ...DEFAULT_SETTINGS, meters: ['2/4', '3/4'], notes: ['whole'], rests: ['whole'] });
    expect(f.ok).toBe(false);
    expect(f.playable).toEqual([]);
    expect(f.blocked['2/4']?.params.values).toBe('value.half,value.quarter,value.eighth');
  });

  it('is not ok without any note value', () => {
    const f = checkSettings({ ...DEFAULT_SETTINGS, notes: [], rests: ['quarter'] });
    expect(f.ok).toBe(false);
    expect(f.blocked['4/4']?.params.values).toBe('value.whole,value.half,value.quarter');
  });

  it('agrees with the generator: a playable setting is generated without the fallback', () => {
    fc.assert(
      fc.property(settingsArb, seedArb, (s, seed) => {
        const f = checkSettings(s);
        const ex = generateExercise(s, seed);
        if (f.ok) {
          expect(f.playable).toContain(ex.meter.id);
          expect(ex.settings.notes).toEqual(s.notes);
        } else {
          expect(ex.settings.notes).toContain('quarter');
        }
      }),
      { numRuns: 300, seed: 7 },
    );
  });
});
