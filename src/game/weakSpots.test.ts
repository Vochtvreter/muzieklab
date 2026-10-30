import { DEFAULT_SETTINGS } from '../core/defaults';
import { checkSettings } from '../core/feasibility';
import { generateExercise } from '../core/generator';
import { noteCells } from './cells';
import { SHOW_IDS } from './intro';
import { sanitizeSettings, CELL_IDS, type CellId } from './storage';
import { playableSetup, weakCells, weakSpotsSettings, weakSpotsShows, type WeakSpotCell } from './weakSpots';

/** The eight cells with these accuracies (null: not enough notes) and locks. */
function cells(acc: Partial<Record<CellId, number | null>>, locked: CellId[] = []): WeakSpotCell[] {
  return CELL_IDS.map((id) => ({ id, accuracy: acc[id] ?? null, locked: locked.includes(id) }));
}

describe('weakCells', () => {
  it('picks the cells under 80%', () => {
    expect(weakCells(cells({ quarter: 96, ties: 78, dottedQE: 72, rests: 86 }))).toEqual(['ties', 'dottedQE']);
  });
  it('with none under 80%, the two weakest unlocked cells with enough notes', () => {
    expect(weakCells(cells({ quarter: 96, half: 97, eighths: 89, rests: 86, sixteenths: 81 }, ['sixteenths']))).toEqual(['rests', 'eighths']);
    // Ties: the map's order.
    expect(weakCells(cells({ quarter: 90, half: 90, eighths: 95 }))).toEqual(['quarter', 'half']);
    expect(weakCells(cells({ half: 92 }))).toEqual(['half']);
  });
  it('is empty without a cell with enough notes', () => {
    expect(weakCells(cells({}))).toEqual([]);
  });
});

describe('weakSpotsSettings', () => {
  const base = { ...DEFAULT_SETTINGS, notes: ['half' as const, 'quarter' as const], rests: [], meters: ['4/4' as const], tempo: 72 };

  it('switches on what the weak cells need, keeping the rest of the setup', () => {
    expect(weakSpotsSettings(base, cells({ quarter: 95, ties: 70 }))).toEqual({ ...base, ties: true });
    expect(weakSpotsSettings(base, cells({ quarter: 95, eighths: 60, sixteenths: 70 }))).toEqual({ ...base, notes: ['half', 'quarter', 'eighth', 'sixteenth'] });
    expect(weakSpotsSettings(base, cells({ dottedHalf: 75 }))).toEqual({ ...base, dotted: true, meters: ['3/4', '4/4'] });
    expect(weakSpotsSettings({ ...base, notes: ['half'] }, cells({ dottedQE: 75 }))).toEqual({ ...base, dotted: true, notes: ['half', 'quarter', 'eighth'] });
  });

  it('adds quarter rests (and eighth rests with eighths) and many of them for rests', () => {
    expect(weakSpotsSettings(base, cells({ rests: 70 }))).toEqual({ ...base, rests: ['quarter'], restAmount: 'many' });
    expect(weakSpotsSettings(base, cells({ rests: 70, eighths: 75 }))).toEqual({ ...base, notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'], restAmount: 'many' });
  });

  it('writes the setup the way storage reads it back, and one the generator can play', () => {
    const all = cells(Object.fromEntries(CELL_IDS.map((id) => [id, 60])));
    for (const s of [weakSpotsSettings(base, all)!, weakSpotsSettings(DEFAULT_SETTINGS, cells({ dottedHalf: 70, rests: 70 }))!]) {
      expect(sanitizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
      expect(checkSettings(s).ok).toBe(true);
    }
  });

  it('plays 2 bars at least for the cells a 1-bar exercise seldom or never has: ties, the dotted cells and rests', () => {
    const one = { ...base, bars: 1 };
    for (const id of ['ties', 'dottedHalf', 'dottedQE', 'rests'] as const) {
      const s = weakSpotsSettings(one, cells({ quarter: 95, [id]: 70 }))!;
      expect(s.bars, id).toBe(2);
      // Room for that cell: with these notes more than half the exercises of 2 bars have notes for it (at 1 bar: none
      // to 44%). With eighths on far fewer do, so the start looks for one (weakSpotsShows).
      const has = Array.from({ length: 20 }, (_, i) => generateExercise(s, i + 1)).filter((ex) => noteCells(ex).some((c) => c.includes(id)));
      expect(has.length, id).toBeGreaterThan(10);
    }
    // The other cells keep the player's Bars, and more than 2 bars stay.
    expect(weakSpotsSettings(one, cells({ quarter: 95, eighths: 70 }))!.bars).toBe(1);
    expect(weakSpotsSettings({ ...base, bars: 4 }, cells({ ties: 70 }))!.bars).toBe(4);
  });

  it('is null without a cell with enough notes (the button is hidden)', () => {
    expect(weakSpotsSettings(base, cells({}))).toBeNull();
  });

  it('opens a setup Start plays, also from one the player left without a time signature or a note that fills one', () => {
    expect(checkSettings({ ...base, meters: [] }).ok).toBe(false);
    expect(weakSpotsSettings({ ...base, meters: [] }, cells({ ties: 78, dottedQE: 72 }))).toEqual({ ...base, ties: true, dotted: true, notes: ['half', 'quarter', 'eighth'] });
    expect(weakSpotsSettings({ ...base, notes: [] }, cells({ rests: 70 }))).toEqual({ ...base, notes: ['quarter'], rests: ['quarter'], restAmount: 'many' });
    const whole = { ...base, notes: ['whole' as const], meters: ['2/4' as const, '3/4' as const] };
    expect(weakSpotsSettings(whole, cells({ ties: 70 }))).toEqual({ ...whole, notes: ['whole', 'quarter'], ties: true });
    expect(playableSetup(base)).toBe(base);
  });
});

describe('weakSpotsShows', () => {
  it('asks the start for a note of each weak cell, as a Learn practice link asks for what its section teaches', () => {
    expect(weakSpotsShows(cells({ quarter: 95, ties: 70, dottedHalf: 60 }))).toEqual(['ties', 'dotted:half']);
    const all = weakSpotsShows(cells(Object.fromEntries(CELL_IDS.map((id) => [id, 60]))));
    expect(all).toEqual(['note:quarter', 'note:half', 'note:eighth', 'rest', 'ties', 'dotted:half', 'dotted:quarter', 'note:sixteenth']);
    // Ids the start's seed search knows, which a run restored after a reload keeps.
    for (const id of all) expect(SHOW_IDS).toContain(id);
    expect(weakSpotsShows(cells({}))).toEqual([]);
  });
});

describe('playableSetup', () => {
  it('leaves a setup Start plays as it is, and gives one it cannot a time signature and quarter notes', () => {
    for (const s of [{ ...DEFAULT_SETTINGS, meters: [] }, { ...DEFAULT_SETTINGS, notes: [] }, { ...DEFAULT_SETTINGS, notes: ['whole' as const], meters: ['3/4' as const] }]) {
      expect(checkSettings(s).ok).toBe(false);
      expect(checkSettings(playableSetup(s)).ok).toBe(true);
    }
    // Quarter notes only when the time signature alone does not do.
    expect(playableSetup({ ...DEFAULT_SETTINGS, notes: ['eighth'], meters: [] })).toEqual({ ...DEFAULT_SETTINGS, notes: ['eighth'] });
  });
});
