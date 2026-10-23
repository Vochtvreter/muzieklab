/**
 * The running exercise: audio, count-in, tap input and live judging (DESIGN.md §3.1, §6).
 * Time `tg` is seconds on the exercise clock (0 = first beat after the count-in). After a pause, play resumes at the
 * start of the paused bar: a fresh segment (sliced timeline + live judge) starts after a new count-in, and the
 * final result is judged again over the whole run from all kept taps.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createLiveJudge,
  judge,
  type Judgement,
  type JudgeOptions,
  type JudgeResult,
  type LiveJudge,
  type NoteResult,
  type Tap,
  type Timeline,
  type TimedNote,
} from '../../core/api';
import { attachTapInput } from '../../input/tapInput';
import type { NoteMark } from '../../render/Staff';
import { exerciseHas, introId, unseenIntros, type Intro } from '../../game/intro';
import type { Prefs } from '../../game/storage';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import type { ExerciseView } from '../exerciseView';
import { beatAt, cursorAt, holdProgress, partialResult, pressFeedback, sliceTimeline, tapsBeforeBar, type BeatState } from '../lib/playMath';
import type { Run } from '../store';

export type Phase = 'intro' | 'running' | 'paused' | 'done';
/** How to play, what the lesson introduces (the intro sheet), Ready, Pause. */
export type SheetKind = 'help' | 'new' | 'pause' | 'ready' | null;

/**
 * Runs that have already played. Coming back to one (Back / Forward after quitting or finishing) must not start it
 * on its own: there was no tap, so it waits on the Ready sheet. Marked on the first frame, not at mount, so React's
 * StrictMode double mount in development still auto-starts.
 */
const played = new WeakSet<Run>();
/**
 * Audio states that stop the clock: the browser suspended the context, iOS interrupted it (a call, Siri), or its clock
 * froze while it says 'running' (iOS, back from the background).
 */
const STOPPED_AUDIO = new Set(['suspended', 'interrupted', 'stalled']);
/** How long the context may take to start running before Play treats it as stopped (ms). */
const AUDIO_START_GRACE_MS = 800;

export interface Frame {
  tg: number;
  beat: BeatState;
  /** Beats since the first beat of the exercise, with the fraction (negative in the count-in): drives the pendulum. */
  beats: number;
  /**
   * Before the music's first beat: the lead-in and the count-in, also the one after a pause. Play says Count-in, not
   * Bar 1, and no note is highlighted yet (§3.1).
   */
  countIn: boolean;
  /** The note under the playhead, highlighted on the staff; null until the music's first beat. */
  cursor: number | null;
  ring: number;
  held: boolean;
}

interface Segment {
  judge: LiveJudge;
  timeline: Timeline;
  firstIndex: number;
  fromBar: number;
  /** Audio time of tg = 0. */
  origin: number;
  countInBeats: number;
}

const LEAD_IN_S = 0.4;
/** Presses this long before the first beat (during the count-in) are ignored, not counted as extra taps. */
const EARLY_IGNORE_S = 0.25;
/** After the last beat, wait this long for the last release before finishing. */
const END_GRACE_S = 0.35;
const END_HARD_S = 1.5;

/**
 * Whether Play opens with How to play, and why: 'first' the very first time, 'hold' the first time an exercise judges
 * holds after only tap-only ones (the sheet's eyebrow then says holding is new), null when it starts straight away.
 */
export function howToIntro(prefs: Pick<Prefs, 'seenHowTo' | 'seenHold'>, hold: boolean): 'first' | 'hold' | null {
  if (!prefs.seenHowTo) return 'first';
  return hold && !prefs.seenHold ? 'hold' : null;
}

/**
 * How to play's eyebrow (a message key): why it opened before the start (howToIntro), or *Paused* once the exercise has
 * started. Null when it was not due and opened with ? from the intro sheet or Ready: Play then shows where the run comes
 * from ("Lesson 3.1"), not *First time here*.
 */
export function howToEyebrow(phase: Phase, intro: 'first' | 'hold' | null): 'howto.firstTime' | 'howto.newHold' | 'howto.paused' | null {
  if (phase !== 'intro') return 'howto.paused';
  return intro === 'first' ? 'howto.firstTime' : intro === 'hold' ? 'howto.newHold' : null;
}

