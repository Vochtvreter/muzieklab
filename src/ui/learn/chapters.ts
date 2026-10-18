/**
 * The Learn chapters as data (DESIGN.md §9.1, plan in docs/LEARN-CHAPTERS.md). Learn.tsx draws every chapter from this
 * file, so a new chapter or section is an entry here plus its text in en.json; no screen code changes.
 *
 * Text keys in a section are relative to that section: in section 9.3, 'point1' is `learn.ch9.s3.point1`. A chapter
 * needs `learn.chapters.{n}.title` / `.sub` and `learn.ch{n}.intro`; its quick check `learn.ch{n}.quiz.question`,
 * `.right` and `.wrong`; a section `learn.ch{n}.s{k}.title`, and `.practice` when it has a practice link.
 * `chapters.test.ts` checks all of this, so a missing text fails the tests instead of showing a raw key.
 */
import type { Alter, Clef, KeyId, MeterId, NoteSettings, Settings } from '../../core/api';

/**
 * Notes on a five-line staff, written as text: letter, optional sign, octave, split by spaces. '#' sharp, 'b' flat,
 * 'n' natural; no sign = what the key signature says. 'C4' is middle C, 'F#4 Bb4' a sharp and a flat.
 */
export type PitchText = string;
/**
 * Rhythm on the one-line staff, one string per bar, in the tokens of `render/notationText.ts`:
 * 'q [8 8] h' = a quarter, two beamed eighths, a half.
 */
export type RhythmText = string;

export type Block =
  /** A paragraph. */
  | { kind: 'text'; text: string }
  /** A grey tip box: a memory aid or "in the game". */
  | { kind: 'tip'; text: string }
  /** A bulleted list. */
  | { kind: 'list'; items: string[] }
  /** Cards with a big music glyph, a title and a line of text (the two clefs). */
  | { kind: 'tiles'; tiles: { glyph: string; title: string; text: string }[] }
  /**
   * A pitch staff, one whole note per bar. `labels` writes each note's name under it ('nameOctave' adds the octave:
   * C4). With `title` it gets a header line with `value` on the right. The `alt` text gets `{names}`: the notes' names.
   */
  | {
      kind: 'staff';
      clef: Clef;
      keyId?: KeyId;
      notes: PitchText;
      /** Bars on the staff; default one per note. 0 draws only the clef and key signature, with `value` beside it. */
      slots?: number;
      /** Staff spaces of room for ledger lines above and below; default 1.6. */
      room?: number;
      labels?: 'name' | 'nameOctave';
      title?: string;
      value?: string;
      alt: string;
    }
  /** A rhythm on the one-line staff (for the rhythm chapters). */
  | { kind: 'rhythm'; meter: MeterId; bars: RhythmText[]; alt: string }
  /** One piano octave C–B; `marked` white keys are tinted. */
  | { kind: 'piano'; marked?: string[]; alt: string }
  /** The seven letter names with do re mi under them. */
  | { kind: 'noteNames' }
  /** Columns side by side on tablet and desktop, stacked on phones: 'staves' for notation, 'text' for text | picture. */
  | { kind: 'pair'; variant?: 'staves' | 'text'; columns: Block[][] };

/** Where a section's practice link goes: Read notes or rhythm Free practice, set up for the section. */
export type Practice = { notes: Partial<NoteSettings> } | { rhythm: Partial<Settings> };

export interface Section {
  /** "9.3": chapter and section number. */
  id: string;
  blocks: Block[];
  /** Adds "Practice … →" (text key 'practice') at the end of the section. */
  practice?: Practice;
}

/** A quick-check answer: a note name ('Gb' → G♭) or a text key relative to the chapter's quiz ('a1' → learn.ch1.quiz.a1). */
export type Answer = { note: string } | { text: string };

export interface Chapter {
  n: number;
  sections: Section[];
  quiz: { answers: Answer[]; right: number };
  /** The big button at the end: Read notes or rhythm Free practice. */
  practice: 'notes' | 'rhythm';
}

