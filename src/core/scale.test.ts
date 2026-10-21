import { KEY_ORDER, keySigns, letterOf, type KeyId } from './pitch';
import {
  ALL_SCALES,
  CIRCLE,
  CIRCLE_ORDER,
  circlePosition,
  doneCounts,
  majorLevel,
  midiOf,
  minorLevel,
  needsDoubleSharp,
  parseScaleId,
  pianoWindow,
  scaleId,
  scaleNotes,
  scaleSteps,
  stepName,
  type Scale,
  type ScaleType,
} from './scale';

const SIGN: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };
const spelled = (s: Scale, direction: 'up' | 'upDown' = 'up'): string =>
  scaleNotes(s, direction)
    .map((n) => letterOf(n.step) + SIGN[n.alter])
    .join(' ');
const pattern = (s: Scale, direction: 'up' | 'upDown' = 'up'): string => scaleSteps(s, direction).map(stepName).join(' ');

describe('scale patterns (§3.7, Learn 11.1 and 11.4)', () => {
  const PATTERN: Record<ScaleType, string> = {
    major: 'W W H W W W H',
    natural: 'W H W W H W W',
    harmonic: 'W H W W H WH H',
    melodic: 'W H W W W W H',
  };

  it('gives every one of the 60 scales its step pattern, each letter once', () => {
    expect(ALL_SCALES).toHaveLength(60);
    for (const s of ALL_SCALES) {
      const notes = scaleNotes(s);
      expect(notes).toHaveLength(8);
      expect(pattern(s)).toBe(PATTERN[s.type]);
      const letters = notes.map((n) => letterOf(n.step));
      expect(new Set(letters.slice(0, 7)).size).toBe(7);
      expect(letters[7]).toBe(letters[0]);
      expect(notes[7].midi - notes[0].midi).toBe(12);
    }
  });

  it('spells the boards and textbook examples', () => {
    expect(spelled({ key: 'D', type: 'major' })).toBe('D E F♯ G A B C♯ D');
    expect(spelled({ key: 'G', type: 'harmonic' })).toBe('E F♯ G A B C D♯ E');
    expect(spelled({ key: 'C', type: 'harmonic' })).toBe('A B C D E F G♯ A');
    expect(spelled({ key: 'C', type: 'melodic' })).toBe('A B C D E F♯ G♯ A');
    expect(spelled({ key: 'Cb', type: 'major' })).toBe('C♭ D♭ E♭ F♭ G♭ A♭ B♭ C♭');
    expect(spelled({ key: 'B', type: 'harmonic' })).toBe('G♯ A♯ B C♯ D♯ E F𝄪 G♯');
    expect(spelled({ key: 'C#', type: 'melodic' })).toBe('A♯ B♯ C♯ D♯ E♯ F𝄪 G𝄪 A♯');
  });

  it('writes melodic minor down as natural minor', () => {
    expect(spelled({ key: 'C', type: 'melodic' }, 'upDown')).toBe('A B C D E F♯ G♯ A G F E D C B A');
    expect(pattern({ key: 'C', type: 'melodic' }, 'upDown')).toBe('W H W W W W H W W H W W H W');
    for (const s of ALL_SCALES) {
      const both = scaleNotes(s, 'upDown');
      expect(both).toHaveLength(15);
      const down = both.slice(7);
      const natural = scaleNotes({ key: s.key, type: s.type === 'melodic' ? 'natural' : s.type });
      expect(down.map((n) => n.midi)).toEqual(natural.map((n) => n.midi).reverse());
    }
  });

  it("uses exactly the key signature's signs in major and natural minor (11.2, 10.4)", () => {
    for (const key of KEY_ORDER) {
      const sigs = keySigns(key)
        .map((x) => x.letter + SIGN[x.alter])
        .sort();
      for (const type of ['major', 'natural'] as const) {
        const signs = scaleNotes({ key, type })
          .slice(0, 7)
          .filter((n) => n.alter !== 0)
          .map((n) => letterOf(n.step) + SIGN[n.alter])
          .sort();
        expect(signs).toEqual(sigs);
      }
    }
  });

  it('needs a double sharp only in G♯, D♯ and A♯ minor (harmonic and melodic), and never a double flat', () => {
    const doubles = ALL_SCALES.filter((s) => needsDoubleSharp(s)).map(scaleId).sort();
    expect(doubles).toEqual(['A#-harmonic', 'A#-melodic', 'D#-harmonic', 'D#-melodic', 'G#-harmonic', 'G#-melodic']);
    for (const s of ALL_SCALES) expect(scaleNotes(s, 'upDown').every((n) => n.alter >= -1)).toBe(true);
  });

  it('plays a written note by its letter octave: B♯3 is middle C, C♭4 the B below it', () => {
    expect(midiOf(28, 0)).toBe(60);
    expect(midiOf(27, 1)).toBe(60);
    expect(midiOf(28, -1)).toBe(59);
    expect(scaleNotes({ key: 'C', type: 'major' })[0].midi).toBe(60);
  });
});

