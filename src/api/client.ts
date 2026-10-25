/**
 * The API client (BACKEND-PLAN.md §1, §7): JSON over HTTPS under /api/v1 on the same site, with the session in
 * HttpOnly cookies the browser sends by itself. The contract — every body and error code — is shared/api.ts.
 *
 * The session token works for an hour; a refresh token keeps the session going for 90 days after its last use
 * (§5.4). When a request says the session ended (401 `unauthenticated`) on a device where someone is signed in, the
 * client swaps the refresh token for a new pair (POST /auth/refresh) and sends the request once more, so a screen
 * never sees the hourly swap. Every tab of the site shares the cookies, so the tabs renew one at a time and use each
 * other's renewals (renewSession).
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

/**
 * Every tab of the site has the same cookies, and a renewal ends the session token it replaces, which another tab may
 * have just sent. So a tab renews only while no other tab does (a Web Lock), and the time of the last renewal is kept
 * where every tab sees it (RENEWED_KEY): a tab that starts just after another one renewed does not renew again, and a
 * request that another tab's renewal answered with a 401 is sent again with the new cookies. Until 0.16.2 every tab
 * renewed by itself, and of several tabs opened at once some showed themselves signed out.
 */
export const RENEWED_KEY = 'muzieklab.renewed.v1';
const RENEW_LOCK = 'muzieklab.renew';
/** A tab that waits for another tab's renewal gives up on it after this (that tab may be frozen), and renews itself. */
export const RENEW_WAIT_MS = API_TIMEOUT_MS + 5_000;
/** A request is sent at most this many times more after a 401: another tab may renew while it is on its way again. */
const RESENDS = 2;

/** The renewal that is running in this tab, if any: every request that needs one waits for the same. */
let renewing: Promise<void> | null = null;
/** When this tab's latest renewal that succeeded ended (Date.now()): what it knows when storage is unavailable. */
let renewedHere = -Infinity;

/** Tests only: forget this tab's renewals, as a reload would. */
export function forgetRenewals(): void {
  renewing = null;
  renewedHere = -Infinity;
}

/** When the session was last renewed on this device, in this tab or another one (-Infinity: not known). */
export function lastRenewal(): number {
  let shared = -Infinity;
  try {
    const at = Number(localStorage.getItem(RENEWED_KEY) ?? NaN);
    // A time still to come means the clock was set back: not trusted, or no tab would renew until then.
    if (Number.isFinite(at) && at <= Date.now()) shared = at;
  } catch {
    /* unavailable storage: this tab's own renewals only */
  }
  return Math.max(renewedHere, shared);
}

/** POST /auth/refresh, and its time for every tab. */
async function refresh(): Promise<void> {
  const res = await send('POST', '/auth/refresh', undefined, {});
  if (!res.ok) throw await failure(res);
  renewedHere = Date.now();
  try {
    localStorage.setItem(RENEWED_KEY, String(renewedHere));
  } catch {
    /* storage full or blocked: the other tabs renew for themselves */
  }
}

/** The Web Locks every tab of the site shares; none in an older browser, or over plain http (not localhost). */
const sharedLocks = (): LockManager | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator.locks as LockManager | undefined);

/** Renews when it is still due, one tab at a time: while another tab renews, this one waits and uses its renewal. */
async function renewShared(due: () => boolean): Promise<void> {
  const locks = sharedLocks();
  // Without them, each tab renews by itself.
  if (!locks) return refresh();
  let ran: boolean;
  try {
    ran = await locks.request(RENEW_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) return false;
      // Another tab may have renewed just before this one got the lock.
      if (due()) await refresh();
      return true;
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // The browser refused the lock itself (a page that is not fully active): as without Web Locks.
    return refresh();
  }
  if (ran) return;
  // Another tab is renewing: its new cookies are this tab's too, once it is done.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const freed = await Promise.race([
    locks.request(RENEW_LOCK, () => true).catch(() => false),
    new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), RENEW_WAIT_MS))),
  ]);
  clearTimeout(timer);
  if (!freed) await refresh();
}

/**
 * POST /auth/refresh: swaps the refresh cookie for a new pair, so the session lasts 90 days from now. With `since`,
 * only when the session was not renewed since then, in this tab or another one (lastRenewal). One at a time in this
 * tab, and across tabs: while another tab renews, this one waits for that renewal and uses it. Rejects with an
 * ApiError: `unauthenticated` when the session has ended.
 */
export function renewSession(since?: number): Promise<void> {
  if (renewing) return renewing;
  const due = (): boolean => since === undefined || lastRenewal() < since;
  if (!due()) return Promise.resolve();
  renewing = renewShared(due).finally(() => {
    renewing = null;
  });
  return renewing;
}

/** Only a device where someone is signed in has a refresh token to try. */
const signedInHere = (): boolean => loadAccount() !== null;

/** A 401 `unauthenticated` on a device where someone is signed in: the session token it carried no longer works. */
async function sessionEnded(res: Response): Promise<boolean> {
  if (res.status !== 401 || !signedInHere()) return false;
  return (await failure(res.clone())).code === 'unauthenticated';
}

/**
 * Sends a request; when it says the session ended, renews the session and sends it once more. A renewal made since the
 * request went out, by another request or another tab, is used instead: its new cookies are already in place. Another
 * tab may renew while the request is on its way again, so after a 401 it is sent again at most RESENDS times. If a
 * renewal gets no answer, that is the error (the device may still be signed in); if it says the session ended, the
 * last answer is.
 */
async function sendRenewing(method: Method, path: string, body: unknown, opts: RequestOptions): Promise<Response> {
  for (let resent = 0; ; resent++) {
    const sentAt = Date.now();
    const res = await send(method, path, body, opts);
    if (resent === RESENDS || !(await sessionEnded(res))) return res;
    try {
      await renewSession(sentAt);
    } catch (e) {
      const renewal = asApiError(e);
      if (renewal.code === 'unavailable' || renewal.code === 'busy' || renewal.status >= 500) throw renewal;
      return res;
    }
  }
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
