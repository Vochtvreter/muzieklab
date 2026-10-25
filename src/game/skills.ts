/**
 * Skill levels (DESIGN.md §8.4; the Progress tab's Skill levels): six skills of ten levels each. A level is passed when
 * all its checks are met, in order from level 1, and stays passed with the day it was passed (`progress.skills`); a
 * skill's level is the number of levels passed in order. A skill not practised for REVIEW_DAYS days is due for review
 * until one round of it is played (`progress.stats.seen`); its level stays.
 *
 * - Rhythm reading: the rhythm units of the Learning path (lessons at ★★, the unit's skill-map cell at 85%, the unit
 *   review at ★★★). Levels 9 (Syncopation) and 10 (Six-eight) have no lessons yet: they come later, with no checks.
 * - Rhythm by ear: Echo rounds with each rhythm unit's material.
 * - Treble clef and Bass clef: Read notes rounds that cover each level, at 90% and quick enough.
 * - Scales: best stars per scale (Scales hub).
 * - Theory: the Learn chapters' sections read (levels 1–9 chapters 1–9, level 10 chapters 10 and 11).
 *
 * Texts are message keys with params (Label): render them with `t(label.key, translateParams(label.params))`, which
 * also translates params that are message keys (a cell, a level or a section name). Pure.
 */
import { KEYS, type Clef, type KeyId } from '../core/pitch';
import type { NoteSettings } from '../core/noteRound';
import { ALL_SCALES, CIRCLE_ORDER, scaleId, type ScaleType } from '../core/scale';
import { SHOWN_STARS, type Settings } from '../core/types';
import { CHAPTERS, sectionKey } from '../ui/learn/chapters';
import { cellAccuracy, cellTotals } from './stats';
import { pathLessonOf, pathUnitOf } from './tracks';
import { daysBetween, mondayOf, shiftDay, SKILL_IDS, type CellId, type Progress, type SkillId } from './storage';
import { playableSetup } from './weakSpots';

/** A text for the screen: a message key and its params (string params that are message keys are translated too). */
export interface Label {
  key: string;
  params: Record<string, string | number>;
}

/** One check of a level. */
export interface Check {
  label: Label;
  done: boolean;
  /** Where the player is now ("now 72%", "now 1 of 4", "now 2.2 s", "now 1 star"), or null with nothing to show yet. */
  now: Label | null;
  /** How far towards the target, 0–1 (1 when done): percent now/target, time target/now, stars and counts got/needed. */
  w: number;
}

/**
 * Where a skill's main button goes: always `to` (a route); 'echo' first puts Echo mode on the rhythm setup
 * (echoPreset), 'notes' first puts the clef on the Read notes setup (notesPreset).
 */
export type CtaTarget = { kind: 'route'; to: string } | { kind: 'echo'; to: '/setup' } | { kind: 'notes'; clef: Clef; to: '/notes' };

export interface SkillCta {
  label: Label;
  target: CtaTarget;
}

/** The skills in their order (also the tie-break for Focus next). */
export const SKILLS: readonly SkillId[] = SKILL_IDS;
export const SKILL_LEVELS = 10;
/** Days without practice after which a skill is due for review. */
export const REVIEW_DAYS = 14;
/** "+2 this month": levels passed in this many days, today included. */
export const GAIN_DAYS = 30;
/** The level history: the level at the end of each of this many weeks, this week last. */
export const HISTORY_WEEKS = 12;
/** Rhythm units with lessons (rhythm levels 1–8; 9 and 10 come later). */
const RHYTHM_UNITS = 8;

/** Skills compared in Focus next: each with its pair. */
const PAIR: Partial<Record<SkillId, SkillId>> = { rhythm: 'ear', ear: 'rhythm', treble: 'bass', bass: 'treble' };

