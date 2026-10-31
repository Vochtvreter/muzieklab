/**
 * The Progress tab as data (DESIGN.md §8.5): everything its screens show, worked out from the progress and today's date
 * (yyyy-mm-dd, the player's local day). The screens draw these and add no logic of their own. Pure.
 *
 * Numbers are whole unless a field says otherwise; days are yyyy-mm-dd, oldest first. Message keys and Labels render
 * with t() (a Label: `t(label.key, translateParams(label.params))`, as game/skills.ts explains).
 */
import { DRAGGING_MS, RUSHING_MS } from '../core/judge';
import { keyAlter, letterOf, KEY_ORDER, type Alter, type Clef, type KeyId, type Letter, type Step } from '../core/pitch';
import { parseNoteId } from '../core/noteRound';
import { CIRCLE_ORDER, MINOR_TYPES, scaleId } from '../core/scale';
import { ACHIEVEMENTS } from './achievements';
import { CELL_UNIT } from './cells';
import {
  levelChecks,
  levelName,
  skillContext,
  skillLevel,
  passedOn,
  reviewOf,
  gainOf,
  historyOf,
  ctaOf,
  focusOf,
  SKILLS,
  SKILL_LEVELS,
  type Check,
  type Focus,
  type Label,
  type SkillCta,
} from './skills';
import { cellAccuracy, cellNotes, cellTotals, minutesOf, wholePercentOf } from './stats';
import {
  CELL_IDS,
  mondayOf,
  shiftDay,
  streak,
  weekdayOf,
  type AchievementId,
  type CellId,
  type DayStats,
  type Progress,
  type SkillId,
} from './storage';
import { pathLessonOpen, pathUnitOf } from './tracks';
import { WEAK_BELOW } from './weakSpots';
import { levelInfo, levelStart, RANK_FROM, RANKS, type Rank } from './xp';

// --- Header: streak and level ------------------------------------------------------------------------------------

/** A rank on the Ranks ladder (tablet and desktop Level card). */
export interface RankStep {
  rank: Rank;
  /** The level it starts at. */
  from: number;
  /** Reached before the current one, the current one, the one after it, or further on. */
  state: 'done' | 'current' | 'next' | 'later';
}

/** The head of the Progress tab: the streak and the XP level. */
export interface ProgressHeader {
  /** Practice days in a row, ending today (or yesterday while today has none yet). */
  streak: number;
  level: number;
  rank: Rank;
  /** Total XP. */
  total: number;
  /** XP into the current level and the XP the level takes (the bar's fill is into / span). */
  into: number;
  span: number;
  /** into / span as a whole percent, 0–99 (for the bar's label). */
  pct: number;
  nextLevel: number;
  /** Total XP where the next level starts ("1445 / 1500 XP"). */
  nextLevelAt: number;
  /** XP still to earn for the next level ("55 XP to level 8"). */
  toNext: number;
  /** The rank after the current one and the level it starts at; null at the top rank. */
  nextRank: { rank: Rank; level: number } | null;
  /** All six ranks, lowest first. */
  ranks: RankStep[];
}

/** The head: the streak pill and the level line (phone), the Level card with its Ranks ladder (tablet, desktop). */
export function progressHeader(p: Progress, today: string): ProgressHeader {
  const info = levelInfo(p.xp);
  const current = RANKS.indexOf(info.rank);
  const after = RANKS[current + 1];
  return {
    streak: streak(p.practiceDays, today),
    level: info.level,
    rank: info.rank,
    total: info.total,
    into: info.into,
    span: info.span,
    pct: Math.floor((info.into / info.span) * 100),
    nextLevel: info.level + 1,
    nextLevelAt: levelStart(info.level + 1),
    toNext: levelStart(info.level + 1) - info.total,
    nextRank: after ? { rank: after, level: RANK_FROM[after] } : null,
    ranks: RANKS.map((rank, i) => ({ rank, from: RANK_FROM[rank], state: i < current ? 'done' : i === current ? 'current' : i === current + 1 ? 'next' : 'later' })),
  };
}

// --- Streak calendar ---------------------------------------------------------------------------------------------

/**
 * A day on the calendar: 'streak' a practice day of the current streak (today too, when practised), 'practised' an
 * earlier practice day, 'missed' a past day without practice, 'today' today before any practice, 'future' after today.
 */
export type CalendarState = 'streak' | 'practised' | 'missed' | 'today' | 'future';

export interface CalendarDay {
  date: string;
  /** Day of the month, 1–31. */
  day: number;
  state: CalendarState;
  isToday: boolean;
}

