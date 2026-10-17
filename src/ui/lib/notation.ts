/** Text alternative for the staff (DESIGN.md §11): "Rhythm in 4/4. Bar 1: quarter note, quarter note, half note." */
import type { MeterId, NotatedBar, NotatedSymbol, NoteValue } from '../../core/api';
import { t } from '../../i18n';

const CAP: Record<NoteValue, string> = {
  whole: 'Whole',
  half: 'Half',
  quarter: 'Quarter',
  eighth: 'Eighth',
  sixteenth: 'Sixteenth',
};

/** Message key for one symbol, matching the engine's value/rest keys (value.dottedQuarter, rest.eighth, …). */
export function symbolKey(s: NotatedSymbol): string {
  if (s.kind === 'rest') return s.dots ? 'rest.dotted' + CAP[s.value] : 'rest.' + s.value;
  if (s.tuplet) return 'value.triplet' + CAP[s.value];
  return s.dots ? 'value.dotted' + CAP[s.value] : 'value.' + s.value;
}

export function describeSymbol(s: NotatedSymbol): string {
  if (s.wholeBarRest) return t('notation.wholeBarRest');
  const name = t(symbolKey(s));
  return s.tieToNext ? t('notation.tied', { name }) : name;
}

export function describeBars(bars: NotatedBar[], meter: MeterId, firstBar = 1): string {
  if (bars.length === 0) return t('notation.empty');
  const parts = bars.map((b, i) =>
    t('notation.bar', {
      n: firstBar + i,
      items: b.symbols.map(describeSymbol).reduce((a, c) => (a ? t('common.commaList', { a, b: c }) : c), ''),
    }),
  );
  return t('notation.label', { meter, bars: parts.join(' ') });
}
