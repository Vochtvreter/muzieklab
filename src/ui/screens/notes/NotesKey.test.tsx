// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_SETTINGS, type KeyId } from '../../../core/api';
import { defaultProgress, PROGRESS_KEY } from '../../../game/storage';
import { setLocale } from '../../../i18n';
import { StoreProvider } from '../../store';
import { NotesKey } from './NotesKey';
import { NotesSetup } from './NotesSetup';

// The screen's width for useBreakpoint: a tablet, where the chosen key's big staff shows above the summary too.
window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? 834 >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

/** An element's words as shown (without what is there for screen readers only), and as a screen reader hears them. */
const without = (el: Element, selector: string): string => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(selector).forEach((x) => x.remove());
  return copy.textContent ?? '';
};
const seen = (el: Element): string => without(el, '.sr-only');
const heard = (el: Element): string => without(el, '[aria-hidden="true"]');
const SIGNS = /[♯♭]/;

/** A screen with the Read notes setup in `key`. */
function show(screenEl: JSX.Element, key: KeyId = 'C'): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...defaultProgress(), notes: { settings: { ...DEFAULT_NOTE_SETTINGS, keys: [key] }, weak: {} } }));
  render(<StoreProvider>{screenEl}</StoreProvider>);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  setLocale('en');
  window.location.hash = '';
});

describe('Read notes Key screen for screen readers', () => {
  it('names every key in words, as Scales does: no ♯ or ♭', () => {
    show(<NotesKey />);
    const keys = within(screen.getByRole('group', { name: 'Keys' })).getAllByRole('button');
    expect(keys).toHaveLength(15);
    for (const b of keys) expect(b.getAttribute('aria-label')).not.toMatch(SIGNS);
    const fs = screen.getByRole('button', { name: 'F sharp major or D sharp minor, 6 sharps' });
    // The button still shows the names as written.
    expect(fs.textContent).toBe('F♯ majorD♯ minor');
    screen.getByRole('button', { name: 'G flat major or E flat minor, 6 flats' });
    screen.getByRole('button', { name: 'C major or A minor, no sharps or flats' });
  });

  it('says the chosen key and its signature in words, and shows them as written', () => {
    show(<NotesKey />);
    fireEvent.click(screen.getByRole('button', { name: 'F sharp major or D sharp minor, 6 sharps' }));
    const summary = document.querySelector('.key-summary')!;
    expect(summary.getAttribute('aria-live')).toBe('polite');
    expect(heard(summary)).toBe(
      'F sharp major or D sharp minor. The key signature makes every F, C, G, D, A, E into F sharp, C sharp, G sharp, D sharp, A sharp, E sharp, in every octave, without a sign next to the note.',
    );
    expect(seen(summary)).toBe('F♯ major or D♯ minor. The key signature makes every F, C, G, D, A, E into F♯, C♯, G♯, D♯, A♯, E♯, in every octave, without a sign next to the note.');
    const use = screen.getByRole('button', { name: 'Use F sharp major' });
    expect(use.textContent).toBe('Use F♯ major');
  });

  it('speaks Dutch key names as Scales does', () => {
    setLocale('nl');
    show(<NotesKey />);
    for (const b of within(screen.getByRole('group', { name: 'Toonsoorten' })).getAllByRole('button')) expect(b.getAttribute('aria-label')).not.toMatch(SIGNS);
    fireEvent.click(screen.getByRole('button', { name: 'fis majeur of dis mineur, 6 kruisen' }));
    screen.getByRole('button', { name: 'Kies fis majeur' });
    fireEvent.click(screen.getByRole('button', { name: 'bes majeur of G mineur, 2 mollen' }));
    expect(heard(document.querySelector('.key-summary')!)).toBe(
      'bes majeur of G mineur. Door de voortekening wordt elke B, E een bes, es, in elk octaaf, zonder teken voor de noot.',
    );
    screen.getByRole('button', { name: 'Kies bes majeur' });
  });
});

describe('Read notes setup for screen readers', () => {
  it('names the key in words on its row', () => {
    show(<NotesSetup />, 'F#');
    const row = screen.getByRole('link', { name: 'Key: F sharp major · D sharp minor, 6 sharps: F sharp, C sharp, G sharp, D sharp, A sharp, E sharp. Change key' });
    expect(row.textContent).toBe('F♯ major · D♯ minor6 sharps: F♯, C♯, G♯, D♯, A♯, E♯');
  });

  it('in Dutch too', () => {
    setLocale('nl');
    show(<NotesSetup />, 'F');
    screen.getByRole('link', { name: 'Toonsoort: F majeur · D mineur, 1 mol: elke B is een bes. Toonsoort wijzigen' });
  });
});
