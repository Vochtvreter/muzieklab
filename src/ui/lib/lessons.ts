/** How the Learning Path looks for a given progress: unit states and the lesson tiles. Pure. */
import { UNITS, findLesson, nextLesson, type Lesson, type Unit } from '../../game/path';
import type { Progress } from '../../game/storage';

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
