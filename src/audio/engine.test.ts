import type { Meter, Timeline } from '../core/types';
import { getAudioEngine } from './engine';

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

// iOS, back from the background: the context can stay 'interrupted', or say 'running' with a frozen clock.
describe('audio engine coming back from the background', () => {
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
    private node = () => ({ connect() {}, disconnect() {}, gain: { value: 1, setTargetAtTime() {} } });
    createGain = this.node;
    createBuffer = () => ({});
    createBufferSource = () => ({ ...this.node(), buffer: null, start() {} });
    resume = async () => undefined;
    close = async () => {
      this.closed = true;
    };
  }
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
  class Refused {
    constructor() {
      made++;
      throw new DOMException('The AudioContext could not be created', 'NotSupportedError');
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    vi.resetModules();
    made = 0;
    vi.stubGlobal('AudioContext', Refused);
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs silently on the performance clock, as without Web Audio, and tries again next time', async () => {
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
    // Each sound asks again, so a refusal that passes (a device plugged in) brings the sound back.
    expect(made).toBeGreaterThan(1);
  });
});
