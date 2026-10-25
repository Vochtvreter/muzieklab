// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../shared/api';
import { ACCOUNT_KEY } from '../game/storage';
import { api, ApiError, renewSession } from './client';

// Renewing the session (BACKEND-PLAN.md §5.4): a 401 `unauthenticated` on a signed-in device swaps the refresh token
// (POST /auth/refresh) and sends the request once more.

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
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

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
