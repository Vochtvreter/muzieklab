/**
 * What a Learn example sounds like (DESIGN.md §9.1): a rhythm as the engine plays it, the beats of the pulse, and a
 * staff's or a piano diagram's notes as MIDI numbers. Pure, so it is unit tested; the play buttons in
 * `ui/learn/Listen.tsx` hand the result to the audio engine.
 */
import { buildTimeline, DEFAULT_SETTINGS, keyAlter, letterOf, midiOf, pitchClass, type KeyId, type Letter, type Meter, type NotatedBar, type ScaleAlter, type Timeline } from '../../core/api';

/** Tempo of a rhythm example that names none: moderate, so each note and count can be followed. */
export const LEARN_TEMPO = 80;
/** Seconds between the notes of a staff or the marked keys, played one after the other. */
export const NOTE_GAP_S = 0.42;
/** The piano diagram's octave starts at middle C. */
export const PIANO_C = 60;

/** A rhythm drawn as notation, timed at `tempo`: tied notes sound as one, rests are silent. */
export function rhythmTimeline(meter: Meter, bars: NotatedBar[], tempo: number): Timeline {
  let tied = false;
  const events = bars.map((bar) => ({
    events: bar.symbols.map((s) => {
      const e = { start: s.start, duration: s.duration, kind: s.kind, tieFromPrev: s.kind === 'note' && tied };
      tied = s.kind === 'note' && s.tieToNext;
      return e;
    }),
  }));
  return buildTimeline({ seed: 0, settings: DEFAULT_SETTINGS, meter, tempo, bars: events, form: '', difficulty: 0 });
}

/** Beats in `seconds` at `bpm`: the dots of the pulse block and the clicks its play button plays. */
export const beatsIn = (bpm: number, seconds: number): number => Math.round((bpm * seconds) / 60);

/**
 * A staff's notes as MIDI numbers, left to right. A note without a sign takes the key signature's; in one bar (a
 * scale) a sign holds for the same line or space until the bar ends, as 9.4 teaches.
 */
export function staffMidis(notes: { step: number; sign: ScaleAlter | null }[], keyId: KeyId, oneBar: boolean): number[] {
  const held = new Map<number, number>();
  return notes.map((n) => {
    if (!oneBar) held.clear();
    if (n.sign !== null) held.set(n.step, n.sign);
    return midiOf(n.step, held.get(n.step) ?? keyAlter(keyId, letterOf(n.step)));
  });
}

/** Marked piano keys in the order written, each above the one before: E F B C plays E4 F4 B4 C5, the two half steps. */
export function markedMidis(marked: readonly string[]): number[] {
  let last = -Infinity;
  return marked.map((L) => {
    let m = PIANO_C + pitchClass(L as Letter, 0);
    while (m <= last) m += 12;
    last = m;
    return m;
  });
}
