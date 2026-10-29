import { describe, expect, it } from 'vitest';
import { scaleNotes } from '../../core/api';
import { setLocale } from '../../i18n';
import { keyName, keySpoken, noteName, noteSpoken } from './scaleText';

// G♯ harmonic minor (key B): its 7th is F𝄪, which a screen reader reads as a symbol or skips (it would sound like F).
const notes = scaleNotes({ key: 'B', type: 'harmonic' });

describe('names for screen readers', () => {
  it('says a note and a key as they are said, where the screen shows the signs', () => {
    expect(notes.map(noteName)).toEqual(['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E', 'F𝄪', 'G♯']);
    expect(notes.map(noteSpoken)).toEqual(['G sharp', 'A sharp', 'B', 'C sharp', 'D sharp', 'E', 'F double sharp', 'G sharp']);
    expect(keyName('B', true)).toBe('G♯ minor');
    expect(keySpoken('B', true)).toBe('G sharp minor');
    expect(keySpoken('Cb', false)).toBe('C flat major');
  });

  it('says them in Dutch as Dutch says them (fisis, gis mineur)', () => {
    setLocale('nl');
    try {
      expect(noteSpoken(notes[6])).toBe('fisis');
      expect(keySpoken('B', true)).toBe('gis mineur');
      expect(keySpoken('Cb', false)).toBe('ces majeur');
    } finally {
      setLocale('en');
    }
  });
});