/** The skill-map cell each rhythm unit checks at CELL_TARGET (unit 3, three-four and whole notes, has none). */
const UNIT_CELL: Partial<Record<number, CellId>> = { 1: 'half', 2: 'rests', 4: 'eighths', 5: 'rests', 6: 'ties', 7: 'dottedQE', 8: 'sixteenths' };
const CELL_TARGET = 85;
/** The treble and bass levels with a name of their own (the clef's lines, spaces and middle C); the rest are shared. */
const CLEF_LEVELS = [1, 2, 4];
/** A note-reading round's accuracy each notes level needs, and the average answer time (ms) of levels 3–9 and 10. */
const READ_TARGET = 90;
const SPEED_MS = 2000;
const SPEED_TOP_MS = 1500;
/** The major scales of scales levels 1–5, and the keys of the five minor scales of levels 7–9 (A, E, D, B, G minor). */
const MAJOR_LEVELS: KeyId[][] = [['C'], ['G', 'F'], ['D', 'Bb'], ['A', 'Eb'], ['E', 'Ab']];
const MINOR_KEYS: KeyId[] = ['C', 'G', 'F', 'D', 'Bb'];
const MINOR_LEVEL_TYPE: Record<number, ScaleType> = { 7: 'natural', 8: 'harmonic', 9: 'melodic' };

const label = (key: string, params: Record<string, string | number> = {}): Label => ({ key, params });
const ratio = (got: number, needed: number): number => Math.max(0, Math.min(1, needed > 0 ? got / needed : 0));
const nowStars = (stars: number): Label | null => (stars > 0 ? label('skills.now.stars', { count: Math.min(SHOWN_STARS, stars) }) : null);
const nowCount = (done: number, total: number): Label => label('skills.now.count', { done: Math.min(done, total), total });

/** The Learn chapters of a theory level. */
const theoryChapters = (n: number): number[] => (n < SKILL_LEVELS ? [n] : [10, 11]);

/** The name of level n (1–10) of a skill: a message key. */
export function levelName(skill: SkillId, n: number): string {
  switch (skill) {
    case 'rhythm':
    case 'ear':
      return n <= RHYTHM_UNITS ? `path.u${n}.title` : `skills.level.rhythm.${n}`;
    case 'treble':
    case 'bass':
      return CLEF_LEVELS.includes(n) ? `skills.level.${skill}.${n}` : `skills.level.notes.${n}`;
    case 'scales':
      return `skills.level.scales.${n}`;
    case 'theory':
      return n < SKILL_LEVELS ? `learn.chapters.${n}.title` : 'skills.level.theory.10';
  }
}

/** What the checks read from, worked out once per evaluation. */
export interface SkillContext {
  progress: Progress;
  today: string;
  /** The skill map's rolling accuracy per cell (null under MIN_CELL_NOTES notes). */
  cells: Record<CellId, number | null>;
}

export function skillContext(progress: Progress, today: string): SkillContext {
  const totals = cellTotals(progress, today);
  const cells = Object.fromEntries(Object.entries(totals).map(([id, t]) => [id, cellAccuracy(t)])) as Record<CellId, number | null>;
  return { progress, today, cells };
}

const starsOn = (p: Progress, lessonId: string): number => p.lessons[lessonId]?.stars ?? 0;

function rhythmChecks(ctx: SkillContext, n: number): Check[] {
  if (n > RHYTHM_UNITS) return [];
  const p = ctx.progress;
  const shown = (ref: string): string => pathLessonOf('rhythm', ref)?.id ?? ref;
  const lessons = [1, 2, 3, 4].filter((i) => starsOn(p, `${n}.${i}`) >= 2).length;
  const checks: Check[] = [
    { label: label('skills.check.lessons', { first: shown(`${n}.1`), last: shown(`${n}.4`) }), done: lessons === 4, now: nowCount(lessons, 4), w: ratio(lessons, 4) },
  ];
  const cell = UNIT_CELL[n];
  if (cell) {
    const acc = ctx.cells[cell];
    checks.push({
      label: label('skills.check.cell', { cell: `skills.cell.${cell}`, pct: CELL_TARGET }),
      done: acc !== null && acc >= CELL_TARGET,
      now: acc === null ? null : label('skills.now.percent', { value: acc }),
      w: acc === null ? 0 : ratio(acc, CELL_TARGET),
    });
  }
  const review = starsOn(p, `${n}.5`);
  checks.push({ label: label('skills.check.review', { id: shown(`${n}.5`) }), done: review >= 3, now: nowStars(review), w: ratio(review, 3) });
  return checks;
}

