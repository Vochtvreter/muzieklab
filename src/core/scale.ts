/**
 * Scales (DESIGN.md §3.7): the four scale types and their steps, spelling a scale in any of the 15 keys (each letter
 * once), the circle of fifths the Scales hub draws, and the piano window a scale is played in. Pure data and functions;
 * names and words come from the i18n catalog.
 */
import { KEYS, LETTERS, octaveOf, type KeyId, type Letter, type Step } from './pitch';

/** Major, and the three forms of minor (on the relative minor of the key: G → E minor). */
export type ScaleType = 'major' | 'natural' | 'harmonic' | 'melodic';
export const SCALE_TYPES: readonly ScaleType[] = ['major', 'natural', 'harmonic', 'melodic'];
export const MINOR_TYPES: readonly ScaleType[] = ['natural', 'harmonic', 'melodic'];

export type Direction = 'up' | 'upDown';
export const DIRECTIONS: readonly Direction[] = ['up', 'upDown'];

/**
 * −2 double flat … +2 double sharp. Read notes never needs more than one sign (`Alter`), but the raised 7th of G♯, D♯
 * and A♯ minor is a double sharp (F𝄪, C𝄪, G𝄪), and their melodic form raises the 6th to E♯, B♯ or F𝄪 (§3.7).
 */
export type ScaleAlter = -2 | -1 | 0 | 1 | 2;

/** A scale: the key signature it belongs to, and its type. Minor types use the key's relative minor. */
export interface Scale {
  key: KeyId;
  type: ScaleType;
}

/** Half steps above the tonic, degree 1 to 8, going up. Melodic minor comes down as natural minor. */
const PATTERNS: Record<ScaleType, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  natural: [0, 2, 3, 5, 7, 8, 10, 12],
  harmonic: [0, 2, 3, 5, 7, 8, 11, 12],
  melodic: [0, 2, 3, 5, 7, 9, 11, 12],
};

/** The form a scale takes going down: melodic minor is written as natural minor (the classical form, §3.7). */
const downType = (type: ScaleType): ScaleType => (type === 'melodic' ? 'natural' : type);

const SEMITONE: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The tonic as written: the key's major tonic, or its relative minor's. */
export function tonic(s: Scale): { letter: Letter; alter: ScaleAlter } {
  const k = KEYS[s.key];
  return s.type === 'major' ? k.major : k.minor;
}

/** A note of a scale as written (staff position and sign) and as played (MIDI note number, middle C = 60). */
export interface ScaleNote {
  /** 1–8: the scale degree (8 is the tonic an octave up). */
  degree: number;
  step: Step;
  alter: ScaleAlter;
  midi: number;
}

/** MIDI number of a written note. The octave belongs to the letter, so B♯3 sounds as C4 and C♭4 as B3. */
export const midiOf = (step: Step, alter: number): number => 12 * (octaveOf(step) + 1) + SEMITONE[LETTERS[((step % 7) + 7) % 7]] + alter;

/** Where the tonic is written: octave 4, so a scale in the treble staff runs from C4–B4 up to C5–B5. */
export const TONIC_OCTAVE = 4;

/** Degrees 1–8 going up, each letter once: the sign is whatever makes the letter land on the pattern's half step. */
function upNotes(s: Scale, type: ScaleType): ScaleNote[] {
  const t = tonic(s);
  const start = TONIC_OCTAVE * 7 + LETTERS.indexOf(t.letter);
  const base = midiOf(start, t.alter);
  return PATTERNS[type].map((semis, i) => {
    const step = start + i;
    const alter = base + semis - midiOf(step, 0);
    if (alter < -2 || alter > 2) throw new Error(`no spelling for degree ${i + 1} of ${s.key} ${type}`);
    return { degree: i + 1, step, alter: alter as ScaleAlter, midi: base + semis };
  });
}

/**
 * The scale as written and played, in order: 8 notes up, or 15 for up and down (degrees 8 back to 1, melodic minor as
 * natural minor on the way down).
 */
export function scaleNotes(s: Scale, direction: Direction = 'up'): ScaleNote[] {
  const up = upNotes(s, s.type);
  if (direction === 'up') return up;
  const down = upNotes(s, downType(s.type)).slice(0, 7).reverse();
  return [...up, ...down];
}

/** Half steps between neighbouring notes, in playing order: 2 = W, 1 = H, 3 = the step and a half of harmonic minor. */
export function scaleSteps(s: Scale, direction: Direction = 'up'): number[] {
  const notes = scaleNotes(s, direction);
  return notes.slice(1).map((n, i) => Math.abs(n.midi - notes[i].midi));
}

