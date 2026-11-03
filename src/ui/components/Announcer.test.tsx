// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce } from '../lib/announce';
import { ANNOUNCE_DELAY_MS, ANNOUNCE_KEEP_MS, Announcer } from './Announcer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Announcer', () => {
  it('is one polite live region, there (empty) before anything is said', () => {
    render(<Announcer />);
    const region = document.getElementById('announcer')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });

  it('says a text a moment after it is announced, the same text again too, and clears it later', () => {
    render(<Announcer />);
    const region = document.getElementById('announcer')!;
    act(() => announce('Your account was deleted.'));
    // The region's text changes after it is in the page: that change is what is read.
    expect(region.textContent).toBe('');
    act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    expect(region.textContent).toBe('Your account was deleted.');
    act(() => announce('Your account was deleted.'));
    expect(region.textContent).toBe('');
    act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    expect(region.textContent).toBe('Your account was deleted.');
    act(() => vi.advanceTimersByTime(ANNOUNCE_KEEP_MS));
    expect(region.textContent).toBe('');
  });

  it('words an announcement given as a function when it says it: in the language the app switched to meanwhile', () => {
    render(<Announcer />);
    const region = document.getElementById('announcer')!;
    let language = 'en';
    act(() => announce(() => (language === 'nl' ? 'Uitgelogd.' : 'Signed out.')));
    language = 'nl';
    act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS));
    expect(region.textContent).toBe('Uitgelogd.');
  });

  it('without an Announcer, announcing does nothing', () => {
    expect(() => announce('Signed out.')).not.toThrow();
  });
});
