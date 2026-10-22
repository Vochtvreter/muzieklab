/**
 * The three learning paths on the Path tab (DESIGN.md §8.2): Rhythm (Learn chapters 1–7), Read notes (chapter 8) and
 * Keys (chapters 9 and 10). Rhythm and Read notes are open from the start; Keys opens with two stars on every Read
 * notes unit 3 lesson.
 */
import { RHYTHM_TRACK } from './path';
import { KEYS_TRACK, NOTES_TRACK } from './notesPath';
import type { Progress } from './storage';
import { lessonOpen, nextIn, starsIn, trackStarsIn, UNLOCK_STARS, type Track, type TrackId, type TrackLesson } from './track';

export const TRACKS: Track[] = [RHYTHM_TRACK, NOTES_TRACK, KEYS_TRACK];

export const trackById = (id: TrackId): Track => TRACKS.find((t) => t.id === id) ?? RHYTHM_TRACK;

/** A path that opens once every lesson of another path's unit has two stars. */
export const OPENS_AFTER: Partial<Record<TrackId, { track: TrackId; unit: number }>> = { keys: { track: 'notes', unit: 3 } };

/** Whether a path is open (Keys after Read notes unit 3; the others from the start). */
export function trackOpen(progress: Progress, id: TrackId): boolean {
  const after = OPENS_AFTER[id];
  if (!after) return true;
  const u = trackById(after.track).units.find((x) => x.id === after.unit);
  return !!u && u.lessons.every((l) => starsIn(progress, after.track, l.id) >= UNLOCK_STARS);
}

/** A lesson can be played: its path is open and the lesson is (track.ts rules). */
export const trackLessonOpen = (progress: Progress, id: TrackId, lessonId: string): boolean =>
  trackOpen(progress, id) && lessonOpen(progress, trackById(id), lessonId);

/** The lesson to continue with on a path, or null when the path is done or still closed. */
export function continueIn(progress: Progress, id: TrackId): TrackLesson | null {
  return trackOpen(progress, id) ? nextIn(progress, trackById(id)) : null;
}

/** Stars over every path, for the Path header ("121 / 285 ★"). */
export function allStars(progress: Progress): { earned: number; max: number } {
  return TRACKS.reduce(
    (sum, t) => {
      const s = trackStarsIn(progress, t);
      return { earned: sum.earned + s.earned, max: sum.max + s.max };
    },
    { earned: 0, max: 0 },
  );
}
