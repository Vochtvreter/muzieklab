import type { RoundNote } from '../../core/api';
import { setLocale } from '../../i18n';
import { feedbackText, fullName, hintText, keyPairName, keySignsText, positionText } from './noteText';

const note = (n: Partial<RoundNote>): RoundNote => ({ clef: 'treble', key: 'C', step: 34, alter: 0, sign: null, input: 'names', ...n });

describe('note and key names', () => {
  it('names notes with both systems, the chosen one first', () => {
    expect(fullName('F', 1)).toBe('F♯ (fa♯)');
    expect(fullName('F', 1, 'solfege')).toBe('fa♯ (F♯)');
  });

  it('names keys and their signatures', () => {
    expect(keyPairName('G')).toBe('G major · E minor');
    expect(keyPairName('Eb')).toBe('E♭ major · C minor');
    expect(keySignsText('C')).toBe('No sharps or flats');
    expect(keySignsText('G')).toBe('1 sharp: every F is F♯');
    expect(keySignsText('Bb')).toBe('2 flats: B♭, E♭');
  });
});

describe('positions and hints', () => {
  it('describes every position on and around the staff', () => {
    expect(positionText('treble', 30)).toBe('the bottom line');
    expect(positionText('treble', 38)).toBe('the top line');
    expect(positionText('treble', 37)).toBe('the top space');
    expect(positionText('treble', 29)).toBe('the space just below the staff');
    expect(positionText('treble', 39)).toBe('the space just above the staff');
    expect(positionText('treble', 28)).toBe('the first ledger line below');
    expect(positionText('treble', 27)).toBe('the space below the first ledger line');
    expect(positionText('bass', 30)).toBe('the second ledger line above');
    expect(positionText('bass', 31)).toBe('the space above the second ledger line');
  });

  it('points to the nearest landmark, and to the key signature when it changes the letter (§3.5)', () => {
    expect(hintText(note({ step: 29 }), 'letters')).toBe('The bottom line is E (mi). This note is one step lower.');
    // The landmark's name and the way to the note are two sentences: G above the staff does not read as F.
    expect(hintText(note({ step: 39 }), 'solfege')).toBe('The top line is fa (F). This note is one step higher.');
    expect(hintText(note({ clef: 'bass', step: 24 }), 'letters')).toBe("This is the F line between the clef's dots: F (fa).");
    expect(hintText(note({ step: 38, key: 'G', alter: 1 }), 'letters')).toBe('This is the top line: F (fa). Look at the sharp after the clef.');
    expect(hintText(note({ step: 28 }), 'solfege')).toBe('This is middle C: do (C).');
  });

  it('words the hint naturally in Dutch', () => {
    setLocale('nl');
    try {
      expect(hintText(note({ step: 39 }), 'solfege')).toBe('De bovenste lijn is fa (F). Deze noot ligt één stap hoger.');
      expect(hintText(note({ step: 33 }), 'letters')).toBe('De middelste lijn is B (si). Deze noot ligt één stap lager.');
    } finally {
      setLocale('en');
    }
  });
});

describe('feedback', () => {
  const fSharp = note({ step: 38, key: 'G', alter: 1 });
  it('explains right answers', () => {
    expect(feedbackText(fSharp, { kind: 'name', letter: 'F', alter: 1 }, true, 'letters')).toBe('Right: F♯ (fa♯). The key signature makes every F sharp.');
    expect(feedbackText(note({}), { kind: 'name', letter: 'B', alter: 0 }, true, 'letters')).toBe('Right: B (si).');
  });

  it('says why a wrong answer was wrong (the canvas wording)', () => {
    expect(feedbackText(fSharp, { kind: 'name', letter: 'F', alter: 0 }, false, 'letters')).toBe(
      'Right line, but G major has F♯ in the key signature: it is F♯ (fa♯).',
    );
    expect(feedbackText(fSharp, { kind: 'name', letter: 'E', alter: 0 }, false, 'solfege')).toBe('That was fa♯ (F♯): the top line, sharp from the key signature.');
    expect(feedbackText(fSharp, { kind: 'piano', pc: 5 }, false, 'letters')).toBe(
      'That was F♯ (fa♯): the top line is F, and the sharp in the key signature makes it F♯ (fa♯).',
    );
    expect(feedbackText(note({ step: 38, key: 'G', alter: 0, sign: 0 }), { kind: 'name', letter: 'F', alter: 1 }, false, 'letters')).toBe(
      'Right line, but mind the natural sign next to the note: it is F (fa).',
    );
    expect(feedbackText(note({}), { kind: 'name', letter: 'B', alter: -1 }, false, 'letters')).toBe('Right line, but there is no sign: it is B (si).');
    expect(feedbackText(note({}), null, false, 'letters')).toBe("Time's up: it was B (si), the middle line.");
  });
});
