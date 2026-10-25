/**
 * The API client (BACKEND-PLAN.md §1, §7): JSON over HTTPS under /api/v1 on the same site, with the session in an
 * HttpOnly cookie the browser sends by itself. The contract — every body and error code — is shared/api.ts.
 *
 * The API lives at the site root, so the path is absolute (`/api/v1`), unlike the app's own `./` base. Production has
 * no API yet: there `/api/…` answers with a 404 that is not JSON, which counts as `unavailable`, like a network error
 * or a timeout. So a screen never has to tell "offline" from "no API here".
 */
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '../../shared/api';

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

async function request<T>(method: Method, path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await send(method, path, body, opts);
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
  const res = await send('GET', '/me/export', undefined, {});
  if (!res.ok) throw await failure(res);
  if (!isJson(res)) throw new ApiError(res.status, 'unavailable', `HTTP ${res.status} without a JSON body`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = EXPORT_FILE;
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
