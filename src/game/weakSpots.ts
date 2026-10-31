/**
 * Practice weak spots (DESIGN.md §9 v1.5, the Progress tab's skill map): a practice-setup preset that switches on what
 * the weak cells need, on top of the rhythm setup as it is. The screen puts it on the setup (dispatch 'settings', with
 * what its Start must show: weakSpotsShows) and opens /setup, where Start plays it. Pure.
 */
import { DEFAULT_SETTINGS } from '../core/defaults';
import { checkSettings } from '../core/feasibility';
import { METER_IDS, NOTE_VALUES, type MeterId, type NoteValue, type Settings } from '../core/types';
import type { CellId } from './storage';

/** Under this rolling accuracy (%) a cell is a weak spot. */
export const WEAK_BELOW = 80;

/** What the preset reads of a skill-map cell (progressView's CellView has it). */
export interface WeakSpotCell {
  id: CellId;
  /** Rolling accuracy as a whole %, or null without enough notes. */
  accuracy: number | null;
  locked: boolean;
}

/**
 * The cells to practise: those under WEAK_BELOW, or with none, the two weakest unlocked cells (ties: the map's order).
 * Only cells with enough notes count; none: the button is hidden.
 */
export function weakCells(cells: readonly WeakSpotCell[]): CellId[] {
  const rated = cells.filter((c): c is WeakSpotCell & { accuracy: number } => c.accuracy !== null);
  const weak = rated.filter((c) => c.accuracy < WEAK_BELOW);
  if (weak.length > 0) return weak.map((c) => c.id);
  return rated
    .filter((c) => !c.locked)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.accuracy - b.c.accuracy || a.i - b.i)
    .slice(0, 2)
    .map(({ c }) => c.id);
}

const VALUE_OF: Partial<Record<CellId, NoteValue>> = { quarter: 'quarter', half: 'half', eighths: 'eighth', sixteenths: 'sixteenth' };

/**
 * Cells that a 1-bar exercise seldom or never has, so the preset plays 2 bars at least: no tie (the generator ties over
 * a bar line, or in a quarter, half, quarter, which never ends one), no dotted half (the cadence turns it down), and
 * the dotted quarter + eighth and a note after a rest in fewer than half of them. Even 2 bars often lack one, most of
 * all with eighths on, so Start also looks for it (weakSpotsShows), and several of them take more bars (barsFor).
 */
const TWO_BARS: readonly CellId[] = ['ties', 'dottedHalf', 'dottedQE', 'rests'];

/**
 * The bars the weak cells need for Start to find a note of each in a few tries (weakSpotsShows): none of TWO_BARS, the
 * player's; one of them, 2; and a bar more for each other one, as they share the room. One more for a dotted half with
 * eighths or sixteenths on, whose busier bars seldom keep three beats for one note (in 2 bars 1 exercise in 6 has one
 * with eighths, 1 in 300 with sixteenths; in 3 bars 1 in 3 and 1 in 10). And one more for both dotted cells: the
 * generator takes any dotted value as its dotted note, so few exercises have a dotted half and a dotted quarter (1 in 35
 * of 3 bars, 1 in 5 of 5).
 */
function barsFor(ids: readonly CellId[], notes: ReadonlySet<NoteValue>): number {
  const rare = ids.filter((id) => TWO_BARS.includes(id)).length;
  if (rare === 0) return 1;
  const dottedHalf = ids.includes('dottedHalf');
  const busy = dottedHalf && (notes.has('eighth') || notes.has('sixteenth')) ? 1 : 0;
  const bothDotted = dottedHalf && ids.includes('dottedQE') ? 1 : 0;
  return 1 + rare + busy + bothDotted;
}

/**
 * The rhythm setup as it is, when Start can play it. One that Start cannot (the player switched off every time
 * signature or note value, or kept none that fills a bar) gets the default time signature when it has none, then
 * quarter notes, which fill every one, when it still needs them: so a preset opens a setup where Start plays it.
 */
export function playableSetup(settings: Settings): Settings {
  if (checkSettings(settings).ok) return settings;
  const timed = settings.meters.length > 0 ? settings : { ...settings, meters: [...DEFAULT_SETTINGS.meters] };
  if (checkSettings(timed).ok) return timed;
  return { ...timed, notes: NOTE_VALUES.filter((v) => v === 'quarter' || timed.notes.includes(v)) };
}

/**
 * The rhythm setup (playable: playableSetup) with what the weak cells need switched on: their note values; rests
 * (quarter, and eighth when eighths are on) with many rests; ties; dotted notes with a half (and three-four) for the
 * dotted half, with a quarter and an eighth for the dotted quarter + eighth; and the bars those need at least
 * (barsFor: 2 for one of them, more for several or for a dotted half with eighths). Arrays stay in their canonical
 * order (as sanitizeSettings keeps them). Null when no cell has enough notes yet.
 */
export function weakSpotsSettings(setup: Settings, cells: readonly WeakSpotCell[]): Settings | null {
  const ids = weakCells(cells);
  if (ids.length === 0) return null;
  const settings = playableSetup(setup);
  const notes = new Set<NoteValue>(settings.notes);
  const rests = new Set<NoteValue>(settings.rests);
  const meters = new Set<MeterId>(settings.meters);
  const next: Settings = { ...settings };
  for (const id of ids) {
    const value = VALUE_OF[id];
    if (value) notes.add(value);
    if (id === 'ties') next.ties = true;
    if (id === 'dottedHalf') {
      next.dotted = true;
      notes.add('half');
      meters.add('3/4');
    }
    if (id === 'dottedQE') {
      next.dotted = true;
      notes.add('quarter');
      notes.add('eighth');
    }
  }
  if (ids.includes('rests')) {
    rests.add('quarter');
    if (notes.has('eighth')) rests.add('eighth');
    next.restAmount = 'many';
  }
  next.bars = Math.max(next.bars, barsFor(ids, notes));
  return {
    ...next,
    notes: NOTE_VALUES.filter((v) => notes.has(v)),
    rests: NOTE_VALUES.filter((v) => rests.has(v)),
    meters: METER_IDS.filter((m) => meters.has(m)),
  };
}

/**
 * What the run the preset starts must show: a note that counts for each weak cell (weakCells; ids of game/intro.ts,
 * 'cell:dottedHalf'), which the start looks for over other seeds as a Learn practice link does (makeRunShowing in
 * ui/store.tsx). The preset alone leaves it to chance: the generator takes a dotted quarter for its dotted note and an
 * off-beat eighth for its syncopation, so with eighths on most exercises of 2 bars had no dotted half, and many no tie.
 * The cell, not the symbol: a dotted half tied on counts for ties.
 */
export function weakSpotsShows(cells: readonly WeakSpotCell[]): string[] {
  return weakCells(cells).map((id) => 'cell:' + id);
}
