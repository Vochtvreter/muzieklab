import { MAX_BARS, MAX_TEMPO } from './defaults';
import type { Exercise, JudgeResult, NoteResult, Tap, Timeline } from './types';
import { spellExercise } from './speller';
import { valueKey } from './values';

/** One-line coaching tip (§6.4): message key + params for i18n. */
export interface CoachTip {
  key: string;
  params: Record<string, string | number>;
}

/** Steadiness worth a tip, in ms of standard deviation. */
export const UNSTEADY_SD_MS = 45;
/** Share of notes missed or extra taps (per note) from which reading, not timing, is the problem. */
export const OFF_TRACK_SHARE = 0.25;
/** A rushing / dragging tip needs at least this many hit notes: an average of one or two says little. */
export const MIN_TENDENCY_HITS = 4;
/**
 * Latency: taps this far from the notes on average (ms), each at least LATENCY_FLOOR_MS off the same way and steady
 * (at most LATENCY_SD_MS of spread), on at least LATENCY_SHARE of the notes (and LATENCY_MIN_NOTES), are the speaker
 * or headphones, not the player. A player's own dragging rarely reaches 80 ms that evenly; sloppy timing spreads both
 * ways and wider than 60 ms.
 */
export const LATENCY_MS = 80;
export const LATENCY_FLOOR_MS = 20;
export const LATENCY_SD_MS = 60;
export const LATENCY_SHARE = 0.6;
export const LATENCY_MIN_NOTES = 3;
/** An extra tap at most this far after (or before) a missed note is that note, pressed late (or early): Bluetooth lag. */
export const LATENCY_PAIR_MS = 350;

/** What the run was, beyond its result. */
export interface CoachContext {
  /** Every press of the run: an extra tap just after (or before) a missed note is that note, too late (or early). */
  taps?: Tap[];
  /**
   * The run was played before any calibration (prefs.calibratedAt was null): a steady dragging points to calibration,
   * and a steady early offset is the player rushing (a device delay only makes taps late).
   */
  uncalibrated?: boolean;
  /** A path lesson with a lesson to go on to: praise for a perfect run points there, not to tempo or bars. */
  nextLesson?: boolean;
}

/** Where a note ends, as a count position: the beat number (1-based) and the part of that beat. */
function countAt(tick: number, exercise: Exercise): { beat: number; part: string } {
  const { meter } = exercise;
  const inBar = tick % meter.barTicks;
  const beat = Math.floor(inBar / meter.beatTicks) + 1;
  const sub = inBar % meter.beatTicks;
  const q = meter.beatTicks / 4;
  const t = meter.beatTicks / 3;
  const part = sub === 0 ? 'count.beat' : sub === 2 * q ? 'count.and' : sub === q ? 'count.e' : sub === 3 * q ? 'count.a' : sub === t ? 'count.trip' : 'count.let';
  return { beat, part };
}

/** Value key of a sounding note as written: a tied note is 'value.tiedNote'. */
function writtenValue(exercise: Exercise, index: number): string {
  for (const bar of spellExercise(exercise)) {
    const sym = bar.symbols.find((s) => s.onsetIndex === index);
    if (sym) return sym.tieToNext ? 'value.tiedNote' : valueKey(sym.value, sym.dots, !!sym.tuplet);
  }
  return 'value.note';
}

/**
 * One-line coaching tip (§6.4). No taps at all, then a steady offset on most notes (latency: a late tapper's run is all
 * misses and extra taps; early only when the run was played calibrated, else it is rushing), come first. Then, when
 * many notes were missed or tapped extra (an off-track run), that: timing advice is beside the point when the player
 * lost their place. Otherwise the worst hold problem, then the tendency (from enough hit notes), then misses, extra
 * taps, steadiness, and praise. Keys and params:
 * - tip.noTaps {}   tip.latency { ms, dir ('late' | 'early') }
 * - tip.cutShort / tip.heldLong { value (message key), bar (1-based), beat, liftBeat, liftPart (count.* key), count }
 * - tip.rushing / tip.dragging { ms }, or tip.draggingCalibrate when steadily late and uncalibrated
 * - tip.missed { count, bar }, or tip.missedSpread { count } when bars tie; tip.missedEcho / tip.missedSpreadEcho the
 *   same for Echo, which hides the notation (no "read ahead")   tip.extraTaps { count }   tip.unsteady { ms }
 * - tip.perfect {} (a faster tempo or more bars), tip.perfectBars {} at the top tempo, tip.perfectTempo {} at the most
 *   bars, tip.perfectTop {} at both; or tip.perfectLesson {} before a next lesson   tip.good {}
 */
