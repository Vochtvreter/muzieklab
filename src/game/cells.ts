/**
 * The Progress tab's skill map (DESIGN.md §8.4): which rhythm cell each judged note of a rhythm round counts for, read
 * from the exercise as it is written (the speller, as coach.ts names a note), and the points it earned there. Pure.
 *
 * A note counts for one cell by its written value: a tied note for ties; else a dotted half for dotted half; a dotted
 * quarter, and the eighth right after it, for dotted quarter + eighth; else a quarter, half, eighth or sixteenth (and
 * the dotted eighth of a sixteenth figure) for its own cell. Whole notes and triplets count for none. The first note
 * after a rest also counts for rests.
 */
import { notePoints, POINTS } from '../core/judge';
import { spellExercise } from '../core/speller';
import { buildTimeline } from '../core/timeline';
import type { Exercise, JudgeResult, Leniency, NotatedBar, NotatedSymbol } from '../core/types';
import type { CellId } from './storage';

/** The rhythm unit (rhythm path, path.ts) whose first lesson opens each cell on the skill map. */
export const CELL_UNIT: Record<CellId, number> = { quarter: 1, half: 1, rests: 2, eighths: 4, ties: 6, dottedHalf: 7, dottedQE: 7, sixteenths: 8 };

/** The cell a note counts for by its written value, or null (whole notes, triplets). `before` is the symbol before it in its bar. */
function valueCell(sym: NotatedSymbol, before: NotatedSymbol | undefined): CellId | null {
  // A note whose sound goes on through a tie (a tie continuation is no new note, so never judged on its own).
  if (sym.tieToNext) return 'ties';
  if (sym.tuplet) return null;
  if (sym.dots) return sym.value === 'half' ? 'dottedHalf' : sym.value === 'quarter' ? 'dottedQE' : sym.value === 'eighth' ? 'sixteenths' : null;
  if (sym.value === 'eighth' && before?.kind === 'note' && before.value === 'quarter' && before.dots === 1 && !before.tuplet) return 'dottedQE';
  switch (sym.value) {
    case 'quarter':
      return 'quarter';
    case 'half':
      return 'half';
    case 'eighth':
      return 'eighths';
    case 'sixteenth':
      return 'sixteenths';
    default:
      return null;
  }
}

/**
 * The cells each sounding note counts for, by its onset index (the timeline's numbering): none, one, or one and rests.
 * `bars`: the exercise as spelled, when the caller has it already (game/intro.ts).
 */
export function noteCells(exercise: Exercise, bars: readonly NotatedBar[] = spellExercise(exercise)): CellId[][] {
  const out: CellId[][] = [];
  let prev: NotatedSymbol | undefined;
  for (const bar of bars) {
    bar.symbols.forEach((sym, i) => {
      if (sym.kind === 'note' && sym.onsetIndex >= 0) {
        const own = valueCell(sym, bar.symbols[i - 1]);
        const cells: CellId[] = own ? [own] : [];
        if (prev?.kind === 'rest') cells.push('rests');
        out[sym.onsetIndex] = cells;
      }
      prev = sym;
    });
  }
  return out;
}

/**
 * What a round's judged notes earned per cell: [points earned, points possible], whole numbers, with the points the
 * accuracy uses (judge.ts notePoints; POINTS.perfect possible per note). Cells no note counted for are left out.
 */
export function cellPoints(exercise: Exercise, result: Pick<JudgeResult, 'notes'>, leniency: Leniency): Partial<Record<CellId, [number, number]>> {
  const timeline = buildTimeline(exercise);
  const cells = noteCells(exercise);
  const out: Partial<Record<CellId, [number, number]>> = {};
  for (const r of result.notes) {
    const note = timeline.notes[r.index];
    const ids = cells[r.index];
    if (!note || !ids?.length) continue;
    const earned = Math.max(0, Math.min(POINTS.perfect, Math.round(notePoints(r, note, leniency))));
    for (const id of ids) {
      const [e, p] = out[id] ?? [0, 0];
      out[id] = [e + earned, p + POINTS.perfect];
    }
  }
  return out;
}

const writtenSymbols = (exercise: Exercise): NotatedSymbol[] => spellExercise(exercise).flatMap((bar) => bar.symbols);

/**
 * The material of a rhythm round as a rhythm unit, 1–8 (Rhythm by ear's levels): the highest unit whose material it
 * has. 8 a sixteenth; 7 a dotted value; 6 a tie; 5 an eighth rest or two-four; 4 an eighth; 3 three-four or a whole
 * note; 2 any rest; else 1.
 */
export function materialLevel(exercise: Exercise): number {
  const syms = writtenSymbols(exercise);
  const notes = syms.filter((s) => s.kind === 'note');
  const rests = syms.filter((s) => s.kind === 'rest');
  const meter = exercise.meter.id;
  if (syms.some((s) => s.value === 'sixteenth' && !s.tuplet)) return 8;
  if (syms.some((s) => s.dots === 1)) return 7;
  if (notes.some((s) => s.tieToNext)) return 6;
  if (meter === '2/4' || rests.some((s) => s.value === 'eighth' && !s.tuplet)) return 5;
  if (notes.some((s) => s.value === 'eighth' && !s.tuplet)) return 4;
  if (meter === '3/4' || notes.some((s) => s.value === 'whole')) return 3;
  if (rests.length > 0) return 2;
  return 1;
}

/** The exercise has a sixteenth note as written (First sixteenths). */
export const hasSixteenth = (exercise: Exercise): boolean => writtenSymbols(exercise).some((s) => s.kind === 'note' && s.value === 'sixteenth' && !s.tuplet);
