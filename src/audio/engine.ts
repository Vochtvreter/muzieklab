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

/**
 * Settings → Instrument: what every exercise is played on (piano by default): melodies, rhythms, scales, Read notes and
 * Learn's examples. Only the metronome clicks and the tap feedback have sounds of their own.
 */
export type Instrument = 'piano' | 'violin' | 'flute';
export const INSTRUMENTS: readonly Instrument[] = ['piano', 'violin', 'flute'];

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
  /** Play the rhythm itself (Listen / correct playback), on the instrument: on RHYTHM_PITCH unless `melody` is given. */
  playRhythm: boolean;
  /** Seconds between now and the first count-in click. */
  leadIn?: number;
  /** Count-in beats still fire onBeat (for the visual counter) but make no sound. */
  silentCountIn?: boolean;
  /**
   * A melody (Listen · Melody, §3.2): the MIDI number of each onset, played on the instrument for its length instead of
   * RHYTHM_PITCH.
   */
  melody?: number[];
  /**
   * A reference note (MIDI): the note a melody starts from (Listen · Melody, §3.2). It sounds alone, held for
   * REFERENCE_NOTE_SECONDS, and the count-in starts REFERENCE_SECONDS after it.
   */
  reference?: number;
}

/** How long a reference note is held (§3.2). */
export const REFERENCE_NOTE_SECONDS = 1.6;
/** From the reference note to the first count-in click: the note, then a short rest. */
export const REFERENCE_SECONDS = 2.2;

