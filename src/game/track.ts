/**
 * A learning path as data and rules (DESIGN.md §8.2): units of lessons that open one after another. Rhythm, Read notes
 * and Keys all follow the same rules: lesson 1.1 is open; two stars on a lesson open the next; a unit opens with two
 * stars on every lesson of the unit before it. Pure: the paths themselves are in path.ts and notesPath.ts, and
 * tracks.ts puts them together.
 */
import { SHOWN_STARS } from '../core/types';
import type { Progress } from './storage';

export type TrackId = 'rhythm' | 'notes' | 'keys';
export const TRACK_IDS: readonly TrackId[] = ['rhythm', 'notes', 'keys'];

/** Stars on a lesson needed to open the next one (§8.2). */
export const UNLOCK_STARS = 2;

export interface TrackLesson {
  /** "7.3": unit and lesson, inside its path. */
  id: string;
  /** Message key (or plain text) of the lesson's name. */
  title: string;
}

export interface TrackUnit<L extends TrackLesson = TrackLesson> {
  id: number;
  titleKey: string;
  /** Noto Music glyph, or short text such as "3/4" (drawn in the display face). */
  glyph: string;
  lessons: L[];
}

export interface Track<L extends TrackLesson = TrackLesson> {
  id: TrackId;
  units: TrackUnit<L>[];
}

/**
 * Where a lesson's result is kept in `progress.lessons`: rhythm lessons under their plain id ("7.3", as since 0.1),
 * the other paths with the path in front ("notes:4.3", "keys:2.1").
 */
export const progressKey = (track: TrackId, lessonId: string): string => (track === 'rhythm' ? lessonId : `${track}:${lessonId}`);

/** Every lesson of a path in order, with its unit and its place in the unit. */
export function trackLessons<L extends TrackLesson>(track: Track<L>): Array<{ unit: TrackUnit<L>; lesson: L; index: number }> {
  return track.units.flatMap((unit) => unit.lessons.map((lesson, index) => ({ unit, lesson, index })));
}

export function findTrackLesson<L extends TrackLesson>(track: Track<L>, lessonId: string): { unit: TrackUnit<L>; lesson: L; index: number } | null {
  return trackLessons(track).find((x) => x.lesson.id === lessonId) ?? null;
}

/** The best stars on a lesson so far (0 when never played). */
export const starsIn = (progress: Progress, track: TrackId, lessonId: string): number => progress.lessons[progressKey(track, lessonId)]?.stars ?? 0;

/** Lesson 1.1 is open; any other lesson opens with 2 stars on the one before it, a unit's first with 2 on every lesson of the unit before. */
export function lessonOpen(progress: Progress, track: Track, lessonId: string): boolean {
  const all = trackLessons(track);
  const pos = all.findIndex((x) => x.lesson.id === lessonId);
  if (pos < 0) return false;
  if (pos === 0) return true;
  const { unit, index } = all[pos];
  if (index > 0) return starsIn(progress, track.id, unit.lessons[index - 1].id) >= UNLOCK_STARS;
  return all[pos - 1].unit.lessons.every((l) => starsIn(progress, track.id, l.id) >= UNLOCK_STARS);
}

/** The lesson to continue with: the first one, in path order, without 2 stars. Null when the path is done. */
export function nextIn<L extends TrackLesson>(progress: Progress, track: Track<L>): L | null {
  return trackLessons(track).find((x) => starsIn(progress, track.id, x.lesson.id) < UNLOCK_STARS)?.lesson ?? null;
}

/** Stars earned in a unit (at most 3 a lesson: the hidden 4th star and the diamond count as three). */
export function unitStarsIn(progress: Progress, track: Track, unitId: number): number {
  const u = track.units.find((x) => x.id === unitId);
  return u ? u.lessons.reduce((sum, l) => sum + Math.min(SHOWN_STARS, starsIn(progress, track.id, l.id)), 0) : 0;
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
  const starsNow = starsIn(after, track.id, lessonId);
  const cont = nextIn(after, track);
  const continueId = starsNow >= UNLOCK_STARS && cont && cont.id !== lessonId ? cont.id : null;
  if (starsNow < UNLOCK_STARS) return { kind: 'needStars', next: following, continueId: null };
  if (starsBefore >= UNLOCK_STARS) return { kind: 'passed', next: cont, continueId };
  if (!cont) return { kind: 'pathDone', next: null, continueId: null };
  return { kind: 'unlocked', next: cont, continueId };
}
