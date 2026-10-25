// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../../../shared/api';

// Every announcement, as the screen reader would get it (the real Announcer still shows them).
vi.mock('../../lib/announce', async (load) => {
  const real = await load<typeof import('../../lib/announce')>();
  return { ...real, announce: vi.fn((text: string) => real.announce(text)) };
});

import { App } from '../../../App';
import { setLocale } from '../../../i18n';
import { ACCOUNT_KEY, PROGRESS_KEY } from '../../../game/storage';
import { SYNC_KEY } from '../../../game/syncState';
import { resetAccountCheck } from '../../account';
import { announce } from '../../lib/announce';
import { CHECKING_MIN_MS } from './AccountSection';

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

const ME: Me = {
  id: '6718f0c2a1b2c3d4e5f60002',
  email: 'ann@example.com',
  name: 'Ann de Vries',
  locale: 'en',
  roles: [],
  roleNames: {},
  permissions: ['self.manage'],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
};
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** GET /me's answer: the account, or no answer (offline, the API restarting). */
let reachable: boolean;
let me: Me;
/** The account's progress (GET and PUT /progress). */
let saved: { rev: number; data: unknown; resetAt: string | null; updatedAt: string | null };
const said = (): string[] => vi.mocked(announce).mock.calls.map((c) => c[0]);

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  vi.mocked(announce).mockClear();
  reachable = true;
  me = ME;
  saved = { rev: 0, data: null, resetAt: null, updatedAt: null };
  window.location.hash = '#/settings';
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      if (!reachable) return Promise.reject(new TypeError('Failed to fetch'));
      if (path.endsWith('/me')) return Promise.resolve(json(200, me));
      if (path.endsWith('/progress')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as { rev: number; prefs: unknown; progress: unknown };
          saved = { rev: body.rev + 1, data: { prefs: body.prefs, progress: body.progress }, resetAt: null, updatedAt: '2026-10-25T10:00:00.000Z' };
        }
        return Promise.resolve(json(200, saved));
      }
      if (path.endsWith('/auth/sign-out')) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(json(404, { error: 'not_found', message: '' }));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
});

describe('Settings → Account', () => {
  it('leads an account with feedback.review to the feedback reports, right after Accounts', async () => {
    me = { ...ME, permissions: ['self.manage', 'accounts.read', 'feedback.give', 'feedback.review'] };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
    render(<App />);
    const section = await screen.findByRole('region', { name: 'Account' });
    await waitFor(() => expect(within(section).getByRole('link', { name: /^Feedback/ }).getAttribute('href')).toBe('#/admin/feedback'));
    expect(within(section).getAllByRole('link').map((a) => a.querySelector('b')?.textContent)).toEqual(['Ann de Vries', 'Accounts', 'Feedback']);
    expect(within(section).getByRole('link', { name: /^Feedback/ }).textContent).toContain('Review the reports sent from the app');
    // The button on this device is another thing: the switch.
    expect(within(section).getByRole('switch', { name: 'Feedback button' })).toBeTruthy();
  });

  it('shows no feedback reports row without feedback.review', async () => {
    me = { ...ME, permissions: ['self.manage', 'feedback.give'] };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
    render(<App />);
    const section = await screen.findByRole('region', { name: 'Account' });
    await within(section).findByRole('switch', { name: 'Feedback button' });
    expect(within(section).queryByRole('link', { name: /^Feedback/ })).toBeNull();
  });

  it('reads a notice out once, when it happens: switching the language shows it again without saying it again', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sign out' }));
    await screen.findByText('Signed out.');
    expect(said()).toEqual(['Signed out.']);
    fireEvent.click(screen.getByRole('button', { name: 'Nederlands' }));
    // The line is still there, now in Dutch (the screens remount in the new language).
    await screen.findByText('Uitgelogd.');
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(said()).toEqual(['Signed out.']);
  });

  it('Try again with still no answer: keeps its focus, shows Checking… for a moment, and says so', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    reachable = false;
    render(<App />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    retry.focus();
    const pressed = Date.now();
    fireEvent.click(retry);
    const checking = await screen.findByRole('button', { name: 'Checking…' });
    // Not disabled, which would drop focus to the page: aria-disabled, and a second press does nothing.
    expect(checking.hasAttribute('disabled')).toBe(false);
    expect(checking.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(checking);
    fireEvent.click(checking);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy(), { timeout: CHECKING_MIN_MS * 3 });
    expect(Date.now() - pressed).toBeGreaterThanOrEqual(CHECKING_MIN_MS - 20);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try again' }));
    expect(said()).toEqual(["Muzieklab still can't be reached."]);
    // GET /me: the first look when Settings opened, and one Try again (the second press was ignored).
    expect(vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).endsWith('/me'))).toHaveLength(2);
  });

  it('Try again that reaches the API: says so, and focus goes to the account instead of the page', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    reachable = false;
    render(<App />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    reachable = true;
    retry.focus();
    fireEvent.click(retry);
    await screen.findByRole('button', { name: 'Sign out' });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: /^Ann de Vries/ })));
    expect(said()).toEqual(['Muzieklab can be reached again.']);
  });

  it('says the progress is saved to the account, and adds what this device did before signing in', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ xp: 120, practiceDays: ['2026-10-24'] }));
    render(<App />);
    await screen.findByText('Progress saved to your account');
    expect(saved.rev).toBe(1);
    expect(saved.data).toMatchObject({ progress: { xp: 120, practiceDays: ['2026-10-24'] } });
    expect(screen.getByText('The progress on this device is on your account now too.')).toBeTruthy();
    expect(said()).toContain('The progress on this device is on your account now too.');
  });

  it('signs out keeping this device’s progress, or removing it for a shared device', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ xp: 120 }));
    render(<App />);
    await screen.findByText('Progress saved to your account');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Sign out on this device?' });
    // Keep is the choice it opens with.
    expect(within(confirm).getByRole('button', { name: 'Keep' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(confirm).getByRole('button', { name: 'Sign out' }));
    await screen.findByText('Signed out.');
    // The progress was on the account already: this device forgets it, and what it knew about the account.
    expect(saved.data).toMatchObject({ progress: { xp: 120 } });
    await waitFor(() => expect(localStorage.getItem(PROGRESS_KEY)).toBeNull());
    expect(localStorage.getItem(SYNC_KEY)).toBeNull();
  });
});
