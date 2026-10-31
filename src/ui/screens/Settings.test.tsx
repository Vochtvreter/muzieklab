// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setLocale } from '../../i18n';
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

/** One frame: focus that goes back to a button once it is there again. */
const frame = (): Promise<void> => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  window.location.hash = '#/settings';
  // No API: Settings without its Account section.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
});

describe('Settings → Reset progress', () => {
  it('closes on Escape and on Cancel, with the focus back on the row button (DESIGN.md, Destructive confirm)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset progress' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Erase all progress?' });
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await frame();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset progress' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset progress' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await frame();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset progress' }));
  });

  it('after Reset, the focus goes to the About heading, not the page: the button and the row button are gone', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset progress' }));
    const reset = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' });
    reset.focus();
    fireEvent.click(reset);
    expect(screen.getByText('Progress was reset.')).toBeTruthy();
    await frame();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'About' }));
  });
});

describe('Settings → Language', () => {
  it('names each language in its own language (lang), so a screen reader says it in that voice', async () => {
    render(<App />);
    const group = await screen.findByRole('group', { name: 'App language' });
    expect(within(group).getByRole('button', { name: 'English' }).getAttribute('lang')).toBe('en');
    expect(within(group).getByRole('button', { name: 'Nederlands' }).getAttribute('lang')).toBe('nl');
  });

  it('keeps the focus on the language control: the switch remounts the screen', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nederlands' }));
    await screen.findByRole('heading', { level: 1, name: 'Instellingen' });
    const nl = within(screen.getByRole('group', { name: 'Taal van de app' })).getByRole('button', { name: 'Nederlands' });
    expect(document.activeElement).toBe(nl);
    fireEvent.click(within(screen.getByRole('group', { name: 'Taal van de app' })).getByRole('button', { name: 'English' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(document.activeElement).toBe(within(screen.getByRole('group', { name: 'App language' })).getByRole('button', { name: 'English' }));
  });

  it('the language control takes no focus when nothing remounted: the language in use, picked again, then Settings opened later (its heading has it)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'English' }));
    act(() => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await screen.findByRole('link', { name: 'Settings' });
    act(() => {
      window.location.hash = '#/settings';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    // A new screen's own focus, on its heading (App.tsx), not the language control.
    expect(document.activeElement).toBe(await screen.findByRole('heading', { level: 1, name: 'Settings' }));
  });

  it('a language from elsewhere (another tab, the account) remounts the screen too: its heading takes the focus that went', async () => {
    render(<App />);
    const light = within(await screen.findByRole('group', { name: 'Color theme' })).getByRole('button', { name: 'Light' });
    light.focus();
    act(() => {
      localStorage.setItem('muzieklab.prefs.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('muzieklab.prefs.v1') ?? '{}'), language: 'nl' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'muzieklab.prefs.v1' }));
    });
    expect(document.activeElement).toBe(await screen.findByRole('heading', { level: 1, name: 'Instellingen' }));
  });
});

describe('Settings → Language, picked in another tab while an exercise is played', () => {
  it('waits until its screen is left, so the exercise does not start over; then the next screen is in that language', async () => {
    window.location.hash = '#/calibrate';
    render(<App />);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Calibrate timing' });
    act(() => {
      localStorage.setItem('muzieklab.prefs.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('muzieklab.prefs.v1') ?? '{}'), language: 'nl' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'muzieklab.prefs.v1' }));
    });
    // The same screen, not a new one in Dutch.
    expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
    expect(document.documentElement.lang).toBe('en');
    act(() => {
      window.location.hash = '#/settings';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(document.activeElement).toBe(await screen.findByRole('heading', { level: 1, name: 'Instellingen' }));
    expect(document.documentElement.lang).toBe('nl');
  });
});
