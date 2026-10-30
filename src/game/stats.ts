/**
 * The Progress tab's figures (DESIGN.md §8.5): what each finished exercise adds to `progress.stats`. Minutes, rhythm
 * accuracy, timing and the skill-map cells are kept per local day for the newest HISTORY_DAYS days, so the account copy
 * stays small; Read notes keeps its totals per clef and note, and the bests its skill levels check. Pure: the store's
 * reducers call these with the round and today's date.
 *
 * Everything here writes what sanitizeProgress reads back unchanged (whole numbers, the same clamps, and no more days
 * than it keeps), so the account sync sees a saved copy as saved (reports in game/merge.ts).
 */
import { POINTS } from '../core/judge';
import { noteId, roundKeys, roundSteps, type NoteAnswer, type NoteSettings, type RoundNote } from '../core/noteRound';
import { BOTTOM_LINE, CLEFS, KEYS, rangeSteps, type Clef } from '../core/pitch';
import { buildTimeline } from '../core/timeline';
import { DIAMOND, PPQ, type Exercise, type JudgeResult, type Leniency } from '../core/types';
import { cellPoints, materialLevel } from './cells';
import {
  ANSWER_CAP_MS,
  CELL_IDS,
  HISTORY_DAYS,
  sanitizeDayStats,
  shiftDay,
  type CellId,
  type DayStats,
  type Progress,
  type SkillId,
  type Stats,
} from './storage';

/** The silence before the count-in when a rhythm round plays to tap (playSession.ts). */
export const PLAY_LEAD_IN_S = 0.4;
/** The silence before the count-in when Echo plays the rhythm to listen (Echo.tsx). */
export const LISTEN_LEAD_IN_S = 0.3;
/** The most seconds one scale of a Scales round counts for: a scale left open is not minutes practised. */
export const SCALE_CAP_S = 90;
/** A skill-map cell shows its accuracy (and can be a weak spot) from this many notes in the window. */
export const MIN_CELL_NOTES = 12;
/** A Read notes round counts for the notes skill levels with at least this many notes answered in a clef. */
export const READING_MIN_NOTES = 5;

/** How an Echo round was heard: every time the rhythm was played to listen, and the replays among them (after the first). */
export interface EchoPlays {
  plays: number;
  replays: number;
}

export const emptyDay = (): DayStats => ({ sec: 0, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} });

const withStats = (p: Progress, patch: Partial<Stats>): Progress => ({ ...p, stats: { ...p.stats, ...patch } });

/**
 * A date up to this many days after today still counts as one played: another device's day may already have begun (a
 * time zone ahead). A later one was written by a clock set wrong, or this device's clock is set back now.
 */
export const CLOCK_AHEAD_DAYS = 1;

/**
 * Progress with one day's figures changed (the day added when new), then HISTORY_DAYS days kept: the newest up to
 * CLOCK_AHEAD_DAYS after `day` (today included), and days after those only in the room left. So days a clock set
 * forward once wrote never push today's figures out, and a clock set back drops no more than it adds.
 */
function changeDay(p: Progress, day: string, change: (d: DayStats) => DayStats): Progress {
  const next = sanitizeDayStats(change(p.stats.days[day] ?? emptyDay())) ?? emptyDay();
  const all = { ...p.stats.days, [day]: next };
  const last = shiftDay(day, CLOCK_AHEAD_DAYS);
  const dates = Object.keys(all).sort();
  const played = dates.filter((d) => d <= last).slice(-HISTORY_DAYS);
  const room = HISTORY_DAYS - played.length;
  const ahead = room > 0 ? dates.filter((d) => d > last).slice(-room) : [];
  return withStats(p, { days: Object.fromEntries([...played, ...ahead].map((d) => [d, all[d]])) });
}

/**
 * Progress with `skill` practised on `day`. A later day already there stays (a clock set back a little does not undo
 * it), unless it is more than CLOCK_AHEAD_DAYS after `day`: that one a clock set forward wrote.
 */
