/**
 * Pure scheduling maths for the audio engine (§6.1, §7): which clicks and notes sound when,
 * and how input timestamps map onto the audio clock. No Web Audio here, so it is unit tested.
 */
import type { Timeline } from '../core/types';

/** How often the scheduler wakes up (ms) and how far ahead it schedules (s). */
export const SCHEDULER_INTERVAL_MS = 25;
export const SCHEDULE_AHEAD_S = 0.1;

export type MetronomeMode = 'on' | 'accent' | 'off';

export interface BeatEvent {
  /** Beat number relative to the exercise start: count-in beats are negative, 0 = first beat of the exercise. */
  index: number;
  /** Beat inside its bar, 0-based (0 = beat 1). */
  inBar: number;
  countIn: boolean;
  /** Audio time in seconds. */
  time: number;
  /** Beat 1 of a bar: the higher click. */
  accent: boolean;
  /** Whether a click is heard on this beat (count-in always; play depends on the metronome mode). */
  audible: boolean;
}

export interface NoteEvent {
  index: number;
  time: number; // audio time of the onset (s)
  end: number; // audio time when the sound stops (s)
}

export function beatSeconds(tempo: number): number {
  return 60 / tempo;
}

/** Beat 1 of every bar is accented. */
export function isAccent(inBar: number): boolean {
  return inBar === 0;
}

/** Whether a play-time click on `inBar` is heard in the given metronome mode. */
export function clickAudible(mode: MetronomeMode, inBar: number): boolean {
  if (mode === 'on') return true;
  if (mode === 'accent') return isAccent(inBar);
  return false;
}

export interface BeatPlan {
  /** Audio time of the first count-in click (or of the exercise start when there is no count-in). */
  startTime: number;
  tempo: number;
  beatsPerBar: number;
  countInBars: number;
  /** Number of beats in the exercise itself (count-in excluded). */
  playBeats: number;
  metronome: MetronomeMode;
}

/** Every beat of the count-in and the exercise, in time order. */
export function planBeats(p: BeatPlan): BeatEvent[] {
  const step = beatSeconds(p.tempo);
  const countInBeats = Math.max(0, Math.round(p.countInBars)) * p.beatsPerBar;
  const out: BeatEvent[] = [];
  for (let i = 0; i < countInBeats + p.playBeats; i++) {
    const index = i - countInBeats;
    const countIn = index < 0;
    const inBar = ((index % p.beatsPerBar) + p.beatsPerBar) % p.beatsPerBar;
    out.push({
      index,
      inBar,
      countIn,
      time: p.startTime + i * step,
      accent: isAccent(inBar),
      audible: countIn || clickAudible(p.metronome, inBar),
    });
  }
  return out;
}

/** Audio time of the exercise's first beat, after the count-in. */
export function exerciseStartTime(startTime: number, tempo: number, beatsPerBar: number, countInBars: number): number {
  return startTime + Math.max(0, Math.round(countInBars)) * beatsPerBar * beatSeconds(tempo);
}

/** Number of beats the exercise lasts (whole beats; every MVP bar is a whole number of beats). */
export function playBeatCount(timeline: Timeline, tempo: number): number {
  return Math.max(0, Math.round(timeline.totalSeconds / beatSeconds(tempo)));
}

/** Timeline notes moved onto the audio clock. */
export function planNotes(timeline: Timeline, exerciseStart: number): NoteEvent[] {
  return timeline.notes.map((n) => ({ index: n.index, time: exerciseStart + n.onset, end: exerciseStart + n.end }));
}

/** `count` evenly spaced clicks at `bpm`, the first at `startTime` (calibration). */
export function clickTimes(count: number, bpm: number, startTime: number): number[] {
  const step = beatSeconds(bpm);
  return Array.from({ length: Math.max(0, count) }, (_, i) => startTime + i * step);
}

/**
 * Look-ahead step: from `cursor`, the items (sorted by `time`) due before `horizon`.
 * Returns the new cursor; items[cursor..next) are the ones to schedule now.
 */
export function dueUntil<T extends { time: number }>(items: readonly T[], cursor: number, horizon: number): number {
  let i = cursor;
  while (i < items.length && items[i].time < horizon) i++;
  return i;
}

export interface ClockAnchor {
  /** performance.now() (ms) of the anchor. */
  perfMs: number;
  /** Audio time (s) at that same moment. */
  audioS: number;
}

/**
 * Maps an input event.timeStamp (ms, performance.now() timebase) onto the audio clock.
 * `latencyS` is subtracted (what the anchor does not already include), then the calibration
 * offset (positive = the player's taps arrive late, §6.1).
 */
export function perfToAudioTime(timeStampMs: number, anchor: ClockAnchor, latencyS: number, calibrationMs: number): number {
  return anchor.audioS + (timeStampMs - anchor.perfMs) / 1000 - latencyS - calibrationMs / 1000;
}