/** All chapters in the plan, built or not, for "chapter 9 of 11". */
export const PLANNED_CHAPTERS = 11;

const C_ONLY: Partial<NoteSettings> = { keys: ['C'], mixKeys: false, extras: 'none' };

export const CHAPTERS: Chapter[] = [
  {
    n: 8,
    practice: 'notes',
    sections: [
      {
        id: '8.1',
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'tiles',
            tiles: [
              { glyph: '𝄞', title: 'trebleTitle', text: 'trebleText' },
              { glyph: '𝄢', title: 'bassTitle', text: 'bassText' },
            ],
          },
          { kind: 'text', text: 'landmarks' },
        ],
      },
      {
        id: '8.2',
        blocks: [
          {
            kind: 'pair',
            variant: 'staves',
            columns: [
              [{ kind: 'staff', clef: 'treble', notes: 'E4 G4 B4 D5 F5', labels: 'name', title: 'lines', value: 'E G B D F', alt: 'linesAlt' }],
              [{ kind: 'staff', clef: 'treble', notes: 'F4 A4 C5 E5', labels: 'name', title: 'spaces', value: 'F A C E', alt: 'spacesAlt' }],
            ],
          },
          { kind: 'tip', text: 'aid' },
        ],
        practice: { notes: { ...C_ONLY, clefs: ['treble'], range: 'staff' } },
      },
      {
        id: '8.3',
        blocks: [
          {
            kind: 'pair',
            variant: 'staves',
            columns: [
              [{ kind: 'staff', clef: 'bass', notes: 'G2 B2 D3 F3 A3', labels: 'name', title: 'lines', value: 'G B D F A', alt: 'linesAlt' }],
              [{ kind: 'staff', clef: 'bass', notes: 'A2 C3 E3 G3', labels: 'name', title: 'spaces', value: 'A C E G', alt: 'spacesAlt' }],
            ],
          },
          { kind: 'tip', text: 'aid' },
        ],
        practice: { notes: { ...C_ONLY, clefs: ['bass'], range: 'staff' } },
      },
      {
        id: '8.4',
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'pair',
            variant: 'staves',
            columns: [
              [{ kind: 'staff', clef: 'treble', notes: 'C4', slots: 2, alt: 'trebleAlt' }],
              [{ kind: 'staff', clef: 'bass', notes: 'C4', slots: 2, alt: 'bassAlt' }],
            ],
          },
          { kind: 'staff', clef: 'treble', notes: 'A3 B3 C4 A5 B5 C6', labels: 'nameOctave', room: 3, alt: 'ledgerAlt' },
          { kind: 'tip', text: 'range' },
        ],
        practice: { notes: { ...C_ONLY, clefs: ['treble', 'bass'], range: 'ledger2' } },
      },
      {
        id: '8.5',
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'noteNames' },
          { kind: 'tip', text: 'ti' },
          { kind: 'text', text: 'game' },
        ],
        practice: { notes: { ...C_ONLY, clefs: ['treble', 'bass'], range: 'staff', input: 'names' } },
      },
    ],
    quiz: { answers: [{ note: 'G' }, { note: 'B' }, { note: 'D' }], right: 1 },
  },
  {
    n: 9,
    practice: 'notes',
    sections: [
      {
        id: '9.1',
        blocks: [
          { kind: 'pair', variant: 'text', columns: [[{ kind: 'text', text: 'text' }], [{ kind: 'piano', alt: 'pianoAlt' }]] },
          { kind: 'tip', text: 'game' },
        ],
        practice: { notes: { ...C_ONLY, input: 'piano' } },
      },
      {
        id: '9.2',
        blocks: [
          { kind: 'pair', variant: 'text', columns: [[{ kind: 'text', text: 'text' }], [{ kind: 'piano', marked: ['E', 'F', 'B', 'C'], alt: 'pianoAlt' }]] },
        ],
      },
      {
        id: '9.3',
        blocks: [
          { kind: 'list', items: ['point1', 'point2', 'point3'] },
          { kind: 'staff', clef: 'treble', notes: 'F#4 Bb4', labels: 'name', alt: 'staffAlt' },
          { kind: 'text', text: 'text' },
        ],
        practice: { notes: { ...C_ONLY, extras: 'sharps' } },
      },
      {
        id: '9.4',
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'staff', clef: 'treble', notes: 'F#4 F4', alt: 'staffAlt' },
          { kind: 'text', text: 'after' },
          { kind: 'tip', text: 'game' },
        ],
        practice: { notes: { ...C_ONLY, extras: 'both' } },
      },
    ],
    quiz: { answers: [{ note: 'G' }, { note: 'Gb' }, { note: 'Fb' }], right: 1 },
  },
  {
    n: 10,
    practice: 'notes',
    sections: [
      {
        id: '10.1',
        blocks: [
          { kind: 'text', text: 'text1' },
          { kind: 'staff', clef: 'treble', keyId: 'G', notes: 'F4 G4 F5', alt: 'gAlt' },
          { kind: 'text', text: 'text2' },
          { kind: 'text', text: 'text4' },
          { kind: 'staff', clef: 'treble', keyId: 'G', notes: 'F5 Fn5 F5', alt: 'barAlt' },
        ],
        practice: { notes: { keys: ['G'], mixKeys: false, extras: 'none' } },
      },
      {
        id: '10.2',
        blocks: [
          { kind: 'text', text: 'text3' },
          {
            kind: 'pair',
            variant: 'staves',
            columns: [
              [{ kind: 'staff', clef: 'treble', keyId: 'C#', notes: '', slots: 0, room: 1.2, value: 'F C G D A E B', alt: 'sharpsAlt' }],
              [{ kind: 'staff', clef: 'treble', keyId: 'Cb', notes: '', slots: 0, room: 1.2, value: 'B E A D G C F', alt: 'flatsAlt' }],
            ],
          },
          { kind: 'tip', text: 'start' },
        ],
        practice: { notes: { keys: ['D', 'Bb'], mixKeys: true, extras: 'none' } },
      },
      {
        id: '10.3',
        blocks: [{ kind: 'list', items: ['point1', 'point2'] }],
        practice: { notes: { keys: ['G', 'D', 'A', 'F', 'Bb', 'Eb'], mixKeys: true, extras: 'none' } },
      },
      {
        id: '10.4',
        blocks: [
          { kind: 'text', text: 'point3' },
          { kind: 'tip', text: 'game' },
        ],
      },
    ],
    quiz: { answers: [{ note: 'C' }, { note: 'D' }, { note: 'C#' }], right: 1 },
  },
];

