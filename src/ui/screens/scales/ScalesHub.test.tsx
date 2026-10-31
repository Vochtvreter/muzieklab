// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SCALE_SETTINGS, type ScaleSettings, type ScaleStars } from '../../../core/api';
import { defaultProgress, loadProgress, PROGRESS_KEY } from '../../../game/storage';
import { setLocale } from '../../../i18n';
import { StoreProvider } from '../../store';
import { ScalesHub } from './ScalesHub';

// The screen's width for useBreakpoint: a phone, unless a test sets a desktop.
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

/**
 * What a screen reader hears of an element, roughly: its words without what is hidden from it, and an element named
 * with aria-label (a list, an image) by that name.
 */
const heard = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
  copy.querySelectorAll('[aria-label]').forEach((x) => x.replaceWith(x.getAttribute('aria-label') + ' '));
  return copy.textContent ?? '';
};
/** What is shown, without the words for screen readers only. */
const seen = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((x) => x.remove());
  return copy.textContent ?? '';
};
const SIGNS = /[♯♭]/;

/** The hub with this Scales setup and these stars, as a page load (or a reload) finds them saved. */
function show(settings: Partial<ScaleSettings> = {}, stars: ScaleStars = {}): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...defaultProgress(), scales: { settings: { ...DEFAULT_SCALE_SETTINGS, ...settings }, stars } }));
  render(
    <StoreProvider>
      <ScalesHub />
    </StoreProvider>,
  );
}
const reload = (): void => {
  cleanup();
  render(
    <StoreProvider>
      <ScalesHub />
    </StoreProvider>,
  );
};
const selected = (): HTMLElement => screen.getByRole('region', { name: 'Selected key' });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  setLocale('en');
  width = 390;
});

// A screen reader reads a sign as a symbol or skips it: F♯ major would be "F major". The circle's keys and the notes
// said it in words, but the title, the relative key, Practice and the key signature's letters gave the signs.
describe('Scales hub: the selected key for screen readers', () => {
  it('says its name, its relative key, Practice and the signature in words, and shows them with their signs (desktop)', () => {
    width = 1280;
    show({ keys: ['F#'] });
    const title = screen.getByRole('heading', { level: 2, name: 'F sharp\u00a0major' });
    expect(seen(title)).toBe('F♯\u00a0major');
    const sub = selected().querySelector('.hub-sel-head > span')!;
    expect(heard(sub)).toMatch(/^Relative minor: D sharp\u00a0minor · (click|tap) again for G flat\u00a0major$/);
    expect(seen(sub)).toMatch(/^Relative minor: D♯\u00a0minor · (click|tap) again for G♭\u00a0major$/);
    const practice = screen.getByRole('button', { name: 'Practice F sharp\u00a0major' });
    expect(seen(practice)).toBe('Practice F♯\u00a0major');
    expect(seen(selected().querySelector('.hub-sig-foot')!)).toBe('6 sharpsF♯ C♯ G♯ D♯ A♯ E♯');
    expect(heard(selected())).not.toMatch(SIGNS);
  });

  it('on a phone too, for a minor key, and in Dutch', () => {
    show({ keys: ['E'] });
    fireEvent.click(within(screen.getByRole('group', { name: 'Major or minor' })).getByRole('button', { name: 'Minor' }));
    expect(screen.getByRole('button', { name: 'Practice C sharp\u00a0minor' })).toBeTruthy();
    expect(heard(selected())).not.toMatch(SIGNS);
    expect(seen(selected().querySelector('.hub-panel-title')!)).toBe('C♯\u00a0minorRelative major: E\u00a0major');
    cleanup();

    setLocale('nl');
    show({ keys: ['F#'] });
    expect(screen.getByRole('button', { name: 'Oefen fis\u00a0majeur' })).toBeTruthy();
    expect(heard(screen.getByRole('region', { name: 'Gekozen toonsoort' }))).not.toMatch(SIGNS);
  });
});

// A phone shows one row of stars for a minor key: how many of its three forms have two stars or more, as the circle
// fills the key. It was read as the key's rating ("No stars yet" with a star on every form).
describe('Scales hub on a phone: the stars of a minor key', () => {
  const minor = (stars: ScaleStars): HTMLElement => {
    show({ keys: ['E'] }, stars);
    fireEvent.click(within(screen.getByRole('group', { name: 'Major or minor' })).getByRole('button', { name: 'Minor' }));
    return within(selected()).getByRole('img');
  };

  it('says how many forms have two stars', () => {
    const none = minor({ 'C#-natural': 1, 'C#-harmonic': 1, 'C#-melodic': 1 });
    expect(none.getAttribute('aria-label')).toBe('No form with 2 stars yet');
    expect(none.textContent).toBe('☆☆☆');
    cleanup();
    const two = minor({ 'C#-natural': 1, 'C#-harmonic': 2, 'C#-melodic': 3 });
    expect(two.getAttribute('aria-label')).toBe('2 of 3 forms with 2 stars');
    expect(two.textContent).toBe('★★☆');
    cleanup();
    expect(minor({ 'C#-natural': 3 }).getAttribute('aria-label')).toBe('1 of 3 forms with 2 stars');
  });

  it('a major key keeps its own rating', () => {
    show({ keys: ['E'] }, { 'E-major': 2 });
    expect(within(selected()).getByRole('img').getAttribute('aria-label')).toBe('2 of 3 stars');
  });
});

// The key last picked on the circle comes back after a reload, whatever the setup: it was kept only in the setup's
// keys, which a pick changed only with the setup on one key.
describe('Scales hub: the key picked on the circle, after a reload', () => {
  const pickFsharp = (): void => {
    fireEvent.click(within(screen.getByRole('group', { name: 'Circle of fifths, major keys' })).getByRole('button', { name: /^F sharp\u00a0major/ }));
  };
  const fsharpSelected = (): string | null =>
    within(screen.getByRole('group', { name: 'Circle of fifths, major keys' })).getByRole('button', { name: /^F sharp\u00a0major/ }).getAttribute('aria-pressed');

  it('round the circle', () => {
    show({ keyMode: 'circle', keys: ['C'] });
    pickFsharp();
    reload();
    expect(fsharpSelected()).toBe('true');
    expect(loadProgress().scales.settings).toMatchObject({ keyMode: 'circle' });
  });

  it('with keys chosen, which stay the round keys', () => {
    show({ keyMode: 'pick', keys: ['D', 'Bb'] });
    pickFsharp();
    reload();
    expect(fsharpSelected()).toBe('true');
    expect(loadProgress().scales.settings).toMatchObject({ keyMode: 'pick', keys: ['D', 'Bb'] });
    // A setup on one key since (from another device) opens on that key, and keeps it when keys are chosen again.
    const setup = (settings: Partial<ScaleSettings>): void =>
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...defaultProgress(), scales: { settings: { ...DEFAULT_SCALE_SETTINGS, ...settings }, stars: {} } }));
    const aSelected = (): string | null =>
      within(screen.getByRole('group', { name: 'Circle of fifths, major keys' })).getByRole('button', { name: /^A\u00a0major/ }).getAttribute('aria-pressed');
    setup({ keys: ['A'] });
    reload();
    expect(aSelected()).toBe('true');
    setup({ keyMode: 'pick', keys: ['D', 'Bb'] });
    reload();
    expect(aSelected()).toBe('true');
  });
});
