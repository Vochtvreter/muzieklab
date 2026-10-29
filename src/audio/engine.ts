import type { Meter, Timeline } from '../core/types';
import {
  SCHEDULE_AHEAD_S,
  SCHEDULER_INTERVAL_MS,
  clickTimes,
  dueUntil,
  exerciseStartTime,
  perfToAudioTime,
  planBeats,
  planNotes,
  playBeatCount,
  type BeatEvent,
} from './schedule';

export interface Volumes {
  metronome: number; // 0–1
  rhythm: number;
  tap: number;
}

export interface StartOptions {
  timeline: Timeline;
  meter: Meter;
  tempo: number;
  countInBars: number;
  metronome: 'on' | 'accent' | 'off';
  /** Play the rhythm itself (Listen / correct playback). */
  playRhythm: boolean;
  /** Seconds between now and the first count-in click. */
  leadIn?: number;
  /** Count-in beats still fire onBeat (for the visual counter) but make no sound. */
  silentCountIn?: boolean;
}

export interface Started {
  /** Audio time (s) of the exercise's first beat, after the count-in. */
  exerciseStart: number;
  /** Audio time (s) when the exercise ends. */
  end: number;
}

/** Web Audio engine with a look-ahead scheduler (§6.1, §7). */
export interface AudioEngine {
  unlock(): Promise<void>;
  /** Current audio time in seconds. */
  now(): number;
  /** Converts an input event.timeStamp (performance.now() timebase) to audio time, minus output latency and the calibration offset. */
  eventToAudioTime(timeStamp: number): number;
  /**
   * The audio time a press made right now would be judged at: the time being *heard*, on the same clock as
   * eventToAudioTime. now() runs ahead of it by the output latency (tens of ms; 150+ on Bluetooth).
   */
  heardNow(): number;
  setVolumes(v: Volumes): void;
  /** Silences the metronome during play only; count-in and calibration clicks stay audible at the metronome volume. */
  setMetronomeMuted(muted: boolean): void;
  setCalibrationOffsetMs(ms: number): void;
  start(opts: StartOptions): Started;
  stop(): void;
  /**
   * Plays notes by MIDI number (60 = middle C), one after the other, `gap` seconds apart, starting now: a soft piano-like
   * tone on the rhythm channel (Scales: each right note, and *Hear it so far*).
   */
  pitches(midis: number[], gap?: number): void;
  /** Tap feedback sound: starts on press, sustains softly while held, stops on release. */
  tapDown(): void;
  tapUp(): void;
  /**
   * Called on every beat (count-in and play, also when the metronome is silent on that beat), close to when it sounds.
   * `index` is relative to the exercise start: count-in beats are negative, 0 = the exercise's first beat.
   * `inBar` is 0-based. For `clicks()` the index runs 0..count-1. Returns an unsubscribe function.
   */
  onBeat(cb: (beat: { index: number; inBar: number; countIn: boolean; time: number }) => void): () => void;
  /** Plain click track for calibration: `count` clicks at `bpm`, returns their audio times. */
  clicks(count: number, bpm: number, leadIn?: number): number[];
  /**
   * The AudioContext state ('running', 'suspended', 'interrupted' on iOS…), or 'none' without Web Audio. 'stalled' when
   * it says 'running' but its clock stands still (iOS, back from the background): the next unlock() replaces it.
   */
  audioState(): string;
  /** Called when the AudioContext state changes (an iOS call or Siri interrupts it, the browser suspends it). */
  onStateChange(cb: (state: string) => void): () => void;
}

type BeatCallback = Parameters<AudioEngine['onBeat']>[0];
type Channel = keyof Volumes;
/** Output routes: the volume channels plus `cue` (count-in and calibration clicks, never muted). */
type Route = Channel | 'cue';

/** One scheduled sound: played by the look-ahead scheduler when its time is within reach. */
interface Job {
  time: number;
  play(ctx: AudioContext, time: number): void;
}

/** A sounding source with its own envelope, so it can be faded out on stop(). */
interface Voice {
  src: OscillatorNode;
  env: GainNode;
}

const DEFAULT_VOLUMES: Volumes = { metronome: 0.7, rhythm: 0.8, tap: 0.5 };
/** Sounds whose time has passed by more than this (e.g. timers throttled in a hidden tab) are skipped, not bunched up. */
const STALE_S = 0.03;
/** onBeat may fire this much before the click is heard (about half a frame). */
const BEAT_EARLY_S = 0.008;
const SILENT = 0.0001;
/** A 'running' context whose clock has not moved for this long is stalled (ms). */
const STALL_MS = 500;

