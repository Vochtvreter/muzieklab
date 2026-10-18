import { PPQ, type Meter, type NotatedBar, type NotatedSymbol, type NoteValue } from '../core/types';

/**
 * Rhythm written as text, for hand-made examples (Learn pages, the render demo). One string per bar, tokens split by
 * spaces:
 *   w h q 8 16   value       .  dotted      r  rest       ~  tie to next      t  triplet eighth (groups of 3)
 *   W            whole-bar rest (centred)   [ ... ]  a beam group
 * So 'q [8 8] h' is a quarter, two beamed eighths and a half note.
 */

const TICKS: Record<string, NoteValue> = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': 'sixteenth' };
const VALUE_TICKS: Record<NoteValue, number> = { whole: 4 * PPQ, half: 2 * PPQ, quarter: PPQ, eighth: PPQ / 2, sixteenth: PPQ / 4 };

/** Parses bars written as tokens (see above) into NotatedBars with onset indices. */
export function parseBars(meter: Meter, bars: string[]): NotatedBar[] {
  let onset = 0;
  let tiedIn = false;
  let beamId = 0;
  let tupletId = 0;
  return bars.map((src) => {
    let tick = 0;
    let beam: number | undefined;
    let tripletCount = 0;
    const symbols: NotatedSymbol[] = [];
    for (const raw of src.trim().split(/\s+/)) {
      let tok = raw;
      if (tok.startsWith('[')) { beam = ++beamId; tok = tok.slice(1); }
      const closes = tok.endsWith(']');
      if (closes) tok = tok.slice(0, -1);
      if (tok === 'W') {
        symbols.push({ value: 'whole', dots: 0, kind: 'rest', tieToNext: false, start: 0, duration: meter.barTicks, onsetIndex: -1, wholeBarRest: true });
        tick = meter.barTicks;
        continue;
      }
      const m = /^(w|h|q|8|16)(t?)(\.?)(r?)(~?)$/.exec(tok);
      if (!m) throw new Error('bad token ' + raw);
      const value = TICKS[m[1]];
      const dots = m[3] ? 1 : 0;
      const kind = m[4] ? 'rest' : 'note';
      let duration = VALUE_TICKS[value] * (dots ? 1.5 : 1);
      let tuplet: NotatedSymbol['tuplet'];
      if (m[2]) {
        if (tripletCount % 3 === 0) tupletId++;
        tripletCount++;
        tuplet = { num: 3, den: 2, id: tupletId };
        duration = (duration * 2) / 3;
      }
      const isOnset = kind === 'note' && !tiedIn;
      symbols.push({
        value, dots, kind, tieToNext: !!m[5], beamGroup: beam, tuplet, start: tick, duration,
        onsetIndex: isOnset ? onset++ : -1,
      });
      tiedIn = kind === 'note' && !!m[5];
      tick += duration;
      if (closes) beam = undefined;
    }
    return { symbols };
  });
}
