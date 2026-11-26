import type { Meter, Timeline } from '../core/types';
import { RHYTHM_PITCH, getAudioEngine } from './engine';

// Node has no Web Audio: the engine runs on the performance clock, silently. This checks the scheduler loop and onBeat.
describe('audio engine without Web Audio', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }));
  afterEach(() => {
    getAudioEngine().stop();
    vi.useRealTimers();
  });

  const meter = { id: '4/4', barTicks: 192, beatTicks: 48, beatsPerBar: 4, beamGroups: [48, 48, 48, 48], weightAt: () => 0 } as Meter;
  const timeline: Timeline = { notes: [], totalSeconds: 2, beatSeconds: 0.5 };

  it('is a singleton', () => {
    expect(getAudioEngine()).toBe(getAudioEngine());
  });

  it('fires onBeat for the count-in and the exercise, in time', () => {
    const engine = getAudioEngine();
    const seen: Array<{ index: number; inBar: number; countIn: boolean; late: number }> = [];
    const off = engine.onBeat((b) => seen.push({ index: b.index, inBar: b.inBar, countIn: b.countIn, late: engine.now() - b.time }));
    const t0 = engine.now();
    const started = engine.start({ timeline, meter, tempo: 120, countInBars: 1, metronome: 'off', playRhythm: true, leadIn: 0.2 });
    expect(started.exerciseStart).toBeCloseTo(t0 + 0.2 + 2);
    expect(started.end).toBeCloseTo(started.exerciseStart + 2);
    vi.advanceTimersByTime(1000);
    expect(seen.map((b) => b.index)).toEqual([-4, -3]);
    vi.advanceTimersByTime(4000);
    expect(seen.map((b) => b.index)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3]);
    expect(seen.slice(0, 4).every((b) => b.countIn)).toBe(true);
    expect(seen.map((b) => b.inBar)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    for (const b of seen) expect(b.late).toBeLessThan(0.03); // within one scheduler tick
    off();
  });

  it('holds a reference note through the count-in bar, up to the melody, and says when it sounds', () => {
    const engine = getAudioEngine();
    const seen: number[] = [];
    const off = engine.onBeat((b) => seen.push(b.index));
    const t0 = engine.now();
    const started = engine.start({ timeline, meter, tempo: 120, countInBars: 1, metronome: 'off', playRhythm: true, leadIn: 0.2, melody: [], reference: 60 });
    // One bar of 4/4 at 120: the count-in takes 2 s, and the melody starts right after it.
    expect(started.reference!.start).toBeCloseTo(t0 + 0.2);
    expect(started.reference!.end).toBeCloseTo(started.exerciseStart);
    expect(started.exerciseStart).toBeCloseTo(t0 + 0.2 + 2);
    // The count-in beats still fire (for what is shown) while the reference sounds.
    vi.advanceTimersByTime(2300);
    expect(seen).toEqual([-4, -3, -2, -1, 0]);
    off();
  });

  it('stop() cancels pending beats; clicks() returns evenly spaced times', () => {
    const engine = getAudioEngine();
    const seen: number[] = [];
    const off = engine.onBeat((b) => seen.push(b.index));
    const times = engine.clicks(4, 60, 0.5);
    expect(times[1] - times[0]).toBeCloseTo(1);
    vi.advanceTimersByTime(1600);
    engine.stop();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([0, 1]);
    off();
  });

  it('eventToAudioTime applies the calibration offset', () => {
    const engine = getAudioEngine();
    const ts = performance.now();
    const base = engine.eventToAudioTime(ts);
    engine.setCalibrationOffsetMs(40);
    expect(engine.eventToAudioTime(ts)).toBeCloseTo(base - 0.04);
    engine.setCalibrationOffsetMs(0);
  });
});

/** A context whose clock moves only when a test sets currentTime: enough for unlock(), start() and the tap sound. */
class FakeContext extends EventTarget {
  static made: FakeContext[] = [];
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  closed = false;
  destination = {};
  constructor() {
    super();
    FakeContext.made.push(this);
  }
  /** Every oscillator made, with its type, the frequency it starts on and the time it was told to stop. */
  oscillators: { type: string; freq: number | null; stopAt: number | null }[] = [];
  filters = 0;
  noise = 0;
  private param = () => ({
    value: 1,
    setValueAtTime() {},
    setTargetAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  private node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: this.param(), frequency: this.param(), detune: this.param(), Q: this.param() });
  createGain = this.node;
  createOscillator = () => {
    const rec = { type: 'sine', freq: null as number | null, stopAt: null as number | null };
    this.oscillators.push(rec);
    const n = this.node();
    n.frequency.setValueAtTime = ((v: number) => {
      rec.freq ??= v;
    }) as () => void;
    n.stop = ((t: number) => {
      rec.stopAt = t;
    }) as () => void;
    return Object.defineProperty(n, 'type', { set: (v: string) => (rec.type = v), get: () => rec.type });
  };
  createBiquadFilter = () => {
    this.filters++;
    return { ...this.node(), type: 'lowpass' };
  };
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  createBufferSource = () => {
    this.noise++;
    return { ...this.node(), buffer: null, loop: false };
  };
  resume = async () => undefined;
  close = async () => {
    this.closed = true;
  };
}