/** Five weeks, Monday to Sunday, ending with this week. */
export interface CalendarView {
  /** 5 weeks of 7 days, Monday first. */
  weeks: CalendarDay[][];
  first: string;
  last: string;
  today: string;
  /** Today's weekday, 0 Monday … 6 Sunday (its column letter is highlighted). */
  todayIndex: number;
  /** Practice days from the first day to today, out of the days elapsed (today included): "28 of 32 days". */
  practised: number;
  elapsed: number;
  /** Past days without practice, in order (for the aria-label). */
  missed: string[];
  streak: number;
  /** The current streak's first day, or null without a streak. */
  streakStart: string | null;
  /** The current streak's last day: today, or yesterday while today has no practice yet; null without a streak. */
  streakEnd: string | null;
}

export const CALENDAR_WEEKS = 5;

/** The streak calendar: five weeks ending this week, the practice days and the current streak. */
export function calendarView(p: Progress, today: string): CalendarView {
  const practice = new Set(p.practiceDays);
  const n = streak(p.practiceDays, today);
  const streakEnd = n === 0 ? null : practice.has(today) ? today : shiftDay(today, -1);
  const streakStart = streakEnd === null ? null : shiftDay(streakEnd, -(n - 1));
  const first = shiftDay(mondayOf(today), -7 * (CALENDAR_WEEKS - 1));
  const missed: string[] = [];
  let practised = 0;
  let elapsed = 0;
  const weeks = Array.from({ length: CALENDAR_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d): CalendarDay => {
      const date = shiftDay(first, 7 * w + d);
      const isToday = date === today;
      let state: CalendarState;
      if (date > today) state = 'future';
      else if (practice.has(date)) state = streakStart !== null && date >= streakStart && streakEnd !== null && date <= streakEnd ? 'streak' : 'practised';
      else state = isToday ? 'today' : 'missed';
      if (date <= today) {
        elapsed++;
        if (practice.has(date)) practised++;
        else if (!isToday) missed.push(date);
      }
      return { date, day: Number(date.slice(8)), state, isToday };
    }),
  );
  return { weeks, first, last: shiftDay(first, 7 * CALENDAR_WEEKS - 1), today, todayIndex: weekdayOf(today), practised, elapsed, missed, streak: n, streakStart, streakEnd };
}

// --- Charts over the last 14 days --------------------------------------------------------------------------------

export const CHART_DAYS = 14;

/** A day of a chart: its value, or null without a rhythm round that day. */
export interface DayPoint {
  date: string;
  value: number | null;
}

/** The last CHART_DAYS days ending today, oldest first, with each day's record (or null). */
function chartDays(p: Progress, today: string): { date: string; d: DayStats | null }[] {
  return Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = shiftDay(today, i - (CHART_DAYS - 1));
    return { date, d: p.stats.days[date] ?? null };
  });
}

const firstOf = (days: DayPoint[]): DayPoint | null => days.find((x) => x.value !== null) ?? null;
const lastOf = (days: DayPoint[]): DayPoint | null => [...days].reverse().find((x) => x.value !== null) ?? null;

/** Rhythm accuracy (tap and Echo) per day, from each day's rounds. */
export interface AccuracyView {
  /** CHART_DAYS days, the last one today: the day's mean accuracy (whole %, rounded down), or null. */
  days: DayPoint[];
  /** The mean over the days with a value (whole %, rounded down), or null when none has. */
  mean: number | null;
  /** The first day with a value, and the highest (on a tie, the latest of them). */
  first: DayPoint | null;
  peak: DayPoint | null;
  /** Today's value, or null. */
  today: number | null;
  /** Days without a value, in order. */
  gaps: string[];
}

/**
 * Accuracy · 14 days: rhythm rounds only (tap and Echo). Rounded down as Results is (§6.3), so 100% means that every
 * round of the day, or of the days, was flawless. The sums are whole numbers, so there is no float error to absorb.
 */
export function accuracyView(p: Progress, today: string): AccuracyView {
  const days = chartDays(p, today).map(({ date, d }): DayPoint => ({ date, value: d && d.rounds > 0 ? Math.floor(d.acc / d.rounds) : null }));
  const values = days.filter((x): x is { date: string; value: number } => x.value !== null);
  const peak = values.reduce<DayPoint | null>((best, x) => (best === null || x.value >= (best.value as number) ? x : best), null);
  return {
    days,
    mean: values.length ? Math.floor(values.reduce((s, x) => s + x.value, 0) / values.length) : null,
    first: firstOf(days),
    peak,
    today: days[days.length - 1].value,
    gaps: days.filter((x) => x.value === null).map((x) => x.date),
  };
}

