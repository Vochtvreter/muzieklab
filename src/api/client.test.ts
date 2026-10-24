import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, API_TIMEOUT_MS, ApiError, asApiError } from './client';

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

describe('api client', () => {
  it('sends JSON to /api/v1 with the session cookie, and parses a JSON answer', async () => {
    fetchMock.mockResolvedValue(json(200, { id: '1', name: 'Ann' }));
    const me = await api.post<{ id: string }>('/auth/sign-in', { email: 'ann@example.com', password: 'x' });
    expect(me).toEqual({ id: '1', name: 'Ann' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/sign-in');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ email: 'ann@example.com', password: 'x' }));
  });

  it('sends no body and no Content-Type on a GET', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await api.get('/me');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('answers undefined for a 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.post('/auth/sign-out')).resolves.toBeUndefined();
  });

  it('turns an error body into an ApiError with its status, code and message', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'invalid_credentials', message: 'Email or password is not right' }));
    const e = await failure(api.post('/auth/sign-in', {}));
    expect(e.status).toBe(401);
    expect(e.code).toBe('invalid_credentials');
    expect(e.message).toBe('Email or password is not right');
  });

  it('passes on retryAfter, from the body or else the Retry-After header', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { error: 'too_many_attempts', message: '', retryAfter: 120 }));
    expect((await failure(api.post('/auth/sign-in', {}))).retryAfter).toBe(120);
    fetchMock.mockResolvedValueOnce(json(429, { error: 'too_many_attempts', message: '' }, { 'retry-after': '30' }));
    const e = await failure(api.post('/auth/sign-in', {}));
    expect(e.code).toBe('too_many_attempts');
    expect(e.retryAfter).toBe(30);
  });

  it('reads the busy answer as busy, never as too many tries', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { error: 'busy', message: 'The server is busy', retryAfter: 1 }));
    const e = await failure(api.post('/auth/sign-in', {}));
    expect([e.status, e.code, e.retryAfter, e.message]).toEqual([429, 'busy', 1, 'The server is busy']);
    // A counter's wait in its last second also says 1: it stays too many tries.
    fetchMock.mockResolvedValueOnce(json(429, { error: 'too_many_attempts', message: '', retryAfter: 1 }));
    expect((await failure(api.post('/auth/sign-in', {}))).code).toBe('too_many_attempts');
  });

  it('reads a JSON error body that is not an object by its status', async () => {
    fetchMock.mockResolvedValueOnce(json(502, null));
    expect((await failure(api.get('/me'))).code).toBe('internal');
    fetchMock.mockResolvedValueOnce(json(400, 'nope'));
    expect((await failure(api.get('/me'))).code).toBe('bad_request');
  });

  it('reads an error code it does not know as internal (5xx) or bad_request', async () => {
    fetchMock.mockResolvedValueOnce(json(503, { error: 'rev_conflict', message: '' }));
    expect((await failure(api.get('/x'))).code).toBe('internal');
    fetchMock.mockResolvedValueOnce(json(409, { error: 'rev_conflict', message: '' }));
    expect((await failure(api.get('/x'))).code).toBe('bad_request');
  });

  it('counts an answer that is not JSON as unavailable: production has no API yet (an HTML 404)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<!doctype html><title>Not found</title>', { status: 404, headers: { 'content-type': 'text/html' } }));
    const e = await failure(api.get('/me'));
    expect(e.code).toBe('unavailable');
    expect(e.status).toBe(404);
    // A dev server's or a service worker's index.html for an unknown path: a 200, but not the API.
    fetchMock.mockResolvedValueOnce(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect((await failure(api.get('/me'))).code).toBe('unavailable');
    // A gateway error with no body (the API is down behind Caddy).
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }));
    expect((await failure(api.get('/me'))).code).toBe('unavailable');
  });

  it('counts a broken JSON body as unavailable', async () => {
    fetchMock.mockResolvedValue(new Response('{"id":', { status: 200, headers: { 'content-type': 'application/json' } }));
    expect((await failure(api.get('/me'))).code).toBe('unavailable');
  });

  it('counts a network error as unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await failure(api.get('/me'));
    expect(e.code).toBe('unavailable');
    expect(e.status).toBe(0);
  });

  it('gives up after the timeout: unavailable', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }),
    );
    const pending = failure(api.get('/me'));
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).code).toBe('unavailable');
  });

  it("passes the caller's own abort on as it is", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const stop = new AbortController();
    const pending = api.get('/admin/accounts?q=a', { signal: stop.signal });
    stop.abort();
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });

  it('asApiError keeps an ApiError and makes anything else internal', () => {
    const e = new ApiError(410, 'link_invalid');
    expect(asApiError(e)).toBe(e);
    expect(asApiError(new Error('boom')).code).toBe('internal');
  });
});
