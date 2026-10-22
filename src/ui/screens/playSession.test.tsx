// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_SETTINGS, generateExercise, type JudgeResult, type Settings } from '../../core/api';
import { DEFAULT_PREFS } from '../../game/storage';
import { exerciseView } from '../exerciseView';
import { howToIntro, usePlaySession } from './playSession';

/*
 * The play session against a fake audio engine. Two clocks, as on a real device: `clock.now` is the scheduling clock
 * (AudioContext.currentTime) and `clock.heard` is what the player hears, `latency` behind it. Key events are judged
 * at the heard time, like eventToAudioTime does.
 */
const clock = { heard: 0, latency: 0 };
const audio = { state: 'running', listeners: new Set<(state: string) => void>() };
const starts: Array<{ countInBars: number; silentCountIn?: boolean; leadIn?: number; meter: { beatsPerBar: number }; tempo: number }> = [];
vi.mock('../audio', () => {
  const eng = {
    now: () => clock.heard + clock.latency,
    heardNow: () => clock.heard,
    eventToAudioTime: () => clock.heard,
    tapDown() {},
    tapUp() {},
    stop() {},
    audioState: () => audio.state,
    onStateChange(cb: (state: string) => void) {
      audio.listeners.add(cb);
      return () => audio.listeners.delete(cb);
    },
    start(o: (typeof starts)[number]) {
      starts.push(o);
      // Scheduled from the scheduling clock: the first count-in click is `leadIn` after now().
      const startTime = clock.heard + clock.latency + (o.leadIn ?? 0.1);
      return { exerciseStart: startTime + o.countInBars * o.meter.beatsPerBar * (60 / o.tempo), end: 0 };
    },
  };
  return { engine: () => eng, applyAudioPrefs: () => undefined, unlockAudio: () => undefined };
});

let frames: FrameRequestCallback[] = [];
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => frames.push(cb);
globalThis.cancelAnimationFrame = (): void => {
  frames = [];
};
const flush = (): void => {
  const run = frames;
  frames = [];
  run.forEach((f) => f(0));
};
const at = (t: number): void => {
  clock.heard = t;
  act(() => flush());
};
const key = (type: 'keydown' | 'keyup'): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: 'a', code: 'KeyA', bubbles: true }));
    flush();
  });
};

function setup(settings: Partial<Settings> = {}, runExtra: { needsGesture?: boolean } = {}) {
  audio.state = 'running';
  clock.heard = 0;
  clock.latency = 0;
  starts.length = 0;
  const ex = generateExercise({ ...DEFAULT_SETTINGS, bars: 4, tempo: 80, rests: [], ...settings }, 3);
  const view = exerciseView(ex)!;
  const run = { exercise: ex, lessonId: null, daily: null, ...runExtra };
  const prefs = { ...DEFAULT_PREFS, seenHowTo: true, seenHold: true };
  const done: { result: JudgeResult | null } = { result: null };
  const hook = renderHook(() =>
    usePlaySession(run, view, prefs, () => undefined, (r) => {
      done.result = r;
    }),
  );
  act(() => hook.result.current.setPad(null));
  /** Heard time of the exercise's first beat for the segment started last (resumed segments start mid-exercise). */
  const origin = (startedAt: number, fromBar: number): number => {
    const s = starts[starts.length - 1];
    return startedAt + (s.leadIn ?? 0.1) + s.countInBars * s.meter.beatsPerBar * (60 / s.tempo) - fromBar * view.barSeconds;
  };
  return { hook, view, done, origin };
}

afterEach(() => {
  frames = [];
});