/** A timing tendency, with the judge's thresholds (judge.ts): under −40 ms rushing, over +30 ms dragging. */
export type Tendency = 'steady' | 'rushing' | 'dragging';
export const tendencyOf = (ms: number): Tendency => (ms < RUSHING_MS ? 'rushing' : ms > DRAGGING_MS ? 'dragging' : 'steady');

/** The steady band of the timing chart, in ms. */
export const STEADY_BAND = { from: RUSHING_MS, to: DRAGGING_MS } as const;

/** The mean timing offset of the hit notes per day (ms, negative = early). */
export interface TimingView {
  /** CHART_DAYS days, the last one today: the day's mean offset (whole ms), or null. */
  days: DayPoint[];
  /** The latest day with a value and its tendency ("Steady · −22 ms"), or null. */
  latest: DayPoint | null;
  tendency: Tendency | null;
  /** The first day with a value and its tendency ("Was rushing (−52 ms)."), or null. */
  first: DayPoint | null;
  firstTendency: Tendency | null;
  gaps: string[];
}

/** Timing tendency over 14 days: the hit notes of rhythm rounds. */
export function timingView(p: Progress, today: string): TimingView {
  const days = chartDays(p, today).map(({ date, d }): DayPoint => ({ date, value: d && d.hits > 0 ? Math.round(d.off / d.hits) : null }));
  const latest = lastOf(days);
  const first = firstOf(days);
  return {
    days,
    latest,
    tendency: latest ? tendencyOf(latest.value as number) : null,
    first,
    firstTendency: first ? tendencyOf(first.value as number) : null,
    gaps: days.filter((x) => x.value === null).map((x) => x.date),
  };
}

/** Minutes practised this week (all modes), Monday to Sunday. */
export interface MinutesView {
  /** 7 days, Monday first: whole minutes (a day with any practice at least 1), or null after today. */
  days: { date: string; minutes: number | null }[];
  /** Today's place, 0 Monday … 6 Sunday. */
  todayIndex: number;
  /** The sum of the days' minutes. */
  total: number;
}

/** Minutes this week, every mode. */
export function minutesView(p: Progress, today: string): MinutesView {
  const monday = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(monday, i);
    return { date, minutes: date > today ? null : minutesOf(p.stats.days[date]?.sec ?? 0) };
  });
  return { days, todayIndex: weekdayOf(today), total: days.reduce((s, x) => s + (x.minutes ?? 0), 0) };
}

// --- Skill map ---------------------------------------------------------------------------------------------------

/** A cell's colour band: 90%+, 80–89%, or under 80% (a weak spot). */
export type CellBand = 'high' | 'mid' | 'weak';

/** A cell of the skill map (rolling accuracy over the last 42 days). */
export interface CellView {
  id: CellId;
  /** Message key of its name (skills.cell.*). */
  name: string;
  /** Rolling accuracy (whole %, rounded down), or null under MIN_CELL_NOTES notes ("—"). */
  accuracy: number | null;
  /** Notes counted in the window. */
  notes: number;
  band: CellBand | null;
  weak: boolean;
  /** Not open yet on the Learning path, and no notes of it in the figures kept: "Locked until unit {unlockUnit}". */
  locked: boolean;
  /** The Learning path's unit number that opens it. */
  unlockUnit: number;
}

/** The skill map's eight cells, in its order; also what weakSpotsSettings (game/weakSpots.ts) takes. */
export function skillMap(p: Progress, today: string): CellView[] {
  const totals = cellTotals(p, today);
  // Any day kept, not only the window: a cell played does not lock again when its notes leave the window ("—").
  const played = new Set(Object.values(p.stats.days).flatMap((d) => Object.keys(d.cells)));
  return CELL_IDS.map((id) => {
    const accuracy = cellAccuracy(totals[id]);
    const notes = cellNotes(totals[id]);
    const unit = CELL_UNIT[id];
    const band: CellBand | null = accuracy === null ? null : accuracy >= 90 ? 'high' : accuracy >= WEAK_BELOW ? 'mid' : 'weak';
    return {
      id,
      name: `skills.cell.${id}`,
      accuracy,
      notes,
      band,
      weak: band === 'weak',
      locked: !played.has(id) && !pathLessonOpen(p, 'rhythm', `${unit}.1`),
      unlockUnit: pathUnitOf('rhythm', unit) ?? unit,
    };
  });
}

// --- Achievements --------------------------------------------------------------------------------------------------

