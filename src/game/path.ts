import type { Settings } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/defaults';
import type { LessonProgress, Progress } from './storage';
import type { Track, TrackLesson, TrackUnit } from './track';

export { UNLOCK_STARS } from './track';

export interface Lesson extends TrackLesson {
  settings: Partial<Settings>; // preset on top of the unit's base
  /**
   * What every exercise of the lesson (makeLessonRun, ui/store.tsx) and the bar of Home's preview must show, where the
   * title names more than the symbols the lesson adds, or other ones (3.2 adds the half rest, which a three-four
   * exercise never has; ui/lib/lessons.ts): 'note:half', 'rest:eighth', 'dotted:quarter', or a figure
   * (game/intro.ts): 'figure:eighth-sixteenths'.
   */
  preview?: string[];
}

/** A lesson's preset, with its `preview` when it has one. */
type LessonPreset = Partial<Settings> & { preview?: string[] };

export interface Unit extends TrackUnit<Lesson> {
  base: Partial<Settings>;
}

function unit(id: number, glyph: string, base: Partial<Settings>, lessons: LessonPreset[]): Unit {
  return {
    id,
    titleKey: `path.u${id}.title`,
    glyph,
    base,
    lessons: lessons.map(({ preview, ...settings }, i) => ({
      id: `${id}.${i + 1}`,
      title: `path.u${id}.l${i + 1}`,
      settings,
      ...(preview && { preview }),
    })),
  };
}

/*
 * Rhythm units 1–8 of the Learning path (§8.2; the path numbers them in its own order, tracks.ts). Each unit's base spells out every musical setting, so nothing
 * leaks in from DEFAULT_SETTINGS; lessons add one thing at a time, and lesson 5 reviews the unit
 * with more bars and a faster tempo. Tap only (`hold: false`) in unit 1, tap & hold from unit 2.
 * Titles are message keys: path.u{unit}.title and path.u{unit}.l{lesson}; the comments give the English.
 */
const BASE: Partial<Settings> = {
  hold: true,
  meters: ['4/4'],
  dotted: false,
  ties: false,
  triplets: false,
  metronome: 'on',
  countIn: 1,
  density: 'balanced',
  restAmount: 'some',
};

