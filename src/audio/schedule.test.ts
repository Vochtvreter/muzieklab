import fc from 'fast-check';
import type { Timeline } from '../core/types';
import {
  clickAudible,
  clickTimes,
  dueUntil,
  exerciseStartTime,
  perfToAudioTime,
  planBeats,
  planNotes,
  playBeatCount,
} from './schedule';

const base = { startTime: 10, tempo: 120, beatsPerBar: 4, countInBars: 1, playBeats: 8, metronome: 'on' as const };

describe('planBeats', () => {
  it('lays out the count-in then the exercise, half a second apart at 120 BPM', () => {
    const beats = planBeats(base);
    expect(beats).toHaveLength(12);
    expect(beats.map((b) => b.index)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(beats.map((b) => b.inBar)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
    expect(beats.slice(0, 4).every((b) => b.countIn)).toBe(true);
    expect(beats.slice(4).every((b) => !b.countIn)).toBe(true);
    beats.forEach((b, i) => expect(b.time).toBeCloseTo(10 + i * 0.5));
    expect(beats[4].time).toBeCloseTo(exerciseStartTime(10, 120, 4, 1));
  });

  it('accents beat 1 of every bar', () => {
    const beats = planBeats({ ...base, beatsPerBar: 3, playBeats: 6, countInBars: 2 });
    expect(beats.filter((b) => b.accent).map((b) => b.index)).toEqual([-6, -3, 0, 3]);
  });

  it('follows the metronome mode during play, but always clicks the count-in', () => {
    const audible = (metronome: 'on' | 'accent' | 'off') =>
      planBeats({ ...base, metronome })
        .filter((b) => b.audible)
        .map((b) => b.index);
    expect(audible('on')).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(audible('accent')).toEqual([-4, -3, -2, -1, 0, 4]);
    expect(audible('off')).toEqual([-4, -3, -2, -1]);
    expect(clickAudible('accent', 1)).toBe(false);
  });

  it('without a count-in the exercise starts at startTime', () => {
    const beats = planBeats({ ...base, countInBars: 0, beatsPerBar: 2, playBeats: 4 });
    expect(beats[0]).toMatchObject({ index: 0, countIn: false, time: 10 });
    expect(exerciseStartTime(10, 120, 2, 0)).toBe(10);
  });

  it('beats are evenly spaced and indices are consecutive (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 200 }),
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 1, max: 64 }),
        (tempo, beatsPerBar, countInBars, playBeats) => {
          const beats = planBeats({ ...base, tempo, beatsPerBar, countInBars, playBeats });
          expect(beats).toHaveLength(countInBars * beatsPerBar + playBeats);
          expect(beats.filter((b) => b.countIn)).toHaveLength(countInBars * beatsPerBar);
          for (let i = 1; i < beats.length; i++) {
            expect(beats[i].time - beats[i - 1].time).toBeCloseTo(60 / tempo, 9);
            expect(beats[i].index).toBe(beats[i - 1].index + 1);
          }
        },
      ),
    );
  });
});

describe('notes and clicks', () => {
  const timeline: Timeline = {
    beatSeconds: 0.5,
    totalSeconds: 4,
    notes: [
      { index: 0, bar: 0, tick: 0, onset: 0, end: 1, durationTicks: 96, next: 'note' },
      { index: 1, bar: 0, tick: 96, onset: 1, end: 1.5, durationTicks: 48, next: 'rest' },
    ],
  };

  it('moves timeline notes onto the audio clock', () => {
    expect(planNotes(timeline, 3)).toEqual([
      { index: 0, time: 3, end: 4 },
      { index: 1, time: 4, end: 4.5 },
    ]);
    expect(playBeatCount(timeline, 120)).toBe(8);
  });

  it('click track for calibration', () => {
    expect(clickTimes(3, 60, 2)).toEqual([2, 3, 4]);
    expect(clickTimes(0, 60, 2)).toEqual([]);
  });
});

describe('dueUntil', () => {
  const items = [{ time: 1 }, { time: 1.05 }, { time: 1.2 }, { time: 2 }];
  it('returns the cursor past everything before the horizon', () => {
    expect(dueUntil(items, 0, 1.1)).toBe(2);
    expect(dueUntil(items, 2, 1.1)).toBe(2);
    expect(dueUntil(items, 2, 5)).toBe(4);
    expect(dueUntil([], 0, 5)).toBe(0);
  });
});

describe('perfToAudioTime', () => {
  it('maps event time through the anchor, minus latency and calibration', () => {
    const anchor = { perfMs: 5000, audioS: 2 };
    expect(perfToAudioTime(5250, anchor, 0, 0)).toBeCloseTo(2.25);
    expect(perfToAudioTime(4900, anchor, 0, 0)).toBeCloseTo(1.9);
    expect(perfToAudioTime(5250, anchor, 0.02, 0)).toBeCloseTo(2.23);
    expect(perfToAudioTime(5250, anchor, 0.02, 38)).toBeCloseTo(2.192);
  });
});
