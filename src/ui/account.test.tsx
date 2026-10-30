// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../shared/api';
import { RENEWED_KEY } from '../api/client';
import { ACCOUNT_KEY, PROGRESS_KEY } from '../game/storage';
import { SYNC_KEY } from '../game/syncState';
import { keepSignedIn, RECHECK_MS, RENEW_MS, resetAccountCheck, useAccount, type UseAccount } from './account';
import { listenToAnnouncements } from './lib/announce';
import { StoreProvider } from './store';
import { progressSync, useProgressSync } from './sync';

const ME: Me = {
  id: '6718f0c2a1b2c3d4e5f60002',
  email: 'ann@example.com',
  name: 'Ann de Vries',
  locale: 'en',
  roles: ['admin'],
  roleNames: {},
  permissions: ['self.manage', 'accounts.read'],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
  feedbackMode: false,
};

/** Someone else, signed in on this browser in another tab. */
const BRAM: Me = { ...ME, id: '6718f0c2a1b2c3d4e5f60009', email: 'bram@example.com', name: 'Bram Smit', roles: [], permissions: ['self.manage'] };

/** Another tab of the app saved (or forgot) the account: the tabs of a browser share its storage. */
const storedElsewhere = (me: Me | null): void => {
  if (me) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
  else localStorage.removeItem(ACCOUNT_KEY);
  window.dispatchEvent(new StorageEvent('storage', { key: ACCOUNT_KEY }));
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
let latest: UseAccount;

function Probe(): JSX.Element {
  latest = useAccount();
  return <p data-testid="probe">{`${latest.api} ${latest.me?.name ?? 'nobody'}`}</p>;
}
const shown = (): string => screen.getByTestId('probe').textContent ?? '';

/** The progress sync, as the app mounts it. */
function Synced(): null {
  useProgressSync();
  return null;
}

/**
 * The API for the tests with the progress sync: GET /me answers `me` (nobody: 401), and the account has no progress
 * yet and takes the first save. Once `ended` is set, the session has ended: every request, a renewal too, gets a 401.
 */
function syncApi(me: Me | null): { ended: boolean; calls: string[] } {
  const api = { ended: false, calls: [] as string[] };
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const call = `${init.method ?? 'GET'} ${url.replace('/api/v1', '')}`;
    api.calls.push(call);
    const refused = json(401, { error: 'unauthenticated', message: '' });
    if (api.ended) return refused;
    if (call === 'GET /me') return me ? json(200, me) : refused;
    if (call === 'GET /progress') return json(200, { rev: 0, data: null, resetAt: null, updatedAt: null });
    if (call === 'PUT /progress') {
      const { prefs, progress } = JSON.parse(String(init.body)) as { prefs: object; progress: object };
      return json(200, { rev: 1, data: { prefs, progress }, resetAt: null, updatedAt: '2026-10-25T10:00:00.000Z' });
    }
    return json(404, { error: 'not_found', message: call });
  });
  return api;
}

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useAccount', () => {
  it('asks GET /me once per app session: signed in', async () => {
    fetchMock.mockResolvedValue(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
        <Probe />
      </StoreProvider>,
    );
    expect(screen.getAllByTestId('probe')[0].textContent).toBe('unknown nobody');
    await waitFor(() => expect(screen.getAllByTestId('probe')[0].textContent).toBe('reachable Ann de Vries'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/me');
    expect(latest.can('accounts.read')).toBe(true);
    expect(latest.can('roles.grant')).toBe(false);
    // Cached for offline use.
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null')?.email).toBe('ann@example.com'));
  });

  it('a 401 the session cannot be renewed from is signed out, and clears a cached account', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    fetchMock.mockImplementation(async () => json(401, { error: 'unauthenticated', message: '' }));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    expect(shown()).toBe('unknown Ann de Vries');
    await waitFor(() => expect(shown()).toBe('reachable nobody'));
    await waitFor(() => expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull());
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/v1/me', '/api/v1/auth/refresh']);
  });

  it('renews a session whose token ran out, and asks again: still signed in', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'unauthenticated', message: '' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    expect(fetchMock.mock.calls.map((c) => [c[0], (c[1] as RequestInit).method])).toEqual([
      ['/api/v1/me', 'GET'],
      ['/api/v1/auth/refresh', 'POST'],
      ['/api/v1/me', 'GET'],
    ]);
  });

  it('keepSignedIn renews the session on start and on coming back into view, only while signed in', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    keepSignedIn();
    expect(fetchMock).not.toHaveBeenCalled();

    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    keepSignedIn();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/refresh');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');

    // Back into view soon after: no need yet.
    await new Promise((r) => setTimeout(r, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Hours later: renewed again.
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + RENEW_MS + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    vi.restoreAllMocks();
  });

  it("keepSignedIn counts another tab's renewal: none on start soon after it, one once it is RENEW_MS ago", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    const renewedElsewhere = Date.now() - 60_000;
    localStorage.setItem(RENEWED_KEY, String(renewedElsewhere));
    keepSignedIn();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();

    vi.spyOn(Date, 'now').mockReturnValue(renewedElsewhere + RENEW_MS + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/refresh');
    // And leaves its own for the other tabs.
    await waitFor(() => expect(localStorage.getItem(RENEWED_KEY)).toBe(String(renewedElsewhere + RENEW_MS + 1)));
    vi.restoreAllMocks();
  });

  it('keepSignedIn does not try again for RENEW_MS after a refusal, but does after no answer', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    keepSignedIn();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    // Offline: again when the app comes back into view; refused this time.
    fetchMock.mockResolvedValueOnce(json(401, { error: 'unauthenticated', message: '' }));
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no answer keeps the cached account, as offline', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('unreachable Ann de Vries'));
    expect(latest.can('accounts.read')).toBe(false);
    expect(localStorage.getItem(ACCOUNT_KEY)).not.toBeNull();
  });

  it('signs in and out', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'unauthenticated', message: '' }));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable nobody'));
    fetchMock.mockResolvedValueOnce(json(200, ME));
    await act(async () => {
      await latest.signIn('ann@example.com', 'a good long password');
    });
    expect(shown()).toBe('reachable Ann de Vries');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ email: 'ann@example.com', password: 'a good long password' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => {
      await latest.signOut();
    });
    expect(shown()).toBe('reachable nobody');
    expect(latest.notice).toBe('signedOut');
  });

  it('a wrong password does not sign anyone out; it rejects with the code', async () => {
    fetchMock.mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_credentials', message: '' }));
    await act(async () => {
      await expect(latest.signIn('ann@example.com', 'wrong')).rejects.toMatchObject({ code: 'invalid_credentials' });
    });
    expect(shown()).toBe('reachable Ann de Vries');
  });

  it('handleError signs out on a 401, and leaves the rest to the screen', async () => {
    fetchMock.mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    act(() => {
      expect(latest.handleError(new TypeError('x')).code).toBe('internal');
    });
    expect(shown()).toBe('reachable Ann de Vries');
    const { ApiError } = await import('../api/client');
    act(() => {
      expect(latest.handleError(new ApiError(0, 'unavailable')).code).toBe('unavailable');
    });
    expect(shown()).toBe('reachable Ann de Vries');
    act(() => {
      latest.handleError(new ApiError(401, 'unauthenticated'));
    });
    expect(shown()).toBe('reachable nobody');
  });

  it('a request the session had ended for signs out with a line for Sign in: nothing was changed, sign in again', async () => {
    const said: string[] = [];
    const stop = listenToAnnouncements((text) => said.push(text));
    fetchMock.mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    const { ApiError } = await import('../api/client');
    act(() => {
      latest.handleError(new ApiError(401, 'unauthenticated'));
    });
    expect(shown()).toBe('reachable nobody');
    // Delete account ends signed out too: without the line, Sign in reads as if the account was deleted.
    expect(latest.notice).toBe('sessionEnded');
    expect(said).toEqual(['You were signed out, so nothing was changed. Sign in again to go on.']);
    stop();
  });

  it('keeps that line when the progress sync finds the session ended too, before the screen shows the sign-out', async () => {
    const api = syncApi(ME);
    render(
      <StoreProvider>
        <Synced />
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(localStorage.getItem(SYNC_KEY)).not.toBeNull());
    const { ApiError } = await import('../api/client');
    // Delete account's 401, then the sync's (the app back online), both before React renders: the sync still sees the
    // account it was started for, and signs out again.
    api.ended = true;
    await act(async () => {
      latest.handleError(new ApiError(401, 'unauthenticated'));
      await progressSync()!.request('online');
    });
    expect(api.calls.slice(-2)).toEqual(['GET /progress', 'POST /auth/refresh']);
    expect(shown()).toBe('reachable nobody');
    expect(latest.notice).toBe('sessionEnded');
  });

  it('sign out everywhere on a session that had already ended: refused, so it never says every device was signed out', async () => {
    fetchMock.mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    // The session ended on another device (a new password there): the request and the renewal it tries are refused,
    // so no other device was signed out.
    fetchMock.mockImplementation(async () => json(401, { error: 'unauthenticated', message: '' }));
    await act(async () => {
      await expect(latest.signOutEverywhere()).rejects.toMatchObject({ code: 'unauthenticated' });
    });
    expect(shown()).toBe('reachable nobody');
    expect(latest.notice).toBe('sessionEnded');
  });

  it('sign out everywhere that worked says so', async () => {
    fetchMock.mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => {
      await latest.signOutEverywhere();
    });
    expect(shown()).toBe('reachable nobody');
    expect(latest.notice).toBe('signedOutEverywhere');
  });

  it('drops an answer to GET /me that a sign-in overtook', async () => {
    let answer: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    fetchMock.mockResolvedValueOnce(json(200, ME));
    await act(async () => {
      await latest.signIn('ann@example.com', 'a good long password');
    });
    await act(async () => {
      answer(json(401, { error: 'unauthenticated', message: '' }));
    });
    expect(shown()).toBe('reachable Ann de Vries');
  });

  it('takes up the account another tab signed in or out, so this one never shows or changes the one before', async () => {
    fetchMock.mockResolvedValue(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    act(() => storedElsewhere(null));
    expect(shown()).toBe('reachable nobody');
    expect(latest.notice).toBeNull();
    act(() => storedElsewhere(BRAM));
    expect(shown()).toBe('reachable Bram Smit');
    expect(latest.can('accounts.read')).toBe(false);
    // A new name there: the same account, as it is now.
    act(() => storedElsewhere({ ...BRAM, name: 'Bram S.' }));
    expect(shown()).toBe('reachable Bram S.');
    // The other tab's answers: nothing was asked here again, and nothing saved back.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null')?.name).toBe('Bram S.');
    // Signed out there, then signed in and out here: the account is forgotten, as after any sign-out.
    act(() => storedElsewhere(null));
    act(() => latest.setMe(ME));
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null')?.id).toBe(ME.id);
    act(() => latest.setSignedOut());
    expect(shown()).toBe('reachable nobody');
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull();
  });

  it('syncs the account another tab signed in, without the first sign-in’s line: that tab says it', async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ xp: 25, practiceDays: ['2026-10-24'], lessons: { '1.1': { stars: 3, bestAccuracy: 90 } } }));
    const api = syncApi(null);
    const said: string[] = [];
    const stop = listenToAnnouncements((text) => said.push(text));
    render(
      <StoreProvider>
        <Synced />
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable nobody'));
    // Signed in there, before that tab's first sync saved what it agreed with the account: this one's sync is a first too.
    act(() => storedElsewhere(ME));
    await waitFor(() => expect(localStorage.getItem(SYNC_KEY)).not.toBeNull());
    expect(api.calls).toContain('PUT /progress');
    expect(latest.notice).toBeNull();
    expect(said).toEqual([]);
    // Signed out, and in again here: this tab's own first sign-in says it.
    act(() => latest.setSignedOut());
    act(() => latest.setMe(ME));
    await waitFor(() => expect(latest.notice).toBe('progressAdded'));
    expect(said).toEqual(['The progress on this device is on your account now too.']);
    stop();
  });

  it('asks GET /me again when another tab signed in as someone else while it was on its way', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    let answer: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    act(() => storedElsewhere(BRAM));
    expect(shown()).toBe('unknown Bram Smit');
    // The answer is about the session before (Ann's): it is not taken, and the next one is.
    fetchMock.mockResolvedValueOnce(json(200, BRAM));
    await act(async () => answer(json(200, ME)));
    await waitFor(() => expect(shown()).toBe('reachable Bram Smit'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null')?.id).toBe(BRAM.id);
  });

  describe('after no answer, asks again', () => {
    let now = 1_000_000;
    beforeEach(() => {
      now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
    });
    afterEach(() => vi.restoreAllMocks());

    const offlineThenSettings = async (): Promise<() => void> => {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const first = render(
        <StoreProvider>
          <Probe />
        </StoreProvider>,
      );
      await waitFor(() => expect(shown()).toBe('unreachable Ann de Vries'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      return first.unmount;
    };

    it('when a screen that needs the account opens again, at most once every RECHECK_MS', async () => {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const { rerender } = render(
        <StoreProvider>
          <Probe key="settings" />
        </StoreProvider>,
      );
      await waitFor(() => expect(shown()).toBe('unreachable Ann de Vries'));
      // Path, then Settings again soon after: no new request.
      rerender(<StoreProvider>{null}</StoreProvider>);
      now += RECHECK_MS - 1;
      rerender(
        <StoreProvider>
          <Probe key="settings-again" />
        </StoreProvider>,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // The API is back (it restarted; no 'online' event): the next visit after the wait asks, and the account is live.
      fetchMock.mockResolvedValue(json(200, ME));
      rerender(<StoreProvider>{null}</StoreProvider>);
      now += 1;
      rerender(
        <StoreProvider>
          <Probe key="settings-later" />
        </StoreProvider>,
      );
      await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(latest.can('accounts.read')).toBe(true);
    });

    it('when the device is back online, even with no account screen open', async () => {
      const unmount = await offlineThenSettings();
      unmount();
      fetchMock.mockResolvedValue(json(200, ME));
      window.dispatchEvent(new Event('online'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it('when the app comes back into view, after the wait', async () => {
      await offlineThenSettings();
      fetchMock.mockResolvedValue(json(200, ME));
      document.dispatchEvent(new Event('visibilitychange'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      now += RECHECK_MS;
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('not while the API answers: a signed-in account is not asked about again', async () => {
      fetchMock.mockResolvedValue(json(200, ME));
      const { unmount } = render(
        <StoreProvider>
          <Probe />
        </StoreProvider>,
      );
      await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
      unmount();
      now += RECHECK_MS * 10;
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      render(
        <StoreProvider>
          <Probe />
        </StoreProvider>,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Try again (refresh) asks at once', async () => {
      await offlineThenSettings();
      fetchMock.mockImplementation(async () => json(401, { error: 'unauthenticated', message: '' }));
      await act(async () => {
        await latest.refresh();
      });
      expect(shown()).toBe('reachable nobody');
      // GET /me offline; then GET /me, and the renewal it tried.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
