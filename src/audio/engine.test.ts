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