export function markSeen(p: Progress, skill: SkillId, day: string): Progress {
  const was = p.stats.seen[skill];
  if (was !== undefined && was >= day && was <= shiftDay(day, CLOCK_AHEAD_DAYS)) return p;
  return withStats(p, { seen: { ...p.stats.seen, [skill]: day } });
}

/** Whole minutes for a day's seconds; a day with any practice shows at least 1. */
export const minutesOf = (sec: number): number => (sec > 0 ? Math.max(1, Math.round(sec / 60)) : 0);

/**
 * Seconds a rhythm exercise takes to play: the count-in (a bar at least, as Play counts in), the lead-in and the bars,
 * up to `upTo` (seconds into the bars) when it stopped there: Skip to results, Echo's Done.
 */
export function playedSeconds(exercise: Exercise, upTo = Infinity): number {
  const timeline = buildTimeline(exercise);
  const bar = (exercise.meter.barTicks / PPQ) * timeline.beatSeconds;
  const bars = upTo > 0 ? Math.min(timeline.totalSeconds, upTo) : 0;
  return bars + Math.max(1, exercise.settings.countIn) * bar + PLAY_LEAD_IN_S;
}

/**
 * Seconds a rhythm round took: played once (up to `upTo`, playedSeconds), and for Echo each time it was played to
 * listen (with its one-bar count-in).
 */
export function rhythmSeconds(exercise: Exercise, plays = 0, upTo = Infinity): number {
  const timeline = buildTimeline(exercise);
  const bar = (exercise.meter.barTicks / PPQ) * timeline.beatSeconds;
  return playedSeconds(exercise, upTo) + Math.max(0, plays) * (timeline.totalSeconds + bar + LISTEN_LEAD_IN_S);
}

function addCells(a: DayStats['cells'], b: DayStats['cells']): DayStats['cells'] {
  const out: DayStats['cells'] = { ...a };
  for (const id of CELL_IDS) {
    const x = b[id];
    if (!x) continue;
    const [e, p] = out[id] ?? [0, 0];
    out[id] = [e + x[0], p + x[1]];
  }
  return out;
}

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * A finished rhythm round (tap or Echo; free practice, a lesson or the daily challenge): its seconds, accuracy, timing
 * and cells on today's figures, Echo's material level, and the skill practised (rhythm reading, or rhythm by ear).
 * `echo`: how an Echo round was heard (its listening counts as minutes). `playedTo`: where the music stopped, in
 * seconds into the bars (a round skipped to Results counts only what was played).
 */
export function recordRhythm(p: Progress, exercise: Exercise, result: JudgeResult, today: string, leniency: Leniency, echo?: EchoPlays | null, playedTo = Infinity): Progress {
  const isEcho = exercise.settings.mode === 'echo';
  const cells = cellPoints(exercise, result, leniency);
  const hit = result.notes.filter((n) => n.judgement !== 'miss' && typeof n.offsetMs === 'number' && Number.isFinite(n.offsetMs));
  const off = hit.reduce((sum, n) => sum + Math.round(n.offsetMs as number), 0);
  let next = changeDay(p, today, (d) => ({
    sec: d.sec + Math.round(rhythmSeconds(exercise, isEcho ? (echo?.plays ?? 0) : 0, playedTo)),
    rounds: d.rounds + 1,
    // In whole percent rounded down, as Results shows it (§6.3): a day of 99.69% rounds is no 100% on Progress. The
    // 1e-9 keeps a whole percent that floating point puts just under it.
    acc: d.acc + Math.floor(Math.max(0, Math.min(100, finite(result.accuracy))) + 1e-9),
    off: d.off + off,
    hits: d.hits + hit.length,
    cells: addCells(d.cells, cells),
  }));
  if (isEcho) next = recordEcho(next, exercise, result);
  return markSeen(next, isEcho ? 'ear' : 'rhythm', today);
}

