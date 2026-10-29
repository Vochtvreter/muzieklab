import type { NoteValue } from './types';
import { PPQ } from './types';

/** Ticks of each plain note value (§5.1). */
export const VALUE_TICKS: Record<NoteValue, number> = {
  whole: PPQ * 4,
  half: PPQ * 2,
  quarter: PPQ,
  eighth: PPQ / 2,
  sixteenth: PPQ / 4,
};

export const TRIPLET_EIGHTH = PPQ / 3;

export interface Spelled {
  value: NoteValue;
  dots: 0 | 1;
}

/** Plain or single-dotted value with exactly this duration, or null. */
export function valueForTicks(ticks: number): Spelled | null {
  for (const v of ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as NoteValue[]) {
    if (VALUE_TICKS[v] === ticks) return { value: v, dots: 0 };
    if (v !== 'sixteenth' && (VALUE_TICKS[v] * 3) / 2 === ticks) return { value: v, dots: 1 };
  }
  return null;
}

const CAP: Record<NoteValue, string> = {
  whole: 'Whole',
  half: 'Half',
  quarter: 'Quarter',
  eighth: 'Eighth',
  sixteenth: 'Sixteenth',
};

/** i18n key for a note value, e.g. value.quarter, value.dottedQuarter, value.tripletEighth. */
export function valueKey(value: NoteValue, dots: 0 | 1, triplet = false): string {
  if (triplet) return 'value.triplet' + CAP[value];
  return dots ? 'value.dotted' + CAP[value] : 'value.' + value;
}

/** i18n key for a rest value, e.g. rest.quarter, rest.dottedEighth, rest.tripletEighth (a rest inside a triplet). */
export function restKey(value: NoteValue, dots: 0 | 1, triplet = false): string {
  if (triplet) return 'rest.triplet' + CAP[value];
  return dots ? 'rest.dotted' + CAP[value] : 'rest.' + value;
}
