/**
 * The note units of the Learning path (DESIGN.md §8.2; tracks.ts puts them in path order). Every lesson is a Read notes
 * preset on top of its unit's base, as rhythm lessons are rhythm presets (path.ts).
 * - First notes ('pitch') brings in the notes of the treble staff one at a time, sol, mi, fa, la, do, re, si, and each
 *   unit reads, writes and hears them.
 * - Read notes ('notes') follows Learn chapter 8: the whole treble staff, the bass clef, both, ledger lines, speed.
 * - Keys ('keys') follows chapters 9 and 10: signs next to notes, then one key signature at a time (G, then F), then
 *   two and three signs, then mixed keys.
 * Titles are message keys: path.{track}.u{unit}.title and path.{track}.u{unit}.l{lesson}.
 */
import { DEFAULT_NOTE_SETTINGS, generateRound, roundExtras, roundHasSigns, type NoteSettings, type RoundNote, type WeakSpots } from '../core/noteRound';
import { KEYS, keyAlter, letterOf, type Step } from '../core/pitch';
import { Rng } from '../core/rng';
import type { Track, TrackLesson, TrackUnit } from './track';

export interface NoteLesson extends TrackLesson {
  settings: Partial<NoteSettings>;
}

export interface NoteUnit extends TrackUnit<NoteLesson> {
  base: Partial<NoteSettings>;
}

export type NoteTrackId = 'pitch' | 'notes' | 'keys';

function unit(track: NoteTrackId, id: number, glyph: string, base: Partial<NoteSettings>, lessons: Partial<NoteSettings>[]): NoteUnit {
  return {
    id,
    titleKey: `path.${track}.u${id}.title`,
    glyph,
    base,
    lessons: lessons.map((settings, i) => ({ id: `${id}.${i + 1}`, title: `path.${track}.u${id}.l${i + 1}`, settings })),
  };
}

/**
 * First notes, in the order they are learned: sol, the note the treble (G) clef curls around, then mi and fa below it,
 * then la, do, re and si above. All seven sit on the staff (E4–D5): no ledger lines, no key signature.
 */
export const FIRST_NOTES: { name: string; step: Step }[] = [
  { name: 'sol', step: 32 },
  { name: 'mi', step: 30 },
  { name: 'fa', step: 31 },
  { name: 'la', step: 33 },
  { name: 'do', step: 35 },
  { name: 're', step: 36 },
  { name: 'si', step: 34 },
];

const PITCH_BASE: Partial<NoteSettings> = {
  clefs: ['treble'], keys: ['C'], mixKeys: false, input: 'names', range: 'staff', extras: 'none', count: 10, timer: 0, tasks: ['read'], stress: [],
};

/**
 * A First notes unit: the notes learned so far, the new one coming up more often. Read it, write it, hear it (after
 * sol), find it on the piano, then a review that takes turns at all three. Sol alone cannot be heard against itself, so
 * unit 1 writes it against the clock instead, and its review reads and writes. Of two notes (mi's unit) the hearing
 * lesson does not stress mi: there it would be the answer three times in four, which a player could give without
 * listening (with a note at most twice in a row, the note after a pair is the other one).
 */
function pitchUnit(n: number): NoteUnit {
  const known = FIRST_NOTES.slice(0, n).map((x) => x.step);
  const step = FIRST_NOTES[n - 1].step;
  const lessons: Partial<NoteSettings>[] =
    n === 1
      ? [
          {}, // Meet sol
          { tasks: ['write'] }, // Write sol
          { input: 'piano' }, // Sol on the piano
          { tasks: ['write'], timer: 5 }, // Write sol, quickly
          { tasks: ['read', 'write'], count: 20 }, // Unit review
        ]
      : [
          { stress: [step] }, // Meet the new note
          { tasks: ['write'], stress: [step] }, // Write it
          { tasks: ['hear'], stress: n === 2 ? [] : [step] }, // Hear it
          { input: 'piano', stress: [step], count: 15 }, // On the piano
          { tasks: ['read', 'write', 'hear'], count: 30 }, // Unit review
        ];
  return unit('pitch', n, FIRST_NOTES[n - 1].name, { ...PITCH_BASE, only: known }, lessons);
}

export const PITCH_UNITS: NoteUnit[] = FIRST_NOTES.map((_, i) => pitchUnit(i + 1));

/** Every Read notes lesson spells out each setting, so nothing from the player's own setup leaks in. */
const NOTES_BASE: Partial<NoteSettings> = { keys: ['C'], mixKeys: false, input: 'names', range: 'staff', extras: 'none', count: 10, timer: 0, tasks: ['read'], only: [], stress: [] };
const BOTH: NoteSettings['clefs'] = ['treble', 'bass'];

