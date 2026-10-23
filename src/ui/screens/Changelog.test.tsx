// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { RELEASES } from '../lib/changelog';
import { Changelog } from './Changelog';

// The screen's width for useBreakpoint: phone unless a test sets it (the hook keeps one MediaQueryList per query).
let width = 390;
window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? width >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

afterEach(() => {
  cleanup();
  setLocale('en');
  width = 390;
});

const release = (version: string): HTMLElement => screen.getByRole('button', { name: new RegExp('^' + version.replace(/\./g, '\\.')) });
const readNotes = RELEASES.find((r) => r.version === '0.3.0')!;

describe("What's new", () => {
  it('shows the latest release on its own card, and a way back to Settings', () => {
    render(<Changelog />);
    expect(screen.getByRole('heading', { level: 1, name: "What's new" })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Made for tablets and computers' })).toBeTruthy();
    expect(within(screen.getByRole('article')).getByText('Oct 23 · 1 new · 4 better')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to settings' }).getAttribute('href')).toBe('#/settings');
  });

  it('opens one earlier release at a time; an opened release keeps its Try link', () => {
    render(<Changelog />);
    expect(release(RELEASES[1].version).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(release('0.3.0'));
    expect(release('0.3.0').getAttribute('aria-expanded')).toBe('true');
    expect(release(RELEASES[1].version).getAttribute('aria-expanded')).toBe('false');
    expect(release('0.3.0').textContent).toContain('Oct 18 · 4 new · 1 better');
    expect(screen.getByRole('link', { name: 'Try Read notes' }).getAttribute('href')).toBe('#' + readNotes.action!.to);
    fireEvent.click(release('0.2.0'));
    expect(release('0.2.0').getAttribute('aria-expanded')).toBe('true');
    expect(release('0.3.0').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(release('0.2.0'));
    expect(release('0.2.0').getAttribute('aria-expanded')).toBe('false');
  });

  it('Fixes keeps only releases with fixes, and only their fixes', () => {
    render(<Changelog />);
    fireEvent.click(screen.getByRole('button', { name: 'Fixes' }));
    expect(screen.queryByRole('heading', { name: 'A quick check after every section' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^0\.3\.0/ })).toBeNull();
    expect(release('0.3.1').textContent).toContain('Oct 18 · 2 fixed');
    expect(release('0.2.1').textContent).toContain('Oct 17 · 1 fixed');
    expect(release('0.1.0').textContent).toContain('Oct 17 · 1 fixed');
  });

  it('reads in Dutch, with Dutch dates', () => {
    setLocale('nl');
    render(<Changelog />);
    expect(screen.getByRole('heading', { level: 1, name: 'Wat is er nieuw' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Gemaakt voor tablets en computers' })).toBeTruthy();
    expect(within(screen.getByRole('article')).getByText('23 okt · 1 nieuw · 4 beter')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terug naar instellingen' })).toBeTruthy();
  });

  it('on a tablet keeps the timeline and puts a chip on each change of the latest release', () => {
    width = 834;
    render(<Changelog />);
    const card = screen.getByRole('article');
    expect(within(card).getAllByText('New')).toHaveLength(1);
    expect(within(card).getAllByText('Better')).toHaveLength(4);
    expect(release(RELEASES[1].version).getAttribute('aria-expanded')).toBe('true');
  });

  it('on a computer lists every release on the left and shows the chosen one beside it', () => {
    width = 1280;
    render(<Changelog />);
    const list = screen.getByRole('navigation', { name: 'Releases' });
    expect(within(list).getAllByRole('button')).toHaveLength(RELEASES.length);
    expect(release(RELEASES[0].version).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('heading', { level: 2, name: 'Made for tablets and computers' })).toBeTruthy();
    expect(within(screen.getByRole('article')).getByText('October 23, 2026 · 1 new · 4 better')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to settings' }).getAttribute('href')).toBe('#/settings');
    expect(screen.queryByRole('button', { name: /^Newer/ })).toBeNull();

    fireEvent.click(release('0.3.0'));
    expect(release('0.3.0').getAttribute('aria-current')).toBe('true');
    expect(release(RELEASES[0].version).getAttribute('aria-current')).toBeNull();
    const card = screen.getByRole('article');
    expect(within(card).getByRole('heading', { level: 2, name: 'Read notes' })).toBeTruthy();
    expect(within(card).getByText('Release')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Try Read notes' }).getAttribute('href')).toBe('#' + readNotes.action!.to);

    fireEvent.click(screen.getByRole('button', { name: /^Older 0\.2\.2/ }));
    expect(within(screen.getByRole('article')).getByText('Fix release')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Newer 0\.3\.0/ }));
    expect(release('0.3.0').getAttribute('aria-current')).toBe('true');
  });
});