export function coachTip(result: JudgeResult, timeline: Timeline, exercise: Exercise, context: CoachContext = {}): CoachTip {
  const n = result.notes.length;
  // Nothing came in: the player did not know what to do, or the taps did not register. Reading ahead would not help.
  if (n > 0 && result.counts.miss === n && result.extraTaps === 0) return { key: 'tip.noTaps', params: {} };
  const latency = steadyOffset(result, timeline, context.taps ?? []);
  // A device delay only makes taps late. Early every time is a calibration that no longer fits (made on Bluetooth, now
  // played on the speaker), or, with none made, the player rushing.
  if (latency?.dir === 'early' && context.uncalibrated) return { key: 'tip.rushing', params: { ms: latency.ms } };
  if (latency) return { key: 'tip.latency', params: latency };
  // Counts only: a low accuracy from cut-short holds is a hold problem, and the hold tip below says so.
  const offTrack = n > 0 && result.counts.miss + result.extraTaps >= Math.max(1, n * OFF_TRACK_SHARE);
  if (offTrack) {
    return result.counts.miss >= result.extraTaps ? missedTip(result, timeline, exercise) : { key: 'tip.extraTaps', params: { count: result.extraTaps } };
  }
  const holdIssues = result.notes.filter((r): r is NoteResult & { hold: 'short' | 'long' } => r.hold === 'short' || r.hold === 'long');
  if (holdIssues.length) {
    // Worst = the largest share of the note that was missed (cut short) or overshot (held long).
    const severity = (r: NoteResult): number => {
      const n = timeline.notes[r.index];
      return Math.abs(r.releaseOffsetMs ?? (n.end - n.onset) * 1000) / ((n.end - n.onset) * 1000);
    };
    const worst = holdIssues.reduce((a, b) => (severity(b) > severity(a) ? b : a));
    const note = timeline.notes[worst.index];
    const lift = countAt(note.tick + note.durationTicks, exercise);
    return {
      key: worst.hold === 'short' ? 'tip.cutShort' : 'tip.heldLong',
      params: {
        value: writtenValue(exercise, worst.index),
        bar: note.bar + 1,
        beat: countAt(note.tick, exercise).beat,
        liftBeat: lift.beat,
        liftPart: lift.part,
        count: holdIssues.filter((r) => r.hold === worst.hold).length,
      },
    };
  }
  const hits = result.notes.filter((r) => r.offsetMs !== null).length;
  if (result.tendency !== 'steady' && hits >= MIN_TENDENCY_HITS) {
    const ms = Math.round(Math.abs(result.meanOffsetMs));
    if (result.tendency === 'rushing') return { key: 'tip.rushing', params: { ms } };
    // Late by about the same on every note may be the device: before a calibration, say so rather than "press sooner".
    // Only when every hit is late and the spread is steady: taps on both sides of the beat are the player.
    const steadyLate = result.sdOffsetMs <= UNSTEADY_SD_MS && result.notes.every((r) => r.offsetMs === null || r.offsetMs >= LATENCY_FLOOR_MS);
    return { key: context.uncalibrated && steadyLate ? 'tip.draggingCalibrate' : 'tip.dragging', params: { ms } };
  }
  if (result.counts.miss > 0) return missedTip(result, timeline, exercise);
  if (result.extraTaps > 0) return { key: 'tip.extraTaps', params: { count: result.extraTaps } };
  if (result.sdOffsetMs > UNSTEADY_SD_MS) return { key: 'tip.unsteady', params: { ms: Math.round(result.sdOffsetMs) } };
  if (result.counts.perfect === result.notes.length) return { key: context.nextLesson ? 'tip.perfectLesson' : perfectKey(exercise), params: {} };
  return { key: 'tip.good', params: {} };
}