function audioContextClass(): typeof AudioContext | null {
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const perfNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private channels: Record<Route, GainNode> | null = null;
  private metronomeMuted = false;
  private volumes: Volumes = { ...DEFAULT_VOLUMES };
  private calibrationMs = 0;

  private jobs: Job[] = [];
  private jobCursor = 0;
  private beats: BeatEvent[] = [];
  private beatCursor = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf: number | null = null;

  private listeners = new Set<BeatCallback>();
  private stateListeners = new Set<(state: string) => void>();
  private voices = new Set<Voice>();
  private tapVoice: Voice | null = null;
  /**
   * The context needs replacing at the next unlock(): the page was hidden since (iOS can hand back a context that
   * never runs again, or whose clock is frozen while it says 'running'), or it was seen stalled.
   */
  private stale = false;
  /** Last time the context clock was seen moving, for the stall check in audioState(). */
  private clockSeen = { audio: 0, perf: 0 };

  constructor() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const hidden = (): void => {
      if (this.ctx) this.stale = true;
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hidden();
    });
    window.addEventListener('pagehide', hidden);
  }

  /** Lazily creates the context (null where Web Audio is missing, e.g. tests, or the browser will not make one). */
  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = audioContextClass();
    if (!Ctor) return null;
    // iOS: 'playback' keeps the clicks audible with the ring/silent switch on (Safari 16.4+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        /* read-only in some versions */
      }
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      // Refused (privacy hardening, no audio device, too many contexts): silent on the performance clock, as without
      // Web Audio. The next sound asks again.
      return null;
    }
    ctx.addEventListener('statechange', () => {
      if (ctx !== this.ctx) return; // a replaced context closing
      this.markClock();
      for (const cb of [...this.stateListeners]) cb(ctx.state);
    });
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    const channel = (): GainNode => {
      const g = ctx.createGain();
      g.connect(master);
      return g;
    };
    this.channels = { metronome: channel(), rhythm: channel(), tap: channel(), cue: channel() };
    this.ctx = ctx;
    this.applyVolumes();
    return ctx;
  }

  /** Drops the current context (closing it) so the next context() call builds a fresh one. */
  private discard(): void {
    const old = this.ctx;
    if (!old) return;
    this.stop();
    this.tapVoice = null;
    this.voices.clear();
    this.ctx = null;
    this.channels = null;
    this.stale = false;
    if (typeof old.close === 'function') void old.close().catch(() => undefined);
  }

  async unlock(): Promise<void> {
    // Inside a gesture, a new context starts reliably; resuming one iOS interrupted or froze in the background does not.
    if (this.ctx && (this.stale || (this.ctx.state as string) === 'interrupted')) this.discard();
    const ctx = this.context();
    if (!ctx) return;
    // iOS: starting a (silent) source inside the gesture unlocks output, resume() alone is not always enough.
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* resume can reject outside a gesture; the next unlock() retries */
      }
    }
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : perfNow() / 1000;
  }

  eventToAudioTime(timeStamp: number): number {
    const ctx = this.ctx;
    if (!ctx) return perfToAudioTime(timeStamp, { perfMs: perfNow(), audioS: this.now() }, 0, this.calibrationMs);
    // getOutputTimestamp pairs the context time being *heard* with its performance time,
    // so output latency is already included. Its value can be missing or stale (suspended context).
    const out = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    const pNow = perfNow();
    if (out && out.performanceTime && out.contextTime !== undefined && Math.abs(pNow - out.performanceTime) < 1000) {
      return perfToAudioTime(timeStamp, { perfMs: out.performanceTime, audioS: out.contextTime }, 0, this.calibrationMs);
    }
    // Fallback: anchor on currentTime (the scheduling clock) and take the output path's latency off.
    return perfToAudioTime(timeStamp, { perfMs: pNow, audioS: ctx.currentTime }, this.latency(), this.calibrationMs);
  }

  heardNow(): number {
    return this.eventToAudioTime(perfNow());
  }

  private latency(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.channels) return;
    for (const k of Object.keys(this.channels) as Route[]) {
      const v = Math.min(1, Math.max(0, this.volumes[k === 'cue' ? 'metronome' : k]));
      const muted = k === 'metronome' && this.metronomeMuted;
      // Squared: the slider feels closer to linear loudness.
      this.channels[k].gain.setTargetAtTime(muted ? 0 : v * v, ctx.currentTime, 0.02);
    }
  }

  setMetronomeMuted(muted: boolean): void {
    this.metronomeMuted = muted;
    this.applyVolumes();
  }

  setCalibrationOffsetMs(ms: number): void {
    this.calibrationMs = Number.isFinite(ms) ? ms : 0;
  }

  start(opts: StartOptions): Started {
    this.stop();
    const ctx = this.context();
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    this.markClock();
    const startTime = this.now() + (opts.leadIn ?? 0.1);
    const { beatsPerBar } = opts.meter;
    const beats = planBeats({
      startTime,
      tempo: opts.tempo,
      beatsPerBar,
      countInBars: opts.countInBars,
      playBeats: playBeatCount(opts.timeline, opts.tempo),
      metronome: opts.metronome,
    });
    const exerciseStart = exerciseStartTime(startTime, opts.tempo, beatsPerBar, opts.countInBars);
    const jobs: Job[] = beats
      .filter((b) => b.audible && !(b.countIn && opts.silentCountIn))
      .map((b) => ({ time: b.time, play: (c, t) => this.click(c, t, b.accent, b.countIn ? 'cue' : 'metronome') }));
    if (opts.playRhythm) {
      for (const n of planNotes(opts.timeline, exerciseStart)) {
        jobs.push({ time: n.time, play: (c, t) => this.woodblock(c, t, n.end) });
      }
    }
    this.run(jobs, beats);
    return { exerciseStart, end: exerciseStart + opts.timeline.totalSeconds };
  }

  clicks(count: number, bpm: number, leadIn?: number): number[] {
    this.stop();
    const ctx = this.context();
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    this.markClock();
    const times = clickTimes(count, bpm, this.now() + (leadIn ?? 0.5));
    const beats: BeatEvent[] = times.map((time, i) => ({ index: i, inBar: i % 4, countIn: false, time, accent: false, audible: true }));
    this.run(
      times.map((time) => ({ time, play: (c, t) => this.click(c, t, false, 'cue') })),
      beats,
    );
    return times;
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    if (this.raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.timer = null;
    this.raf = null;
    this.jobs = [];
    this.beats = [];
    this.jobCursor = 0;
    this.beatCursor = 0;
    const ctx = this.ctx;
    // Scheduled clicks and notes go; a tap the player is still holding keeps sounding until tapUp().
    for (const v of [...this.voices]) {
      if (v === this.tapVoice) continue;
      if (ctx) this.fadeOut(ctx, v, 0.01);
      this.voices.delete(v);
    }
  }

  audioState(): string {
    const ctx = this.ctx;
    if (!ctx) return 'none';
    if (ctx.state !== 'running' || ctx.currentTime !== this.clockSeen.audio) {
      this.markClock();
      return ctx.state;
    }
    if (perfNow() - this.clockSeen.perf < STALL_MS) return ctx.state;
    this.stale = true;
    return 'stalled';
  }

  private markClock(): void {
    this.clockSeen = { audio: this.ctx ? this.ctx.currentTime : 0, perf: perfNow() };
  }

  onStateChange(cb: (state: string) => void): () => void {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  onBeat(cb: BeatCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  tapDown(): void {
    const ctx = this.context();
    if (!ctx || !this.channels) return;
    if (this.tapVoice) this.fadeOut(ctx, this.tapVoice, 0.01);
    const t = ctx.currentTime;
    // "tok": a short pitch-dropping blip.
    const tok = this.voice(ctx, 'tap', 'sine', 660, t, t + 0.12);
    tok.src.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    this.envelope(tok.env, t, 0.5, 0.003, 0.07);
    // Quiet low sustain while the pad is held, released in tapUp().
    const hold = this.voice(ctx, 'tap', 'sine', 196, t, null);
    hold.env.gain.setValueAtTime(SILENT, t);
    hold.env.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    this.tapVoice = hold;
  }

  tapUp(): void {
    const ctx = this.ctx;
    if (!ctx || !this.tapVoice) return;
    this.fadeOut(ctx, this.tapVoice, 0.03);
    this.tapVoice = null;
  }

  // --- scheduler ---------------------------------------------------------------------------

  private run(jobs: Job[], beats: BeatEvent[]): void {
    this.jobs = jobs.sort((a, b) => a.time - b.time);
    this.beats = beats;
    this.jobCursor = 0;
    this.beatCursor = 0;
    this.tick();
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    if (typeof requestAnimationFrame === 'function') {
      const frame = (): void => {
        this.fireBeats();
        this.raf = this.beatCursor < this.beats.length ? requestAnimationFrame(frame) : null;
      };
      this.raf = requestAnimationFrame(frame);
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    const now = this.now();
    const next = dueUntil(this.jobs, this.jobCursor, now + SCHEDULE_AHEAD_S);
    for (let i = this.jobCursor; i < next; i++) {
      const job = this.jobs[i];
      if (ctx && job.time >= now - STALE_S) job.play(ctx, Math.max(job.time, now));
    }
    this.jobCursor = next;
    // The timer also fires beats, for when rAF is throttled (background tab) or missing.
    this.fireBeats();
    if (this.jobCursor >= this.jobs.length && this.beatCursor >= this.beats.length && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private fireBeats(): void {
    // A click is heard `latency` after its scheduled time.
    const heard = this.now() - this.latency() + BEAT_EARLY_S;
    while (this.beatCursor < this.beats.length && this.beats[this.beatCursor].time <= heard) {
      const b = this.beats[this.beatCursor++];
      const beat = { index: b.index, inBar: b.inBar, countIn: b.countIn, time: b.time };
      for (const cb of [...this.listeners]) cb(beat);
    }
  }

  // --- sounds ------------------------------------------------------------------------------

  private voice(ctx: AudioContext, channel: Route, type: OscillatorType, freq: number, at: number, stopAt: number | null): Voice {
    const src = ctx.createOscillator();
    src.type = type;
    src.frequency.setValueAtTime(freq, at);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, at);
    src.connect(env);
    env.connect(this.channels![channel]);
    src.start(at);
    if (stopAt !== null) src.stop(stopAt);
    const v: Voice = { src, env };
    this.voices.add(v);
    src.onended = () => {
      this.voices.delete(v);
      env.disconnect();
    };
    return v;
  }

  /** Fast attack to `peak`, exponential decay over `decay` seconds. */
  private envelope(g: GainNode, at: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(SILENT, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(SILENT, at + attack + decay);
  }

  private fadeOut(ctx: AudioContext, v: Voice, tau: number): void {
    const t = ctx.currentTime;
    v.env.gain.cancelScheduledValues(t);
    v.env.gain.setTargetAtTime(0, t, tau);
    try {
      v.src.stop(t + tau * 6);
    } catch {
      /* already stopped */
    }
  }

  pitches(midis: number[], gap = 0.32): void {
    const ctx = this.context();
    if (!ctx || !this.channels) return;
    const at = ctx.currentTime + 0.02;
    midis.forEach((m, i) => this.pianoTone(ctx, m, at + i * gap));
  }

  /** A short struck tone: a triangle with a quieter octave above, fast attack and a long-ish decay. */
  private pianoTone(ctx: AudioContext, midi: number, at: number): void {
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const body = this.voice(ctx, 'rhythm', 'triangle', freq, at, at + 1.3);
    this.envelope(body.env, at, 0.5, 0.005, 1.2);
    const shine = this.voice(ctx, 'rhythm', 'sine', freq * 2, at, at + 0.6);
    this.envelope(shine.env, at, 0.12, 0.005, 0.5);
  }

  /** Metronome click: beat 1 higher and a little louder. */
  private click(ctx: AudioContext, at: number, accent: boolean, route: Route): void {
    const v = this.voice(ctx, route, 'triangle', accent ? 1760 : 1175, at, at + 0.06);
    this.envelope(v.env, at, accent ? 0.9 : 0.6, 0.001, 0.045);
  }

  /** Woodblock hit for rhythm playback, with a soft tone underneath that lasts the note's length. */
  private woodblock(ctx: AudioContext, at: number, end: number): void {
    const body = this.voice(ctx, 'rhythm', 'sine', 740, at, at + 0.12);
    this.envelope(body.env, at, 0.8, 0.001, 0.09);
    const knock = this.voice(ctx, 'rhythm', 'sine', 1810, at, at + 0.06);
    this.envelope(knock.env, at, 0.35, 0.001, 0.035);
    // Ends a little early so repeated notes stay separate.
    const off = Math.max(at + 0.05, end - 0.03);
    const tone = this.voice(ctx, 'rhythm', 'triangle', 392, at, off + 0.08);
    tone.env.gain.setValueAtTime(SILENT, at);
    tone.env.gain.exponentialRampToValueAtTime(0.1, at + 0.02);
    tone.env.gain.setValueAtTime(0.1, off);
    tone.env.gain.exponentialRampToValueAtTime(SILENT, off + 0.06);
  }
}

let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new WebAudioEngine();
  return engine;
}