export const findChapter = (n: number): Chapter | undefined => CHAPTERS.find((c) => c.n === n);
export const sectionIds = (c: Chapter): string[] => c.sections.map((s) => s.id);
/** The full message key of a section's text: ('9.3', 'point1') → 'learn.ch9.s3.point1'. */
export const sectionKey = (id: string, key: string): string => {
  const [n, k] = id.split('.');
  return `learn.ch${n}.s${k}.${key}`;
};

const LETTER_STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SIGN: Record<string, Alter> = { '#': 1, b: -1, n: 0 };

/** 'F#4' → staff step 31 (C4 = 28) with a sharp; null for text that is not a note. */
export function parsePitch(text: string): { step: number; sign: Alter | null } | null {
  const m = /^([A-G])([#bn]?)(\d)$/.exec(text);
  if (!m) return null;
  return { step: Number(m[3]) * 7 + LETTER_STEP[m[1]], sign: m[2] ? SIGN[m[2]] : null };
}

/** A note name without octave ('Gb') → letter and sign, for quiz answers. */
export function parseNoteName(text: string): { letter: string; alter: Alter } | null {
  const m = /^([A-G])([#b]?)$/.exec(text);
  return m ? { letter: m[1], alter: m[2] ? SIGN[m[2]] : 0 } : null;
}
