// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { DEFAULT_SETTINGS } from '../../core/defaults';
import { PREFS_KEY, PROGRESS_KEY } from '../../game/storage';
import { resetAccountCheck } from '../account';

// Phone width for useBreakpoint; the app scrolls to the top on every route.
window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? 390 >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }) as unknown as MediaQueryList;
window.scrollTo = () => undefined;

const said = (): string => document.getElementById('announcer')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(PREFS_KEY, JSON.stringify({ seenHowTo: true, seenHold: true }));
  resetAccountCheck();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('Practice setup: its hints', () => {
  it("are read out through the app's live region when a change brings them, not as a status inserted with its text", async () => {
    window.location.hash = '#/setup';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Half note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quarter note' }));
    const box = document.querySelector('.hint-box')!;
    expect(box.textContent).toBe('Turn on at least one note value to play');
    expect(box.getAttribute('role')).toBeNull();
    await waitFor(() => expect(said()).toBe('Turn on at least one note value to play'));
  });

  it('are not read out again when the setup opens with them: they are read with the page', async () => {
    // Half notes and no rests, in 3/4 too: a hint is there from the start.
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ lessons: {}, practiceDays: [], lastSettings: { ...DEFAULT_SETTINGS, notes: ['half'], rests: [], meters: ['4/4', '3/4'] } }));
    window.location.hash = '#/setup';
    render(<App />);
    expect(document.querySelector('.hint-box')?.textContent).toBe('3/4 needs a quarter note, quarter rest or dotted half');
    await new Promise((r) => setTimeout(r, 300));
    expect(said()).not.toContain('3/4');
    // A change that brings another one is read out.
    fireEvent.click(screen.getByRole('button', { name: 'Half note' }));
    await waitFor(() => expect(said()).toBe('Turn on at least one note value to play'));
  });

  it('are read as sentences of their own when a change brings two, as each is a line of its own', async () => {
    // Whole and half notes in 2/4, 3/4 and 4/4: with the half note off, 2/4 and 3/4 cannot be filled.
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ lessons: {}, practiceDays: [], lastSettings: { ...DEFAULT_SETTINGS, notes: ['whole', 'half'], rests: [], meters: ['2/4', '3/4', '4/4'] } }));
    window.location.hash = '#/setup';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Half note' }));
    const lines = [...document.querySelectorAll('.hint-box > span')].map((el) => el.textContent ?? '');
    expect(lines.map((line) => line.slice(0, 9))).toEqual(['2/4 needs', '3/4 needs']);
    await waitFor(() => expect(said()).toBe(lines.join('. ')));
  });
});
