/**
 * The Read notes and Keys learning paths (MVP canvas, Path page, "Learning paths"; DESIGN.md §8.2). Every lesson is a
 * Read notes preset on top of its unit's base, as rhythm lessons are rhythm presets (path.ts). Read notes follows
 * Learn chapter 8: one clef at a time, then both, then ledger lines, then speed. Keys follows chapters 9 and 10: signs
 * next to notes, then one key signature at a time (G, then F), then two and three signs, then mixed keys. Keys opens
 * once every Read notes unit 3 lesson has two stars (tracks.ts).
 * Titles are message keys: path.{track}.u{unit}.title and path.{track}.u{unit}.l{lesson}.
 */
import { DEFAULT_NOTE_SETTINGS, type NoteSettings } from '../core/noteRound';
import type { Track, TrackLesson, TrackUnit } from './track';

export interface NoteLesson extends TrackLesson {
  settings: Partial<NoteSettings>;
}

export interface NoteUnit extends TrackUnit<NoteLesson> {
  base: Partial<NoteSettings>;
}

export type NoteTrackId = 'notes' | 'keys';

function unit(track: NoteTrackId, id: number, glyph: string, base: Partial<NoteSettings>, lessons: Partial<NoteSettings>[]): NoteUnit {
  return {
    id,
    titleKey: `path.${track}.u${id}.title`,
    glyph,
    base,
    lessons: lessons.map((settings, i) => ({ id: `${id}.${i + 1}`, title: `path.${track}.u${id}.l${i + 1}`, settings })),
  };
}

/** Every Read notes lesson spells out each setting, so nothing from the player's own setup leaks in. */
const NOTES_BASE: Partial<NoteSettings> = { keys: ['C'], mixKeys: false, input: 'names', range: 'staff', extras: 'none', count: 10, timer: 0 };
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
const KEYS_BASE: Partial<NoteSettings> = { clefs: ['treble'], mixKeys: false, input: 'names', range: 'staff', extras: 'none', count: 20, timer: 0 };

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
  unit('keys', 6, 'Mix', { ...KEYS_BASE, clefs: BOTH, mixKeys: true }, [
    { keys: ['C', 'G', 'F'] }, // C, G and F
    { keys: ['C', 'G', 'D', 'F', 'Bb'] }, // Up to two signs
    { keys: ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'], count: 30 }, // Up to three signs
    { keys: ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'], extras: 'both' }, // With extra signs
    { keys: ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'], extras: 'both', input: 'mixed', timer: 5, count: 30 }, // Unit review
  ]),
];

export const NOTES_TRACK: Track<NoteLesson> = { id: 'notes', units: NOTES_UNITS };
export const KEYS_TRACK: Track<NoteLesson> = { id: 'keys', units: KEYS_UNITS };

export const noteTrack = (id: NoteTrackId): Track<NoteLesson> => (id === 'notes' ? NOTES_TRACK : KEYS_TRACK);

/** The full Read notes settings of a lesson: defaults ← unit base ← lesson preset. Unknown id → null. */
export function noteLessonSettings(track: NoteTrackId, lessonId: string): NoteSettings | null {
  for (const u of track === 'notes' ? NOTES_UNITS : KEYS_UNITS) {
    const l = u.lessons.find((x) => x.id === lessonId);
    if (!l) continue;
    const s: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, ...u.base, ...l.settings };
    // Fresh arrays: callers may edit the result without touching the path.
    return { ...s, clefs: [...s.clefs], keys: [...s.keys] };
  }
  return null;
}
