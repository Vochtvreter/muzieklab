import { generateRound, sanitizeNoteSettings, type NoteSettings, type RoundNote } from '../core/noteRound';
import { keyAlter, keySigns, letterOf } from '../core/pitch';
import en from '../i18n/en.json';
import nl from '../i18n/nl.json';
import { FIRST_NOTES, KEYS_UNITS, NOTES_UNITS, PITCH_UNITS, noteLessonSeed, noteLessonSettings, type NoteTrackId } from './notesPath';

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
      // The new note comes up more often, except in the review and in mi's hearing lesson (below).
      const step = FIRST_NOTES[u.id - 1].step;
      u.lessons.slice(0, 4).forEach((l, i) => expect(noteLessonSettings('pitch', l.id)!.stress, l.id).toEqual(u.id === 2 && i === 2 ? [] : [step]));
      expect(noteLessonSettings('pitch', u.lessons[4].id)!.stress).toEqual([]);
    }
  });

  it('cannot be passed without listening in Hear mi, where only sol and mi come', () => {
    // A note comes at most twice in a row, so after a pair the other one is certain. With mi stressed, answering mi
    // unless it just came twice scored 82 % on average and opened the next lesson in almost half the rounds.
    const s = noteLessonSettings('pitch', '2.3')!;
    expect(s.tasks).toEqual(['hear']);
    const other = (x: number): number => (x === 30 ? 32 : 30);
    const pair = (h: number[]): boolean => h.length >= 2 && h[h.length - 1] === h[h.length - 2];
    // What a player who never listens can do: the feedback names every note, so the order so far is known.
    const blind: Record<string, (h: number[]) => number> = {
      mi: (h) => (pair(h) ? other(h[h.length - 1]) : 30),
      sol: (h) => (pair(h) ? other(h[h.length - 1]) : 32),
      turns: (h) => (h.length ? other(h[h.length - 1]) : 30),
      again: (h) => (pair(h) ? other(h[h.length - 1]) : h.length ? h[h.length - 1] : 30),
    };
    const seeds = 2000;
    for (const [name, guess] of Object.entries(blind)) {
      let sum = 0;
      let opened = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const steps = generateRound(s, seed).map((n) => n.step);
        const accuracy = steps.filter((x, i) => guess(steps.slice(0, i)) === x).length / steps.length;
        sum += accuracy;
        // Two stars (85 %) open the next lesson.
        if (accuracy >= 0.85) opened++;
      }
      expect(sum / seeds, name).toBeLessThan(0.7);
      expect(opened / seeds, name).toBeLessThan(0.2);
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

  it('asks for the sign a Keys lesson teaches in every round: B♭ in F major, F♯ in G major, a flat in Flats too', () => {
    // Judged from the notes themselves: a note the key signature changes, and a sign next to a note that raises or
    // lowers it. The treble staff has one B in its 11 places, and a third of 23.1's rounds had no B♭.
    const raised = (n: RoundNote): boolean => n.sign !== null && n.alter > keyAlter(n.key, letterOf(n.step));
    const lowered = (n: RoundNote): boolean => n.sign !== null && n.alter < keyAlter(n.key, letterOf(n.step));
    const wanted = (s: NoteSettings, notes: RoundNote[]): string[] => [
      ...[...new Set(notes.map((n) => n.key))]
        .filter((k) => keySigns(k).length > 0 && !notes.some((n) => n.key === k && n.sign === null && n.alter !== 0))
        .map((k) => 'a note of ' + k + ' with its key signature'),
      ...(s.extras !== 'none' && !notes.some(raised) ? ['a raising sign'] : []),
      ...(s.extras === 'both' && !notes.some(lowered) ? ['a lowering sign'] : []),
    ];
    for (const u of KEYS_UNITS) {
      for (const l of u.lessons) {
        const s = noteLessonSettings('keys', l.id)!;
        for (let seed = 1; seed <= 200; seed++) {
          const notes = generateRound(s, noteLessonSeed(s, seed));
          expect(wanted(s, notes), `${l.id} seed ${seed}`).toEqual([]);
        }
      }
    }
    const f = noteLessonSettings('keys', '3.1')!;
    expect(generateRound(f, noteLessonSeed(f, 5)).some((n) => letterOf(n.step) === 'B' && n.alter === -1)).toBe(true);
    // Weak spots elsewhere make the B rarer still; the round is the one these weak spots draw from the seed kept.
    const weak = { 'treble:30': 5, 'treble:31': 5, 'treble:32': 5, 'treble:33': 5, 'treble:35': 5, 'treble:36': 5 };
    for (let seed = 1; seed <= 100; seed++) expect(wanted(f, generateRound(f, noteLessonSeed(f, seed, weak), weak)), `seed ${seed}`).toEqual([]);
  });

  it('keeps the seed of a round that already shows it, and only tries others for a lesson about a sign', () => {
    const first = noteLessonSettings('pitch', '1.1')!;
    for (let seed = 1; seed <= 50; seed++) expect(noteLessonSeed(first, seed)).toBe(seed);
    const f = noteLessonSettings('keys', '3.1')!;
    const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
    expect(seeds.filter((seed) => noteLessonSeed(f, seed) === seed).length).toBeGreaterThan(20);
    expect(seeds.filter((seed) => noteLessonSeed(f, seed) !== seed).length).toBeGreaterThan(5);
  });

  it('returns fresh arrays, and null for a lesson that does not exist', () => {
    const a = noteLessonSettings('notes', '3.1')!;
    a.clefs.push('bass');
    expect(noteLessonSettings('notes', '3.1')!.clefs).toEqual(['treble', 'bass']);
    expect(noteLessonSettings('notes', '9.9')).toBeNull();
  });
});

