/**
 * A learning path as data and rules (DESIGN.md §8.2): units of lessons that open one after another. Lesson 1.1 is
 * open; two stars on a lesson open the next; a unit opens with two stars on every lesson of the unit before it. Pure:
 * the units are in path.ts (rhythm) and notesPath.ts (First notes, Read notes, Keys), and tracks.ts puts them together
 * into the one Learning path.
 */
import { SHOWN_STARS } from '../core/types';
import type { Progress } from './storage';

/** The kinds of units the Learning path is made of; each keeps its own lesson ids ("3.2") and progress keys. */
export type TrackId = 'rhythm' | 'pitch' | 'notes' | 'keys';

/** Stars on a lesson needed to open the next one (§8.2). */
export const UNLOCK_STARS = 2;

export interface TrackLesson {
  /** "7.3": unit and lesson, inside its path. */
  id: string;
  /** Message key (or plain text) of the lesson's name. */
  title: string;
  /** Where its result is kept in `progress.lessons`, when not under its own path's key (the Learning path's lessons). */
  key?: string;
}

export interface TrackUnit<L extends TrackLesson = TrackLesson> {
  id: number;
  titleKey: string;
  /** Noto Music glyph, short text such as "3/4" or "1♯" (drawn in the display face), or a message key for a word. */
  glyph: string;
  lessons: L[];
}

export interface Track<L extends TrackLesson = TrackLesson> {
  /** 'path': the Learning path, whose lessons carry their progress key. */
  id: TrackId | 'path';
  units: TrackUnit<L>[];
}

/**
 * Where a lesson's result is kept in `progress.lessons`: rhythm lessons under their plain id ("7.3", as since 0.1),
 * the others with their kind in front ("pitch:2.3", "notes:4.3", "keys:2.1").
 */
export const progressKey = (track: TrackId, lessonId: string): string => (track === 'rhythm' ? lessonId : `${track}:${lessonId}`);

const keyIn = (track: Track, lesson: TrackLesson): string => lesson.key ?? (track.id === 'path' ? lesson.id : progressKey(track.id, lesson.id));

/** The best stars on a lesson of a path so far (0 when never played). */
export const starsOf = (progress: Progress, track: Track, lesson: TrackLesson): number => progress.lessons[keyIn(track, lesson)]?.stars ?? 0;

/** Every lesson of a path in order, with its unit and its place in the unit. */
export function trackLessons<L extends TrackLesson>(track: Track<L>): Array<{ unit: TrackUnit<L>; lesson: L; index: number }> {
  return track.units.flatMap((unit) => unit.lessons.map((lesson, index) => ({ unit, lesson, index })));
}

export function findTrackLesson<L extends TrackLesson>(track: Track<L>, lessonId: string): { unit: TrackUnit<L>; lesson: L; index: number } | null {
  return trackLessons(track).find((x) => x.lesson.id === lessonId) ?? null;
}

/** The best stars on a lesson so far (0 when never played). */
export const starsIn = (progress: Progress, track: TrackId, lessonId: string): number => progress.lessons[progressKey(track, lessonId)]?.stars ?? 0;

/**
 * Lesson 1.1 is open; any other lesson opens with 2 stars on the one before it, a unit's first with 2 on every lesson
 * of the unit before. A lesson with stars stays open (played before the paths became one, 0.11.0).
 */
export function lessonOpen(progress: Progress, track: Track, lessonId: string): boolean {
  const all = trackLessons(track);
  const pos = all.findIndex((x) => x.lesson.id === lessonId);
  if (pos < 0) return false;
  if (pos === 0) return true;
  const { unit, index, lesson } = all[pos];
  if (starsOf(progress, track, lesson) > 0) return true;
  if (index > 0) return starsOf(progress, track, unit.lessons[index - 1]) >= UNLOCK_STARS;
  return all[pos - 1].unit.lessons.every((l) => starsOf(progress, track, l) >= UNLOCK_STARS);
}

/** The lesson to continue with: the first one, in path order, without 2 stars. Null when the path is done. */
export function nextIn<L extends TrackLesson>(progress: Progress, track: Track<L>): L | null {
  return trackLessons(track).find((x) => starsOf(progress, track, x.lesson) < UNLOCK_STARS)?.lesson ?? null;
}

/** Stars earned in a unit (at most 3 a lesson: the hidden 4th star and the diamond count as three). */
export function unitStarsIn(progress: Progress, track: Track, unitId: number): number {
  const u = track.units.find((x) => x.id === unitId);
  return u ? u.lessons.reduce((sum, l) => sum + Math.min(SHOWN_STARS, starsOf(progress, track, l)), 0) : 0;
}

/** Stars over a whole path, for "42 / 75 ★". */
export function trackStarsIn(progress: Progress, track: Track): { earned: number; max: number } {
  return {
    earned: track.units.reduce((sum, u) => sum + unitStarsIn(progress, track, u.id), 0),
    max: trackLessons(track).length * SHOWN_STARS,
  };
}

export type UnitState = 'done' | 'current' | 'locked';

/** Units before the one with the next lesson are done, after it locked; with the path finished, every unit is done. */
export function unitStatesIn(progress: Progress, track: Track): UnitState[] {
  const next = nextIn(progress, track);
  const cur = next ? track.units.findIndex((u) => u.lessons.some((l) => l.id === next.id)) : track.units.length;
  return track.units.map((_, i) => (i < cur ? 'done' : i === cur ? 'current' : 'locked'));
}

/**
 * What a finished lesson means for its path, for Results and Round done (§6.4):
 * - `unlocked`: this run took the lesson to 2 stars, which opened `next`;
 * - `pathDone`: this run took the last lesson without 2 stars to 2 stars: the path is finished;
 * - `needStars`: still under 2 stars; `next` is the lesson that 2 stars open (null for the last lesson);
 * - `passed`: the lesson had 2 stars already (played again).
 * `continueId` is the lesson the main button starts: the path's next lesson once this one has 2 stars, else null.
 */
export interface LessonOutcome<L extends TrackLesson = TrackLesson> {
  kind: 'unlocked' | 'pathDone' | 'needStars' | 'passed';
  next: L | null;
  continueId: string | null;
}

export function outcomeIn<L extends TrackLesson>(after: Progress, track: Track<L>, lessonId: string, starsBefore: number): LessonOutcome<L> | null {
  const all = trackLessons(track);
  const pos = all.findIndex((x) => x.lesson.id === lessonId);
  if (pos < 0) return null;
  const following = all[pos + 1]?.lesson ?? null;
  const starsNow = starsOf(after, track, all[pos].lesson);
  const cont = nextIn(after, track);
  const continueId = starsNow >= UNLOCK_STARS && cont && cont.id !== lessonId ? cont.id : null;
  if (starsNow < UNLOCK_STARS) return { kind: 'needStars', next: following, continueId: null };
  if (starsBefore >= UNLOCK_STARS) return { kind: 'passed', next: cont, continueId };
  if (!cont) return { kind: 'pathDone', next: null, continueId: null };
  return { kind: 'unlocked', next: cont, continueId };
}