describe('usePlaySession', () => {
  it('a pause during the count-in after a resume keeps the earlier bars and resumes at the same bar', () => {
    const { hook, view, origin } = setup();
    const o = origin(0, 0);
    for (const n of view.timeline.notes.filter((n) => n.bar < 2)) {
      at(o + n.onset);
      key('keydown');
      at(o + n.end - 0.01);
      key('keyup');
    }
    const kept = hook.result.current.taps.length;
    expect(kept).toBeGreaterThan(0);
    at(o + 2.5 * view.barSeconds);
    act(() => hook.result.current.openSheet('pause'));
    act(() => hook.result.current.closeSheet()); // resumes at bar 2 after a count-in
    const resumedNotes = starts.length;
    // 0.2 s later, still in the lead-in: the tab is hidden, or the player pauses again.
    at(clock.heard + 0.2);
    act(() => hook.result.current.openSheet('pause'));
    act(() => hook.result.current.closeSheet());
    expect(starts.length).toBe(resumedNotes + 1);
    expect(hook.result.current.taps.length).toBe(kept);
    expect(Object.keys(hook.result.current.marks).length).toBeGreaterThan(0);
    // Same slice of the exercise as the first resume: bar 2 onwards.
    const last = starts[starts.length - 1] as unknown as { timeline: { notes: unknown[] } };
    const prev = starts[starts.length - 2] as unknown as { timeline: { notes: unknown[] } };
    expect(last.timeline.notes.length).toBe(prev.timeline.notes.length);
  });

  it('resumes at the right bar when bar times do not divide evenly (55 BPM, 3/4)', () => {
    const { hook, view, origin } = setup({ tempo: 55, meters: ['3/4'], bars: 5 });
    const o = origin(0, 0);
    for (const n of view.timeline.notes.filter((n) => n.bar < 3)) {
      at(o + n.onset);
      key('keydown');
      at(o + n.end - 0.01);
      key('keyup');
    }
    at(o + 3.5 * view.barSeconds);
    act(() => hook.result.current.openSheet('pause'));
    act(() => hook.result.current.closeSheet()); // resumes at bar 3
    at(clock.heard + 0.2); // pause again during the lead-in
    act(() => hook.result.current.openSheet('pause'));
    act(() => hook.result.current.closeSheet());
    const notesFromBar3 = view.timeline.notes.filter((n) => n.bar >= 3).length;
    const last = starts[starts.length - 1] as unknown as { timeline: { notes: unknown[] } };
    expect(last.timeline.notes.length).toBe(notesFromBar3);
  });

  it('a press still held when the run ends is released for the live judge too (not left open as held right)', () => {
    // A note followed by a rest: holding on into the rest is "held too long" (into a next note it is legato).
    const { view, done, origin } = setup({ rests: ['quarter', 'half'], restAmount: 'many' });
    const i = view.timeline.notes.findIndex((n) => n.next === 'rest');
    expect(i).toBeGreaterThanOrEqual(0);
    const o = origin(0, 0);
    at(o + view.timeline.notes[i].onset);
    key('keydown');
    // Never let go: the run ends at the hard limit after the last beat.
    at(o + view.timeline.totalSeconds + 2);
    expect(done.result).not.toBeNull();
    expect(done.result!.notes[i].hold).toBe('long');
  });

  it('skipping with the pad still held releases that note: cut short, not left open as held right', () => {
    const { hook, view, done, origin } = setup();
    const o = origin(0, 0);
    const first = view.timeline.notes[0];
    at(o + first.onset);
    key('keydown');
    at(o + first.onset + (first.end - first.onset) / 3);
    act(() => hook.result.current.skip());
    expect(done.result!.notes[0].hold).toBe('short');
    expect(done.result!.counts.miss).toBe(view.timeline.notes.length - 1);
  });

  it('judges misses on the heard clock: an on-time press is never shown as a miss first', () => {
    const { hook, view, origin } = setup();
    clock.latency = 0.25; // Bluetooth headphones
    const o = origin(0, 0);
    const first = view.timeline.notes[0];
    // 0.2 s after the note is heard (past the 120 ms Good window on the old, ahead clock), before the press lands.
    at(o + first.onset + 0.1);
    expect(hook.result.current.marks[0]).toBeUndefined();
    key('keydown');
    expect(hook.result.current.marks[0]).not.toBe('miss');
  });

  it('holding the last note past the end is "held too long", also after a pause', () => {
    for (const pauseOnce of [false, true]) {
      const { hook, view, done, origin } = setup();
      let o = origin(0, 0);
      const notes = view.timeline.notes;
      const play = (from: number, to: number): void => {
        for (const n of notes.filter((n) => n.bar >= from && n.bar < to)) {
          const isLast = n === notes[notes.length - 1];
          at(o + n.onset);
          key('keydown');
          if (isLast) {
            at(o + view.timeline.totalSeconds + 2);
            return;
          }
          at(o + n.end - 0.01);
          key('keyup');
        }
      };
      play(0, 2);
      if (pauseOnce) {
        at(o + 2.2 * view.barSeconds);
        act(() => hook.result.current.openSheet('pause'));
        const resumedAt = clock.heard;
        act(() => hook.result.current.closeSheet());
        o = origin(resumedAt, 2);
      }
      play(2, 4);
      at(clock.heard + 0.1);
      expect(done.result, `finished (pause: ${pauseOnce})`).not.toBeNull();
      expect(done.result!.notes.at(-1)!.hold, `pause: ${pauseOnce}`).toBe('long');
    }
  });

  it('the count-in is not bar 1: no note highlighted until the first beat, also in the count-in after a pause', () => {
    const { hook, view, origin } = setup();
    expect(hook.result.current.frame.cursor).toBeNull();
    let o = origin(0, 0);
    at(o - 0.5);
    expect(hook.result.current.frame).toMatchObject({ countIn: true, cursor: null, beat: { countIn: true } });
    at(o + 0.01);
    expect(hook.result.current.frame).toMatchObject({ countIn: false, cursor: 0, beat: { inBar: 0, countIn: false } });
    at(o + 2.5 * view.barSeconds);
    act(() => hook.result.current.openSheet('pause'));
    const resumedAt = clock.heard;
    act(() => hook.result.current.closeSheet());
    o = origin(resumedAt, 2);
    at(o + 2 * view.barSeconds - 0.5);
    expect(hook.result.current.frame).toMatchObject({ countIn: true, cursor: null });
    at(o + 2 * view.barSeconds + 0.01);
    expect(hook.result.current.frame.countIn).toBe(false);
    expect(view.timeline.notes[hook.result.current.frame.cursor!].bar).toBe(2);
  });

  it('count-in "Silent" still gives one bar of lead, without clicks', () => {
    setup({ countIn: 0 });
    expect(starts[0]).toMatchObject({ countInBars: 1, silentCountIn: true });
  });

  it('leaving the window pauses', () => {
    const { hook } = setup();
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(hook.result.current.phase).toBe('paused');
    expect(hook.result.current.sheet).toBe('pause');
  });

  it('a restored run waits on the Ready sheet, and its Start begins the count-in', () => {
    const { hook } = setup({}, { needsGesture: true });
    expect(starts.length).toBe(0);
    expect(hook.result.current.sheet).toBe('ready');
    expect(hook.result.current.needsTap).toBe(true);
    act(() => hook.result.current.closeSheet());
    expect(starts.length).toBe(1);
    expect(hook.result.current.phase).toBe('running');
  });

  it('a run that already played waits on the Ready sheet when Play opens again (Back / Forward)', () => {
    const ex = generateExercise({ ...DEFAULT_SETTINGS, bars: 2 }, 5);
    const view = exerciseView(ex)!;
    const run = { exercise: ex, lessonId: null, daily: null };
    const prefs = { ...DEFAULT_PREFS, seenHowTo: true, seenHold: true };
    starts.length = 0;
    const first = renderHook(() => usePlaySession(run, view, prefs, () => undefined, () => undefined));
    at(0.1); // first frame
    first.unmount();
    const again = renderHook(() => usePlaySession(run, view, prefs, () => undefined, () => undefined));
    expect(starts.length).toBe(1);
    expect(again.result.current.sheet).toBe('ready');
  });

  it('opens How to play again the first time holding counts, and starts once it is closed', () => {
    const ex = generateExercise({ ...DEFAULT_SETTINGS, bars: 2, hold: true }, 5);
    const view = exerciseView(ex)!;
    const run = { exercise: ex, lessonId: '2.1', daily: null };
    // Seen in a tap-only lesson (unit 1), never with holds.
    const prefs = { ...DEFAULT_PREFS, seenHowTo: true, seenHold: false };
    let introDone = 0;
    starts.length = 0;
    const hook = renderHook(() => usePlaySession(run, view, prefs, () => (introDone += 1), () => undefined));
    expect(hook.result.current.intro).toBe('hold');
    expect(hook.result.current.sheet).toBe('help');
    expect(starts.length).toBe(0);
    act(() => hook.result.current.closeSheet());
    expect(introDone).toBe(1);
    expect(starts.length).toBe(1);
    expect(hook.result.current.phase).toBe('running');
  });

  it('pauses with a note when the audio is interrupted', () => {
    const { hook } = setup();
    at(0.1);
    audio.state = 'interrupted';
    act(() => audio.listeners.forEach((cb) => cb('interrupted')));
    expect(hook.result.current.phase).toBe('paused');
    expect(hook.result.current.interrupted).toBe(true);
    act(() => hook.result.current.closeSheet());
    expect(hook.result.current.interrupted).toBe(false);
  });
});

describe('howToIntro', () => {
  it('opens How to play the very first time, tap only or not', () => {
    expect(howToIntro({ seenHowTo: false, seenHold: false }, false)).toBe('first');
    expect(howToIntro({ seenHowTo: false, seenHold: false }, true)).toBe('first');
  });

  it('opens it again for the first exercise that judges holds, and never for tap-only ones', () => {
    expect(howToIntro({ seenHowTo: true, seenHold: false }, true)).toBe('hold');
    expect(howToIntro({ seenHowTo: true, seenHold: false }, false)).toBeNull();
    expect(howToIntro({ seenHowTo: true, seenHold: true }, true)).toBeNull();
  });
});
