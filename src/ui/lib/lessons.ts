/** How the Learning Path looks for a given progress: unit states and the lesson tiles. Pure. */
import type { NotatedBar, Settings } from '../../core/api';
import { ALL_LESSONS, RHYTHM_TRACK, UNITS, findLesson, lessonSettings, nextLesson, type Lesson, type Unit } from '../../game/path';
import { outcomeIn, type LessonOutcome } from '../../game/track';
import type { Progress } from '../../game/storage';
import { exerciseView } from '../exerciseView';
import { makeRun, type Run } from '../store';
import { seedFromString } from './format';

export type UnitState = 'done' | 'current' | 'locked';
export type TileState = 'done' | 'current' | 'upcoming';

export const lessonStars = (p: Progress, id: string): number => p.lessons[id]?.stars ?? 0;

/** The lesson to continue: the next one without 2 stars, or the very last lesson once the path is done. */
export function continueLesson(p: Progress, units: Unit[] = UNITS): { unit: Unit; lesson: Lesson; index: number; done: boolean } | null {
  const next = nextLesson(p);
  if (next) {
    const f = findLesson(next.id);
    if (f) return { ...f, done: false };
  }
  const unit = units[units.length - 1];
  if (!unit || unit.lessons.length === 0) return null;
  const index = unit.lessons.length - 1;
  return { unit, lesson: unit.lessons[index], index, done: true };
}

/** Units before the current one are done, after it locked. With the path finished, every unit is done. */
export function unitStates(p: Progress, units: Unit[] = UNITS): UnitState[] {
  const next = nextLesson(p);
  const cur = next ? units.findIndex((u) => u.lessons.some((l) => l.id === next.id)) : units.length;
  return units.map((_, i) => (i < cur ? 'done' : i === cur ? 'current' : 'locked'));
}

/** Tile state for each lesson of a unit (the 7.1–7.5 strip). */
export function tileStates(p: Progress, unit: Unit, currentId: string | null): TileState[] {
  return unit.lessons.map((l) => (l.id === currentId ? 'current' : lessonStars(p, l.id) > 0 ? 'done' : 'upcoming'));
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

function barFeatures(bar: NotatedBar): Set<string> {
  const f = new Set<string>();
  for (const sym of bar.symbols) {
    f.add(sym.kind + ':' + sym.value);
    if (sym.dots) f.add('dotted');
    if (sym.tieToNext) f.add('ties');
    if (sym.tuplet) f.add('triplets');
  }
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

/** Seeds tried for a preview that shows the lesson's new value; generation takes a few ms each. */
const PREVIEW_TRIES = 8;

/**
 * The Home preview of a lesson: a run (same every visit) and the bar to show, chosen so it contains what the lesson
 * adds (the half rest in "Half rests"). Falls back to the first bar when no tried seed has one.
 */
const previews = new Map<string, { run: Run; bar: number } | null>();

export function lessonPreview(lessonId: string): { run: Run; bar: number } | null {
  // The same every visit, so it is made once: Home mounts again on every visit, and some lessons try 8 seeds.
  if (!previews.has(lessonId)) previews.set(lessonId, makeLessonPreview(lessonId));
  return previews.get(lessonId) ?? null;
}

function makeLessonPreview(lessonId: string): { run: Run; bar: number } | null {
  const settings = lessonSettings(lessonId);
  const wanted = newFeatures(lessonId);
  let first: { run: Run; bar: number } | null = null;
  for (let i = 0; i < (wanted.length ? PREVIEW_TRIES : 1); i++) {
    const run = makeRun(settings, seedFromString(i === 0 ? lessonId : lessonId + '#' + i), lessonId);
    const view = run && exerciseView(run.exercise);
    if (!run || !view || view.bars.length === 0) continue;
    first ??= { run, bar: 0 };
    const bar = view.bars.findIndex((b) => {
      const f = barFeatures(b);
      return wanted.some((k) => f.has(k));
    });
    if (bar >= 0) return { run, bar };
  }
  return first;
}

/** What a finished rhythm lesson means for the path, for Results (§6.4): see outcomeIn (track.ts). */
export const lessonOutcome = (after: Progress, lessonId: string, starsBefore: number): LessonOutcome<Lesson> | null =>
  outcomeIn(after, RHYTHM_TRACK, lessonId, starsBefore);
