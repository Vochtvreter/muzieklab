// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../shared/api';
import { ACCOUNT_KEY } from '../game/storage';
import { api, ApiError, forgetRenewals, lastRenewal, RENEW_WAIT_MS, RENEWED_KEY, renewSession } from './client';

// Renewing the session (BACKEND-PLAN.md §5.4): a 401 `unauthenticated` on a signed-in device swaps the refresh token
// (POST /auth/refresh) and sends the request once more. Every tab has the same cookies: the tabs renew one at a time
// (Web Locks) and use each other's renewals (RENEWED_KEY).

const ME: Me = {
  id: '6718f0c2a1b2c3d4e5f60002',
  email: 'ann@example.com',
  name: 'Ann de Vries',
  locale: 'en',
  roles: [],
  permissions: ['self.manage'],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ended = (): Response => json(401, { error: 'unauthenticated', message: 'Not signed in' });
const renewed = (): Response => new Response(null, { status: 204 });

let fetchMock: ReturnType<typeof vi.fn>;
const calls = (): string[] => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit).method} ${c[0] as string}`);

beforeEach(() => {
  forgetRenewals();
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as { locks?: LockManager }).locks;
});

/** Another tab renewed the session just now: what it leaves for the other tabs. */
const renewedElsewhere = (at = Date.now()): void => localStorage.setItem(RENEWED_KEY, String(at));

/** A fetch answered later, by hand. */
function later(): { response: Promise<Response>; answer: (r: Response) => void } {
  let answer!: (r: Response) => void;
  return { response: new Promise<Response>((r) => (answer = r)), answer };
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('renewing the session', () => {
  it('renews and sends the request again when the session token ran out', async () => {
    fetchMock.mockResolvedValueOnce(ended()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(json(200, ME));
    await expect(api.patch<Me>('/me', { name: 'Ann' })).resolves.toEqual(ME);
    expect(calls()).toEqual(['PATCH /api/v1/me', 'POST /api/v1/auth/refresh', 'PATCH /api/v1/me']);
    // The same request both times.
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ body: JSON.stringify({ name: 'Ann' }) });
  });

  it('gives the first 401 when the session cannot be renewed, and sends nothing more', async () => {
    fetchMock.mockImplementation(async () => ended());
    const e = await failure(api.get('/me'));
    expect([e.status, e.code]).toEqual([401, 'unauthenticated']);
    expect(calls()).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/refresh']);
  });

  it('gives no answer when the renewal gets none: the device may still be signed in', async () => {
    fetchMock.mockResolvedValueOnce(ended()).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await failure(api.get('/me'))).code).toBe('unavailable');
  });

  it('renews once for requests that find the session token ran out at the same time', async () => {
    let refreshes = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/v1/auth/refresh') {
        refreshes++;
        return renewed();
      }
      return refreshes === 0 ? ended() : json(200, ME);
    });
    await expect(Promise.all([api.get('/me'), api.get('/admin/accounts'), api.get('/me')])).resolves.toHaveLength(3);
    expect(refreshes).toBe(1);
  });

  it('sends again without renewing when another request renewed meanwhile', async () => {
    let answer!: (r: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((r) => (answer = r))) // GET /me, sent with the old session token
      .mockResolvedValueOnce(renewed())
      .mockResolvedValueOnce(json(200, ME));
    const me = api.get('/me');
    await renewSession();
    answer(ended());
    await expect(me).resolves.toEqual(ME);
    expect(calls()).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/refresh', 'GET /api/v1/me']);
  });

  it('does not renew on a device where nobody is signed in', async () => {
    localStorage.clear();
    fetchMock.mockImplementation(async () => ended());
    expect((await failure(api.get('/me'))).code).toBe('unauthenticated');
    expect(calls()).toEqual(['GET /api/v1/me']);
  });

  it('does not renew on another 401, such as a wrong password', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_credentials', message: '' }));
    expect((await failure(api.post('/auth/sign-in', { email: 'a@b.c', password: 'x' }))).code).toBe('invalid_credentials');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a renewal the server refuses with unauthenticated', async () => {
    fetchMock.mockResolvedValueOnce(ended());
    expect((await failure(renewSession())).code).toBe('unauthenticated');
  });
});

describe('renewing with other tabs', () => {
  it('keeps the time of a renewal for the other tabs', async () => {
    fetchMock.mockResolvedValueOnce(renewed());
    const before = Date.now();
    await renewSession();
    const at = Number(localStorage.getItem(RENEWED_KEY));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(lastRenewal()).toBe(at);
  });

  it("sends again without renewing when another tab renewed since the request went out: its cookies are this tab's", async () => {
    const me = later();
    fetchMock.mockReturnValueOnce(me.response).mockResolvedValueOnce(json(200, ME));
    const asked = api.get<Me>('/me');
    renewedElsewhere();
    me.answer(ended());
    await expect(asked).resolves.toEqual(ME);
    expect(calls()).toEqual(['GET /api/v1/me', 'GET /api/v1/me']);
  });

  it('renews when the other tab renewed before the request went out', async () => {
    renewedElsewhere(Date.now() - 1000);
    fetchMock.mockResolvedValueOnce(ended()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(json(200, ME));
    await expect(api.get<Me>('/me')).resolves.toEqual(ME);
    expect(calls()).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/refresh', 'GET /api/v1/me']);
  });

  it('sends once more when another tab renewed while it was sent again', async () => {
    const again = later();
    fetchMock
      .mockResolvedValueOnce(ended())
      .mockResolvedValueOnce(renewed())
      .mockReturnValueOnce(again.response) // sent again, with the session token another tab is about to replace
      .mockResolvedValueOnce(json(200, ME));
    const asked = api.get<Me>('/me');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    renewedElsewhere();
    again.answer(ended());
    await expect(asked).resolves.toEqual(ME);
    expect(calls()).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/refresh', 'GET /api/v1/me', 'GET /api/v1/me']);
  });

  it('sends a request at most twice more, however often other tabs renew', async () => {
    fetchMock.mockImplementation(async () => {
      renewedElsewhere();
      return ended();
    });
    expect((await failure(api.get('/me'))).code).toBe('unauthenticated');
    expect(calls()).toEqual(['GET /api/v1/me', 'GET /api/v1/me', 'GET /api/v1/me']);
  });

  it('does not trust a renewal time still to come (the clock was set back)', async () => {
    renewedElsewhere(Date.now() + 60_000);
    expect(lastRenewal()).toBe(-Infinity);
    fetchMock.mockResolvedValueOnce(ended()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(json(200, ME));
    await expect(api.get<Me>('/me')).resolves.toEqual(ME);
    expect(calls()).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/refresh', 'GET /api/v1/me']);
  });

  it('renewSession(since) renews only when nobody renewed since then', async () => {
    renewedElsewhere(Date.now() - 1000);
    await renewSession(Date.now() - 2000);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(renewed());
    await renewSession(Date.now() - 500);
    expect(calls()).toEqual(['POST /api/v1/auth/refresh']);
  });

  describe('with Web Locks', () => {
    type Client = typeof import('./client');
    /** Two tabs: the client loaded twice, with the same cookies (fetch), storage and locks. */
    async function twoTabs(): Promise<[Client, Client]> {
      Object.defineProperty(navigator, 'locks', { value: sharedLocks(), configurable: true });
      vi.resetModules();
      const a = await import('./client');
      vi.resetModules();
      return [a, await import('./client')];
    }

    it('one of two tabs renewing at once renews; the other waits for it, and uses its renewal', async () => {
      const [a, b] = await twoTabs();
      const swap = later();
      fetchMock.mockReturnValueOnce(swap.response);
      const both = Promise.all([a.renewSession(), b.renewSession()]);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      swap.answer(renewed());
      await both;
      expect(calls()).toEqual(['POST /api/v1/auth/refresh']);
    });

    it("a 401 while another tab renews: sent again once that tab's renewal is done, without renewing", async () => {
      const [a, b] = await twoTabs();
      const swap = later();
      fetchMock.mockReturnValueOnce(swap.response).mockResolvedValueOnce(ended()).mockResolvedValueOnce(json(200, ME));
      const renewing = a.renewSession();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      // Sent with the session token tab a is replacing.
      const asked = b.api.get<Me>('/me');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      swap.answer(renewed());
      await renewing;
      await expect(asked).resolves.toEqual(ME);
      expect(calls()).toEqual(['POST /api/v1/auth/refresh', 'GET /api/v1/me', 'GET /api/v1/me']);
    });

    it('a tab that started after another renewed does not renew again', async () => {
      const [a, b] = await twoTabs();
      fetchMock.mockResolvedValueOnce(renewed());
      await a.renewSession(Date.now() - 1000);
      await b.renewSession(Date.now() - 1000);
      expect(calls()).toEqual(['POST /api/v1/auth/refresh']);
    });

    it('renews by itself when the browser refuses the lock', async () => {
      const refuse = (): Promise<never> => Promise.reject(new DOMException('The document is not fully active', 'InvalidStateError'));
      Object.defineProperty(navigator, 'locks', { value: { request: refuse }, configurable: true });
      fetchMock.mockResolvedValueOnce(ended()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(json(200, ME));
      await expect(api.get<Me>('/me')).resolves.toEqual(ME);
      expect(calls()).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/refresh', 'GET /api/v1/me']);
    });

    it('gives up waiting for a tab whose renewal does not end (a frozen tab), and renews itself', async () => {
      const [a, b] = await twoTabs();
      vi.useFakeTimers();
      fetchMock.mockReturnValueOnce(new Promise<Response>(() => {})).mockResolvedValueOnce(renewed());
      void a.renewSession();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const waiting = b.renewSession();
      await vi.advanceTimersByTimeAsync(RENEW_WAIT_MS - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(calls()).toEqual(['POST /api/v1/auth/refresh', 'POST /api/v1/auth/refresh']);
    });
  });
});

/** Web Locks as the browser shares them between its tabs: one holder of a name at a time, the others in turn. */
function sharedLocks(): LockManager {
  const queued = new Map<string, number>();
  const last = new Map<string, Promise<void>>();
  const request = (name: string, ...args: unknown[]): Promise<unknown> => {
    const [options, callback] = (args.length === 1 ? [{}, args[0]] : args) as [LockOptions, LockGrantedCallback];
    if (options.ifAvailable && (queued.get(name) ?? 0) > 0) return Promise.resolve().then(() => callback(null));
    queued.set(name, (queued.get(name) ?? 0) + 1);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const turn = last.get(name) ?? Promise.resolve();
    last.set(name, turn.then(() => held));
    return turn
      .then(() => callback({ name, mode: 'exclusive' }))
      .finally(() => {
        queued.set(name, queued.get(name)! - 1);
        release();
      });
  };
  return { request } as unknown as LockManager;
}