/** An Echo round at ★★ or more counts for its material level; one of 4 bars or more keeps its best stars there. */
export function recordEcho(p: Progress, exercise: Exercise, result: Pick<JudgeResult, 'stars'>): Progress {
  const stars = Math.max(0, Math.min(DIAMOND, Math.round(finite(result.stars))));
  const counts = stars >= 2;
  const long = exercise.bars.length >= 4;
  if (!counts && !long) return p;
  const level = String(materialLevel(exercise));
  const [n, best] = p.stats.echo[level] ?? [0, 0];
  return withStats(p, { echo: { ...p.stats.echo, [level]: [n + (counts ? 1 : 0), long ? Math.max(best, stars) : best] } });
}

/**
 * `part` of `whole` as a whole percent, rounded down (§6.3): a skill check, a band or a weak spot is met only by the real
 * value, so 89.5% is 89%, not the notes check's 90%. The 1e-9 keeps a whole percent that floating point puts just under
 * it (57 of 100 is 56.99999999999999). The one place of this rule: Results' wholePercent (ui/lib/format.ts) uses it too.
 */
export const wholePercentOf = (part: number, whole: number): number => Math.max(0, Math.min(100, Math.floor((part / whole) * 100 + 1e-9)));

/** The faster of two average answer times, where 0 means none yet. */
export const fastest = (a: number, b: number): number => (a === 0 ? b : b === 0 ? a : Math.min(a, b));

const capped = (ms: number): number => Math.round(Math.max(0, Math.min(ANSWER_CAP_MS, finite(ms))));

/** The staff lines and spaces of a clef, and the notes from middle C to G (treble) or from F to middle C (bass). */
const LINES = (clef: Clef): number[] => [0, 2, 4, 6, 8].map((i) => BOTTOM_LINE[clef] + i);
const SPACES = (clef: Clef): number[] => [1, 3, 5, 7].map((i) => BOTTOM_LINE[clef] + i);
const AROUND_C: Record<Clef, number[]> = { treble: [28, 29, 30, 31, 32], bass: [24, 25, 26, 27, 28] };

/**
 * The notes skill levels (game/skills.ts) a Read notes round counts for in one clef, from the positions it draws there
 * and its keys: 1 every staff line; 2 every space; 3 every staff position; 4 middle C to G (treble) or F to middle C
 * (bass); 5 every position of one ledger line; 6 4 with a key of 1 ♯ or ♭ at most; 7 2–3; 8 every position of two
 * ledger lines; 9 4 with 4–5; 10 4 with 6 or 7 (`a` = the most sharps or flats in the round's keys).
 */
export function readingLevels(s: NoteSettings, clef: Clef): number[] {
  const steps = new Set(roundSteps(s, clef));
  const has = (list: number[]): boolean => list.every((st) => steps.has(st));
  const a = Math.max(...roundKeys(s).map((k) => Math.abs(KEYS[k].fifths)));
  const staff = has(rangeSteps(clef, 'staff'));
  const out: number[] = [];
  if (has(LINES(clef))) out.push(1);
  if (has(SPACES(clef))) out.push(2);
  if (staff) out.push(3);
  if (has(AROUND_C[clef])) out.push(4);
  if (has(rangeSteps(clef, 'ledger1'))) out.push(5);
  if (staff && a === 1) out.push(6);
  if (staff && a >= 2 && a <= 3) out.push(7);
  if (has(rangeSteps(clef, 'ledger2'))) out.push(8);
  if (staff && a >= 4 && a <= 5) out.push(9);
  if (staff && a >= 6) out.push(10);
  return out;
}

/**
 * A finished Read notes round (free practice or a note lesson), with the notes answered: their seconds on today's
 * figures, right and answered per clef, answer times per note, the round's key, the skill levels' bests per clef, and
 * the clefs practised.
 */
