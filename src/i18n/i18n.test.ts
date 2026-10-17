import { describe, expect, it } from 'vitest';
import en from './en.json';
import { formatMessage } from './format';
import { hasMessage, t, tipText, translateParams, tx } from './index';

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