/**
 * The sheet Play opens with, before the count-in: How to play when it is due (howToIntro), else the intro sheet when
 * the lesson brings symbols the player was not shown yet, else Ready when no tap led here (`gated`) or the run is a
 * lesson other than the one finished last (`fresh`: read the new rhythm first). Null: count in straight away.
 */
export function firstSheet(howTo: 'first' | 'hold' | null, intros: number, gated: boolean, fresh: boolean): SheetKind {
  if (howTo) return 'help';
  if (intros > 0) return 'new';
  return gated || fresh ? 'ready' : null;
}

export interface PlaySession {
  /** Why How to play opened before the start (see howToIntro), for its eyebrow. */
  intro: 'first' | 'hold' | null;
  /**
   * What this lesson introduces that its exercise shows and the player has not been shown yet (the intro sheet); empty
   * for other runs.
   */
  intros: Intro[];
  phase: Phase;
  sheet: SheetKind;
  frame: Frame;
  marks: Record<number, NoteMark>;
  feedback: { key: string; tone: 'good' | 'gold' | 'miss' | 'muted' } | null;
  combo: number;
  taps: Tap[];
  liveResult: JudgeResult;
  judged: Judgement[];
  extraTaps: number;
  /** The audio stopped (iOS interruption, the browser suspended it): the Pause sheet says so. */
  interrupted: boolean;
  /**
   * The next start must come from a click, tap, Enter or Space: browsers do not count Esc as a gesture that may
   * start audio. True on the Ready sheet (no tap led here) and after the audio was interrupted.
   */
  needsTap: boolean;
  setPad(el: HTMLElement | null): void;
  openSheet(kind: 'help' | 'pause'): void;
  closeSheet(): void;
  restart(): void;
  stop(): void;
  /** End now and go to Results: notes not played yet count as missed. */
  skip(): void;
}

/**
 * `onSeen`: a sheet before the start was done with (How to play, the intro sheet); the prefs to save. `fresh`: a lesson
 * other than the one finished last, so Play waits on Ready (see firstSheet).
 */
