import type { Meter, NotatedSymbol } from '../core/types';

/** A part of the beat, as counted: the beat number, "e", "&", "a", or "trip" / "let" in a triplet. */
export type CountPart = 'beat' | 'e' | 'and' | 'a' | 'trip' | 'let';

/** One count under the notes (DESIGN.md §9.1). */
export interface CountMark {
  /** Ticks from the start of the bar. */
  tick: number;
  /** 1-based beat in the bar. */
  beat: number;
  part: CountPart;
  /** Held through or silent: drawn grey, in brackets. */
  held: boolean;
  /** Index of the symbol sounding (or resting) at this tick. */
  symbol: number;
}

const SIXTEENTHS: CountPart[] = ['beat', 'e', 'and', 'a'];
const TRIPLETS: CountPart[] = ['beat', 'trip', 'let'];

/**
 * The counts under one bar. Each beat is counted as finely as its own notes and rests need: "1" for a beat that starts
 * one thing, "1 &" when something starts after the beat, plus "e" and "a" (sixteenths) or "trip" and "let" (triplets)
 * where something starts on them. A count on which a note starts is plain; a count held through (a long note, a tied
 * note) or silent (a rest) is held.
 *
 *   q [8 8] h  →  1  2 &  3 (4)        8 q 8  →  1 & (2) &        [8 16 16]  →  1 & a        [8. 16]  →  1 (&) a
 */
export function countBar(meter: Pick<Meter, 'beatTicks' | 'beatsPerBar'>, symbols: NotatedSymbol[]): CountMark[] {
  const bt = meter.beatTicks;
  const marks: CountMark[] = [];
  for (let b = 0; b < meter.beatsPerBar; b++) {
    const from = b * bt;
    const offsets = symbols.filter((s) => s.start >= from && s.start < from + bt).map((s) => s.start - from);
    const parts =
      offsets.some((o) => o % (bt / 2) !== 0 && o % (bt / 3) === 0) ? TRIPLETS
      : offsets.some((o) => o % (bt / 2) !== 0) ? SIXTEENTHS
      : offsets.some((o) => o === bt / 2) ? (['beat', 'and'] as CountPart[])
      : (['beat'] as CountPart[]);
    const step = bt / parts.length;
    parts.forEach((part, k) => {
      const tick = from + k * step;
      // The beat and its "&" always; "e", "a", "trip" and "let" only where something starts.
      if (k > 0 && !(parts.length > 1 && part === 'and') && !offsets.includes(k * step)) return;
      const symbol = symbols.findIndex((s) => tick >= s.start && tick < s.start + s.duration);
      if (symbol < 0) return;
      const s = symbols[symbol];
      const struck = s.kind === 'note' && s.onsetIndex >= 0 && s.start === tick;
      marks.push({ tick, beat: b + 1, part, held: !struck, symbol });
    });
  }
  return marks;
}

/**
 * The counts as text, with each run of held counts of one symbol in one pair of brackets: '1 & (2) &'. For tests and
 * descriptions; `syllable` turns a mark into its word (the beat number, "&", …).
 */
export function countText(marks: CountMark[], syllable: (m: CountMark) => string): string[] {
  return marks.map((m, i) => {
    const prev = marks[i - 1];
    const next = marks[i + 1];
    const opens = m.held && !(prev?.held && prev.symbol === m.symbol);
    const closes = m.held && !(next?.held && next.symbol === m.symbol);
    return (opens ? '(' : '') + syllable(m) + (closes ? ')' : '');
  });
}

/** English default syllables, as in `count.*` of en.json. */
export const plainSyllable = (m: CountMark): string =>
  m.part === 'beat' ? String(m.beat) : { e: 'e', and: '&', a: 'a', trip: 'trip', let: 'let' }[m.part];