function earChecks(ctx: SkillContext, n: number): Check[] {
  if (n > RHYTHM_UNITS) return [];
  const echo = ctx.progress.stats.echo;
  let rounds = 0;
  let best = 0;
  for (let l = n; l <= RHYTHM_UNITS; l++) {
    const [r, s] = echo[String(l)] ?? [0, 0];
    rounds += r;
    best = Math.max(best, s);
  }
  const material = `skills.material.${n}`;
  return [
    { label: label('skills.check.echoRounds', { count: 3, material }), done: rounds >= 3, now: nowCount(rounds, 3), w: ratio(rounds, 3) },
    { label: label('skills.check.echoBars', { bars: 4, material }), done: best >= 3, now: nowStars(best), w: ratio(best, 3) },
  ];
}

function readingChecks(ctx: SkillContext, clef: Clef, n: number): Check[] {
  const entry = ctx.progress.stats.reading[`${clef}:${n}`];
  const acc = entry ? entry[0] : null;
  const what = CLEF_LEVELS.includes(n) ? `skills.what.${clef}.${n}` : `skills.what.notes.${n}`;
  const checks: Check[] = [
    {
      label: label('skills.check.read', { what, pct: READ_TARGET }),
      done: acc !== null && acc >= READ_TARGET,
      now: acc === null ? null : label('skills.now.percent', { value: acc }),
      w: acc === null ? 0 : ratio(acc, READ_TARGET),
    },
  ];
  if (n >= 3) {
    const target = n === SKILL_LEVELS ? SPEED_TOP_MS : SPEED_MS;
    const ms = entry ? entry[1] : 0;
    const done = ms > 0 && ms <= target;
    // Rounded up, and the bar short of full, so an average that misses the target never reads as it (2.04 s: 2.1 s).
    checks.push({
      label: label('skills.check.speed', { seconds: target / 1000 }),
      done,
      now: ms > 0 ? label('skills.now.seconds', { value: Math.ceil(ms / 100) / 10 }) : null,
      w: ms > 0 ? Math.min(done ? 1 : 0.99, ratio(target, ms)) : 0,
    });
  }
  return checks;
}

/** "B♭": a major key's tonic as written (letters and signs read the same in every catalog so far). */
const tonicText = (key: KeyId): string => {
  const t = KEYS[key].major;
  return t.letter + (t.alter > 0 ? '♯' : t.alter < 0 ? '♭' : '');
};

function scaleChecks(ctx: SkillContext, n: number): Check[] {
  const stars = ctx.progress.scales.stars;
  const of = (key: KeyId, type: ScaleType): number => stars[scaleId({ key, type })] ?? 0;
  if (n <= MAJOR_LEVELS.length) {
    return MAJOR_LEVELS[n - 1].map((key) => {
      const s = of(key, 'major');
      return { label: label('skills.check.major', { tonic: tonicText(key) }), done: s >= 2, now: nowStars(s), w: ratio(s, 2) };
    });
  }
  const count = (keys: readonly KeyId[], type: ScaleType): Check => {
    const k = keys.filter((key) => of(key, type) >= 2).length;
    return { label: label('skills.check.scaleCount', { count: keys.length, type: `scales.typeLower.${type}` }), done: k === keys.length, now: nowCount(k, keys.length), w: ratio(k, keys.length) };
  };
  if (n === 6) return [count(CIRCLE_ORDER, 'major')];
  if (n < SKILL_LEVELS) return [count(MINOR_KEYS, MINOR_LEVEL_TYPE[n])];
  const k = ALL_SCALES.filter((s) => (stars[scaleId(s)] ?? 0) >= 3).length;
  return [{ label: label('skills.check.allScales', { count: ALL_SCALES.length }), done: k === ALL_SCALES.length, now: nowCount(k, ALL_SCALES.length), w: ratio(k, ALL_SCALES.length) }];
}