export function recordNotes(p: Progress, notes: RoundNote[], answers: NoteAnswer[], settings: NoteSettings, today: string): Progress {
  const given = answers.slice(0, notes.length);
  if (given.length === 0) return p;
  const ms = given.map((a) => capped(a.ms));
  const clefs = { ...p.stats.clefs };
  const noteMs = { ...p.stats.noteMs };
  const perClef: Partial<Record<Clef, { right: number; total: number; ms: number }>> = {};
  given.forEach((a, i) => {
    const n = notes[i];
    const right = a.outcome === 'right' ? 1 : 0;
    const [r, t] = clefs[n.clef] ?? [0, 0];
    clefs[n.clef] = [r + right, t + 1];
    const id = noteId(n.clef, n.step);
    const [sum, count] = noteMs[id] ?? [0, 0];
    noteMs[id] = [sum + ms[i], count + 1];
    const c = (perClef[n.clef] ??= { right: 0, total: 0, ms: 0 });
    c.right += right;
    c.total++;
    c.ms += ms[i];
  });
  const reading = { ...p.stats.reading };
  for (const clef of CLEFS) {
    const c = perClef[clef];
    if (!c || c.total < READING_MIN_NOTES) continue;
    const acc = wholePercentOf(c.right, c.total);
    const avg = Math.round(c.ms / c.total);
    for (const level of readingLevels(settings, clef)) {
      const key = `${clef}:${level}`;
      const [bestAcc, bestMs] = reading[key] ?? [0, 0];
      reading[key] = [Math.max(bestAcc, acc), fastest(bestMs, avg)];
    }
  }
  const last = notes[given.length - 1];
  let next = withStats(p, { clefs, noteMs, reading, lastKey: { key: last.key, clef: last.clef } });
  // At least a second, so a day with a short round shows a minute (minutesOf), as it counts as practised.
  next = changeDay(next, today, (d) => ({ ...d, sec: d.sec + Math.max(1, Math.round(ms.reduce((s, x) => s + x, 0) / 1000)) }));
  for (const clef of CLEFS) if (perClef[clef]) next = markSeen(next, clef, today);
  return next;
}

/**
 * A finished Scales round: its seconds (measured on its play screen, at most SCALE_CAP_S a scale; at least 1, as for
 * Read notes) and the skill.
 */
export function recordScales(p: Progress, seconds: number, today: string): Progress {
  const sec = Math.max(1, Math.round(finite(seconds)));
  return markSeen(changeDay(p, today, (d) => ({ ...d, sec: d.sec + sec })), 'scales', today);
}

/** Days of `days` in the window of `n` days ending `today` (yyyy-mm-dd, today included). */
export function windowDays(days: Record<string, DayStats>, today: string, n: number): [string, DayStats][] {
  const from = shiftDay(today, -n);
  return Object.entries(days).filter(([d]) => d > from && d <= today);
}

/** Per cell, [points earned, points possible] over the last HISTORY_DAYS days (the skill map's rolling accuracy). */
export function cellTotals(p: Progress, today: string): Record<CellId, [number, number]> {
  const out = Object.fromEntries(CELL_IDS.map((id) => [id, [0, 0]])) as Record<CellId, [number, number]>;
  for (const [, d] of windowDays(p.stats.days, today, HISTORY_DAYS)) {
    for (const id of CELL_IDS) {
      const x = d.cells[id];
      if (x) out[id] = [out[id][0] + x[0], out[id][1] + x[1]];
    }
  }
  return out;
}

/** Notes counted in a cell's totals. */
export const cellNotes = (totals: [number, number]): number => Math.round(totals[1] / POINTS.perfect);

/** A cell's rolling accuracy as a whole %, rounded down (wholePercentOf), or null under MIN_CELL_NOTES notes. */
export const cellAccuracy = (totals: [number, number]): number | null =>
  cellNotes(totals) >= MIN_CELL_NOTES ? wholePercentOf(totals[0], totals[1]) : null;
