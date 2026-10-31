import { hasMessage } from '../i18n';
import { FIRST_NOTES, KEYS_UNITS, NOTES_UNITS, PITCH_UNITS } from './notesPath';
import { UNITS } from './path';
import { defaultProgress, type LessonProgress, type Progress } from './storage';
import { lessonOpen, progressKey, trackLessons } from './track';
import {
  allStars,
  findPathLesson,
  LEARNING_PATH,
  PATH_UNITS,
  pathLessonOf,
  pathLessonOpen,
  pathNext,
  pathOutcome,
  pathUnitOf,
} from './tracks';

function withStars(entries: Record<string, LessonProgress['stars']>): Progress {
  const p = defaultProgress();
  for (const [key, stars] of Object.entries(entries)) p.lessons[key] = { stars, bestAccuracy: 90 };
  return p;
}
const all = trackLessons(LEARNING_PATH).map((x) => x.lesson);
/** Every path lesson up to and including `lastId` (its number in the path), at `stars`, under its progress key. */
const upTo = (lastId: string, stars: LessonProgress['stars'] = 2): Record<string, LessonProgress['stars']> =>
  Object.fromEntries(all.slice(0, all.findIndex((l) => l.id === lastId) + 1).map((l) => [l.key, stars]));

describe('the Learning path (DESIGN.md §8.2)', () => {
  it('starts with sol, then takes turns: a new note, a rhythm unit', () => {
    const kinds = PATH_UNITS.map((u) => `${u.track} ${u.ref}`);
    expect(kinds.slice(0, 14)).toEqual([
      'pitch 1', 'rhythm 1', 'pitch 2', 'rhythm 2', 'pitch 3', 'rhythm 3', 'pitch 4',
      'rhythm 4', 'pitch 5', 'rhythm 5', 'pitch 6', 'rhythm 6', 'pitch 7', 'rhythm 7',
    ]);
    // The new notes in the order of the plan: sol mi fa la do re si.
    expect(PATH_UNITS.filter((u) => u.track === 'pitch').map((u) => u.glyph)).toEqual(FIRST_NOTES.map((n) => n.name));
  });

  it('holds every unit once, numbered 1, 2, 3, …, with lessons "u.l"', () => {
    expect(PATH_UNITS.map((u) => u.id)).toEqual(PATH_UNITS.map((_, i) => i + 1));
    expect(PATH_UNITS).toHaveLength(PITCH_UNITS.length + UNITS.length + NOTES_UNITS.length + KEYS_UNITS.length);
    expect(new Set(PATH_UNITS.map((u) => `${u.track} ${u.ref}`)).size).toBe(PATH_UNITS.length);
    for (const u of PATH_UNITS) u.lessons.forEach((l, i) => expect(l.id).toBe(`${u.id}.${i + 1}`));
    // Keys comes last, as it did after Read notes.
    expect(PATH_UNITS[PATH_UNITS.length - 1]).toMatchObject({ track: 'keys', ref: 6 });
  });

  // A word on a unit's node comes from the catalog, so it follows the player's language (DESIGN.md §11): only music
  // glyphs, figures with signs ("3/4", "1♯", "3 s") and the first notes' solfège names are written as they are.
  it('draws no word on a unit\'s node that is not a message', () => {
    const names = FIRST_NOTES.map((n) => n.name);
    const words = PATH_UNITS.filter((u) => /[A-Za-z]{2}/.test(u.glyph) && !names.includes(u.glyph) && !hasMessage(u.glyph));
    expect(words.map((u) => `${u.id} ${u.glyph}`)).toEqual([]);
    expect(PATH_UNITS[PATH_UNITS.length - 1].glyph).toBe('path.keys.u6.glyph');
  });

  it('keeps every lesson\'s result where it was: rhythm "1.1", others with their kind in front', () => {
    expect(pathLessonOf('pitch', '1.1')).toMatchObject({ id: '1.1', key: 'pitch:1.1' });
    expect(pathLessonOf('rhythm', '1.1')).toMatchObject({ id: '2.1', key: '1.1' });
    expect(pathLessonOf('rhythm', '8.5')?.id).toBe('16.5');
    expect(pathLessonOf('notes', '2.3')).toMatchObject({ id: '17.3', key: progressKey('notes', '2.3') });
    expect(pathLessonOf('rhythm', '9.9')).toBeNull();
    expect(findPathLesson('4.2')?.lesson).toMatchObject({ track: 'rhythm', ref: '2.2' });
    expect(pathUnitOf('rhythm', 3)).toBe(6);
  });

  it('opens sol first, then one lesson at a time across both kinds', () => {
    const p = defaultProgress();
    expect(pathNext(p)?.id).toBe('1.1');
    expect(pathLessonOpen(p, 'pitch', '1.1')).toBe(true);
    expect(pathLessonOpen(p, 'rhythm', '1.1')).toBe(false);
    const solDone = withStars(upTo('1.5'));
    expect(pathLessonOpen(solDone, 'rhythm', '1.1')).toBe(true);
    expect(pathLessonOpen(solDone, 'pitch', '2.1')).toBe(false);
    expect(pathNext(solDone)).toMatchObject({ id: '2.1', track: 'rhythm', ref: '1.1' });
  });

  it('keeps lessons played before the paths became one open', () => {
    const p = withStars({ '3.2': 2, 'notes:1.1': 3 });
    expect(pathLessonOpen(p, 'rhythm', '3.2')).toBe(true);
    expect(pathLessonOpen(p, 'notes', '1.1')).toBe(true);
    // The path still goes on from its first lesson without two stars.
    expect(pathNext(p)?.id).toBe('1.1');
    expect(lessonOpen(p, LEARNING_PATH, '6.4')).toBe(false);
  });

  it('says what a lesson opened, also when the next one is of the other kind', () => {
    expect(pathOutcome(withStars(upTo('1.5')), 'pitch', '1.5', 1)).toMatchObject({ kind: 'unlocked', continueId: '2.1', next: { track: 'rhythm' } });
    expect(pathOutcome(withStars({ ...upTo('2.4'), '1.5': 2 }), 'rhythm', '1.5', 0)).toMatchObject({ kind: 'unlocked', continueId: '3.1', next: { track: 'pitch' } });
    expect(pathOutcome(withStars({ 'pitch:1.1': 1 }), 'pitch', '1.1', 0)).toMatchObject({ kind: 'needStars', continueId: null });
    const last = all[all.length - 1];
    expect(pathOutcome(withStars(upTo(last.id)), 'keys', '6.5', 1)).toMatchObject({ kind: 'pathDone' });
  });

  it('counts the stars of the whole path', () => {
    expect(allStars(withStars({ 'pitch:1.1': 3, '1.1': 2, 'keys:1.1': 4 }))).toEqual({ earned: 8, max: all.length * 3 });
  });
});
