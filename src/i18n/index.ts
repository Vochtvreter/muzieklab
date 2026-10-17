/**
 * Message lookup (DESIGN.md §11). Every user-facing string, including aria labels, goes through t().
 * v1 ships English only; another locale is a new JSON catalog plus a setLocale() call.
 */
import en from './en.json';
import { formatMessage, type MessageParams } from './format';

export type { MessageParams } from './format';

type Catalog = { [key: string]: string | Catalog };

const catalogs: Record<string, Catalog> = { en: en as Catalog };
let locale = 'en';
const warned = new Set<string>();

export function getLocale(): string {
  return locale;
}

/** Switches the active catalog and the document's lang attribute. */
export function setLocale(next: string): void {
  if (!catalogs[next]) return;
  locale = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

function lookup(key: string, cat: Catalog | undefined): string | undefined {
  let node: string | Catalog | undefined = cat;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** True when `key` names a message in the active catalog (or English). */
export function hasMessage(key: string): boolean {
  return lookup(key, catalogs[locale]) !== undefined || lookup(key, catalogs.en) !== undefined;
}

/** Translate `key` with ICU-style params. Falls back to English, then to the key itself. */
export function t(key: string, params?: MessageParams): string {
  const msg = lookup(key, catalogs[locale]) ?? lookup(key, catalogs.en);
  if (msg === undefined) {
    if (!warned.has(key) && typeof console !== 'undefined') {
      warned.add(key);
      console.warn('[i18n] missing message:', key);
    }
    return key;
  }
  return formatMessage(msg, params, locale);
}

/**
 * For data that holds either a message key or plain text (e.g. lesson titles in game/path.ts):
 * translate when it is a key, otherwise return it unchanged.
 */
export function tx(keyOrText: string, params?: MessageParams): string {
  return hasMessage(keyOrText) ? t(keyOrText, params) : keyOrText;
}

/** Locale-aware short date, e.g. "Oct 12". */
export function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

/** Params whose values are message keys (e.g. an engine's `value: 'value.dottedQuarter'`) translated to text. */
export function translateParams(params: Record<string, string | number>): MessageParams {
  const out: MessageParams = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === 'string' && hasMessage(v) ? t(v, params) : v;
  return out;
}

/**
 * A coaching tip from core/coach: key-valued params are translated, and `liftPart` (a count.* key) is also passed
 * through as `liftPartKey` so messages can choose wording (“lift on 3” vs “lift on the &”). count.beat shows the beat.
 */
export function tipText(tip: { key: string; params: Record<string, string | number> }): string {
  const p = tip.params;
  const extra: Record<string, string | number> = typeof p.liftPart === 'string' ? { liftPartKey: p.liftPart, beat: p.liftBeat ?? '' } : {};
  return t(tip.key, { ...translateParams({ ...p, ...extra }), liftPartKey: extra.liftPartKey });
}