export type StepName = 'W' | 'H' | 'WH';
export const stepName = (halfSteps: number): StepName => (halfSteps === 1 ? 'H' : halfSteps === 2 ? 'W' : 'WH');

/** Signs the scale needs: double sharps are drawn as a fourth button only in the scales that have one (§3.7). */
export const needsDoubleSharp = (s: Scale, direction: Direction = 'up'): boolean => scaleNotes(s, direction).some((n) => n.alter === 2);

// --- Ids and the round's list -----------------------------------------------------------------------------------

/** "D-major", "E-harmonic": the tonic and the type. Each of the 60 scales has its own tonic name per type. */
export function scaleId(s: Scale): string {
  const t = tonic(s);
  return t.letter + (t.alter > 0 ? '#' : t.alter < 0 ? 'b' : '') + '-' + s.type;
}

/** The 15 keys around the circle: clockwise from C (one sharp more each time), then the flats (§3.7, Go round the circle). */
export const CIRCLE_ORDER: readonly KeyId[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

/** All 60 scales: 15 keys × 4 types. */
export const ALL_SCALES: readonly Scale[] = CIRCLE_ORDER.flatMap((key) => SCALE_TYPES.map((type) => ({ key, type })));

const SCALE_BY_ID = new Map(ALL_SCALES.map((s) => [scaleId(s), s]));
export const parseScaleId = (id: string): Scale | null => SCALE_BY_ID.get(id) ?? null;

// --- The circle of fifths ---------------------------------------------------------------------------------------

/**
 * The hub's 12 positions, clockwise from C at the top. The three at the bottom have two spellings of the same sound
 * (B/C♭, F♯/G♭, D♭/C♯): the selected one is shown, else the one with more progress (the first on a tie), and tapping
 * the selected key again switches to the other.
 */
export const CIRCLE: readonly (readonly KeyId[])[] = [['C'], ['G'], ['D'], ['A'], ['E'], ['B', 'Cb'], ['F#', 'Gb'], ['Db', 'C#'], ['Ab'], ['Eb'], ['Bb'], ['F']];

/** The circle position of a key (0–11, C = 0). */
export const circlePosition = (key: KeyId): number => CIRCLE.findIndex((p) => p.includes(key));

// --- Progress on the hub ----------------------------------------------------------------------------------------

/** Best stars per scale id, 0–3. */
export type ScaleStars = Record<string, number>;

/** A major key's fill on the circle: its stars (0 none, 1 light, 2 mid, 3 dark slate). */
export const majorLevel = (stars: ScaleStars, key: KeyId): number => stars[scaleId({ key, type: 'major' })] ?? 0;

/** A minor key's fill: how many of its three forms have ★★ or more. */
export const minorLevel = (stars: ScaleStars, key: KeyId): number =>
  MINOR_TYPES.filter((type) => (stars[scaleId({ key, type })] ?? 0) >= 2).length;

/** "6 of 15 major scales with 2+ stars", "4 of 45 minor scales". */
export function doneCounts(stars: ScaleStars): { major: number; minor: number } {
  let major = 0;
  let minor = 0;
  for (const s of ALL_SCALES) {
    if ((stars[scaleId(s)] ?? 0) < 2) continue;
    if (s.type === 'major') major++;
    else minor++;
  }
  return { major, minor };
}

// --- The piano ---------------------------------------------------------------------------------------------------

export interface PianoWindow {
  /** MIDI numbers of the 9 white keys, low to high. */
  whites: number[];
  /** Black keys: MIDI number, and the white key index it follows (1 = between whites 0 and 1). */
  blacks: { midi: number; after: number }[];
}

const isWhite = (midi: number): boolean => [0, 2, 4, 5, 7, 9, 11].includes(((midi % 12) + 12) % 12);

/**
 * 9 white keys from the tonic, or from the white key just below it when the tonic is a black key (F♯, D♭ …): always
 * enough for an octave from any starting note.
 */
export function pianoWindow(s: Scale): PianoWindow {
  let first = scaleNotes(s)[0].midi;
  while (!isWhite(first)) first--;
  const whites: number[] = [];
  const blacks: { midi: number; after: number }[] = [];
  for (let m = first; whites.length < 9; m++) {
    if (isWhite(m)) whites.push(m);
    else blacks.push({ midi: m, after: whites.length });
  }
  return { whites, blacks: blacks.filter((b) => b.after < 9) };
}