export function usePlaySession(
  run: Run,
  view: ExerciseView,
  prefs: Prefs,
  onSeen: (patch: Partial<Prefs>) => void,
  onFinish: (r: JudgeResult, taps: Tap[]) => void,
  fresh = false,
): PlaySession {
  const ex = run.exercise;
  const meter = ex.meter;
  const barSec = view.barSeconds;
  const opts: JudgeOptions = { hold: ex.settings.hold, leniency: prefs.leniency };

  // No tap led here (a reload, Back / Forward into Play): wait for one, so the audio may start.
  const [gated] = useState(() => !!run.needsGesture || played.has(run));
  // How to play opens first the very first time, and again the first time holding counts (unit 1 is tap only).
  const [intro] = useState(() => howToIntro(prefs, ex.settings.hold));
  // Only what this exercise shows (a lesson start picks one with all of it: makeLessonRun), so the sheet never names,
  // and marks as shown, a symbol the staff does not have.
  const [intros] = useState(() => (run.lessonId ? unseenIntros(run.lessonId, prefs.seenIntros).filter((x) => exerciseHas(ex, [introId(x)])) : []));
  const [first] = useState(() => firstSheet(intro, intros.length, gated, fresh));
  const autoStart = first === null;
  const [phase, setPhase] = useState<Phase>(autoStart ? 'running' : 'intro');
  const [sheet, setSheet] = useState<SheetKind>(first);
  /** The intro sheet's Start was pressed: How to play, opened again with ?, does not lead back to it. */
  const introsDone = useRef(false);
  const [interrupted, setInterrupted] = useState(false);
  const segStartedAt = useRef(0);
  const [frame, setFrame] = useState<Frame>({ tg: -1, beat: { inBar: null, countIn: false }, beats: 0, countIn: false, cursor: null, ring: 0, held: false });
  const [marks, setMarks] = useState<Record<number, NoteMark>>({});
  const [feedback, setFeedback] = useState<PlaySession['feedback']>(null);
  const [combo, setCombo] = useState(0);

  const seg = useRef<Segment | null>(null);
  const taps = useRef<Tap[]>([]);
  const extras = useRef<Tap[]>([]);
  const live = useRef(new Map<number, NoteResult>());
  const current = useRef<{ tap: Tap; note: TimedNote | null } | null>(null);
  const ignoredPress = useRef(false);
  const everPaused = useRef(false);
  const pausedAt = useRef(0);
  /** The bar to resume at, kept as an integer: pausedAt / barSec can land just below a whole bar (2.9999…). */
  const pausedBar = useRef(0);
  const raf = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [pad, setPadState] = useState<HTMLElement | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const rebuildMarks = (): void => {
    const m: Record<number, NoteMark> = {};
    for (const [i, r] of live.current) m[i] = r.judgement;
    setMarks(m);
  };

  const cancelLoop = (): void => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const globalTime = (audioTime: number): number => audioTime - (seg.current?.origin ?? 0);

  const finish = useCallback(() => {
    const s = seg.current;
    if (!s) return;
    cancelLoop();
    // A key still held at the end is released now: holding past the last note's end is "held too long".
    const heldUntil = globalTime(engine().heardNow());
    engine().stop();
    engine().tapUp();
    for (const tp of taps.current) if (tp.up === null) tp.up = Math.max(tp.down, heldUntil);
    // The live judge must hear about that release too, or it keeps the hold open (Skip with a finger on the pad).
    if (current.current) s.judge.release(heldUntil - s.fromBar * barSec);
    current.current = null;
    let result: JudgeResult;
    try {
      result = everPaused.current ? judge(view.timeline, taps.current, opts) : s.judge.finish();
    } catch (e) {
      console.error('judging failed', e);
      return;
    }
    seg.current = null;
    setPhase('done');
    finishRef.current(result, taps.current.map((tp) => ({ ...tp })));
  }, [view, barSec, opts.hold, opts.leniency]);

  const tick = useCallback(() => {
    const s = seg.current;
    if (!s) return;
    const eng = engine();
    played.add(run);
    // A stopped context freezes the clock: the count-in would hang in silence. Pause and say why.
    if (STOPPED_AUDIO.has(eng.audioState()) && performance.now() - segStartedAt.current > AUDIO_START_GRACE_MS) {
      pauseRef.current('pause', true);
      return;
    }
    // The heard clock (what the player hears now), the same clock taps are judged on.
    const tg = globalTime(eng.heardNow());
    const ts = tg - s.fromBar * barSec;
    // Notes whose window passed without a press: missed (shown live).
    let missed = false;
    for (const i of s.judge.missedUntil(ts)) {
      const gi = i + s.firstIndex;
      if (live.current.has(gi)) continue;
      live.current.set(gi, { index: gi, judgement: 'miss', offsetMs: null, hold: null, releaseOffsetMs: null, tap: null });
      missed = true;
    }
    if (missed) {
      rebuildMarks();
      setFeedback({ key: 'judge.miss', tone: 'miss' });
    }
    // The judge settles the combo once a note's hold is over, so read it every frame.
    setCombo(s.judge.combo());
    const beat = beatAt(ts, view.timeline.beatSeconds, meter.beatsPerBar, s.countInBeats, s.timeline.totalSeconds);
    const countIn = ts < 0;
    const cursor = countIn ? null : cursorAt(view.timeline.notes, tg, view.timeline.totalSeconds);
    const cur = current.current;
    setFrame({ tg, beat, beats: view.timeline.beatSeconds > 0 ? ts / view.timeline.beatSeconds : 0, countIn, cursor, ring: holdProgress(cur?.note ?? null, tg), held: cur !== null || ignoredPress.current });
    const over = ts - s.timeline.totalSeconds;
    if ((over > END_GRACE_S && !cur) || over > END_HARD_S) {
      finish();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, [view, barSec, meter.beatsPerBar, finish, run]);

  const startSegment = useCallback(
    (fromBar: number, countIn: number) => {
      const eng = engine();
      // Count-in "None" is one silent bar with only the visual beat counter: the first note needs a lead.
      const countInBars = Math.max(1, countIn);
      applyAudioPrefs(prefsRef.current, eng);
      const { timeline, firstIndex } = sliceTimeline(view.timeline, fromBar, meter.barTicks, barSec);
      let lj: LiveJudge;
      try {
        lj = createLiveJudge(timeline, opts);
      } catch (e) {
        console.error('createLiveJudge failed', e);
        return;
      }
      const started = eng.start({
        timeline,
        meter,
        tempo: ex.tempo,
        countInBars,
        metronome: ex.settings.metronome,
        playRhythm: false,
        leadIn: LEAD_IN_S,
        silentCountIn: countIn === 0,
      });
      seg.current = { judge: lj, timeline, firstIndex, fromBar, origin: started.exerciseStart - fromBar * barSec, countInBeats: countInBars * meter.beatsPerBar };
      segStartedAt.current = performance.now();
      setInterrupted(false);
      setPhase('running');
      cancelLoop();
      raf.current = requestAnimationFrame(tick);
      },
    [view, meter, barSec, ex, tick, opts.hold, opts.leniency],
  );

  const resetRun = (): void => {
    taps.current = [];
    extras.current = [];
    live.current = new Map();
    current.current = null;
    ignoredPress.current = false;
    everPaused.current = false;
    setMarks({});
    setFeedback(null);
    setCombo(0);
  };

  const pause = useCallback((kind: 'help' | 'pause', audioStopped = false) => {
    if (audioStopped) setInterrupted(true);
    if (phaseRef.current !== 'running') {
      setSheet(kind);
      return;
    }
    const eng = engine();
    const tg = globalTime(eng.heardNow());
    cancelLoop();
    eng.stop();
    eng.tapUp();
    const cur = current.current;
    if (cur && seg.current) {
      cur.tap.up = Math.max(cur.tap.down, tg);
      seg.current.judge.release(tg - seg.current.fromBar * barSec);
    }
    current.current = null;
    ignoredPress.current = false;
    // Paused during a resumed segment's lead-in or count-in: tg is still before the bar it resumed at. Resume there,
    // not earlier (bar 0 would wipe the whole run).
    const fromBar = seg.current?.fromBar ?? 0;
    pausedAt.current = Math.max(tg, fromBar * barSec);
    pausedBar.current = Math.max(fromBar, Math.floor(tg / barSec));
    setPhase('paused');
    setSheet(kind);
    setFrame((f) => ({ ...f, ring: 0, held: false }));
  }, [barSec]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  const resume = useCallback(() => {
    const bars = ex.bars.length;
    const b = Math.max(0, Math.min(bars - 1, pausedBar.current));
    if (b === 0) {
      resetRun();
      startSegment(0, Math.max(1, ex.settings.countIn));
      return;
    }
    const cut = b * barSec;
    taps.current = tapsBeforeBar(taps.current, b, barSec, pausedAt.current);
    extras.current = extras.current.filter((tp) => tp.down < cut);
    for (const [gi] of live.current) {
      if ((view.timeline.notes[gi]?.bar ?? 0) >= b) live.current.delete(gi);
    }
    // The kept NoteResults must point at the kept (possibly shortened) taps.
    const byDown = new Map(taps.current.map((tp) => [tp.down, tp]));
    for (const r of live.current.values()) if (r.tap) r.tap = byDown.get(r.tap.down) ?? r.tap;
    everPaused.current = true;
    rebuildMarks();
    setFeedback(null);
    setCombo(0);
    startSegment(b, Math.max(1, ex.settings.countIn));
  }, [ex, barSec, view, startSegment]);

  const down = useCallback((timeStamp: number) => {
    const s = seg.current;
    if (!s || phaseRef.current !== 'running') return;
    const eng = engine();
    eng.tapDown();
    const tg = globalTime(eng.eventToAudioTime(timeStamp));
    const ts = tg - s.fromBar * barSec;
    if (ts < -EARLY_IGNORE_S) {
      ignoredPress.current = true;
      return;
    }
    const tap: Tap = { down: tg, up: null };
    taps.current.push(tap);
    const p = s.judge.press(ts);
    let note: TimedNote | null = null;
    if (p.index !== null && p.judgement !== 'extra') {
      const gi = p.index + s.firstIndex;
      note = view.timeline.notes[gi] ?? null;
      live.current.set(gi, { index: gi, judgement: p.judgement, offsetMs: p.offsetMs, hold: null, releaseOffsetMs: null, tap });
      rebuildMarks();
    } else {
      extras.current.push(tap);
    }
    current.current = { tap, note };
    setFeedback(pressFeedback(p));
    setCombo(s.judge.combo());
  }, [barSec, view]);

  const up = useCallback((timeStamp: number) => {
    const eng = engine();
    eng.tapUp();
    ignoredPress.current = false;
    const s = seg.current;
    const cur = current.current;
    current.current = null;
    if (!s || !cur) return;
    const tg = globalTime(eng.eventToAudioTime(timeStamp));
    cur.tap.up = Math.max(cur.tap.down, tg);
    s.judge.release(tg - s.fromBar * barSec);
    setCombo(s.judge.combo());
  }, [barSec]);

  // Start right away unless a sheet is up first (How to play, Ready): its button starts the exercise.
  useEffect(() => {
    if (autoStart) startSegment(0, ex.settings.countIn);
    return () => {
      cancelLoop();
      engine().stop();
      engine().tapUp();
    };
  }, [run]);

  // Tap input only while the exercise runs with no sheet open, so keys never double as taps in a dialog.
  useEffect(() => {
    if (phase !== 'running' || sheet !== null) return;
    return attachTapInput(pad, { down, up, pause: () => pause('pause'), help: () => pause('help') }, { claimActivationKeys: true });
  }, [phase, sheet, pad, down, up, pause]);

  // Leaving the tab or the window pauses (the input module releases held keys too): keys would go elsewhere.
  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'hidden' && phaseRef.current === 'running') pause('pause');
    };
    const onBlur = (): void => {
      if (phaseRef.current === 'running') pause('pause');
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    };
  }, [pause]);

  // The audio stopped under us (iOS call or Siri, the browser suspended it): pause instead of hanging.
  useEffect(
    () =>
      engine().onStateChange((state) => {
        if (STOPPED_AUDIO.has(state) && phaseRef.current === 'running') pauseRef.current('pause', true);
      }),
    [],
  );

  // Keep the screen awake while playing.
  useEffect(() => {
    if (phase !== 'running') return;
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    let lock: { release(): Promise<void> } | null = null;
    let cancelled = false;
    nav.wakeLock
      ?.request('screen')
      .then((l) => {
        if (cancelled) void l.release().catch(() => undefined);
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
    };
  }, [phase]);

  const closeSheet = useCallback(() => {
    const kind = sheet;
    // Closing a sheet is a tap or a key press: the moment iOS lets the page make sound.
    unlockAudio();
    if (phaseRef.current === 'intro') {
      const hold = ex.settings.hold;
      if (kind === 'help') onSeen(hold ? { seenHowTo: true, seenHold: true } : { seenHowTo: true });
      if (kind === 'new') {
        introsDone.current = true;
        onSeen({ seenIntros: [...new Set([...prefsRef.current.seenIntros, ...intros.map(introId)])] });
      }
      // One sheet at a time: How to play first, then what the lesson introduces, then the count-in.
      if (kind === 'help' && intros.length > 0 && !introsDone.current) {
        setSheet('new');
        return;
      }
      setSheet(null);
      startSegment(0, ex.settings.countIn);
    } else {
      setSheet(null);
      if (phaseRef.current === 'paused' && kind) resume();
    }
  }, [sheet, onSeen, intros, startSegment, ex.settings.countIn, ex.settings.hold, resume]);

  const restart = useCallback(() => {
    setSheet(null);
    cancelLoop();
    engine().stop();
    resetRun();
    startSegment(0, ex.settings.countIn);
  }, [startSegment, ex.settings.countIn]);

  const stop = useCallback(() => {
    cancelLoop();
    engine().stop();
    engine().tapUp();
    seg.current = null;
  }, []);

  const setPad = useCallback((el: HTMLElement | null) => {
    setPadState(el);
  }, []);

  const liveNotes = [...live.current.values()];
  return {
    intro,
    intros,
    phase,
    sheet,
    frame,
    marks,
    feedback,
    combo,
    taps: taps.current,
    liveResult: partialResult(liveNotes, extras.current.length),
    judged: liveNotes.map((n) => n.judgement),
    extraTaps: extras.current.length,
    interrupted,
    needsTap: (gated && phase === 'intro') || interrupted,
    setPad,
    openSheet: pause,
    closeSheet,
    restart,
    stop,
    skip: finish,
  };
}