function theoryChecks(ctx: SkillContext, n: number): Check[] {
  const read = new Set(ctx.progress.learnRead);
  return CHAPTERS.filter((c) => theoryChapters(n).includes(c.n))
    .flatMap((c) => c.sections)
    .map((s) => {
      const done = read.has(s.id);
      return { label: label('skills.check.section', { id: s.id, title: sectionKey(s.id, 'title') }), done, now: null, w: done ? 1 : 0 };
    });
}

/** The checks of level n (1–10) of a skill. None: the level comes later (rhythm and Echo 9–10). */
export function levelChecks(ctx: SkillContext, skill: SkillId, n: number): Check[] {
  switch (skill) {
    case 'rhythm':
      return rhythmChecks(ctx, n);
    case 'ear':
      return earChecks(ctx, n);
    case 'treble':
    case 'bass':
      return readingChecks(ctx, skill, n);
    case 'scales':
      return scaleChecks(ctx, n);
    case 'theory':
      return theoryChecks(ctx, n);
  }
}

const levelKey = (skill: SkillId, n: number): string => `${skill}:${n}`;

/** The day level n of a skill was passed, or null. */
export const passedOn = (p: Progress, skill: SkillId, n: number): string | null => p.skills[levelKey(skill, n)] ?? null;

/** A skill's level: the levels passed in order from 1 (a gap stops the count). */
export function skillLevel(p: Progress, skill: SkillId): number {
  let n = 0;
  while (n < SKILL_LEVELS && passedOn(p, skill, n + 1)) n++;
  return n;
}

/**
 * Progress with every level whose checks are all met passed `today`: per skill in order from its level, up to the
 * first level not met. `added` lists the new "skill:level" keys.
 */
export function passSkills(p: Progress, today: string): { progress: Progress; added: string[] } {
  const ctx = skillContext(p, today);
  const add: Record<string, string> = {};
  for (const skill of SKILLS) {
    for (let n = 1; n <= SKILL_LEVELS; n++) {
      if (passedOn(p, skill, n)) continue;
      const checks = levelChecks(ctx, skill, n);
      if (checks.length === 0 || !checks.every((c) => c.done)) break;
      add[levelKey(skill, n)] = today;
    }
  }
  const added = Object.keys(add);
  if (added.length === 0) return { progress: p, added };
  return { progress: { ...p, skills: { ...p.skills, ...add } }, added };
}

/**
 * Review: due when the skill has a level and was last practised REVIEW_DAYS or more days ago; `days` since then (0 for
 * a day after today, which another device's time zone or a clock set wrong wrote).
 */
export function reviewOf(p: Progress, skill: SkillId, today: string): { due: boolean; days: number | null } {
  const seen = p.stats.seen[skill];
  const days = seen ? Math.max(0, daysBetween(seen, today)) : null;
  return { due: days !== null && days >= REVIEW_DAYS && skillLevel(p, skill) >= 1, days };
}

/**
 * The day level n was passed, as this device counts it: a day after today (another device a time zone ahead, or a
 * clock set wrong, wrote it) counts as today, as skillLevel counts the level already.
 */
const passedBy = (p: Progress, skill: SkillId, n: number, today: string): string | null => {
  const day = passedOn(p, skill, n);
  return day && day > today ? today : day;
};

/** Levels of a skill passed in the last GAIN_DAYS days (today included). */
export function gainOf(p: Progress, skill: SkillId, today: string): number {
  const from = shiftDay(today, -GAIN_DAYS);
  let n = 0;
  for (let l = 1; l <= SKILL_LEVELS; l++) {
    const day = passedBy(p, skill, l, today);
    if (day && day > from) n++;
  }
  return n;
}

/** The level at the end of each of the last HISTORY_WEEKS weeks (Monday to Sunday), oldest first; this week's is today's. */
export function historyOf(p: Progress, skill: SkillId, today: string): number[] {
  const monday = mondayOf(today);
  return Array.from({ length: HISTORY_WEEKS }, (_, i) => {
    const back = HISTORY_WEEKS - 1 - i;
    const end = back === 0 ? today : shiftDay(monday, -7 * back + 6);
    let n = 0;
    for (let l = 1; l <= SKILL_LEVELS; l++) {
      const day = passedBy(p, skill, l, today);
      if (day && day <= end) n++;
    }
    return n;
  });
}

