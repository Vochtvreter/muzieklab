/**
 * Message lookup (DESIGN.md §11). Every user-facing string, including aria labels, goes through t().
 *
 * Every `<code>.json` in this folder is a locale, found at build time: adding a language is one new catalog with the
 * same keys as en.json (its own name under `meta.name`), and Settings → Language lists it. Missing keys fall back to
 * English; i18n.test.ts checks that every catalog has every key and uses only the params English has.
 */
import { formatMessage, type MessageParams } from './format';

export type { MessageParams } from './format';

type Catalog = { [key: string]: string | Catalog };

/** The fallback catalog: always complete, and the one that is shown when nothing else matches. */
export const DEFAULT_LOCALE = 'en';

const files = import.meta.glob<Catalog>('./*.json', { eager: true, import: 'default' });
const catalogs: Record<string, Catalog> = {};
for (const [path, catalog] of Object.entries(files)) catalogs[path.slice(2, -'.json'.length)] = catalog;

export interface LocaleInfo {
  /** BCP 47 code, the catalog's file name: "en", "nl". */
  code: string;
  /** The language's name in that language ("Nederlands"), as the picker shows it. */
  name: string;
}

/** Every available locale, English first, then by code. */
export const LOCALES: LocaleInfo[] = Object.keys(catalogs)
  .sort((a, b) => (a === DEFAULT_LOCALE ? -1 : b === DEFAULT_LOCALE ? 1 : a.localeCompare(b)))
  .map((code) => ({ code, name: lookup('meta.name', catalogs[code]) ?? code }));

export const isLocale = (code: unknown): code is string => typeof code === 'string' && Object.hasOwn(catalogs, code);

/**
 * The locale to show: the chosen one, else the first of the device's languages we have ("nl-BE" matches "nl"),
 * else English.
 */
export function resolveLocale(choice: string, preferred: readonly string[] = deviceLanguages()): string {
  if (isLocale(choice)) return choice;
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    const exact = Object.keys(catalogs).find((c) => c.toLowerCase() === lower);
    if (exact) return exact;
    const base = lower.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function deviceLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

let locale = DEFAULT_LOCALE;
const warned = new Set<string>();
/** Messages without params, formatted once per locale: Play looks up a couple of dozen on every frame. */
const plain = new Map<string, string>();

export function getLocale(): string {
  return locale;
}

/** Switches the active catalog and the document's lang attribute. */
export function setLocale(next: string): void {
  if (!catalogs[next]) return;
  if (next !== locale) plain.clear();
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
  return lookup(key, catalogs[locale]) !== undefined || lookup(key, catalogs[DEFAULT_LOCALE]) !== undefined;
}

/** Translate `key` with ICU-style params. Falls back to English, then to the key itself. */
export function t(key: string, params?: MessageParams): string {
  if (params === undefined) {
    const hit = plain.get(key);
    if (hit !== undefined) return hit;
  }
  const msg = lookup(key, catalogs[locale]) ?? lookup(key, catalogs[DEFAULT_LOCALE]);
  if (msg === undefined) {
    if (!warned.has(key) && typeof console !== 'undefined') {
      warned.add(key);
      console.warn('[i18n] missing message:', key);
    }
    return key;
  }
  const out = formatMessage(msg, params, locale);
  if (params === undefined) plain.set(key, out);
  return out;
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

/** Locale-aware long date, e.g. "October 12, 2026". */
export function formatLongDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

/** Locale-aware day and time of an ISO date-time, e.g. "October 30, 2026 at 10:00 AM" (when a link stops working). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(d);
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

/** A yyyy-mm-dd date for the daily challenge: short month ("Oct"), day ("15"), short ("Oct 15") and long ("October 15"). */
export function dateParts(iso: string): { month: string; day: string; short: string; long: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return { month: '', day: iso, short: iso, long: iso };
  const f = (o: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat(locale, o).format(d);
  return { month: f({ month: 'short' }), day: f({ day: 'numeric' }), short: formatShortDate(iso), long: f({ month: 'long', day: 'numeric' }) };
}
