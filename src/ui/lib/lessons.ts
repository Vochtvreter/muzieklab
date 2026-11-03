/** How the Learning path looks for a given progress: unit states, the lesson tiles and Home's previews. Pure. */
import { generateRound, staffPage, type Clef, type KeyId, type NotatedBar, type RoundNote, type Settings } from '../../core/api';
import { barFigures, introId, lessonIntros } from '../../game/intro';
import { noteLessonMisses, noteLessonSettings } from '../../game/notesPath';
import { ALL_LESSONS, findLesson, lessonSettings } from '../../game/path';
import { starsOf, unitStatesIn, type LessonOutcome } from '../../game/track';
import { findPathLesson, LEARNING_PATH, PATH_UNITS, pathNext, pathOutcome, type PathLesson, type PathUnit } from '../../game/tracks';
import type { Progress } from '../../game/storage';
import { exerciseView } from '../exerciseView';
import { makeLessonRun, type Run } from '../store';
import { seedFromString } from './format';

export type UnitState = 'done' | 'current' | 'locked';
export type TileState = 'done' | 'current' | 'upcoming';

/** The best stars on a lesson of the Learning path. */
export const lessonStars = (p: Progress, lesson: PathLesson): number => starsOf(p, LEARNING_PATH, lesson);

/** The lesson to continue: the next one without 2 stars, or the very last lesson once the path is done. */
export function continueLesson(p: Progress): { unit: PathUnit; lesson: PathLesson; index: number; done: boolean } | null {
  const next = pathNext(p);
  const f = next ? findPathLesson(next.id) : null;
  if (f) return { unit: f.unit as PathUnit, lesson: f.lesson, index: f.index, done: false };
  const unit = PATH_UNITS[PATH_UNITS.length - 1];
  if (!unit || unit.lessons.length === 0) return null;
  const index = unit.lessons.length - 1;
  return { unit, lesson: unit.lessons[index], index, done: true };
}

/** Units before the current one are done, after it locked. With the path finished, every unit is done. */
export const unitStates = (p: Progress): UnitState[] => unitStatesIn(p, LEARNING_PATH);

/** Tile state for each lesson of a unit (the 7.1–7.5 strip). */
export function tileStates(p: Progress, unit: PathUnit, currentId: string | null): TileState[] {
  return unit.lessons.map((l) => (l.id === currentId ? 'current' : lessonStars(p, l) > 0 ? 'done' : 'upcoming'));
}

/** Lesson number inside its unit, from the "u.l" id. */
export const lessonNumber = (id: string): number => Number(id.split('.')[1] ?? 0);

/** What a lesson can contain, as feature keys: 'note:half', 'rest:quarter', 'dotted', 'ties', 'triplets'. */
function settingFeatures(s: Settings): Set<string> {
  const f = new Set<string>([...s.notes.map((v) => 'note:' + v), ...s.rests.map((v) => 'rest:' + v)]);
  if (s.dotted) f.add('dotted');
  if (s.ties) f.add('ties');
  if (s.triplets) f.add('triplets');
  return f;
}

/**
 * What a bar shows, as feature keys: 'rest:half', 'dotted', 'dotted:quarter', 'ties', 'triplets',
 * 'figure:eighth-sixteenths'.
 */
export function barFeatures(bar: NotatedBar): Set<string> {
  const f = new Set<string>();
  for (const sym of bar.symbols) {
    f.add(sym.kind + ':' + sym.value);
    // 'dotted:quarter' too: a lesson can be about one dotted value (path.ts, `preview`).
    if (sym.dots) f.add('dotted').add('dotted:' + sym.value);
    if (sym.tieToNext) f.add('ties');
    if (sym.tuplet) f.add('triplets');
  }
  // And its figures (game/intro.ts), which a lesson can be about too: 8.3's eighth and two sixteenths in one beat.
  for (const id of barFigures(bar)) f.add(id);
  return f;
}

/** What a lesson adds over the lesson before it in the path ("Half rests" adds 'rest:half'). */
export function newFeatures(lessonId: string): string[] {
  const pos = ALL_LESSONS.findIndex((x) => x.lesson.id === lessonId);
  if (pos < 0) return [];
  const now = settingFeatures(lessonSettings(lessonId));
  const before = pos > 0 ? settingFeatures(lessonSettings(ALL_LESSONS[pos - 1].lesson.id)) : new Set<string>();
  return [...now].filter((k) => !before.has(k));
}

