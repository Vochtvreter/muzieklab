/**
 * What a rhythm path lesson introduces (DESIGN.md §3.1, the intro sheet): the time signatures, note values, rests,
 * dots, ties and triplets that no earlier lesson of the path used. The first lesson introduces nothing to show: its
 * quarter notes and four-four are what How to play covers.
 */
import { spellExercise } from '../core/speller';
import { METER_IDS, NOTE_VALUES, type Exercise, type MeterId, type NoteValue, type Settings } from '../core/types';
import { ALL_LESSONS, lessonSettings } from './path';

export type Intro = { kind: 'meter'; meter: MeterId } | { kind: 'note' | 'rest'; value: NoteValue } | { kind: 'dotted' | 'ties' | 'triplets' };

/** Its id in prefs.seenIntros: "meter:3/4", "note:half", "rest:quarter", "dotted", "ties", "triplets". */
export function introId(i: Intro): string {
  if (i.kind === 'meter') return 'meter:' + i.meter;
  if (i.kind === 'note' || i.kind === 'rest') return i.kind + ':' + i.value;
  return i.kind;
}

/** Every symbol a lesson can use, in the order the sheet lists them. */
function symbols(s: Settings): Intro[] {
  return [
    ...s.meters.map((meter): Intro => ({ kind: 'meter', meter })),
    ...s.notes.map((value): Intro => ({ kind: 'note', value })),
    ...s.rests.map((value): Intro => ({ kind: 'rest', value })),
    ...(['dotted', 'ties', 'triplets'] as const).filter((k) => s[k]).map((kind): Intro => ({ kind })),
  ];
}

/** Every id an intro can have, for validating stored prefs. */
export const INTRO_IDS: readonly string[] = symbols({
  ...lessonSettings(ALL_LESSONS[0].lesson.id),
  meters: [...METER_IDS],
  notes: [...NOTE_VALUES],
  rests: [...NOTE_VALUES],
  dotted: true,
  ties: true,
  triplets: true,
}).map(introId);

let byLesson: Map<string, Intro[]> | null = null;

/** What each lesson introduces, worked out once in path order. */
function introsByLesson(): Map<string, Intro[]> {
  if (byLesson) return byLesson;
  const map = new Map<string, Intro[]>();
  const used = new Set<string>();
  for (const [i, { lesson }] of ALL_LESSONS.entries()) {
    const fresh = symbols(lessonSettings(lesson.id)).filter((x) => !used.has(introId(x)));
    for (const x of fresh) used.add(introId(x));
    map.set(lesson.id, i === 0 ? [] : fresh);
  }
  byLesson = map;
  return map;
}

/** What a rhythm lesson introduces; none for the first lesson or an unknown id. */
export function lessonIntros(lessonId: string): Intro[] {
  return introsByLesson().get(lessonId) ?? [];
}

/** What a lesson introduces that the player has not been shown yet. */
export function unseenIntros(lessonId: string, seen: readonly string[]): Intro[] {
  return lessonIntros(lessonId).filter((x) => !seen.includes(introId(x)));
}

/** The intro ids of the lessons given (progress keys; other paths' "notes:1.2" have none): played lessons were met. */
export function introsOf(lessonIds: Iterable<string>): string[] {
  const ids = new Set<string>();
  for (const id of lessonIds) for (const x of lessonIntros(id)) ids.add(introId(x));
  return [...ids];
}

/**
 * The intro ids of what an exercise's staff shows: its time signature, note and rest values, dots, ties, triplets;
 * and each dotted value, as a lesson's `preview` names it (path.ts: 'dotted:quarter').
 */
function shownIds(exercise: Exercise): Set<string> {
  const ids = new Set<string>(['meter:' + exercise.meter.id]);
  for (const bar of spellExercise(exercise)) {
    for (const s of bar.symbols) {
      // A whole-bar rest is drawn as the whole rest; a triplet's notes count as the triplet, not as eighths.
      ids.add(s.tuplet ? 'triplets' : s.kind + ':' + s.value);
      if (s.dots) ids.add('dotted').add('dotted:' + s.value);
      if (s.tieToNext) ids.add('ties');
    }
  }
  return ids;
}

/** Whether an exercise's staff shows every symbol given (intro ids, 'dotted:quarter'), e.g. all its lesson is about. */
export function exerciseHas(exercise: Exercise, ids: readonly string[]): boolean {
  if (ids.length === 0) return true;
  const shown = shownIds(exercise);
  return ids.every((id) => shown.has(id));
}
