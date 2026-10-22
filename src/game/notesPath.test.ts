import { generateRound, sanitizeNoteSettings, type NoteSettings } from '../core/noteRound';
import en from '../i18n/en.json';
import nl from '../i18n/nl.json';
import { KEYS_UNITS, NOTES_UNITS, noteLessonSettings, type NoteTrackId } from './notesPath';
import { defaultProgress, type LessonProgress, type Progress } from './storage';
import { lessonOpen, nextIn, outcomeIn, progressKey, trackLessons, trackStarsIn } from './track';
import { allStars, continueIn, trackById, trackLessonOpen, trackOpen } from './tracks';

/** A message in one catalog, without the English fallback that t() and hasMessage() use. */
const message = (catalog: object, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), catalog);

const PATHS: Array<[NoteTrackId, typeof NOTES_UNITS]> = [
  ['notes', NOTES_UNITS],
  ['keys', KEYS_UNITS],
];

function withStars(entries: Record<string, LessonProgress['stars']>): Progress {
  const p = defaultProgress();
  for (const [key, stars] of Object.entries(entries)) p.lessons[key] = { stars, bestAccuracy: 90 };
  return p;
}
/** Every lesson of a path up to and including `lastId`, at `stars`, under its progress key. */
const upTo = (track: NoteTrackId, lastId: string, stars: LessonProgress['stars'] = 2): Record<string, LessonProgress['stars']> => {
  const ids = trackLessons(trackById(track)).map((x) => x.lesson.id);
  return Object.fromEntries(ids.slice(0, ids.indexOf(lastId) + 1).map((id) => [progressKey(track, id), stars]));
};