/** An achievement badge. */
export interface AchievementView {
  id: AchievementId;
  /** Message keys: achievements.{id}.name and .text. */
  name: string;
  text: string;
  /** The day it was earned, or null (locked). */
  earned: string | null;
}

/** The five achievements in the Progress tab's order, and how many are earned ("3 earned"). */
export function achievementsView(p: Progress): { list: AchievementView[]; earned: number } {
  const list = ACHIEVEMENTS.map((id) => ({ id, name: `achievements.${id}.name`, text: `achievements.${id}.text`, earned: p.achievements[id] ?? null }));
  return { list, earned: list.filter((a) => a.earned).length };
}

// --- Notes view ----------------------------------------------------------------------------------------------------

/** A note among the slowest to answer. */
export interface SlowNote {
  /** "treble:38" */
  id: string;
  clef: Clef;
  step: Step;
  letter: Letter;
  /** The sign the last round's key signature gives this letter (0 without a last round): "F♯" after a G major round. */
  alter: Alter;
  /** Average answer time in seconds, one decimal. */
  seconds: number;
  answers: number;
}

/** A note is among the slowest once it has this many answers; this many are shown. */
export const SLOW_MIN_ANSWERS = 3;
export const SLOW_NOTES = 3;

/** The Notes view: accuracy per clef, the slowest notes and the last round's key. */
export interface NotesView {
  /**
   * Treble, then bass: accuracy over every round (whole %, rounded down; null before any note of that clef) and notes
   * answered.
   */
  clefs: { clef: Clef; accuracy: number | null; answered: number }[];
  /** The SLOW_NOTES slowest notes with SLOW_MIN_ANSWERS answers or more, slowest first. */
  slowest: SlowNote[];
  /** The last round's key and clef, or null before the first round. */
  lastKey: { key: KeyId; clef: Clef } | null;
}

/** The Notes view, from every Read notes round (free practice and note lessons). */
export function notesView(p: Progress): NotesView {
  const s = p.stats;
  const clefs = (['treble', 'bass'] as const).map((clef) => {
    const c = s.clefs[clef];
    return { clef, accuracy: c ? wholePercentOf(c[0], c[1]) : null, answered: c ? c[1] : 0 };
  });
  const slowest = Object.entries(s.noteMs)
    .filter(([, [, n]]) => n >= SLOW_MIN_ANSWERS)
    .map(([id, [sum, n]]) => ({ id, avg: sum / n, n, at: parseNoteId(id)! }))
    .sort((a, b) => b.avg - a.avg || (a.id < b.id ? -1 : 1))
    .slice(0, SLOW_NOTES)
    .map(({ id, avg, n, at }): SlowNote => {
      const letter = letterOf(at.step);
      return { id, clef: at.clef, step: at.step, letter, alter: s.lastKey ? keyAlter(s.lastKey.key, letter) : 0, seconds: Math.round(avg / 100) / 10, answers: n };
    });
  return { clefs, slowest, lastKey: s.lastKey ? { ...s.lastKey } : null };
}

// --- Scales view ---------------------------------------------------------------------------------------------------

/** The Scales view: best stars per major scale and per started minor key. */
export interface ScalesView {
  /** The 15 major scales round the circle (C, G, D … C♭), best stars 0–3. */
  majors: { key: KeyId; stars: number }[];
  /** Major scales with ★★ or more. */
  majorsDone: number;
  /** Minor keys with any stars, in the Key screen's order (A, E, D, B …): best stars per form; `key` is the signature's key. */
  minors: { key: KeyId; natural: number; harmonic: number; melodic: number }[];
  /** Minor keys started, of 15. */
  minorsStarted: number;
}

/** The Scales view, from the Scales hub's best stars. */
export function scalesView(p: Progress): ScalesView {
  const stars = p.scales.stars;
  const of = (key: KeyId, type: 'major' | 'natural' | 'harmonic' | 'melodic'): number => stars[scaleId({ key, type })] ?? 0;
  const majors = CIRCLE_ORDER.map((key) => ({ key, stars: of(key, 'major') }));
  const minors = KEY_ORDER.filter((key) => MINOR_TYPES.some((type) => of(key, type) > 0)).map((key) => ({
    key,
    natural: of(key, 'natural'),
    harmonic: of(key, 'harmonic'),
    melodic: of(key, 'melodic'),
  }));
  return { majors, majorsDone: majors.filter((m) => m.stars >= 2).length, minors, minorsStarted: minors.length };
}

// --- Skill levels --------------------------------------------------------------------------------------------------

