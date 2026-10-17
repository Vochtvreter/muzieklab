/**
 * Pitch reading (DESIGN.md §3.5): letters, staff positions in treble and bass clef, the 15 key signatures, and how a
 * written note is named and played. Pure data and functions; names and words come from the i18n catalog.
 */

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

export type Clef = 'treble' | 'bass';
export const CLEFS: readonly Clef[] = ['treble', 'bass'];

/** −1 flat, 0 natural, +1 sharp. Double sharps and flats never appear (§3.5). */
export type Alter = -1 | 0 | 1;

/**
 * A staff position as a count of letter steps: octave × 7 + letter index, so C4 (middle C) is 28 and each step up is
 * the next letter (E4 = 30, the bottom line of the treble staff).
 */
export type Step = number;
export const MIDDLE_C: Step = 28;

export const letterOf = (step: Step): Letter => LETTERS[((step % 7) + 7) % 7];
/** Octave in scientific pitch notation (C4 = middle C), of the written letter. */
export const octaveOf = (step: Step): number => Math.floor(step / 7);

/** The bottom line of each staff: E4 in treble clef, G2 in bass clef. */
export const BOTTOM_LINE: Record<Clef, Step> = { treble: 30, bass: 18 };

/** On the staff (11 positions), +1 ledger line (15) or +2 ledger lines (19), per clef. */
export type Range = 'staff' | 'ledger1' | 'ledger2';
export const RANGES: readonly Range[] = ['staff', 'ledger1', 'ledger2'];
const RANGE_EXTRA: Record<Range, number> = { staff: 0, ledger1: 2, ledger2: 4 };

/**
 * The positions a range allows, low to high: the 5 lines, 4 spaces and the space just outside each end, and per extra
 * ledger line one more line and the space beyond it at both ends.
 */
export function rangeSteps(clef: Clef, range: Range): Step[] {
  const extra = RANGE_EXTRA[range];
  const lo = BOTTOM_LINE[clef] - 1 - extra;
  const hi = BOTTOM_LINE[clef] + 9 + extra;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** Where a step sits relative to its staff: 0 = bottom line, 8 = top line; even = a line (or ledger line). */
export const staffOffset = (clef: Clef, step: Step): number => step - BOTTOM_LINE[clef];
export const isLine = (clef: Clef, step: Step): boolean => staffOffset(clef, step) % 2 === 0;

// --- Key signatures --------------------------------------------------------------------------------------------

export type KeyId = 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#' | 'C#' | 'F' | 'Bb' | 'Eb' | 'Ab' | 'Db' | 'Gb' | 'Cb';

export interface KeySig {
  id: KeyId;
  /** Sharps (> 0) or flats (< 0) in the signature. */
  fifths: number;
  major: { letter: Letter; alter: Alter };
  /** The relative minor: same signature, same notes. */
  minor: { letter: Letter; alter: Alter };
}

const k = (id: KeyId, fifths: number, major: [Letter, Alter], minor: [Letter, Alter]): KeySig => ({
  id,
  fifths,
  major: { letter: major[0], alter: major[1] },
  minor: { letter: minor[0], alter: minor[1] },
});

export const KEYS: Record<KeyId, KeySig> = {
  C: k('C', 0, ['C', 0], ['A', 0]),
  G: k('G', 1, ['G', 0], ['E', 0]),
  D: k('D', 2, ['D', 0], ['B', 0]),
  A: k('A', 3, ['A', 0], ['F', 1]),
  E: k('E', 4, ['E', 0], ['C', 1]),
  B: k('B', 5, ['B', 0], ['G', 1]),
  'F#': k('F#', 6, ['F', 1], ['D', 1]),
  'C#': k('C#', 7, ['C', 1], ['A', 1]),
  F: k('F', -1, ['F', 0], ['D', 0]),
  Bb: k('Bb', -2, ['B', -1], ['G', 0]),
  Eb: k('Eb', -3, ['E', -1], ['C', 0]),
  Ab: k('Ab', -4, ['A', -1], ['F', 0]),
  Db: k('Db', -5, ['D', -1], ['B', -1]),
  Gb: k('Gb', -6, ['G', -1], ['E', -1]),
  Cb: k('Cb', -7, ['C', -1], ['A', -1]),
};

/** The Key screen's order: C, then sharps and flats side by side by count (G | F, D | B♭, …, C♯ | C♭). */
export const KEY_ORDER: readonly KeyId[] = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'F#', 'Gb', 'C#', 'Cb'];
export const KEY_IDS: readonly KeyId[] = KEY_ORDER;

/** Sharps are added F C G D A E B; flats B E A D G C F (§8.7). */
export const SHARP_ORDER: readonly Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER: readonly Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** The signs of a key signature in the order they are written. */
export function keySigns(key: KeyId): { letter: Letter; alter: Alter }[] {
  const f = KEYS[key].fifths;
  if (f > 0) return SHARP_ORDER.slice(0, f).map((letter) => ({ letter, alter: 1 as Alter }));
  return FLAT_ORDER.slice(0, -f).map((letter) => ({ letter, alter: -1 as Alter }));
}

/** What the key signature does to a letter, in every octave. */
export function keyAlter(key: KeyId, letter: Letter): Alter {
  const f = KEYS[key].fifths;
  if (f > 0) return SHARP_ORDER.indexOf(letter) < f ? 1 : 0;
  if (f < 0) return FLAT_ORDER.indexOf(letter) < -f ? -1 : 0;
  return 0;
}

// --- Written notes ---------------------------------------------------------------------------------------------

/** A note as written: its staff position and its full name (the key signature's sign included). */
export interface WrittenNote {
  step: Step;
  alter: Alter;
}

/** The sign drawn next to a note in a key: null when the key signature already says it (§3.5). */
export function signShown(key: KeyId, note: WrittenNote): Alter | null {
  return note.alter === keyAlter(key, letterOf(note.step)) ? null : note.alter;
}

const SEMITONE: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class 0–11 (C = 0): which piano key sounds, in any octave. C♭ is B (11), E♯ is F (5). */
export function pitchClass(letter: Letter, alter: Alter): number {
  return (SEMITONE[letter] + alter + 12) % 12;
}

/** The piano octave, C to B: white keys and the black keys with both their names (§3.5). */
export const WHITE_KEYS: readonly Letter[] = LETTERS;
export const BLACK_KEYS: readonly { pc: number; after: number; sharp: Letter; flat: Letter }[] = [
  { pc: 1, after: 1, sharp: 'C', flat: 'D' },
  { pc: 3, after: 2, sharp: 'D', flat: 'E' },
  { pc: 6, after: 4, sharp: 'F', flat: 'G' },
  { pc: 8, after: 5, sharp: 'G', flat: 'A' },
  { pc: 10, after: 6, sharp: 'A', flat: 'B' },
];