describe('Read notes and Keys paths (MVP canvas, Learning paths)', () => {
  it('have the units of the design, five lessons each, ids "u.l" and every title in both catalogs', () => {
    expect(NOTES_UNITS.map((u) => u.id)).toEqual([1, 2, 3, 4, 5]);
    expect(KEYS_UNITS.map((u) => u.id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const [name, catalog] of [['en', en], ['nl', nl]] as const) {
      for (const [, units] of PATHS) {
        for (const u of units) {
          expect(typeof message(catalog, u.titleKey), `${name} ${u.titleKey}`).toBe('string');
          expect(u.lessons.map((l) => l.id)).toEqual([1, 2, 3, 4, 5].map((n) => `${u.id}.${n}`));
          for (const l of u.lessons) expect(typeof message(catalog, l.title), `${name} ${l.title}`).toBe('string');
        }
      }
    }
  });

  it('every lesson is a valid, playable Read notes preset', () => {
    for (const [track, units] of PATHS) {
      for (const u of units) {
        for (const l of u.lessons) {
          const s = noteLessonSettings(track, l.id) as NoteSettings;
          expect(s, `${track} ${l.id}`).not.toBeNull();
          // Nothing the sanitizer would repair: the preset is exactly what a player could set up.
          expect(sanitizeNoteSettings(s)).toEqual(s);
          const notes = generateRound(s, 7);
          expect(notes).toHaveLength(s.count);
          expect(new Set(notes.map((n) => n.clef))).toEqual(new Set(s.clefs));
        }
      }
    }
  });

  it('follows chapter 8 in Read notes: one clef, then both, then ledger lines, then the clock', () => {
    const s = (id: string): NoteSettings => noteLessonSettings('notes', id)!;
    expect(s('1.1')).toMatchObject({ clefs: ['treble'], keys: ['C'], range: 'staff', extras: 'none', timer: 0, input: 'names' });
    expect(s('2.1').clefs).toEqual(['bass']);
    expect(s('3.1').clefs).toEqual(['treble', 'bass']);
    expect(s('4.4').range).toBe('ledger2');
    expect(s('5.1').timer).toBe(3);
    // Nothing before unit 4 leaves the staff, nothing in Read notes uses a key signature.
    for (const u of NOTES_UNITS.slice(0, 3)) for (const l of u.lessons) expect(s(l.id).range).toBe('staff');
    for (const u of NOTES_UNITS) for (const l of u.lessons) expect(s(l.id).keys).toEqual(['C']);
  });

  it('adds key signatures one at a time in Keys: G before F, then two and three signs, then mixed', () => {
    const s = (id: string): NoteSettings => noteLessonSettings('keys', id)!;
    expect(s('1.1')).toMatchObject({ keys: ['C'], extras: 'sharps', input: 'piano' });
    expect(s('2.1').keys).toEqual(['G']);
    expect(s('3.1').keys).toEqual(['F']);
    expect(s('4.1').keys).toEqual(['D']);
    expect(s('5.2').keys).toEqual(['Eb']);
    expect(s('6.1')).toMatchObject({ keys: ['C', 'G', 'F'], mixKeys: true });
  });

  it('returns fresh arrays, and null for a lesson that does not exist', () => {
    const a = noteLessonSettings('notes', '3.1')!;
    a.clefs.push('bass');
    expect(noteLessonSettings('notes', '3.1')!.clefs).toEqual(['treble', 'bass']);
    expect(noteLessonSettings('notes', '9.9')).toBeNull();
  });
});

describe('opening lessons and paths', () => {
  const notes = trackById('notes');

  it('keeps each path’s stars apart: Read notes 1.1 is "notes:1.1", rhythm 1.1 stays "1.1"', () => {
    expect(progressKey('rhythm', '1.1')).toBe('1.1');
    expect(progressKey('notes', '1.1')).toBe('notes:1.1');
    const rhythmOnly = withStars({ '1.1': 3, '1.2': 3 });
    expect(lessonOpen(rhythmOnly, notes, '1.2')).toBe(false);
    expect(lessonOpen(withStars({ 'notes:1.1': 2 }), notes, '1.2')).toBe(true);
  });

  it('opens Read notes from the start and Keys after every Read notes unit 3 lesson has two stars', () => {
    const p = defaultProgress();
    expect(trackOpen(p, 'rhythm')).toBe(true);
    expect(trackOpen(p, 'notes')).toBe(true);
    expect(trackOpen(p, 'keys')).toBe(false);
    expect(trackLessonOpen(p, 'keys', '1.1')).toBe(false);
    expect(continueIn(p, 'keys')).toBeNull();
    expect(trackOpen(withStars(upTo('notes', '3.4')), 'keys')).toBe(false);
    const open = withStars(upTo('notes', '3.5'));
    expect(trackOpen(open, 'keys')).toBe(true);
    expect(trackLessonOpen(open, 'keys', '1.1')).toBe(true);
    expect(continueIn(open, 'keys')?.id).toBe('1.1');
  });

  it('continues each path with its first lesson under two stars, and counts stars per path and over all', () => {
    const p = withStars({ ...upTo('notes', '2.2', 3), 'notes:2.3': 1, '1.1': 2 });
    expect(nextIn(p, notes)?.id).toBe('2.3');
    expect(trackStarsIn(p, notes)).toEqual({ earned: 7 * 3 + 1, max: 25 * 3 });
    expect(allStars(p)).toEqual({ earned: 22 + 2, max: (40 + 25 + 30) * 3 });
  });

  it('says what a Read notes lesson opened, as Results does for rhythm', () => {
    expect(outcomeIn(withStars({ 'notes:1.1': 2 }), notes, '1.1', 0)).toMatchObject({ kind: 'unlocked', continueId: '1.2' });
    expect(outcomeIn(withStars({ 'notes:1.1': 1 }), notes, '1.1', 0)).toMatchObject({ kind: 'needStars', next: { id: '1.2' } });
    expect(outcomeIn(withStars(upTo('notes', '5.5')), notes, '5.5', 1)).toMatchObject({ kind: 'pathDone' });
  });
});