export const NOTES_UNITS: NoteUnit[] = [
  unit('notes', 1, '𝄞', { ...NOTES_BASE, clefs: ['treble'] }, [
    {}, // Name the notes
    { count: 20 }, // Twenty notes
    { input: 'piano' }, // On the piano
    { count: 20, timer: 5 }, // Against the clock
    { count: 30, input: 'mixed', timer: 5 }, // Unit review
  ]),
  unit('notes', 2, '𝄢', { ...NOTES_BASE, clefs: ['bass'] }, [
    {}, // Name the notes
    { count: 20 }, // Twenty notes
    { input: 'piano' }, // On the piano
    { count: 20, timer: 5 }, // Against the clock
    { count: 30, input: 'mixed', timer: 5 }, // Unit review
  ]),
  unit('notes', 3, '𝄞𝄢', { ...NOTES_BASE, clefs: BOTH }, [
    {}, // Switching clefs
    { count: 20 }, // Twenty notes
    { input: 'piano', count: 20 }, // On the piano
    { count: 20, timer: 5 }, // Against the clock
    { count: 30, input: 'mixed', timer: 5 }, // Unit review
  ]),
  unit('notes', 4, '𝅝', { ...NOTES_BASE, clefs: BOTH, range: 'ledger1', count: 20 }, [
    { clefs: ['treble'] }, // One ledger line, treble
    { clefs: ['bass'] }, // One ledger line, bass
    {}, // Both clefs, one ledger line
    { range: 'ledger2' }, // Two ledger lines
    { range: 'ledger2', count: 30, input: 'mixed' }, // Unit review
  ]),
  unit('notes', 5, '3 s', { ...NOTES_BASE, clefs: BOTH, count: 20, timer: 3 }, [
    { clefs: ['treble'] }, // Three seconds, treble
    { clefs: ['bass'] }, // Three seconds, bass
    { range: 'ledger1', input: 'mixed', timer: 5 }, // Names and piano mixed
    { range: 'ledger2' }, // Ledger lines, quick
    { range: 'ledger2', input: 'mixed', count: 30 }, // Unit review
  ]),
];

/** Keys lessons read in treble clef unless they say otherwise; the key signature is the point. */
const KEYS_BASE: Partial<NoteSettings> = { clefs: ['treble'], mixKeys: false, input: 'names', range: 'staff', extras: 'none', count: 20, timer: 0, tasks: ['read'], only: [], stress: [] };

