import { afterEach, describe, expect, it } from 'vitest';
import en from './en.json';
import { formatMessage } from './format';
import { getLocale, hasMessage, isLocale, LOCALES, resolveLocale, setLocale, t, tipText, translateParams, tx } from './index';
import { orList } from '../ui/lib/format';
import { majorName, spokenName } from '../ui/lib/noteText';

describe('formatMessage', () => {
  it('fills variables and leaves plain text alone', () => {
    expect(formatMessage('Bar {bar} of {total}', { bar: 3, total: 4 })).toBe('Bar 3 of 4');
    expect(formatMessage('No braces here')).toBe('No braces here');
    expect(formatMessage('Missing {x}')).toBe('Missing ');
  });

  it('picks plural branches, with exact matches first and # as the number', () => {
    const msg = '{count, plural, =0 {No streak yet} one {#-day streak} other {#-day streak}}';
    expect(formatMessage(msg, { count: 0 })).toBe('No streak yet');
    expect(formatMessage(msg, { count: 1 })).toBe('1-day streak');
    expect(formatMessage(msg, { count: 12 })).toBe('12-day streak');
    expect(formatMessage('{n, plural, one {# bar} other {# bars}}', { n: 2 })).toBe('2 bars');
  });

  it('supports select and nesting inside branches', () => {
    const msg = '{kind, select, rest {{value} rest} other {{value} note}}';
    expect(formatMessage(msg, { kind: 'rest', value: 'quarter' })).toBe('quarter rest');
    expect(formatMessage(msg, { kind: 'x', value: 'half' })).toBe('half note');
    expect(formatMessage('{k, select, value.eighth {an} other {a}}', { k: 'value.eighth' })).toBe('an');
  });

  it('formats numbers without grouping', () => {
    expect(formatMessage('{v}%', { v: 79 })).toBe('79%');
    expect(formatMessage('{v}', { v: 1234.5 })).toBe('1234.5');
  });
});

describe('t()', () => {
  it('looks up dotted keys in the catalog', () => {
    expect(t('nav.home')).toBe('Home');
    expect(t('common.bars', { count: 1 })).toBe('1 bar');
    expect(t('common.bars', { count: 4 })).toBe('4 bars');
    expect(t('path.u7.l3')).toBe('Dotted quarter + eighth');
  });

  it('returns the key for a missing message', () => {
    expect(t('nope.not.here')).toBe('nope.not.here');
    expect(hasMessage('nope.not.here')).toBe(false);
  });

  it('tx() passes plain text through and translates keys', () => {
    expect(tx('path.u1.title')).toBe('Quarter and half notes');
    expect(tx('Just a title')).toBe('Just a title');
  });

  it('builds the setup hint with an article and an or-list', () => {
    expect(t('setup.needs', { meter: '3/4', first: 'value.quarter', values: 'quarter note, quarter rest or dotted half' })).toBe(
      '3/4 needs a quarter note, quarter rest or dotted half',
    );
    expect(t('setup.needs', { meter: '2/4', first: 'value.eighth', values: 'eighth note' })).toBe('2/4 needs an eighth note');
  });

  it('translates key-valued params and coaching tips', () => {
    expect(translateParams({ value: 'value.dottedQuarter', bar: 2 })).toEqual({ value: 'dotted quarter note', bar: 2 });
    const tip = tipText({
      key: 'tip.cutShort',
      params: { value: 'value.dottedQuarter', bar: 2, beat: 1, liftBeat: 2, liftPart: 'count.and', count: 1 },
    });
    expect(tip).toBe('You let go of the dotted quarter note in bar 2 too early. Hold it through “2” and lift on the “&”.');
    const onBeat = tipText({ key: 'tip.heldLong', params: { value: 'value.half', bar: 1, beat: 1, liftBeat: 3, liftPart: 'count.beat', count: 1 } });
    expect(onBeat).toBe('You held the half note in bar 1 too long. Lift on “3”.');
    expect(tipText({ key: 'tip.missed', params: { count: 1, bar: 3 } })).toBe('You missed 1 note, most in bar 3. Read one beat ahead.');
  });

  it('has every value and rest key the engine can produce', () => {
    const caps = ['Whole', 'Half', 'Quarter', 'Eighth', 'Sixteenth'];
    for (const v of ['whole', 'half', 'quarter', 'eighth', 'sixteenth']) {
      expect(hasMessage('value.' + v)).toBe(true);
      expect(hasMessage('rest.' + v)).toBe(true);
    }
    for (const c of caps.slice(0, 4)) {
      expect(hasMessage('value.dotted' + c)).toBe(true);
      expect(hasMessage('rest.dotted' + c)).toBe(true);
    }
    expect(hasMessage('value.tripletEighth')).toBe(true);
    for (const k of ['beat', 'e', 'and', 'a', 'trip', 'let']) expect(hasMessage('count.' + k)).toBe(true);
  });

  it('has unit and lesson titles for the whole MVP path', () => {
    const path = (en as { path: Record<string, unknown> }).path;
    for (let u = 1; u <= 8; u++) {
      expect(hasMessage(`path.u${u}.title`)).toBe(true);
      for (let l = 1; l <= 5; l++) expect(hasMessage(`path.u${u}.l${l}`)).toBe(true);
    }
    expect(path).toBeDefined();
  });
});

