/**
 * The API client (BACKEND-PLAN.md §1, §7): JSON over HTTPS under /api/v1 on the same site, with the session in
 * HttpOnly cookies the browser sends by itself. The contract — every body and error code — is shared/api.ts.
 *
 * The session token works for an hour; a refresh token keeps the session going for 90 days after its last use
 * (§5.4). When a request says the session ended (401 `unauthenticated`) on a device where someone is signed in, the
 * client swaps the refresh token for a new pair (POST /auth/refresh) and sends the request once more, so a screen
 * never sees the hourly swap.
 *
 * The API lives at the site root, so the path is absolute (`/api/v1`), unlike the app's own `./` base. Production has
 * no API yet: there `/api/…` answers with a 404 that is not JSON, which counts as `unavailable`, like a network error
 * or a timeout. So a screen never has to tell "offline" from "no API here".
 */
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '../../shared/api';
import { loadAccount } from '../game/storage';

export const API_BASE = '/api/v1';
/** A request that takes longer than this is given up (and is `unavailable`). */
export const API_TIMEOUT_MS = 15_000;

/**
 * Every code in the contract (busy included: the server's line for password checks is full, BACKEND-PLAN.md §5.2, §7),
 * plus `unavailable`: no answer from the API (offline, timeout, or no API on this site).
 */
export type ClientErrorCode = ErrorCode | 'unavailable';

/** A request that did not succeed. `code` is what the app translates (apiError.<code>, ui/lib/apiErrors.ts). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  /** With too_many_attempts (and busy): seconds until the next try (from the body, else the Retry-After header). */
  readonly retryAfter?: number;
  /** With rev_conflict: the account's copy of the progress, as it came (ui/sync.ts checks it before use). */
  readonly current?: unknown;

  constructor(status: number, code: ClientErrorCode, message: string = code, retryAfter?: number, current?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.current = current;
  }
}

export interface RequestOptions {
  /** Aborts the request (a screen that left, a search that was typed over): rejects with the AbortError itself. */
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const isCode = (v: unknown): v is ErrorCode => typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v);

/** An error body as it arrives: nothing in it is trusted until checked. */
type ErrorBodyIn = { [K in keyof ApiErrorBody]?: unknown };

/** Sends one request; resolves with the response once it came within the timeout. */
async function send(method: Method, path: string, body: unknown, opts: RequestOptions): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), API_TIMEOUT_MS);
  const outer = opts.signal;
  const forward = (): void => timeout.abort();
  outer?.addEventListener('abort', forward);
  try {
    if (outer?.aborted) throw outer.reason ?? new DOMException('Aborted', 'AbortError');
    return await fetch(API_BASE + path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    });
  } catch (e) {
    // The caller's own abort is passed on as it is; everything else (offline, DNS, timeout) means no answer.
    if (outer?.aborted) throw outer.reason ?? e;
    throw new ApiError(0, 'unavailable', e instanceof Error ? e.message : 'network error');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forward);
  }
}

const isJson = (res: Response): boolean => /^application\/(.+\+)?json\b/i.test(res.headers.get('content-type') ?? '');

/** An error response as an ApiError: the body's code when it has one the contract knows. */
async function failure(res: Response): Promise<ApiError> {
  if (!isJson(res)) return new ApiError(res.status, 'unavailable', `HTTP ${res.status} without a JSON body`);
  let data: ErrorBodyIn;
  try {
    const body: unknown = await res.json();
    data = body !== null && typeof body === 'object' ? (body as ErrorBodyIn) : {};
  } catch {
    return new ApiError(res.status, 'unavailable', `HTTP ${res.status} with a broken JSON body`);
  }
  const header = Number(res.headers.get('retry-after'));
  const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : Number.isFinite(header) && header > 0 ? header : undefined;
  // An error code this app does not know yet (a newer server): a server fault, or a request it did not take.
  const code: ClientErrorCode = isCode(data.error) ? data.error : res.status >= 500 ? 'internal' : 'bad_request';
  return new ApiError(res.status, code, typeof data.message === 'string' ? data.message : code, retryAfter, data.current);
}

/** The renewal that is running, if any: every request that needs one waits for the same. */
let renewing: Promise<void> | null = null;
/** Renewals that succeeded: a request sent before the latest may have carried the session token it replaced. */
let renewals = 0;

/**
 * POST /auth/refresh: swaps the refresh cookie for a new pair, so the session lasts 90 days from now. One at a time.
 * Rejects with an ApiError: `unauthenticated` when the session has ended.
 */
export function renewSession(): Promise<void> {
  renewing ??= send('POST', '/auth/refresh', undefined, {})
    .then(async (res) => {
      if (!res.ok) throw await failure(res);
      renewals++;
    })
    .finally(() => {
      renewing = null;
    });
  return renewing;
}

/** Only a device where someone is signed in has a refresh token to try. */
const signedInHere = (): boolean => loadAccount() !== null;

/**
 * Sends a request; when it says the session ended, renews the session and sends it once more. If the renewal gets no
 * answer, that is the error (the device may still be signed in); if it says the session ended, the first answer is.
 */
async function sendRenewing(method: Method, path: string, body: unknown, opts: RequestOptions): Promise<Response> {
  const before = renewals;
  const res = await send(method, path, body, opts);
  if (res.status !== 401 || !signedInHere()) return res;
  const err = await failure(res.clone());
  if (err.code !== 'unauthenticated') return res;
  // Another request renewed the session meanwhile: its new cookies are already in place.
  if (renewals === before) {
    try {
      await renewSession();
    } catch (e) {
      const renewal = asApiError(e);
      if (renewal.code === 'unavailable' || renewal.code === 'busy' || renewal.status >= 500) throw renewal;
      return res;
    }
  }
  return send(method, path, body, opts);
}

async function request<T>(method: Method, path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await sendRenewing(method, path, body, opts);
  if (!res.ok) throw await failure(res);
  if (res.status === 204) return undefined as T;
  // A 200 that is not JSON is not the API: e.g. a dev server's or a service worker's index.html for an unknown path.
  if (!isJson(res)) throw new ApiError(res.status, 'unavailable', `HTTP ${res.status} without a JSON body`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, 'unavailable', 'a broken JSON body');
  }
}

/** `api.get<Me>('/me')`, `api.post<Me>('/auth/sign-in', body)`… Paths are under /api/v1 and start with '/'. */
export const api = {
  get: <T>(path: string, opts?: RequestOptions): Promise<T> => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> => request<T>('POST', path, body, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> => request<T>('PUT', path, body, opts),
  patch: <T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> => request<T>('PATCH', path, body, opts),
  del: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> => request<T>('DELETE', path, body, opts),
};

/** The name the account export is saved under. */
export const EXPORT_FILE = 'muzieklab-account.json';

/** GET /me/export, saved as muzieklab-account.json (an object URL and a temporary <a download>). */
export async function downloadExport(): Promise<void> {
  const res = await sendRenewing('GET', '/me/export', undefined, {});
  if (!res.ok) throw await failure(res);
  if (!isJson(res)) throw new ApiError(res.status, 'unavailable', `HTTP ${res.status} without a JSON body`);
  saveBlob(await res.blob(), EXPORT_FILE);
}

/** Saves `blob` as a file named `name` (an object URL and a temporary <a download>). */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked a little later: some browsers start the download only after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Any thrown value as an ApiError: a bug or an unexpected throw counts as `internal`. */
export function asApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(0, 'internal', e instanceof Error ? e.message : String(e));
}