describe('scale ids and the circle', () => {
  it('names each scale by tonic and type, and reads the name back', () => {
    const ids = ALL_SCALES.map(scaleId);
    expect(new Set(ids).size).toBe(60);
    expect(scaleId({ key: 'D', type: 'major' })).toBe('D-major');
    expect(scaleId({ key: 'G', type: 'harmonic' })).toBe('E-harmonic');
    expect(scaleId({ key: 'Gb', type: 'natural' })).toBe('Eb-natural');
    for (const s of ALL_SCALES) expect(parseScaleId(scaleId(s))).toEqual(s);
    expect(parseScaleId('H-major')).toBeNull();
  });

  it('places the 15 keys on 12 positions, one sharp more clockwise, with three two-spelling positions at the bottom', () => {
    expect(CIRCLE).toHaveLength(12);
    expect(CIRCLE.flat().sort()).toEqual([...KEY_ORDER].sort());
    expect(CIRCLE.filter((p) => p.length === 2).map((p) => p.join('/'))).toEqual(['B/Cb', 'F#/Gb', 'Db/C#']);
    expect(circlePosition('C')).toBe(0);
    expect(circlePosition('G')).toBe(1);
    expect(circlePosition('Cb')).toBe(5);
    expect(circlePosition('F')).toBe(11);
    // Go round the circle: clockwise from C through the sharps, then the flats.
    expect(CIRCLE_ORDER).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
  });

  it('fills a major key by its stars and a minor key by its forms with ★★ or more', () => {
    const stars = { 'G-major': 3, 'E-natural': 2, 'E-harmonic': 3, 'E-melodic': 1, 'A-natural': 1 };
    expect(majorLevel(stars, 'G')).toBe(3);
    expect(majorLevel(stars, 'D')).toBe(0);
    expect(minorLevel(stars, 'G')).toBe(2);
    expect(minorLevel(stars, 'C')).toBe(0);
    expect(doneCounts(stars)).toEqual({ major: 1, minor: 2 });
  });
});

describe('the piano window (§3.7)', () => {
  it('starts on the tonic, or the white key below a black tonic, and holds the whole scale', () => {
    for (const s of ALL_SCALES) {
      const w = pianoWindow(s);
      expect(w.whites).toHaveLength(9);
      const keys = new Set([...w.whites, ...w.blacks.map((b) => b.midi)]);
      for (const n of scaleNotes(s, 'upDown')) expect(keys.has(n.midi)).toBe(true);
      const tonicMidi = scaleNotes(s)[0].midi;
      expect(w.whites[0] === tonicMidi || w.whites[0] === tonicMidi - 1).toBe(true);
    }
  });

  it('draws D major as on the board: D to E, six black keys', () => {
    const w = pianoWindow({ key: 'D', type: 'major' });
    expect(w.whites).toEqual([62, 64, 65, 67, 69, 71, 72, 74, 76]);
    expect(w.blacks).toEqual([
      { midi: 63, after: 1 },
      { midi: 66, after: 3 },
      { midi: 68, after: 4 },
      { midi: 70, after: 5 },
      { midi: 73, after: 7 },
      { midi: 75, after: 8 },
    ]);
  });

  it('starts F♯ major on the F below', () => {
    const key: KeyId = 'F#';
    expect(pianoWindow({ key, type: 'major' }).whites[0]).toBe(65);
  });
});
