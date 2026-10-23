/**
 * The Learning path (DESIGN.md §8.2): one path that learns notes and rhythm together. The First notes units bring in
 * sol, mi, fa, la, do, re and si one at a time (read, write and hear them) and take turns with the rhythm units; after
 * them come the rest of Read notes (the whole treble staff, the bass clef, both clefs, ledger lines, quick reading) and
 * Keys. Every unit keeps its own lessons and progress key (track.ts), so results from before the paths became one
 * (0.11.0) still count; the path numbers its units 1, 2, 3, … in its own order, and that number is what the player
 * sees ("Lesson 4.2").
 */
import { RHYTHM_TRACK } from './path';
import { noteTrack } from './notesPath';
import type { Progress } from './storage';
import {
  findTrackLesson,
  lessonOpen,
  nextIn,
  outcomeIn,
  progressKey,
  trackStarsIn,
  type LessonOutcome,
  type Track,
  type TrackId,
  type TrackLesson,
  type TrackUnit,
} from './track';

/** A lesson of the Learning path: its number there ("4.2"), and the unit kind and lesson it plays ("pitch", "2.2"). */
export interface PathLesson extends TrackLesson {
  track: TrackId;
  ref: string;
  key: string;
}

export interface PathUnit extends TrackUnit<PathLesson> {
  track: TrackId;
  /** The unit's own number in its kind (rhythm unit 3). */
  ref: number;
}

/** The units in path order: a new note, then a rhythm unit, while both last; then reading and keys. */
const ORDER: Array<[TrackId, number]> = [
  ['pitch', 1],
  ['rhythm', 1],
  ['pitch', 2],
  ['rhythm', 2],
  ['pitch', 3],
  ['rhythm', 3],
  ['pitch', 4],
  ['rhythm', 4],
  ['pitch', 5],
  ['rhythm', 5],
  ['pitch', 6],
  ['rhythm', 6],
  ['pitch', 7],
  ['rhythm', 7],
  ['notes', 1],
  ['rhythm', 8],
  ['notes', 2],
  ['notes', 3],
  ['notes', 4],
  ['notes', 5],
  ['keys', 1],
  ['keys', 2],
  ['keys', 3],
  ['keys', 4],
  ['keys', 5],
  ['keys', 6],
];

const sourceTrack = (track: TrackId): Track => (track === 'rhythm' ? RHYTHM_TRACK : noteTrack(track));

export const PATH_UNITS: PathUnit[] = ORDER.map(([track, ref], i) => {
  const u = sourceTrack(track).units.find((x) => x.id === ref);
  if (!u) throw new Error(`Learning path: no ${track} unit ${ref}`);
  const id = i + 1;
  return {
    id,
    titleKey: u.titleKey,
    glyph: u.glyph,
    track,
    ref,
    lessons: u.lessons.map((l, j) => ({ id: `${id}.${j + 1}`, title: l.title, track, ref: l.id, key: progressKey(track, l.id) })),
  };
});

export const LEARNING_PATH: Track<PathLesson> = { id: 'path', units: PATH_UNITS };

const byRef = new Map(PATH_UNITS.flatMap((u) => u.lessons.map((l) => [l.key, l] as const)));

/** The path lesson that plays lesson `ref` of a kind ("rhythm", "1.1" → "2.1"), or null. */
export const pathLessonOf = (track: TrackId, ref: string): PathLesson | null => byRef.get(progressKey(track, ref)) ?? null;

/** A path lesson by its number in the path ("2.1"), with its unit. */
export const findPathLesson = (id: string): { unit: TrackUnit<PathLesson>; lesson: PathLesson; index: number } | null =>
  findTrackLesson(LEARNING_PATH, id);

/** The path's number of a unit of one kind (rhythm unit 3 → 6), or null. */
export const pathUnitOf = (track: TrackId, ref: number): number | null => PATH_UNITS.find((u) => u.track === track && u.ref === ref)?.id ?? null;

/** A lesson of one kind can be played: its place in the Learning path is open (track.ts rules). */
export function pathLessonOpen(progress: Progress, track: TrackId, ref: string): boolean {
  const l = pathLessonOf(track, ref);
  return !!l && lessonOpen(progress, LEARNING_PATH, l.id);
}

/** The lesson to continue with, or null when the path is done. */
export const pathNext = (progress: Progress): PathLesson | null => nextIn(progress, LEARNING_PATH);

/** What a finished lesson (by kind and own id) means for the path, for Results and Round done (§6.4). */
export function pathOutcome(after: Progress, track: TrackId, ref: string, starsBefore: number): LessonOutcome<PathLesson> | null {
  const l = pathLessonOf(track, ref);
  return l ? outcomeIn(after, LEARNING_PATH, l.id, starsBefore) : null;
}

/** Stars over the whole path, for the Path header ("121 / 390 ★"). */
export const allStars = (progress: Progress): { earned: number; max: number } => trackStarsIn(progress, LEARNING_PATH);
