/** Test-only helpers: hand-built exercises, random settings, synthetic taps. */
import fc from 'fast-check';
import type { Bar, Exercise, MeterId, NoteValue, RhythmEvent, Settings, Tap, Timeline } from './types';
import { METER_IDS, NOTE_VALUES } from './types';
import { DEFAULT_SETTINGS } from './defaults';
import { getMeter } from './meters';

/** Bars from [duration, kind, flags] tuples; 'n' = note, 'r' = rest, flags: 't' tie from previous, '3' triplet. */
export function makeExercise(meter: MeterId, bars: [number, 'n' | 'r', string?][][], patch: Partial<Settings> = {}, tempo = 60): Exercise {
  const m = getMeter(meter);
  const out: Bar[] = bars.map((evs) => {
    let t = 0;
    const events = evs.map(([duration, k, flags = '']): RhythmEvent => {
      const e: RhythmEvent = { start: t, duration, kind: k === 'n' ? 'note' : 'rest' };
      if (flags.includes('t')) e.tieFromPrev = true;
      if (flags.includes('3')) e.triplet = true;
      t += duration;
      return e;
    });
    if (t !== m.barTicks) throw new Error('bar does not sum: ' + t);
    return { events };
  });
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    meters: [meter],
    notes: [...NOTE_VALUES],
    rests: [...NOTE_VALUES],
    dotted: true,
    ties: true,
    triplets: true,
    tempo,
    bars: bars.length,
    ...patch,
  };
  return { seed: 0, settings, meter: m, tempo, bars: out, form: 'a', difficulty: 0 };
}

const subset = <T>(items: readonly T[]): fc.Arbitrary<T[]> =>
  fc.array(fc.boolean(), { minLength: items.length, maxLength: items.length }).map((bits) => items.filter((_, i) => bits[i]));

export const settingsArb: fc.Arbitrary<Settings> = fc.record({
  hold: fc.boolean(),
  meters: subset(METER_IDS).filter((m) => m.length > 0),
  notes: subset<NoteValue>(NOTE_VALUES),
  rests: subset<NoteValue>(NOTE_VALUES),
  dotted: fc.boolean(),
  ties: fc.boolean(),
  triplets: fc.boolean(),
  bars: fc.integer({ min: 1, max: 16 }),
  tempo: fc.integer({ min: 40, max: 200 }),
  metronome: fc.constantFrom('on' as const, 'accent' as const, 'off' as const),
  countIn: fc.constantFrom(0 as const, 1 as const, 2 as const),
  density: fc.constantFrom('sparse' as const, 'balanced' as const, 'busy' as const),
  restAmount: fc.constantFrom('few' as const, 'some' as const, 'many' as const),
});

export const seedArb = fc.integer({ min: 0, max: 0x7fffffff });

/** Taps that are exactly right: press on the onset, lift at the end (just before, when a note follows). */
export function perfectTaps(timeline: Timeline): Tap[] {
  return timeline.notes.map((n) => ({ down: n.onset, up: n.next === 'note' ? n.end - 0.005 : n.end }));
}