type Tree = { [key: string]: string | Tree };
const catalogs = import.meta.glob<Tree>('./*.json', { eager: true, import: 'default' });

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else for (const [kk, vv] of flatten(v, prefix + k + '.')) out.set(kk, vv);
  }
  return out;
}

/** Index of the `}` closing the `{` at `from`; throws when there is none. */
function closing(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced { in: ' + s);
}

/** The argument names a message uses, inside plural and select branches too; throws on an unbalanced brace. */
function argNames(msg: string, into = new Set<string>()): Set<string> {
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] === '}') throw new Error('unbalanced } in: ' + msg);
    if (msg[i] !== '{') continue;
    const end = closing(msg, i);
    const body = msg.slice(i + 1, end);
    const parts = body.split(',');
    into.add(parts[0].trim());
    if (parts.length >= 3) {
      // `name, plural|select, key {branch} key {branch}`: each branch is a message of its own.
      const branches = parts.slice(2).join(',');
      for (let j = branches.indexOf('{'); j >= 0; j = branches.indexOf('{', closing(branches, j))) {
        argNames(branches.slice(j + 1, closing(branches, j)), into);
      }
    }
    i = end;
  }
  return into;
}

describe('locales', () => {
  const english = flatten(en as Tree);

  it('finds every catalog in src/i18n, each named in its own language', () => {
    expect(LOCALES.map((l) => l.code)).toEqual(expect.arrayContaining(['en', 'nl']));
    expect(LOCALES[0]).toEqual({ code: 'en', name: 'English' });
    expect(LOCALES.find((l) => l.code === 'nl')?.name).toBe('Nederlands');
  });

  for (const [path, catalog] of Object.entries(catalogs)) {
    const code = path.slice(2, -'.json'.length);
    if (code === 'en') continue;
    const messages = flatten(catalog);

    it(`${code}: has every key English has, and no others`, () => {
      expect([...english.keys()].filter((k) => !messages.has(k)), 'missing').toEqual([]);
      expect([...messages.keys()].filter((k) => !english.has(k)), 'not in English').toEqual([]);
    });

    it(`${code}: uses only the params English passes, with balanced braces`, () => {
      const wrong: string[] = [];
      for (const [key, msg] of messages) {
        const known = argNames(english.get(key) ?? '');
        for (const name of argNames(msg)) if (!known.has(name)) wrong.push(`${key}: {${name}}`);
      }
      expect(wrong).toEqual([]);
    });
  }

  it('resolves the chosen language, else the device language, else English', () => {
    expect(resolveLocale('nl', ['en-US'])).toBe('nl');
    expect(resolveLocale('system', ['nl-BE', 'en'])).toBe('nl');
    expect(resolveLocale('system', ['fr-FR', 'nl'])).toBe('nl');
    expect(resolveLocale('system', ['fr-FR'])).toBe('en');
    expect(resolveLocale('system', [])).toBe('en');
    expect(resolveLocale('xx', ['NL'])).toBe('nl');
    expect(isLocale('nl')).toBe(true);
    expect(isLocale('system')).toBe(false);
  });
});

describe('Dutch', () => {
  afterEach(() => setLocale('en'));

  it('switches the catalog, plurals and the lang attribute', () => {
    setLocale('nl');
    expect(getLocale()).toBe('nl');
    expect(t('nav.settings')).toBe('Instellingen');
    expect(t('common.bars', { count: 1 })).toBe('1 maat');
    expect(t('common.bars', { count: 4 })).toBe('4 maten');
    expect(t('streak.pill', { count: 0 })).toBe('Nog geen reeks');
    expect(orList(['value.quarter', 'rest.quarter', 'value.dottedHalf'])).toBe('kwartnoot, kwartrust of gepunteerde halve');
  });

  it('names sharps and flats the Dutch way for screen readers', () => {
    setLocale('nl');
    expect(spokenName('F', 1)).toBe('fis');
    expect(spokenName('B', -1)).toBe('bes');
    expect(spokenName('E', -1)).toBe('es');
    expect(spokenName('A', -1)).toBe('as');
    expect(spokenName('C', 0)).toBe('C');
    expect(majorName('G')).toBe('G majeur');
  });

  it('counts “1 en 2 en” in coaching tips', () => {
    setLocale('nl');
    const tip = tipText({
      key: 'tip.cutShort',
      params: { value: 'value.dottedQuarter', bar: 2, beat: 1, liftBeat: 2, liftPart: 'count.and', count: 1 },
    });
    expect(tip).toBe('Je liet de gepunteerde kwartnoot in maat 2 te vroeg los. Houd hem vast tot en met “2” en laat los op “en”.');
  });

  it('falls back to English for a key a catalog lacks', () => {
    setLocale('nl');
    expect(hasMessage('nope.not.here')).toBe(false);
    setLocale('xx');
    expect(getLocale()).toBe('nl');
  });
});
