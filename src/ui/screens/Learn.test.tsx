// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { PREFS_KEY, PROGRESS_KEY } from '../../game/storage';
import { setLocale } from '../../i18n';
import { resetAccountCheck } from '../account';
import { PlayButton } from '../learn/Listen';

// Phone width for useBreakpoint; the app scrolls to the top on every route, and a chapter to the section it opens at.
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
Element.prototype.scrollIntoView = () => undefined;

const open = (hash: string): void => {
  window.location.hash = hash;
  render(<App />);
};
const section = (id: string): HTMLElement => document.getElementById('s' + id.replace('.', '-'))!;
const said = (): string => document.getElementById('announcer')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
});

describe('Learn: the quick check', () => {
  it('names a note answer as it is said, F sharp and not the sign: the piano and Read notes do too', () => {
    open('#/learn/9?s=9.4');
    const check = within(section('9.4'));
    expect(check.getByRole('button', { name: 'F sharp' }).textContent).toBe('F♯');
    expect(check.getByRole('button', { name: 'F flat' }).textContent).toBe('F♭');
    expect(check.getByRole('button', { name: 'F' }).textContent).toBe('F');
    cleanup();

    localStorage.setItem(PREFS_KEY, JSON.stringify({ language: 'nl' }));
    open('#/learn/9?s=9.4');
    expect(within(section('9.4')).getByRole('button', { name: 'fis' }).textContent).toBe('F♯');
  });

  it("says the staff's notes the same way", () => {
    open('#/learn/11?s=11.4');
    expect(within(section('11.4')).getByRole('img', { name: 'Treble staff with A harmonic minor: A, B, C, D, E, F, G sharp, A' })).toBeTruthy();
  });

  it("reads out what a pick means through the app's live region, not a status inserted with its text", async () => {
    open('#/learn/2?s=2.1');
    const check = screen.getByRole('group', { name: /^A filled note head with a stem and two flags/ });
    fireEvent.click(within(check).getByRole('button', { name: 'An eighth (½ beat)' }));
    expect(within(check).queryByRole('status')).toBeNull();
    expect(check.querySelector('.nfeedback')?.textContent).toMatch(/^Not quite\. Start from the quarter note/);
    await waitFor(() => expect(said()).toMatch(/^Not quite\. Start from the quarter note/));

    fireEvent.click(within(check).getByRole('button', { name: 'A sixteenth (¼ beat)' }));
    expect(within(check).queryByRole('status')).toBeNull();
    await waitFor(() => expect(said()).toMatch(/^Right\. Each flag halves the note/));
  });
});

describe("Learn: the examples' play buttons", () => {
  it('each name their example, so a list of the buttons tells them apart', () => {
    open('#/learn/4');
    const names = [...document.querySelectorAll('.learn-play')].map((b) => b.getAttribute('aria-label'));
    expect(names).toHaveLength(6);
    expect(new Set(names).size).toBe(names.length);
    // By the example's title, or what its notation shows when it has none.
    expect(names).toContain('Play: One beam per beat: the usual way');
    expect(names).toContain('Play: A bar of 4/4: four eighths counted 1 & 2 &, then quarter notes on 3 and 4');
  });

  it('say which example they stop', () => {
    render(<PlayButton on name="Whole note" onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Stop: Whole note' })).toBeTruthy();
  });
});

describe('Learn: a practice link opened in a new tab', () => {
  it('is not taken over by a Ctrl or Cmd click: the browser opens it in a new tab', () => {
    open('#/learn/4');
    const link = screen.getByRole('link', { name: 'Practice eighths →' });
    expect(link.getAttribute('href')).toBe('#/learn/practice?s=4.1');
    // fireEvent is false when the click's default was prevented.
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
  });

  it("starts the section's practice there, as a click does: an exercise with its preset, Quit returning to it", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ seenHowTo: true, seenHold: true }));
    open('#/learn/practice?s=4.1');
    await waitFor(() => expect(window.location.hash).toBe('#/play?from=4.1'));
    expect(screen.getByRole('link', { name: 'Quit exercise' }).getAttribute('href')).toBe('#/learn/4?s=4.1');
    const played = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}').lastSettings;
    expect(played.notes).toEqual(['half', 'quarter', 'eighth']);
    expect(played.rests).toEqual(['quarter', 'eighth']);
    // No tap led here, so the sound may not start: Play waits on Ready · Start, as after a reload.
    const ready = screen.getByRole('dialog', { name: 'Ready?' });
    expect(within(ready).getByRole('button', { name: /^Start/ })).toBeTruthy();
  });

  it('a Read notes round, or the Scales setup with its preset', async () => {
    open('#/learn/practice?s=8.2');
    await waitFor(() => expect(window.location.hash).toBe('#/notes/play?from=8.2'));
    cleanup();
    open('#/learn/practice?s=11.2');
    await waitFor(() => expect(window.location.hash).toBe('#/scales/setup?from=11.2'));
    expect(screen.getByRole('button', { name: 'Start · 2 scales' })).toBeTruthy();
  });

  it('goes to the Learn tab for a section that is not there', async () => {
    open('#/learn/practice?s=4.9');
    await waitFor(() => expect(window.location.hash).toBe('#/learn'));
  });
});