export interface Started {
  /** Audio time (s) of the exercise's first beat, after the count-in. */
  exerciseStart: number;
  /** Audio time (s) when the exercise ends. */
  end: number;
  /** With a reference note: the audio times (s) it starts and stops. The count-in starts after it. */
  reference?: { start: number; end: number };
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
  /** The instrument notes are played on from now on (pitches(), a rhythm or melody, and its reference note). */
  setInstrument(instrument: Instrument): void;
  /** Silences the metronome during play only; count-in and calibration clicks stay audible at the metronome volume. */
  setMetronomeMuted(muted: boolean): void;
  setCalibrationOffsetMs(ms: number): void;
  start(opts: StartOptions): Started;
  stop(): void;
  /**
   * Plays notes by MIDI number (60 = middle C), one after the other, `gap` seconds apart, starting now, on the instrument
   * (setInstrument) on the rhythm channel (Scales: each right note, and *Hear it so far*). A piano note rings on as
   * struck; a violin or flute note is held until just before the next one.
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
  src: AudioScheduledSourceNode;
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
/** How long pitches() holds a violin or flute note at most, and the last one of a run (s). */
const HELD_S = 0.9;
/** The note a rhythm without a melody is played on, on the instrument (G4: in the range of the piano, violin and flute). */
export const RHYTHM_PITCH = 67;

const midiFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
/** A struck piano string's overtones above the fundamental: [harmonic, peak, decay in s]. Slightly sharp, as on a piano. */
const PIANO_PARTIALS: readonly (readonly [number, number, number])[] = [
  [2.002, 0.12, 0.5],
  [3.006, 0.05, 0.3],
  [4.012, 0.025, 0.18],
];

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
  private instrument: Instrument = 'piano';
  /** A second of white noise, for the piano's hammer and the flute's breath: made once per context. */
  private noise: AudioBuffer | null = null;
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
  /**
   * The browser refused a context (its constructor threw): silent on the performance clock until the next unlock()
   * asks again, before a new run (Start, Listen, Calibrate…). Never during one: a tap or a note that brought a context
   * would move now() to its clock, which starts near 0, and no beat of the run would come.
   */
  private refused = false;
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
    if (!Ctor || this.refused) return null;
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
      // Web Audio, until the next unlock() asks again.
      this.refused = true;
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
    this.noise = null;
    this.stale = false;
    if (typeof old.close === 'function') void old.close().catch(() => undefined);
  }

  async unlock(): Promise<void> {
    // Inside a gesture, a new context starts reliably; resuming one iOS interrupted or froze in the background does not.
    if (this.ctx && (this.stale || (this.ctx.state as string) === 'interrupted')) this.discard();
    // A refused context is asked for again here, before a new run, so a refusal that passed (a device plugged in)
    // brings the sound back.
    this.refused = false;
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

  setInstrument(instrument: Instrument): void {
    this.instrument = INSTRUMENTS.includes(instrument) ? instrument : 'piano';
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
    const first = this.now() + (opts.leadIn ?? 0.1);
    // The reference note sounds alone, before the count-in, so it is not heard as part of the melody.
    const startTime = first + (opts.reference !== undefined ? REFERENCE_SECONDS : 0);
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
      const melody = opts.melody;
      for (const n of planNotes(opts.timeline, exerciseStart)) {
        const midi = melody?.[n.index] ?? RHYTHM_PITCH;
        jobs.push({ time: n.time, play: (c, t) => this.note(c, midi, t, n.end) });
      }
    }
    let reference: Started['reference'];
    if (opts.reference !== undefined) {
      const midi = opts.reference;
      reference = { start: first, end: first + REFERENCE_NOTE_SECONDS };
      jobs.push({ time: first, play: (c, t) => this.note(c, midi, t, first + REFERENCE_NOTE_SECONDS) });
    }
    this.run(jobs, beats);
    return { exerciseStart, end: exerciseStart + opts.timeline.totalSeconds, ...(reference ? { reference } : {}) };
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

  /** An oscillator through `chain` (filters, in order) and its own envelope to `channel`, from `at` until `stopAt`. */
  private voice(
    ctx: AudioContext,
    channel: Route,
    type: OscillatorType,
    freq: number,
    at: number,
    stopAt: number | null,
    chain: AudioNode[] = [],
  ): { src: OscillatorNode; env: GainNode } {
    const src = ctx.createOscillator();
    src.type = type;
    src.frequency.setValueAtTime(freq, at);
    return this.own(ctx, src, channel, at, stopAt, chain);
  }

  /** Wires a source through `chain` and a new envelope to `channel`, starts it and keeps it in `voices` until it ends. */
  private own<S extends AudioScheduledSourceNode>(
    ctx: AudioContext,
    src: S,
    channel: Route,
    at: number,
    stopAt: number | null,
    chain: AudioNode[] = [],
  ): { src: S; env: GainNode } {
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, at);
    let out: AudioNode = src;
    for (const n of chain) {
      out.connect(n);
      out = n;
    }
    out.connect(env);
    env.connect(this.channels![channel]);
    src.start(at);
    if (stopAt !== null) src.stop(stopAt);
    const v = { src, env };
    this.voices.add(v);
    src.onended = () => {
      this.voices.delete(v);
      env.disconnect();
      for (const n of chain) n.disconnect();
    };
    return v;
  }

  /** A filter of `type` at `freq` (Hz), for a voice to sound through. */
  private filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Vibrato on `src`: `cents` deep at `rate` Hz, coming in over `fadeIn` seconds from `from`, until `stopAt`. */
  private vibrato(ctx: AudioContext, src: OscillatorNode, rate: number, cents: number, from: number, fadeIn: number, stopAt: number): void {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, from);
    depth.gain.linearRampToValueAtTime(cents, from + fadeIn);
    lfo.connect(depth);
    depth.connect(src.detune);
    lfo.start(from);
    lfo.stop(stopAt);
    lfo.onended = () => depth.disconnect();
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
    const last = midis.length - 1;
    midis.forEach((m, i) => {
      const t = at + i * gap;
      // Held until a little before the next note (legato), the last one a little longer.
      const hold = i === last ? HELD_S : Math.min(HELD_S, Math.max(0.12, gap * 0.92));
      this.note(ctx, m, t, t + hold, true);
    });
  }

  /**
   * One note on the instrument from `at`, held until `end`. A piano note `struck` (pitches()) rings on by itself instead,
   * as a key pressed and let go; a violin or flute note always stops at `end`.
   */
  private note(ctx: AudioContext, midi: number, at: number, end: number, struck = false): void {
    if (this.instrument === 'violin') this.violinNote(ctx, midi, at, end);
    else if (this.instrument === 'flute') this.fluteNote(ctx, midi, at, end);
    else if (struck) this.pianoTone(ctx, midi, at);
    else this.pianoNote(ctx, midi, at, end);
  }

  /** A struck piano note, ringing on: it fades over about a second and grows darker as it does. */
  private pianoTone(ctx: AudioContext, midi: number, at: number): void {
    const freq = midiFreq(midi);
    const body = this.voice(ctx, 'rhythm', 'triangle', freq, at, at + 1.3, [this.damper(ctx, freq, at)]);
    this.envelope(body.env, at, 0.5, 0.005, 1.2);
    this.strike(ctx, freq, at, at + 0.6);
  }

  /**
   * A piano note held for its length (a melody): the struck tone of pianoTone, sustained softly until a little before
   * `end`, so repeated notes stay separate.
   */
  private pianoNote(ctx: AudioContext, midi: number, at: number, end: number): void {
    const freq = midiFreq(midi);
    const off = Math.max(at + 0.08, end - 0.04);
    const body = this.voice(ctx, 'rhythm', 'triangle', freq, at, off + 0.12, [this.damper(ctx, freq, at)]);
    body.env.gain.setValueAtTime(SILENT, at);
    body.env.gain.exponentialRampToValueAtTime(0.5, at + 0.006);
    body.env.gain.exponentialRampToValueAtTime(0.2, at + 0.35);
    body.env.gain.setValueAtTime(0.2, Math.max(at + 0.36, off - 0.001));
    body.env.gain.exponentialRampToValueAtTime(SILENT, off + 0.08);
    this.strike(ctx, freq, at, Math.min(at + 0.5, off + 0.08));
  }

  /** A low-pass that closes after the strike: a piano string is bright as it is hit and mellows as it rings. */
  private damper(ctx: AudioContext, freq: number, at: number): BiquadFilterNode {
    const f = this.filter(ctx, 'lowpass', Math.min(12000, freq * 10), 0.5);
    f.frequency.setValueAtTime(Math.min(12000, freq * 10), at);
    f.frequency.exponentialRampToValueAtTime(Math.min(12000, Math.max(500, freq * 2.5)), at + 0.8);
    return f;
  }

  /**
   * What makes a struck string sound struck: its overtones, each a little sharp (as a piano's are) and fading faster the
   * higher it is, all gone by `until`, and a short knock of the hammer.
   */
  private strike(ctx: AudioContext, freq: number, at: number, until: number): void {
    for (const [n, peak, decay] of PIANO_PARTIALS) {
      const f = freq * n;
      if (f > 14000) continue;
      const p = this.voice(ctx, 'rhythm', 'sine', f, at, Math.min(until, at + decay + 0.1));
      this.envelope(p.env, at, peak, 0.004, Math.min(decay, until - at - 0.005));
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const hammer = this.own(ctx, src, 'rhythm', at, at + 0.06, [this.filter(ctx, 'bandpass', Math.min(5000, Math.max(1200, freq * 4)), 1)]);
    this.envelope(hammer.env, at, 0.06, 0.001, 0.03);
  }

  /**
   * A bowed note: a sawtooth through a low-pass (the string's brightness) and a body resonance, a soft bow attack,
   * held until a little before `end`, with a vibrato that comes in once the note has settled.
   */
  private violinNote(ctx: AudioContext, midi: number, at: number, end: number): void {
    const freq = midiFreq(midi);
    const off = Math.max(at + 0.1, end - 0.04);
    const stopAt = off + 0.2;
    const string = this.filter(ctx, 'lowpass', Math.min(5000, Math.max(1500, freq * 5)), 0.9);
    const body = this.filter(ctx, 'peaking', 2800, 1.2);
    body.gain.value = 4;
    const bow = this.voice(ctx, 'rhythm', 'sawtooth', freq, at, stopAt, [string, body]);
    const g = bow.env.gain;
    g.setValueAtTime(SILENT, at);
    g.exponentialRampToValueAtTime(0.26, at + 0.06);
    g.linearRampToValueAtTime(0.21, at + 0.18);
    g.setValueAtTime(0.21, Math.max(at + 0.19, off - 0.001));
    g.exponentialRampToValueAtTime(SILENT, off + 0.15);
    if (off - at > 0.3) this.vibrato(ctx, bow.src, 5.6, 14, at + 0.18, 0.25, stopAt);
  }

  /**
   * A blown note: a pure tone with quiet overtones, a little breath noise that is strongest as the note speaks, held
   * until a little before `end`, with a gentle vibrato on longer notes.
   */
  private fluteNote(ctx: AudioContext, midi: number, at: number, end: number): void {
    const freq = midiFreq(midi);
    const off = Math.max(at + 0.08, end - 0.04);
    const stopAt = off + 0.15;
    const hold = (g: GainNode, peak: number, sustain: number, attack: number): void => {
      g.gain.setValueAtTime(SILENT, at);
      g.gain.exponentialRampToValueAtTime(peak, at + attack);
      g.gain.linearRampToValueAtTime(sustain, at + attack + 0.08);
      g.gain.setValueAtTime(sustain, Math.max(at + attack + 0.09, off - 0.001));
      g.gain.exponentialRampToValueAtTime(SILENT, off + 0.1);
    };
    const tone = this.voice(ctx, 'rhythm', 'sine', freq, at, stopAt);
    hold(tone.env, 0.25, 0.21, 0.05);
    const second = this.voice(ctx, 'rhythm', 'sine', freq * 2, at, stopAt);
    hold(second.env, 0.04, 0.03, 0.04);
    const third = this.voice(ctx, 'rhythm', 'sine', freq * 3, at, stopAt);
    hold(third.env, 0.015, 0.009, 0.04);
    if (off - at > 0.3) {
      // In cents, so the overtones move with the tone.
      for (const v of [tone, second, third]) this.vibrato(ctx, v.src, 5, 9, at + 0.2, 0.3, stopAt);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const breath = this.own(ctx, src, 'rhythm', at, stopAt, [this.filter(ctx, 'bandpass', Math.min(8000, freq * 2), 1.5)]);
    hold(breath.env, 0.05, 0.012, 0.03);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  /** Metronome click: beat 1 higher and a little louder. */
  private click(ctx: AudioContext, at: number, accent: boolean, route: Route): void {
    const v = this.voice(ctx, route, 'triangle', accent ? 1760 : 1175, at, at + 0.06);
    this.envelope(v.env, at, accent ? 0.9 : 0.6, 0.001, 0.045);
  }
}

let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new WebAudioEngine();
  return engine;
}