export const UNITS: Unit[] = [
  unit(1, '𝅘𝅥', { ...BASE, hold: false, notes: ['quarter'], rests: [] }, [
    { notes: ['quarter'], bars: 2, tempo: 60 }, // Quarter notes
    { notes: ['half', 'quarter'], density: 'sparse', bars: 2, tempo: 60 }, // Half notes
    { notes: ['half', 'quarter'], bars: 4, tempo: 70 }, // Halves and quarters
    { notes: ['half', 'quarter'], bars: 4, tempo: 80 }, // A little faster
    { notes: ['half', 'quarter'], bars: 8, tempo: 90 }, // Unit review
  ]),
  unit(2, '𝄽', { ...BASE, notes: ['half', 'quarter'], rests: ['quarter'] }, [
    { rests: [], bars: 2, tempo: 60 }, // Hold for the length
    { rests: ['quarter'], restAmount: 'few', bars: 2, tempo: 60 }, // Quarter rests
    { rests: ['half'], bars: 4, tempo: 70 }, // Half rests
    { rests: ['half', 'quarter'], bars: 4, tempo: 80, preview: ['rest:quarter', 'rest:half'] }, // Quarter and half rests
    { rests: ['half', 'quarter'], restAmount: 'many', bars: 8, tempo: 90 }, // Unit review
  ]),
  unit(3, '3/4', { ...BASE, meters: ['3/4'], notes: ['half', 'quarter'], rests: ['quarter'] }, [
    { bars: 2, tempo: 70 }, // Three beats in a bar
    { rests: ['half', 'quarter'], bars: 4, tempo: 80, preview: ['rest:quarter'] }, // Rests in three-four
    { meters: ['4/4'], notes: ['whole', 'half', 'quarter'], density: 'sparse', bars: 4, tempo: 70 }, // Whole notes
    { meters: ['4/4'], notes: ['whole', 'half', 'quarter'], rests: ['whole', 'half', 'quarter'], bars: 4, tempo: 80 }, // Whole rests
    { rests: ['whole', 'half', 'quarter'], bars: 8, tempo: 90 }, // Unit review
  ]),
  unit(4, '𝅘𝅥𝅮', { ...BASE, notes: ['half', 'quarter', 'eighth'], rests: ['quarter'] }, [
    { notes: ['quarter', 'eighth'], rests: [], density: 'sparse', bars: 2, tempo: 60 }, // Eighth-note pairs
    { notes: ['quarter', 'eighth'], bars: 4, tempo: 70 }, // Eighths and quarters
    { rests: ['half', 'quarter'], bars: 4, tempo: 70, preview: ['note:eighth', 'note:half'] }, // Eighths with half notes
    { meters: ['3/4'], bars: 4, tempo: 80 }, // Eighths in three-four
    { notes: ['whole', 'half', 'quarter', 'eighth'], rests: ['half', 'quarter'], density: 'busy', bars: 8, tempo: 90 }, // Unit review
  ]),
  unit(5, '2/4', { ...BASE, meters: ['2/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'] }, [
    { rests: ['quarter'], bars: 2, tempo: 70 }, // Two beats in a bar
    { meters: ['4/4'], notes: ['quarter', 'eighth'], bars: 2, tempo: 60 }, // Eighth rests
    { notes: ['quarter', 'eighth'], bars: 4, tempo: 70, preview: ['rest:eighth'] }, // Eighth rests in two-four
    { meters: ['2/4', '3/4', '4/4'], bars: 4, tempo: 80 }, // Mixed meters
    { meters: ['2/4', '3/4', '4/4'], notes: ['whole', 'half', 'quarter', 'eighth'], rests: ['whole', 'half', 'quarter', 'eighth'], bars: 8, tempo: 90 }, // Unit review
  ]),
  unit(6, '⁀', { ...BASE, ties: true, notes: ['half', 'quarter', 'eighth'], rests: ['quarter'] }, [
    { notes: ['half', 'quarter'], bars: 2, tempo: 60 }, // Tied notes
    { bars: 4, tempo: 70 }, // Ties with eighths
    { meters: ['3/4'], bars: 4, tempo: 70 }, // Ties in three-four
    { rests: ['quarter', 'eighth'], bars: 4, tempo: 80 }, // Ties and rests
    { meters: ['2/4', '3/4', '4/4'], rests: ['half', 'quarter', 'eighth'], bars: 8, tempo: 90 }, // Unit review
  ]),
  // Dotted half first: without eighths a dotted quarter cannot be completed, so only the dotted half appears.
  unit(7, '𝅘𝅥.', { ...BASE, dotted: true, notes: ['half', 'quarter'], rests: ['quarter'] }, [
    { meters: ['3/4'], bars: 2, tempo: 70 }, // Dotted half notes
    { bars: 4, tempo: 80 }, // Dotted halves in four-four
    { notes: ['half', 'quarter', 'eighth'], bars: 4, tempo: 80, preview: ['dotted:quarter', 'note:eighth'] }, // Dotted quarter + eighth
    { meters: ['3/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'], bars: 4, tempo: 80, preview: ['dotted:quarter'] }, // Dotted quarters in three-four
    { meters: ['2/4', '3/4', '4/4'], notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'], ties: true, bars: 8, tempo: 90 }, // Unit review
  ]),
  // Four sixteenths first: without eighths a beat can only split into four sixteenths.
  unit(8, '𝅘𝅥𝅯', { ...BASE, notes: ['quarter', 'sixteenth'], rests: ['quarter'] }, [
    { density: 'sparse', bars: 2, tempo: 60 }, // Four sixteenths
    { notes: ['half', 'quarter', 'sixteenth'], bars: 4, tempo: 60 }, // Sixteenths and half notes
    { notes: ['quarter', 'eighth', 'sixteenth'], bars: 2, tempo: 60, preview: ['figure:eighth-sixteenths'] }, // Eighth and two sixteenths
    { notes: ['half', 'quarter', 'eighth', 'sixteenth'], rests: ['quarter', 'eighth'], bars: 4, tempo: 70 }, // Sixteenth combinations
    { meters: ['2/4', '3/4', '4/4'], notes: ['half', 'quarter', 'eighth', 'sixteenth'], rests: ['quarter', 'eighth'], bars: 8, tempo: 80 }, // Unit review
  ]),
];

/** The rhythm units, as one kind of unit of the Learning path (tracks.ts puts the path together; track.ts has its rules). */
export const RHYTHM_TRACK: Track<Lesson> = { id: 'rhythm', units: UNITS };

export const ALL_LESSONS: Array<{ unit: Unit; lesson: Lesson; index: number }> = UNITS.flatMap((unit) =>
  unit.lessons.map((lesson, index) => ({ unit, lesson, index })),
);

export function findLesson(lessonId: string): { unit: Unit; lesson: Lesson; index: number } | null {
  return ALL_LESSONS.find((x) => x.lesson.id === lessonId) ?? null;
}

/** The full Settings for a lesson: DEFAULT_SETTINGS ← unit base ← lesson preset. Unknown id → defaults. */
export function lessonSettings(lessonId: string): Settings {
  const found = findLesson(lessonId);
  const s: Settings = { ...DEFAULT_SETTINGS, ...found?.unit.base, ...found?.lesson.settings };
  // Fresh arrays: callers may edit the result without touching UNITS.
  return { ...s, meters: [...s.meters], notes: [...s.notes], rests: [...s.rests] };
}

/** Progress with a finished lesson recorded (by its progress key, track.ts), keeping the best stars and accuracy. */
export function recordLessonResult(progress: Progress, lessonId: string, stars: LessonProgress['stars'], accuracy: number): Progress {
  const prev = progress.lessons[lessonId];
  const next: LessonProgress = {
    stars: prev && prev.stars > stars ? prev.stars : stars,
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
  };
  return { ...progress, lessons: { ...progress.lessons, [lessonId]: next } };
}
