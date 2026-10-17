/**
 * A small ICU-style message formatter (DESIGN.md §11): `{name}` variables, `{n, plural, …}` with `=N`,
 * `zero/one/two/few/many/other` and `#`, and `{x, select, … other {…}}`. Nesting works inside branches.
 * Pure: the catalog and locale are passed in, so it is easy to test.
 */
export type MessageParams = Record<string, string | number | boolean | null | undefined>;

export function formatMessage(message: string, params: MessageParams = {}, locale = 'en'): string {
  return render(message, params, locale, null);
}

function render(msg: string, params: MessageParams, locale: string, hash: string | null): string {
  let out = '';
  let i = 0;
  while (i < msg.length) {
    const ch = msg[i];
    if (ch === '{') {
      const end = matchBrace(msg, i);
      if (end < 0) {
        out += msg.slice(i);
        break;
      }
      out += renderArg(msg.slice(i + 1, end), params, locale);
      i = end + 1;
    } else if (ch === '#' && hash !== null) {
      out += hash;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Index of the `}` matching the `{` at `start`, or -1. */
function matchBrace(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function renderArg(body: string, params: MessageParams, locale: string): string {
  const firstComma = body.indexOf(',');
  if (firstComma < 0) return formatValue(params[body.trim()], locale);
  const name = body.slice(0, firstComma).trim();
  const rest = body.slice(firstComma + 1);
  const secondComma = rest.indexOf(',');
  const type = (secondComma < 0 ? rest : rest.slice(0, secondComma)).trim();
  const options = parseOptions(secondComma < 0 ? '' : rest.slice(secondComma + 1));
  const value = params[name];
  if (type === 'plural') {
    const n = typeof value === 'number' ? value : Number(value ?? 0);
    const exact = options.get('=' + n);
    const branch = exact ?? options.get(pluralCategory(n, locale)) ?? options.get('other') ?? '';
    return render(branch, params, locale, formatValue(n, locale));
  }
  if (type === 'select') {
    const key = String(value);
    return render(options.get(key) ?? options.get('other') ?? '', params, locale, null);
  }
  return formatValue(value, locale);
}

/** `one {…} other {…}` -> Map. */
function parseOptions(s: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    let key = '';
    while (i < s.length && s[i] !== '{' && !/\s/.test(s[i])) key += s[i++];
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== '{') break;
    const end = matchBrace(s, i);
    if (end < 0) break;
    map.set(key, s.slice(i + 1, end));
    i = end + 1;
  }
  return map;
}

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralCategory(n: number, locale: string): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(n);
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function formatValue(v: MessageParams[string], locale: string): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    let nf = numberFormats.get(locale);
    if (!nf) {
      nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false });
      numberFormats.set(locale, nf);
    }
    return nf.format(v);
  }
  return String(v);
}