export const KEYS_UNITS: NoteUnit[] = [
  // Signs next to the notes first (chapter 9), in C: the piano shows what a sharp and a flat are.
  unit('keys', 1, '♯♭', { ...KEYS_BASE, keys: ['C'], extras: 'both', count: 10 }, [
    { extras: 'sharps', input: 'piano' }, // Black keys on the piano
    { input: 'piano' }, // Flats too
    {}, // Name them
    { clefs: BOTH, count: 20 }, // Both clefs
    { clefs: BOTH, input: 'mixed', count: 20 }, // Unit review
  ]),
  unit('keys', 2, '1♯', { ...KEYS_BASE, keys: ['G'] }, [
    { count: 10 }, // F sharp in the key
    { clefs: ['bass'] }, // Bass clef
    { clefs: BOTH, input: 'piano' }, // On the piano
    { clefs: BOTH, timer: 5 }, // Against the clock
    { clefs: BOTH, input: 'mixed', count: 30 }, // Unit review
  ]),
  unit('keys', 3, '1♭', { ...KEYS_BASE, keys: ['F'] }, [
    { count: 10 }, // B flat in the key
    { clefs: ['bass'] }, // Bass clef
    { clefs: BOTH, input: 'piano' }, // On the piano
    { clefs: BOTH, timer: 5 }, // Against the clock
    { clefs: BOTH, input: 'mixed', count: 30 }, // Unit review
  ]),
  unit('keys', 4, '3♯', { ...KEYS_BASE, keys: ['D', 'A'], mixKeys: true }, [
    { keys: ['D'], mixKeys: false }, // D major
    { keys: ['A'], mixKeys: false }, // A major
    { clefs: BOTH }, // Both clefs
    { clefs: BOTH, input: 'piano' }, // On the piano
    { keys: ['G', 'D', 'A'], clefs: BOTH, input: 'mixed', count: 30 }, // Unit review
  ]),
  unit('keys', 5, '3♭', { ...KEYS_BASE, keys: ['Bb', 'Eb'], mixKeys: true }, [
    { keys: ['Bb'], mixKeys: false }, // B flat major
    { keys: ['Eb'], mixKeys: false }, // E flat major
    { clefs: BOTH }, // Both clefs
    { clefs: BOTH, input: 'piano' }, // On the piano
    { keys: ['F', 'Bb', 'Eb'], clefs: BOTH, input: 'mixed', count: 30 }, // Unit review
  ]),
  unit('keys', 6, 'path.keys.u6.glyph', { ...KEYS_BASE, clefs: BOTH, mixKeys: true }, [
    { keys: ['C', 'G', 'F'] }, // C, G and F
    { keys: ['C', 'G', 'D', 'F', 'Bb'] }, // Up to two signs
    { keys: ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'], count: 30 }, // Up to three signs
    { keys: ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'], extras: 'both' }, // With extra signs
    { keys: ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'], extras: 'both', input: 'mixed', timer: 5, count: 30 }, // Unit review
  ]),
];

export const PITCH_TRACK: Track<NoteLesson> = { id: 'pitch', units: PITCH_UNITS };
export const NOTES_TRACK: Track<NoteLesson> = { id: 'notes', units: NOTES_UNITS };
export const KEYS_TRACK: Track<NoteLesson> = { id: 'keys', units: KEYS_UNITS };

const NOTE_TRACKS: Record<NoteTrackId, Track<NoteLesson>> = { pitch: PITCH_TRACK, notes: NOTES_TRACK, keys: KEYS_TRACK };
const NOTE_UNITS: Record<NoteTrackId, NoteUnit[]> = { pitch: PITCH_UNITS, notes: NOTES_UNITS, keys: KEYS_UNITS };
export const noteTrack = (id: NoteTrackId): Track<NoteLesson> => NOTE_TRACKS[id];
export const isNoteTrack = (id: unknown): id is NoteTrackId => id === 'pitch' || id === 'notes' || id === 'keys';

/** The full Read notes settings of a lesson: defaults ← unit base ← lesson preset. Unknown id → null. */
export function noteLessonSettings(track: NoteTrackId, lessonId: string): NoteSettings | null {
  for (const u of NOTE_UNITS[track]) {
    const l = u.lessons.find((x) => x.id === lessonId);
    if (!l) continue;
    const s: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, ...u.base, ...l.settings };
    // Fresh arrays: callers may edit the result without touching the path.
    return { ...s, clefs: [...s.clefs], keys: [...s.keys], tasks: [...s.tasks], only: [...s.only], stress: [...s.stress] };
  }
  return null;
}

/**
 * How many of the things a lesson is about some notes of its round lack (0: none), so a lesson named after a sign asks
 * for it: for each key they use that has a signature, a note it changes (the treble staff has one B in its 11 places,
 * and a third of 23.1's rounds had no B♭); with extra signs, a note a sign raises, and with both kinds one a sign lowers
 * too (21.2 Flats too); and, in a lesson with signs, a sign at all (Home's preview of 26.2 could start in C major).
 */
export function noteLessonMisses(s: NoteSettings, notes: RoundNote[]): number {
  const change = (n: RoundNote): number => n.alter - keyAlter(n.key, letterOf(n.step));
  let misses = 0;
  for (const key of new Set(notes.map((n) => n.key))) {
    if (KEYS[key].fifths !== 0 && !notes.some((n) => n.key === key && n.sign === null && n.alter !== 0)) misses++;
  }
  const extras = roundExtras(s);
  if (extras !== 'none' && !notes.some((n) => change(n) > 0)) misses++;
  if (extras === 'both' && !notes.some((n) => change(n) < 0)) misses++;
  if (roundHasSigns(s) && !notes.some((n) => n.alter !== 0 || n.sign !== null)) misses++;
  return misses;
}

/**
 * Seeds a lesson start tries for a round that shows what the lesson is about. A round is drawn in microseconds, and
 * weak spots elsewhere on the staff make 23.1's one B rarer still.
 */
const SHOW_TRIES = 100;

/**
 * The seed of a lesson's round, chosen so the round shows all the lesson is about (noteLessonMisses), as a rhythm
 * lesson's exercise shows what it introduces (makeLessonRun in ui/store.tsx): from `seed`, other seeds are tried until
 * one does, else the one that comes closest is kept. The run keeps the seed, so a reload draws the same round again.
 */
export function noteLessonSeed(s: NoteSettings, seed: number, weak: WeakSpots = {}): number {
  const seeds = new Rng(seed);
  let best = seed;
  let misses = noteLessonMisses(s, generateRound(s, seed, weak));
  for (let i = 1; i < SHOW_TRIES && misses > 0; i++) {
    const next = seeds.int(0x7fffffff);
    const m = noteLessonMisses(s, generateRound(s, next, weak));
    if (m < misses) {
      best = next;
      misses = m;
    }
  }
  return best;
}