/**
 * What the Home preview's bar shows: the lesson's `preview` (path.ts) where its title names more than its symbols do,
 * or other ones, else the symbols it is the first in the path to use (game/intro.ts: the whole rest of "Whole rests",
 * whose half rest is new over the lesson before too), else what it adds over the lesson before; with the dot, the tie
 * or the triplet whenever the lesson has them, as their units are about them ("Dotted halves in four-four" adds no
 * symbol).
 */
export function previewFeatures(lessonId: string): string[] {
  const found = findLesson(lessonId);
  if (!found) return [];
  if (found.lesson.preview) return found.lesson.preview;
  const intros = lessonIntros(lessonId).map(introId).filter((id) => !id.startsWith('meter:'));
  const s = lessonSettings(lessonId);
  const flags = (['dotted', 'ties', 'triplets'] as const).filter((k) => s[k]);
  return [...new Set([...(intros.length ? intros : newFeatures(lessonId)), ...flags])];
}

/** Seeds tried for a preview that shows all of what the lesson is about; generation takes a few ms each. */
const PREVIEW_TRIES = 8;

/**
 * The Home preview of a lesson: a run (same every visit) and the bar to show, chosen so it contains what the lesson is
 * about (the half rest in "Half rests"): the first bar with all of it, else the one with the most over the seeds tried.
 */
const previews = new Map<string, { run: Run; bar: number } | null>();

export function lessonPreview(lessonId: string): { run: Run; bar: number } | null {
  // The same every visit, so it is made once: Home mounts again on every visit, and some lessons try 8 seeds.
  if (!previews.has(lessonId)) previews.set(lessonId, makeLessonPreview(lessonId));
  return previews.get(lessonId) ?? null;
}

function makeLessonPreview(lessonId: string): { run: Run; bar: number } | null {
  const settings = lessonSettings(lessonId);
  const wanted = previewFeatures(lessonId);
  let best: { run: Run; bar: number; has: number } | null = null;
  for (let i = 0; i < PREVIEW_TRIES && best?.has !== wanted.length; i++) {
    // As a lesson starts it, so the exercise has what the lesson introduces: 3.4's whole rest is in 1 exercise in 22.
    const run = makeLessonRun(settings, seedFromString(i === 0 ? lessonId : lessonId + '#' + i), lessonId);
    const view = run && exerciseView(run.exercise);
    if (!run || !view) continue;
    for (const [bar, b] of view.bars.entries()) {
      const f = barFeatures(b);
      const has = wanted.filter((k) => f.has(k)).length;
      if (!best || has > best.has) best = { run, bar, has };
    }
  }
  return best && { run: best.run, bar: best.bar };
}

/** Seeds tried for a note lesson's preview that shows its sign: 21.2's first four notes have a sharp and a flat in 1 round in 7. */
const NOTE_PREVIEW_TRIES = 60;
/** The fewest notes a preview shows (a phone's), which pick its round. */
const NOTE_PREVIEW_MIN = 4;

/**
 * The Home preview of a Read notes or Keys lesson: the first notes of a round (the same every visit), up to `count`,
 * on the staff they are read on. Only the round's first clef and key, as Play draws a new staff for a new one (18.2
 * starts in bass clef, 26.3 in E♭ major). The round is the first of a few fixed seeds whose first four notes show what
 * the lesson is about (noteLessonMisses: the B♭ of B flat in the key), so a phone and a wider screen start alike.
 * Null for other lessons.
 */
export function noteLessonPreview(lesson: PathLesson, count: number): { clef: Clef; key: KeyId; notes: RoundNote[] } | null {
  if (lesson.track !== 'notes' && lesson.track !== 'keys') return null;
  const settings = noteLessonSettings(lesson.track, lesson.ref);
  if (!settings) return null;
  let best: { round: RoundNote[]; misses: number } | null = null;
  for (let i = 0; i < NOTE_PREVIEW_TRIES && best?.misses !== 0; i++) {
    const round = generateRound(settings, seedFromString(i === 0 ? lesson.key : lesson.key + '#' + i));
    const misses = noteLessonMisses(settings, round.slice(0, staffPage(round, 0, NOTE_PREVIEW_MIN).to));
    if (!best || misses < best.misses) best = { round, misses };
  }
  const round = best!.round;
  return { clef: round[0].clef, key: round[0].key, notes: round.slice(0, staffPage(round, 0, count).to) };
}

/** What a finished rhythm lesson (by its rhythm id) means for the Learning path, for Results (§6.4): see outcomeIn (track.ts). */
export const lessonOutcome = (after: Progress, lessonId: string, starsBefore: number): LessonOutcome<PathLesson> | null =>
  pathOutcome(after, 'rhythm', lessonId, starsBefore);
