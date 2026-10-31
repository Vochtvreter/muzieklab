/**
 * Sound in Learn (DESIGN.md §9.1): the round play button beside a rhythm, the pulse, a scale or a piano, and the sounds
 * they start. One example sounds at a time: starting one stops the other, and leaving the chapter stops it. Each sound
 * starts from the tap (iOS needs the gesture) at the Sound volumes set in Settings.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { AudioEngine } from '../../audio/engine';
import type { Meter, NotatedBar } from '../../core/api';
import { t } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { Icon } from '../components/Icon';
import { NOTE_GAP_S, rhythmTimeline } from '../lib/learnSound';
import { useStore } from '../store';

/** Schedules a sound on the engine and returns how many seconds it lasts. */
export type Sound = (eng: AudioEngine) => number;

/** A struck piano tone dies away over this long (the engine's pianoTone). */
const TONE_S = 1.3;
/** Room after the last click before the button turns back to Play. */
const TAIL_S = 0.25;

/** The example sounding now (a useId of its block), shared by every block on the page. */
let current: string | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const setCurrent = (id: string | null): void => {
  current = id;
  for (const cb of [...listeners]) cb();
};

/** Stops the Learn example that is sounding, if any (another one starts, the chapter closes). */
export function stopLearnSound(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  if (current === null) return;
  engine().stop();
  setCurrent(null);
}

export interface LearnSound {
  /** The example sounding now, or null. */
  playing: string | null;
  /** Play button: starts `id`'s sound, or stops it when it is the one sounding. */
  toggle(id: string, sound: Sound): void;
  /** A piano key: sounds at once, over whatever example was playing. */
  tap(sound: Sound): void;
}

export function useLearnSound(): LearnSound {
  const { state } = useStore();
  const prefs = state.prefs;
  const playing = useSyncExternalStore(subscribe, () => current, () => null);
  const begin = useCallback(
    (sound: Sound): number => {
      stopLearnSound();
      unlockAudio();
      const eng = engine();
      applyAudioPrefs(prefs, eng);
      return sound(eng);
    },
    [prefs],
  );
  const toggle = useCallback(
    (id: string, sound: Sound) => {
      if (current === id) return stopLearnSound();
      const seconds = begin(sound);
      setCurrent(id);
      timer = window.setTimeout(() => {
        timer = null;
        setCurrent(null);
      }, Math.max(0, seconds) * 1000);
    },
    [begin],
  );
  const tap = useCallback((sound: Sound) => void begin(sound), [begin]);
  return { playing, toggle, tap };
}

/** The rhythm on the woodblock with the beat clicking, after one bar of count-in. */
export const rhythmSound =
  (meter: Meter, bars: NotatedBar[], tempo: number): Sound =>
  (eng) => {
    const timeline = rhythmTimeline(meter, bars, tempo);
    const { end } = eng.start({ timeline, meter, tempo, countInBars: 1, metronome: 'on', playRhythm: true, leadIn: 0.15 });
    return end - eng.now() + TAIL_S;
  };

/** `count` beat clicks at `bpm`. */
export const clickSound =
  (count: number, bpm: number): Sound =>
  (eng) => {
    const times = eng.clicks(count, bpm, 0.15);
    return (times[times.length - 1] ?? eng.now()) - eng.now() + TAIL_S;
  };

/** Piano tones one after the other (a scale, the marked keys), or one key. */
export const notesSound =
  (midis: number[]): Sound =>
  (eng) => {
    eng.pitches(midis, NOTE_GAP_S);
    return (midis.length - 1) * NOTE_GAP_S + TONE_S;
  };

/**
 * The round slate button: Play, and Stop while its example sounds. It shows only its icon, and a section has several:
 * its name says which example it plays ("Play: Whole note").
 */
export function PlayButton({ on, name, onClick }: { on: boolean; name: string; onClick(): void }): JSX.Element {
  return (
    <button type="button" className={'learn-play' + (on ? ' is-on' : '')} aria-label={t(on ? 'learn.stop' : 'learn.play', { name })} onClick={onClick}>
      <span className="learn-play-dot">
        <Icon name={on ? 'stop' : 'play'} size={16} />
      </span>
    </button>
  );
}