// iOS, back from the background: the context can stay 'interrupted', or say 'running' with a frozen clock.
describe('audio engine coming back from the background', () => {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] });
    vi.resetModules();
    FakeContext.made = [];
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const fresh = async () => (await import('./engine')).getAudioEngine();

  it('replaces an interrupted context on the next unlock', async () => {
    const engine = await fresh();
    await engine.unlock();
    FakeContext.made[0].state = 'interrupted';
    await engine.unlock();
    expect(FakeContext.made).toHaveLength(2);
    expect(FakeContext.made[0].closed).toBe(true);
    expect(engine.audioState()).toBe('running');
  });

  it('reads a running context with a frozen clock as stalled, and replaces it', async () => {
    const engine = await fresh();
    await engine.unlock();
    const ctx = FakeContext.made[0];
    expect(engine.audioState()).toBe('running');
    vi.advanceTimersByTime(300);
    ctx.currentTime = 0.3; // moving
    expect(engine.audioState()).toBe('running');
    vi.advanceTimersByTime(600); // frozen since
    expect(engine.audioState()).toBe('stalled');
    await engine.unlock();
    expect(FakeContext.made).toHaveLength(2);
    expect(engine.audioState()).toBe('running');
  });

  it('starts a fresh context after the page was hidden', async () => {
    const engine = await fresh();
    await engine.unlock();
    await engine.unlock();
    expect(FakeContext.made).toHaveLength(1);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'visible';
    await engine.unlock();
    expect(FakeContext.made).toHaveLength(2);
    expect(FakeContext.made[0].closed).toBe(true);
  });
});

// A browser can refuse a context (privacy hardening, no audio device, too many contexts): its constructor throws.
describe('audio engine whose AudioContext cannot be created', () => {
  const meter = { id: '4/4', barTicks: 192, beatTicks: 48, beatsPerBar: 4, beamGroups: [48, 48, 48, 48], weightAt: () => 0 } as Meter;
  const timeline: Timeline = { notes: [], totalSeconds: 2, beatSeconds: 0.5 };
  let made = 0;
  /** Whether the browser makes a context now: a refusal can pass (a device plugged in). */
  let allow = false;
  class Refused extends FakeContext {
    constructor() {
      made++;
      if (!allow) throw new DOMException('The AudioContext could not be created', 'NotSupportedError');
      super();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    vi.resetModules();
    made = 0;
    allow = false;
    FakeContext.made = [];
    vi.stubGlobal('AudioContext', Refused);
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs silently on the performance clock, as without Web Audio, and asks again at the next unlock', async () => {
    const engine = (await import('./engine')).getAudioEngine();
    await expect(engine.unlock()).resolves.toBeUndefined();
    const seen: number[] = [];
    const off = engine.onBeat((b) => seen.push(b.index));
    const t0 = engine.now();
    let started: { exerciseStart: number } | null = null;
    expect(() => {
      started = engine.start({ timeline, meter, tempo: 120, countInBars: 1, metronome: 'on', playRhythm: true, leadIn: 0.2 });
    }).not.toThrow();
    expect(started!.exerciseStart).toBeCloseTo(t0 + 0.2 + 2);
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([-4, -3, -2, -1, 0, 1, 2, 3]);
    off();
    expect(() => engine.clicks(4, 60)).not.toThrow();
    expect(() => engine.pitches([60, 64])).not.toThrow();
    expect(() => engine.tapDown()).not.toThrow();
    engine.tapUp();
    engine.stop();
    expect(engine.audioState()).toBe('none');
    // The sounds of the run did not ask again; the next unlock() (the next Start, Listen or Calibrate) does.
    expect(made).toBe(1);
    await engine.unlock();
    expect(made).toBe(2);
  });

  it('keeps a run on the performance clock when the browser would make a context during it', async () => {
    const engine = (await import('./engine')).getAudioEngine();
    // The page has been open a while: a new context's clock, near 0, is far from the performance clock.
    vi.advanceTimersByTime(40_000);
    await engine.unlock(); // Start: refused
    const seen: number[] = [];
    const off = engine.onBeat((b) => seen.push(b.index));
    const started = engine.start({ timeline, meter, tempo: 120, countInBars: 1, metronome: 'on', playRhythm: false, leadIn: 0.2 });
    expect(started.exerciseStart).toBeCloseTo(40 + 0.2 + 2);
    vi.advanceTimersByTime(700);
    allow = true;
    // A tap on the pad during the count-in: it makes no context, so the beats still come.
    engine.tapDown();
    engine.tapUp();
    expect(FakeContext.made).toHaveLength(0);
    expect(engine.now()).toBeCloseTo(performance.now() / 1000);
    expect(engine.audioState()).toBe('none');
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([-4, -3, -2, -1, 0, 1, 2, 3]);
    off();
    engine.stop();
    // The next Start makes one: the sound is back, on its clock.
    await engine.unlock();
    expect(FakeContext.made).toHaveLength(1);
    FakeContext.made[0].currentTime = 0.5;
    expect(engine.now()).toBe(0.5);
    expect(engine.audioState()).toBe('running');
  });
});