/** A level on a skill's ladder ("All levels"). */
export interface LevelStep {
  n: number;
  /** Message key of its name. */
  name: string;
  state: 'passed' | 'next' | 'later';
  /** The day it was passed, or null. */
  day: string | null;
}

/** The level a skill works on now. */
export interface NextLevel {
  n: number;
  name: string;
  /** Its checks; empty when the level comes later (no lessons for it yet: `later`). */
  checks: Check[];
  done: number;
  total: number;
  later: boolean;
}

/** One skill on the Skill levels list and its own screen. */
export interface SkillView {
  id: SkillId;
  /** Message keys: skills.name.{id} and, mid-sentence, skills.nameLower.{id}. */
  name: string;
  level: number;
  /** The level after it, or null with all ten passed. */
  next: NextLevel | null;
  /** The 10 levels. */
  levels: LevelStep[];
  /** The list's chip: review due, else levels passed in the last 30 days, else none. */
  chip: { kind: 'review' | 'gain'; label: Label } | null;
  /** Levels passed in the last 30 days. */
  gain: number;
  /** The level at the end of each of the last 12 weeks, oldest first (this week's is today's). */
  history: number[];
  /** Due for review (14 days or more since it was practised, with a level), and the days since it was practised. */
  review: { due: boolean; days: number | null };
  cta: SkillCta;
}

/** The Skill levels list, and the Progress tab's Skill levels card ("25 of 60 levels · 6 skills · 1 review due"). */
export interface SkillsView {
  skills: SkillView[];
  /** Levels passed in all, of `max` (60). */
  total: number;
  max: number;
  /** Levels passed in the last 30 days, all skills. */
  gained: number;
  /** Skills due for review, in order. */
  reviewDue: SkillId[];
  focus: Focus;
}

/** One skill (its own screen); `ctx` can be shared between skills. */
export function skillView(p: Progress, skill: SkillId, today: string, ctx = skillContext(p, today)): SkillView {
  const level = skillLevel(p, skill);
  const review = reviewOf(p, skill, today);
  const gain = gainOf(p, skill, today);
  let next: NextLevel | null = null;
  if (level < SKILL_LEVELS) {
    const n = level + 1;
    const checks = levelChecks(ctx, skill, n);
    next = { n, name: levelName(skill, n), checks, done: checks.filter((c) => c.done).length, total: checks.length, later: checks.length === 0 };
  }
  return {
    id: skill,
    name: `skills.name.${skill}`,
    level,
    next,
    levels: Array.from({ length: SKILL_LEVELS }, (_, i) => ({
      n: i + 1,
      name: levelName(skill, i + 1),
      state: i < level ? 'passed' : i === level ? 'next' : 'later',
      day: passedOn(p, skill, i + 1),
    })),
    chip: review.due
      ? { kind: 'review', label: { key: 'skills.chip.review', params: {} } }
      : gain > 0
        ? { kind: 'gain', label: { key: 'skills.chip.gain', params: { count: gain } } }
        : null,
    gain,
    history: historyOf(p, skill, today),
    review,
    cta: ctaOf(p, skill),
  };
}

/** The six skills in their order, the totals and Focus next. */
export function skillsView(p: Progress, today: string): SkillsView {
  const ctx = skillContext(p, today);
  const skills = SKILLS.map((s) => skillView(p, s, today, ctx));
  return {
    skills,
    total: skills.reduce((sum, s) => sum + s.level, 0),
    max: SKILLS.length * SKILL_LEVELS,
    gained: skills.reduce((sum, s) => sum + s.gain, 0),
    reviewDue: skills.filter((s) => s.review.due).map((s) => s.id),
    focus: focusOf(p),
  };
}

// --- Everything ------------------------------------------------------------------------------------------------------

/** Every card of the Progress tab, in all three views. */
export interface ProgressView {
  header: ProgressHeader;
  calendar: CalendarView;
  accuracy: AccuracyView;
  timing: TimingView;
  minutes: MinutesView;
  cells: CellView[];
  achievements: { list: AchievementView[]; earned: number };
  notes: NotesView;
  scales: ScalesView;
  skills: SkillsView;
}

/** Every card of the Progress tab. */
export function progressView(p: Progress, today: string): ProgressView {
  return {
    header: progressHeader(p, today),
    calendar: calendarView(p, today),
    accuracy: accuracyView(p, today),
    timing: timingView(p, today),
    minutes: minutesView(p, today),
    cells: skillMap(p, today),
    achievements: achievementsView(p),
    notes: notesView(p),
    scales: scalesView(p),
    skills: skillsView(p, today),
  };
}
