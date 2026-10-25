import { DEFAULT_SETTINGS } from '../core/defaults';
import { checkSettings } from '../core/feasibility';
import { sanitizeSettings, CELL_IDS, type CellId } from './storage';
import { weakCells, weakSpotsSettings, type WeakSpotCell } from './weakSpots';

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

  it('is null without a cell with enough notes (the button is hidden)', () => {
    expect(weakSpotsSettings(base, cells({}))).toBeNull();
  });
});