// Settings → Instrument: the notes of pitches() and a melody, on the piano (default), the violin or the flute.
describe('audio engine instruments', () => {
  const meter = { id: '4/4', barTicks: 192, beatTicks: 48, beatsPerBar: 4, beamGroups: [48, 48, 48, 48], weightAt: () => 0 } as Meter;
  const timeline: Timeline = {
    notes: [
      { index: 0, bar: 0, tick: 0, onset: 0, end: 1, durationTicks: 96, next: 'note' },
      { index: 1, bar: 0, tick: 96, onset: 1, end: 2, durationTicks: 96, next: 'end' },
    ],
    totalSeconds: 2,
    beatSeconds: 0.5,
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    vi.resetModules();
    FakeContext.made = [];
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** Moves the context's clock and the scheduler on together, 3 s in 50 ms steps. */
  const play = (ctx: FakeContext): void => {
    for (let i = 0; i < 60; i++) {
      ctx.currentTime += 0.05;
      vi.advanceTimersByTime(50);
    }
  };

  const fresh = async () => {
    const engine = (await import('./engine')).getAudioEngine();
    await engine.unlock();
    return { engine, ctx: FakeContext.made[0] };
  };

  it('plays pitches on the piano by default: a string with its overtones and a hammer, ringing on', async () => {
    const { engine, ctx } = await fresh();
    engine.pitches([60, 64], 0.3);
    const note = ['triangle', 'sine', 'sine', 'sine'];
    expect(ctx.oscillators.map((o) => o.type)).toEqual([...note, ...note]);
    expect(ctx.filters).toBe(4); // the darkening low-pass and the hammer's band each
    expect(ctx.noise).toBe(3); // unlock()'s silent buffer, and a hammer each
    // Struck: the first note rings past the second.
    expect(ctx.oscillators[0].stopAt!).toBeGreaterThan(0.3 + 0.5);
  });

  it('plays the violin as a filtered sawtooth with vibrato, held until just before the next note', async () => {
    const { engine, ctx } = await fresh();
    engine.setInstrument('violin');
    engine.pitches([60, 64, 67, 72], 0.3);
    const bows = ctx.oscillators.filter((o) => o.type === 'sawtooth');
    expect(bows).toHaveLength(4);
    expect(ctx.filters).toBe(8); // a low-pass and a body resonance each
    // The first note ends near the second one's start (0.02 + 0.3), not a struck note's long ring.
    expect(bows[0].stopAt!).toBeLessThan(0.02 + 0.3 + 0.25);
    // The last one is held longer, long enough for vibrato (a sine driving the detune).
    expect(bows[3].stopAt!).toBeGreaterThan(0.02 + 0.9 + 0.9);
    expect(ctx.oscillators.filter((o) => o.type === 'sine')).toHaveLength(1);
  });

  it('plays the flute as a pure tone with soft overtones and breath', async () => {
    const { engine, ctx } = await fresh();
    engine.setInstrument('flute');
    engine.pitches([60], 0.3);
    expect(ctx.oscillators.filter((o) => o.type !== 'sine')).toHaveLength(0);
    expect(ctx.noise).toBe(2); // unlock()'s silent buffer, and the breath
    expect(ctx.filters).toBe(1);
  });

  it('plays a melody and its reference note on the instrument', async () => {
    const { engine, ctx } = await fresh();
    engine.setInstrument('violin');
    engine.start({ timeline, meter, tempo: 120, countInBars: 0, metronome: 'off', playRhythm: true, leadIn: 0, melody: [60, 62], reference: 60 });
    play(ctx);
    const bows = ctx.oscillators.filter((o) => o.type === 'sawtooth');
    expect(bows.map((o) => Math.round(o.freq ?? 0))).toEqual([262, 262, 294]);
    engine.stop();
  });

  it.each([
    ['piano', 'triangle'],
    ['violin', 'sawtooth'],
    ['flute', 'sine'],
  ] as const)('plays a rhythm without a melody on the %s, on one note', async (instrument, type) => {
    const { engine, ctx } = await fresh();
    engine.setInstrument(instrument);
    engine.start({ timeline, meter, tempo: 120, countInBars: 0, metronome: 'off', playRhythm: true, leadIn: 0 });
    play(ctx);
    const freq = Math.round(440 * 2 ** ((RHYTHM_PITCH - 69) / 12));
    const tones = ctx.oscillators.filter((o) => o.type === type && Math.round(o.freq ?? 0) === freq);
    expect(tones).toHaveLength(2); // one per note of the timeline
    engine.stop();
  });

  it('falls back to the piano for an instrument it does not know', async () => {
    const { engine, ctx } = await fresh();
    engine.setInstrument('tuba' as never);
    engine.pitches([60]);
    expect(ctx.oscillators.map((o) => o.type)).toEqual(['triangle', 'sine', 'sine', 'sine']);
  });
});
