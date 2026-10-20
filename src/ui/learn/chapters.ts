/**
 * The Learn chapters as data (DESIGN.md §9.1, plan in docs/LEARN-CHAPTERS.md). Learn.tsx draws every chapter from this
 * file, so a new chapter or section is an entry here plus its text in en.json; no screen code changes.
 *
 * Text keys in a section are relative to that section: in section 9.3, 'point1' is `learn.ch9.s3.point1`. A chapter
 * needs `learn.chapters.{n}.title` / `.sub` and `learn.ch{n}.intro`; its quick check `learn.ch{n}.quiz.question`,
 * `.right` and `.wrong`; a section `learn.ch{n}.s{k}.title`, its quick check `.check.question`, `.right` and `.wrong`,
 * and `.practice` when it has a practice link.
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
  /**
   * A rhythm on the one-line staff, with the counting under the notes (held and silent counts grey, in brackets).
   * `title` and `value` give it a header line; `verdict` a "Write" or "Avoid" label; `common` draws 4/4 as C.
   */
  | {
      kind: 'rhythm';
      meter: MeterId;
      bars: RhythmText[];
      alt: string;
      title?: string;
      value?: string;
      verdict?: 'write' | 'avoid';
      common?: boolean;
    }
  /** Rows of a name, a line of text and a value on the right, with an optional music glyph (tempo words, rests). */
  | { kind: 'table'; rows: { glyph?: string; title: string; text?: string; value?: string }[] }
  /** Strong, medium and weak beats of each meter, as bars of different heights. */
  | { kind: 'accents'; meters: MeterId[] }
  /** Four seconds of beats at each tempo, as dots on a time line. */
  | { kind: 'pulse'; tempos: number[]; alt: string }
  /** A big time signature with what its top and bottom number mean. */
  | { kind: 'timeSig'; meter: MeterId; top: string; bottom: string }
  /** One beat, divided in several ways: each row's rhythm fills one beat and shows its counts in a shared grid. */
  | { kind: 'beatGrid'; rows: { title: string; beat: RhythmText }[]; alt: string }
  /** The note tree: one 4/4 bar per value, whole to sixteenth, with a Notes | Rests switch. */
  | { kind: 'noteTree' }
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
  /** The quick check at the end of the section; answering it right marks the section read. Text keys under 'check'. */
  check: Quiz;
  blocks: Block[];
  /** Adds "Practice … →" (text key 'practice') at the end of the section. */
  practice?: Practice;
}

/**
 * A quick-check answer: a note name ('Gb' → G♭) or a text key relative to its quiz ('a1' → learn.ch1.quiz.a1 for a
 * chapter, learn.ch1.s2.check.a1 for section 1.2).
 */
export type Answer = { note: string } | { text: string };
/**
 * A quick check: its answers and which one is right. Every quick check is also a Test yourself flash card (DESIGN.md
 * §3.6); `glyph` is the symbol or bit of notation on its card, else the card shows its topic's glyph.
 */
export interface Quiz {
  answers: Answer[];
  right: number;
  glyph?: string;
}

export interface Chapter {
  n: number;
  /** "Builds on chapters 1 and 2" in the header; none on a chapter that starts from nothing. */
  builds?: number[];
  /** Learning Path units that practise the chapter, for the header. */
  units?: number[];
  sections: Section[];
  quiz: Quiz;
  /** The big button at the end: Read notes or rhythm Free practice. It also puts the chapter in its Learn topic. */
  practice: Topic;
}

/** The Learn tab's topics (DESIGN.md §3.6): a chapter belongs to the one its practice goes to. */
export type Topic = 'rhythm' | 'notes';
export const TOPICS: { id: Topic; glyph: string }[] = [
  { id: 'rhythm', glyph: '𝅘𝅥𝅮' },
  { id: 'notes', glyph: '𝄞' },
];

/** All chapters in the plan, built or not, for "chapter 9 of 11". */
export const PLANNED_CHAPTERS = 11;

const C_ONLY: Partial<NoteSettings> = { keys: ['C'], mixKeys: false, extras: 'none' };