/** The rhythm setup in Echo mode (Rhythm by ear's button), the rest as set up (playable: weakSpots' playableSetup). */
export const echoPreset = (s: Settings): Settings => ({ ...playableSetup(s), mode: 'echo' });

/** The Read notes setup with one clef (Treble clef's and Bass clef's button), the rest as set up. */
export const notesPreset = (s: NoteSettings, clef: Clef): NoteSettings => ({ ...s, clefs: [clef] });

/** The first Learn chapter from a theory level on with a section not read yet, or null when every section is read. */
function nextChapter(p: Progress, fromLevel: number): number | null {
  const read = new Set(p.learnRead);
  const from = theoryChapters(Math.min(SKILL_LEVELS, Math.max(1, fromLevel)))[0];
  const later = CHAPTERS.filter((c) => c.n >= from).find((c) => c.sections.some((s) => !read.has(s.id)));
  return (later ?? CHAPTERS.find((c) => c.sections.some((s) => !read.has(s.id))))?.n ?? null;
}

/** A skill's main button, for its next level. */
export function ctaOf(p: Progress, skill: SkillId): SkillCta {
  const next = skillLevel(p, skill) + 1;
  switch (skill) {
    case 'rhythm': {
      const unit = next <= RHYTHM_UNITS ? pathUnitOf('rhythm', next) : null;
      return unit !== null
        ? { label: label('skills.cta.rhythm', { unit }), target: { kind: 'route', to: '/path' } }
        : { label: label('skills.cta.rhythmFree'), target: { kind: 'route', to: '/setup' } };
    }
    case 'ear':
      return { label: label('skills.cta.ear'), target: { kind: 'echo', to: '/setup' } };
    case 'treble':
    case 'bass':
      return { label: label(`skills.cta.${skill}`), target: { kind: 'notes', clef: skill, to: '/notes' } };
    case 'scales':
      return { label: label('skills.cta.scales'), target: { kind: 'route', to: '/scales' } };
    case 'theory': {
      const n = nextChapter(p, next);
      return n !== null
        ? { label: label('skills.cta.theory', { n }), target: { kind: 'route', to: `/learn/${n}` } }
        : { label: label('skills.cta.theoryDone'), target: { kind: 'route', to: '/learn' } };
    }
  }
}

/** Focus next: the lowest skill (ties: the skills' order), and the one it is compared with. */
export interface Focus {
  skill: SkillId;
  level: number;
  /** Its pair (rhythm ↔ ear, treble ↔ bass) when that is higher, else the highest skill; null when all are level. */
  other: SkillId | null;
  /** Levels behind `other` (0 when all are level). */
  behind: number;
  /** "Bass clef is your lowest skill: level 3, 2 levels behind treble clef." / "Your skills are all at level 3." */
  label: Label;
  cta: SkillCta;
}

export function focusOf(p: Progress): Focus {
  const levels = new Map(SKILLS.map((s) => [s, skillLevel(p, s)]));
  const lv = (s: SkillId): number => levels.get(s) ?? 0;
  const skill = SKILLS.reduce((a, b) => (lv(b) < lv(a) ? b : a));
  const top = SKILLS.reduce((a, b) => (lv(b) > lv(a) ? b : a));
  const level = lv(skill);
  const cta = ctaOf(p, skill);
  if (lv(top) === level) return { skill, level, other: null, behind: 0, label: label('skills.focus.equal', { level }), cta };
  const pair = PAIR[skill];
  const other = pair && lv(pair) > level ? pair : top;
  const behind = lv(other) - level;
  return {
    skill,
    level,
    other,
    behind,
    label: label('skills.focus.behind', { skill: `skills.name.${skill}`, level, count: behind, other: `skills.nameLower.${other}` }),
    cta,
  };
}
