/** Wording for the Progress tab's cards and charts: dates, weekdays and spoken offsets. */
import { formatShortDate, getLocale, t } from '../../../i18n';

/** "Oct 15" ("15 okt"). */
export const shortDate = formatShortDate;

/** A day's weekday in the player's language: "M" / "Mon" / "Monday". */
export function weekday(iso: string, style: 'narrow' | 'short' | 'long'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(getLocale(), { weekday: style }).format(new Date(y, m - 1, d));
}

/** An offset in words for screen readers: "minus 52 ms", "plus 8 ms", "0 ms"; without the unit, "minus 40". */
export function spokenMs(ms: number, unit = true): string {
  const v = Math.round(ms);
  return t(unit ? 'progress.timing.spoken' : 'progress.timing.spokenNumber', { sign: v < 0 ? 'minus' : v > 0 ? 'plus' : 'zero', value: Math.abs(v) });
}