/**
 * Every rhythm practice link spells out all musical settings, so nothing from the player's last setup leaks in;
 * tempo, bars, mode and the metronome stay theirs.
 */
const RHYTHM: Partial<Settings> = { meters: ['4/4'], notes: ['half', 'quarter'], rests: ['quarter'], dotted: false, ties: false, triplets: false };

export const CHAPTERS: Chapter[] = [
  {
    n: 1,
    units: [1, 3, 5],
    practice: 'rhythm',
    sections: [
      {
        id: '1.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'pulse', tempos: [60, 120], alt: 'pulseAlt' },
          { kind: 'text', text: 'words' },
          {
            kind: 'table',
            rows: [
              { title: 'largo', text: 'largoText', value: 'largoBpm' },
              { title: 'adagio', text: 'adagioText', value: 'adagioBpm' },
              { title: 'andante', text: 'andanteText', value: 'andanteBpm' },
              { title: 'moderato', text: 'moderatoText', value: 'moderatoBpm' },
              { title: 'allegro', text: 'allegroText', value: 'allegroBpm' },
              { title: 'presto', text: 'prestoText', value: 'prestoBpm' },
            ],
          },
          { kind: 'text', text: 'mark' },
          { kind: 'tip', text: 'game' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['quarter'], rests: [] } },
      },
      {
        id: '1.2',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 2, glyph: '𝄴' },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'rhythm', meter: '4/4', bars: ['q q q q', 'h h'], alt: 'barsAlt' },
          { kind: 'text', text: 'sig' },
          { kind: 'timeSig', meter: '3/4', top: 'top', bottom: 'bottom' },
          { kind: 'rhythm', meter: '2/4', bars: ['q q', 'h'], title: 'two', alt: 'twoAlt' },
          { kind: 'rhythm', meter: '3/4', bars: ['q q q', 'h q'], title: 'three', alt: 'threeAlt' },
          { kind: 'rhythm', meter: '4/4', bars: ['q q q q'], title: 'four', alt: 'fourAlt' },
          { kind: 'rhythm', meter: '4/4', common: true, bars: ['q q h'], title: 'common', alt: 'commonAlt' },
          { kind: 'tip', text: 'simple' },
        ],
        practice: { rhythm: { ...RHYTHM, meters: ['2/4', '3/4', '4/4'] } },
      },
      {
        id: '1.3',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'accents', meters: ['2/4', '3/4', '4/4'] },
          { kind: 'text', text: 'middle' },
          { kind: 'tip', text: 'game' },
        ],
        practice: { rhythm: { ...RHYTHM, meters: ['3/4', '4/4'], metronome: 'accent' } },
      },
    ],
    quiz: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
  },
  {
    n: 2,
    builds: [1],
    units: [1, 3, 4, 8],
    practice: 'rhythm',
    sections: [
      {
        id: '2.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0, glyph: '𝅘𝅥𝅯' },
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'tiles',
            tiles: [
              { glyph: '𝅘𝅥', title: 'filledTitle', text: 'filledText' },
              { glyph: '𝅗𝅥 𝅝', title: 'openTitle', text: 'openText' },
              { glyph: '𝅘𝅥𝅮 𝅘𝅥𝅯', title: 'flagsTitle', text: 'flagsText' },
              { glyph: '♫', title: 'beamsTitle', text: 'beamsText' },
            ],
          },
          { kind: 'rhythm', meter: '4/4', bars: ['q q h', 'w'], alt: 'staffAlt' },
          { kind: 'tip', text: 'game' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['whole', 'half', 'quarter'], rests: [] } },
      },
      {
        id: '2.2',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 2 },
        blocks: [{ kind: 'text', text: 'text' }, { kind: 'noteTree' }, { kind: 'text', text: 'after' }],
      },
    ],
    quiz: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
  },
  {
    n: 3,
    builds: [2],
    units: [2, 3, 5],
    practice: 'rhythm',
    sections: [
      {
        id: '3.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0, glyph: '𝄻 𝄼' },
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'table',
            rows: [
              { glyph: '𝄻', title: 'whole', value: 'wholeBeats' },
              { glyph: '𝄼', title: 'half', value: 'halfBeats' },
              { glyph: '𝄽', title: 'quarter', value: 'quarterBeats' },
              { glyph: '𝄾', title: 'eighth', value: 'eighthBeats' },
              { glyph: '𝄿', title: 'sixteenth', value: 'sixteenthBeats' },
            ],
          },
          { kind: 'text', text: 'place' },
          { kind: 'rhythm', meter: '4/4', bars: ['W', 'hr h'], alt: 'placeAlt' },
          { kind: 'text', text: 'count' },
          { kind: 'rhythm', meter: '4/4', bars: ['q qr q qr', 'hr h'], alt: 'countAlt' },
          { kind: 'tip', text: 'game' },
        ],
        practice: { rhythm: { ...RHYTHM, rests: ['half', 'quarter'] } },
      },
      {
        id: '3.2',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'rhythm', meter: '3/4', bars: ['h q', 'W'], title: 'silentTitle', alt: 'silentAlt' },
          { kind: 'text', text: 'silent' },
          { kind: 'text', text: 'beat3' },
          { kind: 'rhythm', meter: '4/4', verdict: 'write', bars: ['hr q q', 'q qr qr q'], alt: 'writeAlt' },
          { kind: 'rhythm', meter: '4/4', verdict: 'avoid', bars: ['q hr q'], alt: 'avoidAlt' },
          { kind: 'text', text: 'dotted' },
          { kind: 'rhythm', meter: '4/4', bars: ['8.r 16 q qr 8r 8'], alt: 'dottedAlt' },
          { kind: 'text', text: 'noTie' },
        ],
        practice: { rhythm: { ...RHYTHM, meters: ['2/4', '3/4', '4/4'], rests: ['whole', 'half', 'quarter'] } },
      },
    ],
    quiz: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0 },
  },
  {
    n: 4,
    builds: [1, 2, 3],
    units: [4, 5, 8],
    practice: 'rhythm',
    sections: [
      {
        id: '4.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'rhythm', meter: '4/4', bars: ['[8 8] [8 8] q q'], alt: 'staffAlt' },
          { kind: 'text', text: 'rest' },
          { kind: 'rhythm', meter: '4/4', bars: ['q 8 8r 8r 8 q'], alt: 'restAlt' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'] } },
      },
      {
        id: '4.2',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1, glyph: '𝅘𝅥𝅮𝅘𝅥𝅯𝅘𝅥𝅯' },
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'beatGrid',
            rows: [
              { title: 'quarter', beat: 'q' },
              { title: 'eighths', beat: '[8 8]' },
              { title: 'sixteenths', beat: '[16 16 16 16]' },
            ],
            alt: 'gridAlt',
          },
          { kind: 'text', text: 'mixed' },
          {
            kind: 'beatGrid',
            rows: [
              { title: 'eighthTwo', beat: '[8 16 16]' },
              { title: 'twoEighth', beat: '[16 16 8]' },
            ],
            alt: 'mixedAlt',
          },
          { kind: 'rhythm', meter: '4/4', bars: ['[16 16 16 16] [8 8] [8 16 16] q'], alt: 'staffAlt' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['quarter', 'eighth', 'sixteenth'] } },
      },
      {
        id: '4.3',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 2 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'rhythm', meter: '4/4', verdict: 'write', title: 'perBeat', bars: ['q [8 8] [8 8] q'], alt: 'perBeatAlt' },
          { kind: 'rhythm', meter: '4/4', verdict: 'write', title: 'half', bars: ['[8 8 8 8] q q'], alt: 'halfAlt' },
          { kind: 'rhythm', meter: '4/4', verdict: 'avoid', title: 'middle', bars: ['q [8 8 8 8] q'], alt: 'middleAlt' },
          { kind: 'text', text: 'never' },
          {
            kind: 'table',
            rows: [
              { title: 'sixteenths', text: 'sixteenthsText' },
              { title: 'quarters', text: 'quartersText' },
            ],
          },
          { kind: 'tip', text: 'game' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['half', 'quarter', 'eighth', 'sixteenth'], rests: ['quarter', 'eighth'] } },
      },
    ],
    quiz: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
  },
  {
    n: 5,
    builds: [2, 4],
    units: [6, 7],
    practice: 'rhythm',
    sections: [
      {
        id: '5.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'rhythm', meter: '4/4', bars: ['q q q q~', 'q q h'], alt: 'barAlt' },
          { kind: 'text', text: 'middle' },
          { kind: 'rhythm', meter: '4/4', bars: ['q q~ q q'], alt: 'middleAlt' },
          { kind: 'text', text: 'slur' },
          { kind: 'tip', text: 'game' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['half', 'quarter', 'eighth'], ties: true } },
      },
      {
        id: '5.2',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 2, glyph: '𝅗𝅥𝅭' },
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'table',
            rows: [
              { glyph: '𝅗𝅥.', title: 'dottedHalf', value: 'dottedHalfBeats' },
              { glyph: '𝅘𝅥.', title: 'dottedQuarter', value: 'dottedQuarterBeats' },
              { glyph: '𝅘𝅥𝅮.', title: 'dottedEighth', value: 'dottedEighthBeats' },
            ],
          },
          {
            kind: 'pair',
            variant: 'staves',
            columns: [
              [{ kind: 'rhythm', meter: '2/4', title: 'tied', bars: ['q~ 8 8'], alt: 'tiedAlt' }],
              [{ kind: 'rhythm', meter: '2/4', title: 'dotted', bars: ['q. 8'], alt: 'dottedAlt' }],
            ],
          },
          { kind: 'text', text: 'count' },
          { kind: 'rhythm', meter: '4/4', bars: ['h. q', 'q. 8 h'], alt: 'countAlt' },
        ],
        practice: { rhythm: { ...RHYTHM, meters: ['3/4', '4/4'], notes: ['half', 'quarter', 'eighth'], dotted: true } },
      },
      {
        id: '5.3',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 2 },
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'beatGrid',
            rows: [
              { title: 'eighths', beat: '[8 8]' },
              { title: 'dottedSixteenth', beat: '[8. 16]' },
              { title: 'sixteenthDotted', beat: '[16 8.]' },
              { title: 'sixteenths', beat: '[16 16 16 16]' },
            ],
            alt: 'gridAlt',
          },
          { kind: 'rhythm', meter: '4/4', bars: ['[8. 16] [8. 16] q q'], alt: 'staffAlt' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['quarter', 'eighth', 'sixteenth'], dotted: true } },
      },
    ],
    quiz: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0, glyph: '𝅘𝅥𝅭' },
  },
  {
    n: 6,
    builds: [1, 4, 5],
    practice: 'rhythm',
    sections: [
      {
        id: '6.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'rhythm', meter: '4/4', title: 'eqe', bars: ['8 q 8 q q'], alt: 'eqeAlt' },
          { kind: 'text', text: 'qhq' },
          {
            kind: 'pair',
            variant: 'staves',
            columns: [
              [{ kind: 'rhythm', meter: '4/4', title: 'qhqPlain', bars: ['q h q'], alt: 'qhqPlainAlt' }],
              [{ kind: 'rhythm', meter: '4/4', title: 'qhqTied', bars: ['q q~ q q'], alt: 'qhqTiedAlt' }],
            ],
          },
          { kind: 'text', text: 'game' },
          { kind: 'tip', text: 'tip' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['half', 'quarter', 'eighth'], ties: true } },
      },
    ],
    quiz: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
  },
  {
    n: 7,
    builds: [4],
    practice: 'rhythm',
    sections: [
      {
        id: '7.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 2 },
        blocks: [
          { kind: 'text', text: 'text' },
          {
            kind: 'beatGrid',
            rows: [
              { title: 'eighths', beat: '[8 8]' },
              { title: 'triplet', beat: '[8t 8t 8t]' },
            ],
            alt: 'gridAlt',
          },
          { kind: 'rhythm', meter: '4/4', bars: ['[8t 8t 8t] q [8t 8t 8t] q'], alt: 'staffAlt' },
          { kind: 'text', text: 'compare' },
          { kind: 'tip', text: 'game' },
        ],
        practice: { rhythm: { ...RHYTHM, notes: ['half', 'quarter', 'eighth'], triplets: true } },
      },
    ],
    quiz: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
  },
  {
    n: 8,
    practice: 'notes',
    sections: [
      {
        id: '8.1',
        check: { answers: [{ note: 'C' }, { note: 'F' }, { note: 'G' }], right: 1, glyph: '𝄢' },
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
        check: { answers: [{ note: 'D' }, { note: 'E' }, { note: 'F' }], right: 2, glyph: '𝄞' },
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
        check: { answers: [{ note: 'A' }, { note: 'B' }, { note: 'C' }], right: 0, glyph: '𝄢' },
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
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
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
        check: { answers: [{ note: 'F' }, { note: 'G' }, { note: 'A' }], right: 1 },
        blocks: [
          { kind: 'text', text: 'text' },
          { kind: 'noteNames' },
          { kind: 'tip', text: 'ti' },
          { kind: 'text', text: 'game' },
        ],
        practice: { notes: { ...C_ONLY, clefs: ['treble', 'bass'], range: 'staff', input: 'names' } },
      },
    ],
    quiz: { answers: [{ note: 'G' }, { note: 'B' }, { note: 'D' }], right: 1, glyph: '𝄞' },
  },
  {
    n: 9,
    practice: 'notes',
    sections: [
      {
        id: '9.1',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 0 },
        blocks: [
          { kind: 'pair', variant: 'text', columns: [[{ kind: 'text', text: 'text' }], [{ kind: 'piano', alt: 'pianoAlt' }]] },
          { kind: 'tip', text: 'game' },
        ],
        practice: { notes: { ...C_ONLY, input: 'piano' } },
      },
      {
        id: '9.2',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
        blocks: [
          { kind: 'pair', variant: 'text', columns: [[{ kind: 'text', text: 'text' }], [{ kind: 'piano', marked: ['E', 'F', 'B', 'C'], alt: 'pianoAlt' }]] },
        ],
      },
      {
        id: '9.3',
        check: { answers: [{ note: 'B' }, { note: 'Bb' }, { note: 'C' }], right: 0 },
        blocks: [
          { kind: 'list', items: ['point1', 'point2', 'point3'] },
          { kind: 'staff', clef: 'treble', notes: 'F#4 Bb4', labels: 'name', alt: 'staffAlt' },
          { kind: 'text', text: 'text' },
        ],
        practice: { notes: { ...C_ONLY, extras: 'sharps' } },
      },
      {
        id: '9.4',
        check: { answers: [{ note: 'F' }, { note: 'F#' }, { note: 'Fb' }], right: 1 },
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
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
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
        check: { answers: [{ note: 'Bb' }, { note: 'Eb' }, { note: 'F' }], right: 0 },
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
        check: { answers: [{ note: 'Ab' }, { note: 'Bb' }, { note: 'Eb' }], right: 2, glyph: '♭♭♭' },
        blocks: [{ kind: 'list', items: ['point1', 'point2'] }],
        practice: { notes: { keys: ['G', 'D', 'A', 'F', 'Bb', 'Eb'], mixKeys: true, extras: 'none' } },
      },
      {
        id: '10.4',
        check: { answers: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }], right: 1 },
        blocks: [
          { kind: 'text', text: 'point3' },
          { kind: 'tip', text: 'game' },
        ],
      },
    ],
    quiz: { answers: [{ note: 'C' }, { note: 'D' }, { note: 'C#' }], right: 1, glyph: '♯♯' },
  },
];

export const findChapter = (n: number): Chapter | undefined => CHAPTERS.find((c) => c.n === n);
export const topicChapters = (topic: Topic): Chapter[] => CHAPTERS.filter((c) => c.practice === topic);
export const topicGlyph = (topic: Topic): string => TOPICS.find((x) => x.id === topic)!.glyph;
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
