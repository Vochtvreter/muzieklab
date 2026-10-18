import { KEYS, KEY_ORDER, keyAlter, keySigns, letterOf, octaveOf, pitchClass, rangeSteps, signShown, staffOffset } from './pitch';

describe('staff positions', () => {
  it('numbers steps so middle C is C4 and the staves start on E4 and G2', () => {
    expect(letterOf(28)).toBe('C');
    expect(octaveOf(28)).toBe(4);
    expect(letterOf(30)).toBe('E');
    expect(letterOf(18)).toBe('G');
    expect(octaveOf(18)).toBe(2);
    expect(staffOffset('treble', 38)).toBe(8); // F5, the top line
  });

  it('reads the treble lines E G B D F and spaces F A C E, the bass lines G B D F A and spaces A C E G (§8.2, §8.3)', () => {
    const lines = (bottom: number) => [0, 2, 4, 6, 8].map((o) => letterOf(bottom + o)).join('');
    const spaces = (bottom: number) => [1, 3, 5, 7].map((o) => letterOf(bottom + o)).join('');
    expect(lines(30)).toBe('EGBDF');
    expect(spaces(30)).toBe('FACE');
    expect(lines(18)).toBe('GBDFA');
    expect(spaces(18)).toBe('ACEG');
  });

  it('allows 11, 15 or 19 positions per clef (§3.5 Range)', () => {
    for (const clef of ['treble', 'bass'] as const) {
      expect(rangeSteps(clef, 'staff')).toHaveLength(11);
      expect(rangeSteps(clef, 'ledger1')).toHaveLength(15);
      expect(rangeSteps(clef, 'ledger2')).toHaveLength(19);
    }
    // Treble, on the staff: D4 (space below) to G5 (space above). +1 ledger line reaches middle C and A5 and beyond.
    expect(rangeSteps('treble', 'staff')[0]).toBe(29);
    expect(rangeSteps('treble', 'staff').at(-1)).toBe(39);
    expect(rangeSteps('treble', 'ledger1')).toContain(28);
    expect(rangeSteps('bass', 'ledger1')).toContain(28);
  });
});

describe('key signatures', () => {
  it('has the 15 standard keys, C first and sharps beside flats by count', () => {
    expect(KEY_ORDER).toHaveLength(15);
    expect(new Set(KEY_ORDER).size).toBe(15);
    const counts = KEY_ORDER.map((k) => Math.abs(KEYS[k].fifths));
    expect(counts).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  });

  it('adds sharps F C G D A E B and flats B E A D G C F', () => {
    expect(keySigns('C#').map((s) => s.letter).join('')).toBe('FCGDAEB');
    expect(keySigns('Cb').map((s) => s.letter).join('')).toBe('BEADGCF');
    expect(keySigns('D').map((s) => s.letter).join('')).toBe('FC');
    expect(keySigns('C')).toEqual([]);
  });

  it('names the major key a half step above the last sharp, and by the second-to-last flat (Learn 10.3)', () => {
    for (const id of KEY_ORDER) {
      const key = KEYS[id];
      const signs = keySigns(id);
      if (key.fifths < -1) expect(signs.at(-2)).toEqual(key.major);
      if (key.fifths > 0) {
        const last = signs.at(-1)!;
        expect((pitchClass(last.letter, last.alter) + 1) % 12).toBe(pitchClass(key.major.letter, key.major.alter));
      }
      // The tonic is spelled with the key's own sign, and the relative minor is a minor third below.
      expect(keyAlter(id, key.major.letter)).toBe(key.major.alter);
      expect((pitchClass(key.major.letter, key.major.alter) - pitchClass(key.minor.letter, key.minor.alter) + 12) % 12).toBe(3);
    }
  });

  it('makes every F sharp in G major, in every octave, without a sign next to it', () => {
    expect(keyAlter('G', 'F')).toBe(1);
    expect(keyAlter('G', 'C')).toBe(0);
    expect(signShown('G', { step: 38, alter: 1 })).toBeNull(); // F♯5
    expect(signShown('G', { step: 31, alter: 1 })).toBeNull(); // F♯4
    expect(signShown('G', { step: 38, alter: 0 })).toBe(0); // F♮ needs a natural sign
    expect(signShown('C', { step: 38, alter: 1 })).toBe(1);
  });

  it('plays C♭ on B and E♯ on F', () => {
    expect(pitchClass('C', -1)).toBe(11);
    expect(pitchClass('E', 1)).toBe(5);
    expect(pitchClass('F', 1)).toBe(pitchClass('G', -1));
  });
});
