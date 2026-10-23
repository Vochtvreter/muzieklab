import { describe, expect, it } from 'vitest';
import { getMeter } from '../../core/api';
import { parseBars } from '../../render/notationText';
import { parsePitch } from '../learn/chapters';
import { beatsIn, markedMidis, rhythmTimeline, staffMidis } from './learnSound';

const timed = (meter: '2/4' | '3/4' | '4/4', bars: string[], tempo = 60): [number, number][] =>
  rhythmTimeline(getMeter(meter), parseBars(getMeter(meter), bars), tempo).notes.map((n) => [n.onset, n.end]);

describe('rhythmTimeline', () => {
  it('times each note from the start of its bar, at the tempo, and keeps rests silent', () => {
    expect(timed('4/4', ['q qr h'])).toEqual([
      [0, 1],
      [2, 4],
    ]);
    const t = rhythmTimeline(getMeter('3/4'), parseBars(getMeter('3/4'), ['h q', 'W']), 80);
    expect(t.totalSeconds).toBeCloseTo(4.5);
    expect(t.beatSeconds).toBeCloseTo(0.75);
    expect(t.notes.map((n) => n.onset)).toEqual([0, 1.5]);
  });

  it('sounds tied notes as one, also across the bar line', () => {
    expect(timed('4/4', ['q q q q~', 'q q h'])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 5],
      [5, 6],
      [6, 8],
    ]);
    expect(timed('2/4', ['q~ 8 8'])).toEqual([
      [0, 1.5],
      [1.5, 2],
    ]);
  });

  it('plays dotted notes and triplets at their length', () => {
    expect(timed('2/4', ['q. 8'])).toEqual([
      [0, 1.5],
      [1.5, 2],
    ]);
    const triplet = timed('4/4', ['[8t 8t 8t] q [8t 8t 8t] q']).slice(0, 3);
    triplet.forEach(([on], i) => expect(on).toBeCloseTo(i / 3));
  });
});

describe('beatsIn', () => {
  it('counts the beats in four seconds: 4 at 60 BPM, 8 at 120 BPM', () => {
    expect(beatsIn(60, 4)).toBe(4);
    expect(beatsIn(120, 4)).toBe(8);
  });
});

describe('staffMidis', () => {
  const notes = (text: string) => text.split(' ').map((x) => parsePitch(x)!);

  it('plays a scale up from its written notes, signs included', () => {
    expect(staffMidis(notes('C4 D4 E4 F4 G4 A4 B4 C5'), 'C', true)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(staffMidis(notes('A4 B4 C5 D5 E5 F#5 G#5 A5'), 'C', true)).toEqual([69, 71, 72, 74, 76, 78, 80, 81]);
  });

  it('takes the key signature for a note without a sign, and a natural cancels it', () => {
    expect(staffMidis(notes('F4 G4 F5'), 'G', false)).toEqual([66, 67, 78]);
    expect(staffMidis(notes('F5 Fn5 F5'), 'G', false)).toEqual([78, 77, 78]);
  });

  it('keeps a sign until the bar ends', () => {
    expect(staffMidis(notes('F#4 G4 F4'), 'C', true)).toEqual([66, 67, 66]);
    expect(staffMidis(notes('F#4 G4 F4'), 'C', false)).toEqual([66, 67, 65]);
  });
});

describe('markedMidis', () => {
  it('plays the marked keys in order, each above the one before', () => {
    expect(markedMidis(['E', 'F', 'B', 'C'])).toEqual([64, 65, 71, 72]);
    expect(markedMidis(['C', 'E', 'G'])).toEqual([60, 64, 67]);
    expect(markedMidis([])).toEqual([]);
  });
});
