// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { DEFAULT_SETTINGS } from '../../core/defaults';
import { exerciseHas } from '../../game/intro';
import { PREFS_KEY, PROGRESS_KEY } from '../../game/storage';
import { setLocale } from '../../i18n';
import { resetAccountCheck } from '../account';
import { PlayButton } from '../learn/Listen';
import { restoreRun, RUN_KEY, runSetup } from '../store';

// Phone width for useBreakpoint (a test may set another); the app scrolls to the top on every route, and a chapter to
// the section it opens at.
let width = 390;
window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? width >= Number(min[1]) : false;
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
  width = 390;
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

describe("Learn: a tablet's section chips", () => {
  /** A press of a mouse button on `el` and its click, `detail` the click's count within a double click (1, then 2). */
  const click = (el: Element, detail: number): void => {
    el.dispatchEvent(Object.assign(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }), { pointerType: 'mouse' }));
    fireEvent.mouseDown(el, { detail });
    fireEvent.mouseUp(el, { detail });
    fireEvent.click(el, { detail });
  };

  it("jump to a section, and a double click's second click does not answer the quick check the jump put under it", () => {
    width = 834;
    open('#/learn/10');
    const chip = within(document.querySelector('.learn-chips') as HTMLElement).getByRole('link', { name: /^10\.3 / });
    click(chip, 1);
    expect(window.location.hash).toBe('#/learn/10?s=10.3');
    // The jump scrolls 10.3 to the top, which puts its answer E♭ where the chip was.
    const answer = within(section('10.3')).getByRole('button', { name: 'E flat' });
    click(answer, 2);
    expect(answer.getAttribute('aria-pressed')).toBe('false');
    expect(section('10.3').querySelector('.nfeedback')).toBeNull();
    expect(localStorage.getItem(PROGRESS_KEY) ?? '').not.toContain('10.3');
    // A click of its own, after it, answers.
    click(answer, 1);
    expect(answer.getAttribute('aria-pressed')).toBe('true');
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

describe("Learn: a chapter's Practice button", () => {
  it('opens the circle from chapter 11, whose back arrow returns to the chapter; from Home it goes Home', () => {
    open('#/learn/11');
    expect(screen.getByRole('link', { name: 'Practice scales' }).getAttribute('href')).toBe('#/scales?from=11');
    cleanup();
    open('#/scales?from=11');
    expect(screen.getByRole('link', { name: 'Back to chapter 11' }).getAttribute('href')).toBe('#/learn/11?s=check');
    expect(screen.getByRole('link', { name: 'Options' }).getAttribute('href')).toBe('#/scales/setup?from=11');
    cleanup();
    open('#/scales');
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('#/');
    expect(screen.getByRole('link', { name: 'Options' }).getAttribute('href')).toBe('#/scales/setup');
  });
});

describe("Learn: a rhythm section's practice", () => {
  // newSeed's first seed, so a start that keeps it is one that did not look further.
  const seed = 12345;
  const stored = (): { seed: number; settings: { bars: number; ties: boolean }; shows?: string[] } => JSON.parse(sessionStorage.getItem(RUN_KEY) ?? 'null');
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
      (a as unknown as Uint32Array)[0] = seed * 2;
      return a;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks for 5.1's tie, and keeps that for Retry and Next after a reload on Play", async () => {
    open('#/learn/practice?s=5.1');
    await waitFor(() => expect(window.location.hash).toBe('#/play?from=5.1'));
    expect(stored().shows).toEqual(['ties']);
    expect(restoreRun()?.shows).toEqual(['ties']);
  });

  it("asks for 5.3's dotted eighth, where a dotted quarter has a dot too, and keeps that after a reload on Play", async () => {
    // A start seed whose exercise has a dot but no dotted eighth: the link once played it as it came.
    vi.mocked(crypto.getRandomValues).mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
      (a as unknown as Uint32Array)[0] = 22 * 2;
      return a;
    });
    open('#/learn/practice?s=5.3');
    await waitFor(() => expect(window.location.hash).toBe('#/play?from=5.3'));
    expect(stored().shows).toEqual(['dotted', 'dotted:eighth']);
    expect(stored().seed).not.toBe(22);
    // Rebuilt after a reload, the run still asks for it, so Next does too.
    const run = restoreRun()!;
    expect(exerciseHas(run.exercise, ['dotted:eighth'])).toBe(true);
    expect(run.shows).toEqual(['dotted', 'dotted:eighth']);
  });

  it('a reload on Play keeps every id a practice can ask for, and drops unknown ones', () => {
    const settings = { ...DEFAULT_SETTINGS, notes: ['quarter', 'eighth', 'sixteenth'], dotted: true };
    const shows = ['dotted', 'dotted:eighth', 'figure:eighth-pair', 'rest', 'note:sixteenth', 'tie', 'dotted:triplet', 7];
    sessionStorage.setItem(RUN_KEY, JSON.stringify({ settings, seed: 1, lessonId: null, daily: null, shows }));
    expect(restoreRun()?.shows).toEqual(['dotted', 'dotted:eighth', 'figure:eighth-pair', 'rest', 'note:sixteenth']);
  });

  it('plays 2 bars for the tie with Bars at 1, where no exercise has one, and the player keeps 1 bar', async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ lastSettings: { ...DEFAULT_SETTINGS, bars: 1 } }));
    open('#/learn/practice?s=5.1');
    await waitFor(() => expect(window.location.hash).toBe('#/play?from=5.1'));
    expect(stored()).toMatchObject({ settings: { bars: 2, ties: true }, shows: ['ties'] });
    const run = restoreRun()!;
    expect(exerciseHas(run.exercise, ['ties'])).toBe(true);
    // Only this run, also after a reload on Play: the setup saved, which Setup and the next start take, keeps 1 bar.
    expect(run.shows).toEqual(['ties']);
    expect(runSetup(run)).toMatchObject({ bars: 1, ties: true });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)!).lastSettings).toMatchObject({ bars: 1, ties: true }));
  });
});
