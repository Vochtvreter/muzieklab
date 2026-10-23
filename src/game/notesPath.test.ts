import { generateRound, sanitizeNoteSettings, type NoteSettings } from '../core/noteRound';
import en from '../i18n/en.json';
import nl from '../i18n/nl.json';
import { FIRST_NOTES, KEYS_UNITS, NOTES_UNITS, PITCH_UNITS, noteLessonSettings, type NoteTrackId } from './notesPath';

/** A message in one catalog, without the English fallback that t() and hasMessage() use. */
const message = (catalog: object, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), catalog);

const PATHS: Array<[NoteTrackId, typeof NOTES_UNITS]> = [
  ['pitch', PITCH_UNITS],
  ['notes', NOTES_UNITS],
  ['keys', KEYS_UNITS],
];

describe('First notes, Read notes and Keys units (DESIGN.md §8.2)', () => {
  it('have their units, five lessons each, ids "u.l" and every title in both catalogs', () => {
    expect(PITCH_UNITS.map((u) => u.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
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

  it('brings in sol, mi, fa, la, do, re, si one at a time, on the treble staff', () => {
    expect(FIRST_NOTES.map((n) => n.name)).toEqual(['sol', 'mi', 'fa', 'la', 'do', 're', 'si']);
    // G4 E4 F4 A4 C5 D5 B4: all inside the staff.
    expect(FIRST_NOTES.map((n) => n.step)).toEqual([32, 30, 31, 33, 35, 36, 34]);
    PITCH_UNITS.forEach((u, i) => {
      const known = FIRST_NOTES.slice(0, i + 1).map((n) => n.step);
      expect(u.glyph).toBe(FIRST_NOTES[i].name);
      for (const l of u.lessons) {
        const s = noteLessonSettings('pitch', l.id)!;
        expect(s, l.id).toMatchObject({ clefs: ['treble'], keys: ['C'], range: 'staff', extras: 'none' });
        expect([...s.only].sort(), l.id).toEqual([...known].sort());
        for (const n of generateRound(s, 3)) expect(known, l.id).toContain(n.step);
      }
    });
  });

  it('reads, writes and hears every new note, and reviews all three (sol: read and write)', () => {
    const tasks = (id: string): string[] => noteLessonSettings('pitch', id)!.tasks;
    expect(PITCH_UNITS[0].lessons.map((l) => tasks(l.id))).toEqual([['read'], ['write'], ['read'], ['write'], ['read', 'write']]);
    for (const u of PITCH_UNITS.slice(1)) {
      expect(u.lessons.map((l) => tasks(l.id)), `unit ${u.id}`).toEqual([['read'], ['write'], ['hear'], ['read'], ['read', 'write', 'hear']]);
      // The new note comes up more often, except in the review.
      const step = FIRST_NOTES[u.id - 1].step;
      for (const l of u.lessons.slice(0, 4)) expect(noteLessonSettings('pitch', l.id)!.stress).toEqual([step]);
      expect(noteLessonSettings('pitch', u.lessons[4].id)!.stress).toEqual([]);
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

