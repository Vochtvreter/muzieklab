import { describe, expect, it } from 'vitest';
import { getMeter, type MeterId } from '../core/api';
import { countBar, countText, plainSyllable } from './counting';
import { parseBars } from './notationText';

const count = (meter: MeterId, bars: string[]): string[] => {
  const m = getMeter(meter);
  return parseBars(m, bars).map((bar) => countText(countBar(m, bar.symbols), plainSyllable).join(' '));
};

describe('countBar', () => {
  it('counts beats, and holds long notes in brackets', () => {
    expect(count('4/4', ['q q q q', 'h h', 'w'])).toEqual(['1 2 3 4', '1 (2) 3 (4)', '1 (2 3 4)']);
    expect(count('3/4', ['h.'])).toEqual(['1 (2 3)']);
  });

  it('counts rests silent, and a whole-bar rest for the whole bar', () => {
    expect(count('4/4', ['q qr [8 8r] q'])).toEqual(['1 (2) 3 (&) 4']);
    expect(count('4/4', ['q qr qr q'])).toEqual(['1 (2) (3) 4']);
    expect(count('3/4', ['W'])).toEqual(['(1 2 3)']);
  });

  it('counts each beat as finely as its notes need', () => {
    expect(count('4/4', ['[8 8] [8 8] q q'])).toEqual(['1 & 2 & 3 4']);
    expect(count('4/4', ['[16 16 16 16] [8 8] [8 16 16] q'])).toEqual(['1 e & a 2 & 3 & a 4']);
    expect(count('2/4', ['[16 16 8] [8. 16]'])).toEqual(['1 e & 2 (&) a']);
    expect(count('4/4', ['[8t 8t 8t] q [8t 8t 8t] q'])).toEqual(['1 trip let 2 3 trip let 4']);
    expect(count('2/4', ['[16 8.] [8 8r]'])).toEqual(['1 e (&) 2 (&)']);
  });

  it('holds dotted notes, syncopations and ties', () => {
    expect(count('4/4', ['q. 8 h'])).toEqual(['1 (2) & 3 (4)']);
    expect(count('4/4', ['8 q 8 q q'])).toEqual(['1 & (2) & 3 4']);
    expect(count('4/4', ['q q q q~', 'q h.'])).toEqual(['1 2 3 4', '(1) 2 (3 4)']);
  });
});
