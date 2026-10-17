/** Text alternative for the staff (DESIGN.md §11): "Rhythm in 4/4. Bar 1: quarter note, quarter note, half note." */
import { restKey, valueKey, type MeterId, type NotatedBar, type NotatedSymbol } from '../../core/api';
import { t } from '../../i18n';

/** Message key for one symbol: the engine's value/rest keys (value.dottedQuarter, rest.eighth, …). */
export function symbolKey(s: NotatedSymbol): string {
  return s.kind === 'rest' ? restKey(s.value, s.dots) : valueKey(s.value, s.dots, !!s.tuplet);
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
