import type { RoundNote } from '../../core/api';
import { setLocale } from '../../i18n';
import { feedbackText, fullName, hearFeedback, hearHint, hintText, keyPairName, keySignsText, positionText, writeFeedback } from './noteText';

const note = (n: Partial<RoundNote>): RoundNote => ({ clef: 'treble', key: 'C', step: 34, alter: 0, sign: null, input: 'names', task: 'read', ...n });

describe('note and key names', () => {
  it('names notes with both systems, the chosen one first', () => {
    expect(fullName('F', 1)).toBe('F♯ (fa♯)');
    expect(fullName('F', 1, 'solfege')).toBe('fa♯ (F♯)');
  });

  it('names keys and their signatures', () => {
    expect(keyPairName('G')).toBe('G\u00a0major · E\u00a0minor');
    expect(keyPairName('Eb')).toBe('E♭\u00a0major · C\u00a0minor');
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
      'Right line, but G\u00a0major has F♯ in the key signature: it is F♯ (fa♯).',
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

  it('says "het kruis" and "het herstellingsteken" in Dutch, and "de mol"', () => {
    setLocale('nl');
    try {
      expect(feedbackText(fSharp, { kind: 'piano', pc: 5 }, false, 'letters')).toBe(
        'Dat was F♯ (fa♯): de bovenste lijn is F, en met het kruis in de voortekening wordt het F♯ (fa♯).',
      );
      expect(feedbackText(note({ alter: 1, sign: 1 }), { kind: 'piano', pc: 11 }, false, 'letters')).toBe(
        'Dat was B♯ (si♯): de middelste lijn is B, en met het kruis ervoor wordt het B♯ (si♯).',
      );
      expect(feedbackText(note({ alter: 1, sign: 1 }), { kind: 'name', letter: 'B', alter: 0 }, false, 'letters')).toBe(
        'Juiste lijn, maar let op het kruis voor de noot: het is B♯ (si♯).',
      );
      expect(feedbackText(note({ step: 38, key: 'G', alter: 0, sign: 0 }), { kind: 'name', letter: 'F', alter: 1 }, false, 'letters')).toBe(
        'Juiste lijn, maar let op het herstellingsteken voor de noot: het is F (fa).',
      );
      expect(feedbackText(note({ alter: -1, sign: -1 }), { kind: 'name', letter: 'B', alter: 0 }, false, 'letters')).toBe(
        'Juiste lijn, maar let op de mol voor de noot: het is B♭ (si♭).',
      );
      expect(feedbackText(note({ alter: -1, sign: -1 }), { kind: 'piano', pc: 11 }, false, 'letters')).toBe(
        'Dat was B♭ (si♭): de middelste lijn is B, en met de mol ervoor wordt het B♭ (si♭).',
      );
    } finally {
      setLocale('en');
    }
  });
});

describe('writing and hearing (path lessons)', () => {
  const la = note({ step: 33, task: 'write' });
  it('says where a written note goes, and where it went', () => {
    expect(writeFeedback(la, { kind: 'place', step: 33 }, true, 'solfege')).toBe('Right: la (A) is on the 2nd space.');
    expect(writeFeedback(la, { kind: 'place', step: 32 }, false, 'solfege')).toBe('You wrote sol (G), on the 2nd line; la (A) goes on the 2nd space.');
    expect(writeFeedback(la, null, false, 'letters')).toBe("Time's up: it was A (la), the 2nd space.");
  });

  it('says so when the note is written an octave off, not that it was another note', () => {
    // The staff has a second G, E, F and D: the right letter in the other octave is still not the place asked for.
    expect(writeFeedback(note({ step: 32, task: 'write' }), { kind: 'place', step: 39 }, false, 'solfege')).toBe(
      'Right note, wrong octave: write the lower sol (G), on the 2nd line.',
    );
    expect(writeFeedback(note({ step: 36, task: 'write' }), { kind: 'place', step: 29 }, false, 'letters')).toBe(
      'Right note, wrong octave: write the higher D (re), on the 4th line.',
    );
    setLocale('nl');
    try {
      expect(writeFeedback(note({ step: 30, task: 'write' }), { kind: 'place', step: 37 }, false, 'solfege')).toBe(
        'Juiste noot, verkeerd octaaf: schrijf de lagere mi (E), op de onderste lijn.',
      );
    } finally {
      setLocale('en');
    }
  });

  it('places a heard note from sol, the reference', () => {
    const mi = note({ step: 30, task: 'hear' });
    expect(hearFeedback(mi, { kind: 'name', letter: 'E', alter: 0 }, true, 'solfege')).toBe('Right: mi (E), 2 steps below sol.');
    expect(hearFeedback(la, { kind: 'name', letter: 'G', alter: 0 }, false, 'letters')).toBe('That was A (la), one step above G.');
    expect(hearFeedback(note({ step: 32 }), null, false, 'solfege')).toBe("Time's up: it was sol (G), the same as sol.");
    expect(hearHint(mi, 'solfege')).toBe('Hint: it is 2 steps below sol.');
  });

  it('words the hint and the feedback for a heard sol naturally in Dutch', () => {
    setLocale('nl');
    try {
      expect(hearHint(note({ step: 32, task: 'hear' }), 'solfege')).toBe('Hint: hij ligt even hoog als sol.');
      expect(hearHint(note({ step: 30, task: 'hear' }), 'solfege')).toBe('Hint: hij ligt 2 stappen onder sol.');
      expect(hearFeedback(note({ step: 32, task: 'hear' }), null, false, 'solfege')).toBe('De tijd is om: het was sol (G), even hoog als sol.');
    } finally {
      setLocale('en');
    }
  });
});