/** Praise for a perfect run that asks only for what the setup still has: a faster tempo, more bars, or neither. */
function perfectKey(exercise: Exercise): string {
  const fastest = exercise.tempo >= MAX_TEMPO;
  const longest = exercise.bars.length >= MAX_BARS;
  return fastest && longest ? 'tip.perfectTop' : fastest ? 'tip.perfectBars' : longest ? 'tip.perfectTempo' : 'tip.perfect';
}

/**
 * tip.missed with the bar that had the most misses; tip.missedSpread when bars tie (the first of equals says nothing).
 * Echo has its own two: tapped back from memory with the notation hidden, it has nothing to read ahead.
 */
function missedTip(result: JudgeResult, timeline: Timeline, exercise: Exercise): CoachTip {
  const perBar = new Map<number, number>();
  for (const r of result.notes) if (r.judgement === 'miss') perBar.set(timeline.notes[r.index].bar, (perBar.get(timeline.notes[r.index].bar) ?? 0) + 1);
  const most = Math.max(...perBar.values());
  const bars = [...perBar.entries()].filter(([, c]) => c === most);
  const echo = exercise.settings.mode === 'echo';
  if (bars.length > 1) return { key: echo ? 'tip.missedSpreadEcho' : 'tip.missedSpread', params: { count: result.counts.miss } };
  return { key: echo ? 'tip.missedEcho' : 'tip.missed', params: { count: result.counts.miss, bar: bars[0][0] + 1 } };
}

/**
 * A steady offset on most notes (latency), or null. Each way (late, then early) the offsets are the hit notes' and,
 * for a missed note, the nearest unpaired extra tap after (before) it, short of the next (previous) note and within
 * LATENCY_PAIR_MS. Extra taps left unpaired must stay few: a player mashing the pad also hits at a steady offset.
 * On evenly spaced notes both ways can pass (a steady early tap is also the previous note's tap, late): the way that
 * pairs more notes wins (the other leaves the first or last note without a tap), then the nearer one (smaller mean).
 */
function steadyOffset(result: JudgeResult, timeline: Timeline, taps: Tap[]): { ms: number; dir: 'late' | 'early' } | null {
  const n = result.notes.length;
  const need = Math.max(LATENCY_MIN_NOTES, Math.ceil(n * LATENCY_SHARE));
  if (n < need) return null;
  // The extra taps: every press no note took (a hit note keeps a copy of its tap).
  const taken = result.notes.flatMap((r) => (r.tap ? [r.tap.down] : []));
  const extras = taps
    .map((tp) => tp.down)
    .filter((down) => {
      const i = taken.indexOf(down);
      if (i < 0) return true;
      taken.splice(i, 1);
      return false;
    });
  let found: { ms: number; dir: 'late' | 'early'; count: number; mean: number } | null = null;
  for (const sign of [1, -1] as const) {
    const offsets: number[] = [];
    const paired = new Set<number>();
    for (const r of result.notes) {
      if (r.offsetMs !== null) {
        offsets.push(r.offsetMs);
        continue;
      }
      const note = timeline.notes[r.index];
      const neighbour = timeline.notes[r.index + sign];
      const reach = Math.min(LATENCY_PAIR_MS / 1000, neighbour ? sign * (neighbour.onset - note.onset) : Infinity);
      let pick = -1;
      extras.forEach((down, k) => {
        const d = sign * (down - note.onset);
        if (!paired.has(k) && d > 0 && d < reach && (pick < 0 || d < sign * (extras[pick] - note.onset))) pick = k;
      });
      if (pick < 0) continue;
      paired.add(pick);
      offsets.push((extras[pick] - note.onset) * 1000);
    }
    if (offsets.length < need || result.extraTaps - paired.size > n * OFF_TRACK_SHARE) continue;
    // "Late every time": one tap near the beat (or the other way) is the player's timing, not a delay.
    if (offsets.some((o) => sign * o < LATENCY_FLOOR_MS)) continue;
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const sd = Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length);
    if (sign * mean < LATENCY_MS || sd > LATENCY_SD_MS) continue;
    // Late passed too: keep the way that pairs more notes, then the nearer one.
    if (found && (found.count > offsets.length || (found.count === offsets.length && Math.abs(found.mean) <= Math.abs(mean)))) continue;
    found = { ms: Math.round(Math.abs(mean)), dir: sign > 0 ? 'late' : 'early', count: offsets.length, mean };
  }
  return found && { ms: found.ms, dir: found.dir };
}
