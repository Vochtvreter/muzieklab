import { randomBytes } from 'node:crypto';
import {
  expect, request, test as base, type APIRequestContext, type APIResponse, type BrowserContext, type Locator, type Page, type Route,
} from '@playwright/test';
import type { AccountDetail, AccountListResponse, AccountSummary, InviteCreated, LinkCreated, Me, Role } from '../../shared/api';
import en from '../../src/i18n/en.json' with { type: 'json' };
import { expectNoClippedLabels, expectNoSideScroll, VIEWPORTS } from '../helpers';

/**
 * What the smoke specs share (docs/SMOKE.md): where the site is, the rules that keep the suite to its own accounts,
 * requests to the API, a watch on every page for errors, and the fixtures (the admin, a person's browser, and the
 * accounts a test makes, removed again when it ends).
 *
 * The rules, in code:
 * - Only a test site is signed in to or changed (ACCOUNT_HOSTS): on any other site, production first of all,
 *   NO_ACCOUNTS skips those tests, and send() refuses every change.
 * - The suite only changes accounts it made itself: smoke-<run>-…@example.invalid, named "Smoke …". Every change the
 *   admin makes, through the API or the admin screens, goes through one guard (Admin.guard) that refuses any other.
 * - The admin signs in once per worker, through the API (never a wrong password: one failure stops the run), and signs
 *   out when the worker ends. It never changes itself: no name, password, email, progress or sign-out-everywhere.
 * - Wrong passwords are only ever typed for the suite's own accounts, once or twice a run.
 * - Nothing that could hold a password is printed or recorded: a failed request's error is cut to its first line
 *   (Playwright's call log after it lists the cookies), and with tracing on nothing signs in.
 */

/** The site under test, with a trailing slash (playwright.smoke.config.ts sets SMOKE_URL for every worker). */
export const SITE = process.env.SMOKE_URL ?? 'https://test.vivanova.app/';
export const ORIGIN = new URL(SITE).origin;
export const API = new URL('api/v1', SITE).href;
/** The host, without the dot a fully written name may end with (vivanova.app. is vivanova.app). */
const HOST = new URL(SITE).hostname.replace(/\.$/, '');

/** Production: the anonymous checks may run there, nothing that signs in or changes anything. */
export const PRODUCTION = HOST === 'vivanova.app' || HOST.endsWith('.vivanova.app') && HOST !== 'test.vivanova.app';

/**
 * The only sites the suite signs in to and changes: the test site, and the app run on this computer. Any other is
 * refused, whatever it is (production under another name, an IP address): add a test site here to sign in there.
 */
const ACCOUNT_HOSTS = ['test.vivanova.app', 'localhost', '127.0.0.1'];
const WRITES_ALLOWED = ACCOUNT_HOSTS.includes(HOST);

/** One id per run (playwright.smoke.config.ts), in every account the run makes. */
export const RUN_ID = process.env.SMOKE_RUN_ID ?? Date.now().toString(36);

const ADMIN_EMAIL = (process.env.MUZIEKLAB_TEST_EMAIL ?? '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.MUZIEKLAB_TEST_PASSWORD ?? '';

/** Set by global setup when tracing is on (`--trace`): a trace keeps every request body, the admin's password too. */
export const TRACING = 'Tracing is on (--trace): a trace keeps every request body, the admin password too, so the tests that sign in are skipped; run them without --trace';

/** Why the tests that sign in are skipped (not a test site, no admin account given, or tracing), or null when they run. */
export const NO_ACCOUNTS: string | null = PRODUCTION
  ? `${HOST} is production: the smoke tests never sign in or change anything there`
  : !WRITES_ALLOWED
    ? `${HOST} is not a test site the smoke tests may sign in to (${ACCOUNT_HOSTS.join(', ')}): they never sign in or change anything there`
    : !ADMIN_EMAIL || !ADMIN_PASSWORD
      ? 'MUZIEKLAB_TEST_EMAIL and MUZIEKLAB_TEST_PASSWORD are not set, so the tests that sign in are skipped (docs/SMOKE.md)'
      : process.env.SMOKE_TRACING
        ? TRACING
        : null;

/** Whether `trace` (a project's use.trace, which --trace sets) records anything. */
export const tracingOn = (trace: unknown): boolean => {
  const mode = typeof trace === 'string' ? trace : (trace as { mode?: string } | undefined)?.mode;
  return !!mode && mode !== 'off';
};

/** Every account the suite makes, and the only ones it ever changes: smoke-<run>-<test>-<label>@example.invalid. */
export const SMOKE_EMAIL = /^smoke-[a-z0-9]+(-[a-z0-9]+)+@example\.invalid$/;
/** This run's accounts start with this. */
export const RUN_PREFIX = `smoke-${RUN_ID}-`;
/** What a smoke account says when it deletes itself: Deleted accounts shows it, so the owner sees where it came from. */
export const FEEDBACK = `[smoke test] run ${RUN_ID}`;

/** An invite or new-password link of this site, as the admin screens show it and the API answers with it. */
export const linkPattern = (kind: 'invite' | 'reset'): RegExp => new RegExp(`^${ORIGIN.replace(/[.]/g, '\\.')}/#/${kind}/[A-Za-z0-9_-]{43}$`);

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// --- requests to the API -------------------------------------------------------------------------------------------

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A request to the API as the app sends it: a change carries this site's Origin (without it the API answers 403
 * bad_origin), and a change without a body sends none (an empty JSON body is a 400). "Busy" (the password queue is
 * full; nothing was counted) is tried again a second later. Changes are refused on any site but a test site.
 */
export async function send(req: APIRequestContext, method: Method, path: string, data?: unknown): Promise<APIResponse> {
  if (!WRITES_ALLOWED && method !== 'GET') throw new Error(`Refused: ${method} ${path} on ${HOST}, which is not a test site`);
  for (let tries = 1; ; tries++) {
    const res = await quietly(`${method} ${path.replace(/\?.*$/, '')}`, () =>
      req.fetch(API + path, {
        method,
        headers: method === 'GET' ? {} : { Origin: ORIGIN },
        ...(data === undefined ? {} : { data }),
        maxRedirects: 0,
      }),
    );
    if (res.status() !== 429 || tries === 5 || (await errorCode(res)) !== 'busy') return res;
    await sleep(1000);
  }
}

/**
 * A request that failed without an answer (connection reset, DNS, TLS) throws with only the first line of Playwright's
 * error: the call log after it lists the request's headers, its session cookies too, and the CI log is public.
 */
export async function quietly<T>(what: string, fetching: () => Promise<T>): Promise<T> {
  try {
    return await fetching();
  } catch (e) {
    throw new Error(`${what}: ${String((e as Error)?.message ?? e).split('\n')[0]}`);
  }
}

/** The API's error code in an answer ("forbidden"), or its status when the body is not an API error. */
export async function errorCode(res: APIResponse): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? String(res.status());
  } catch {
    return String(res.status());
  }
}

/** send() that must succeed: the answer's JSON (null for 204). The error names the route and the code, nothing sent. */
export async function call<T>(req: APIRequestContext, method: Method, path: string, data?: unknown): Promise<T> {
  const res = await send(req, method, path, data);
  if (!res.ok()) throw new Error(`${method} ${path.replace(/\?.*$/, '')}: ${res.status()} ${await errorCode(res)}`);
  return (res.status() === 204 ? null : await res.json()) as T;
}

/**
 * The suite's admin signs in: once per worker, and once in global setup and teardown. A refused sign-in is never tried
 * again (only "busy", which counts for nothing, is sent once more). A sign-in that went through but is not the admin
 * the suite needs is signed out again before the error, so no session is left open.
 */
export async function signInAdmin(req: APIRequestContext): Promise<Me> {
  if (SMOKE_EMAIL.test(ADMIN_EMAIL)) throw new Error('The smoke admin (MUZIEKLAB_TEST_EMAIL) must not be a smoke account itself.');
  const res = await send(req, 'POST', '/auth/sign-in', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!res.ok()) {
    const code = await errorCode(res);
    throw new Error(
      `The smoke admin (MUZIEKLAB_TEST_EMAIL) could not sign in: ${res.status()} ${code}. It is not tried again, so a wrong ` +
        'password cannot lock the account; check MUZIEKLAB_TEST_EMAIL and MUZIEKLAB_TEST_PASSWORD.',
    );
  }
  const me = (await res.json()) as Me;
  const wrong = !me.roles.includes('admin')
    ? 'The smoke account (MUZIEKLAB_TEST_EMAIL) is not an admin: the tests that sign in need one.'
    : SMOKE_EMAIL.test(me.email)
      ? 'The smoke admin (MUZIEKLAB_TEST_EMAIL) must not be a smoke account itself.'
      : null;
  if (wrong) {
    await send(req, 'POST', '/auth/sign-out');
    throw new Error(wrong);
  }
  return me;
}

// --- the guard: only the suite's own accounts are changed ----------------------------------------------------------

interface Owned {
  email: string;
  name: string;
}

/**
 * An account the suite may change: one it made (or the sweep found), with a smoke email, and never the admin itself.
 * Throws otherwise, so nothing is sent.
 */
function mustOwn(owned: Map<string, Owned>, adminId: string, id: string): Owned {
  const account = owned.get(id);
  if (!account || id === adminId || !SMOKE_EMAIL.test(account.email)) throw new Error(`Refused: account ${id} was not made by this smoke run`);
  return account;
}

/**
 * Removes accounts the suite left behind: smoke emails only, never the admin itself, and only those `pick` says
 * (old ones from runs that crashed, or this run's). An invite is canceled; an account is deleted by the admin.
 */
export async function sweep(req: APIRequestContext, me: Me, pick: (a: AccountSummary) => boolean): Promise<string[]> {
  const removed: string[] = [];
  for (let round = 0; round < 10; round++) {
    const { accounts } = await call<AccountListResponse>(req, 'GET', '/admin/accounts?q=' + encodeURIComponent('@example.invalid'));
    const left = accounts.filter((a) => SMOKE_EMAIL.test(a.email) && a.id !== me.id && a.email !== me.email && pick(a));
    if (!left.length) break;
    const owned = new Map(left.map((a) => [a.id, { email: a.email, name: a.name }]));
    for (const a of left) {
      mustOwn(owned, me.id, a.id);
      await removeAccount(req, a.id, a.status);
      removed.push(a.email);
    }
    // At most 500 come back at once: look again until none are left.
    if (accounts.length < 500) break;
  }
  return removed;
}

/** DELETE /admin/accounts/:id for an account the caller has checked is the suite's: 404 is gone already. */
async function removeAccount(req: APIRequestContext, id: string, status?: string): Promise<void> {
  const res = await send(req, 'DELETE', `/admin/accounts/${id}` + (status ? `?expect=${status}` : ''));
  if (res.status() === 204 || res.status() === 404) return;
  // Its status changed meanwhile (an invite was accepted): delete it as it is now.
  if (res.status() === 409 && (await errorCode(res)) === 'wrong_status') return removeAccount(req, id);
  throw new Error(`DELETE /admin/accounts/${id}: ${res.status()} ${await errorCode(res)}`);
}

// --- watching pages ------------------------------------------------------------------------------------------------

/** A response that is part of the design, not a fault: by method, path under the site, and status. */
export interface Allowed {
  method: Method;
  path: RegExp;
  status: number;
}

const ALWAYS: Allowed[] = [
  // Signed out, the app asks who is signed in.
  { method: 'GET', path: /^\/api\/v1\/me$/, status: 401 },
  // Another device saved meanwhile: the app merges and saves again.
  { method: 'PUT', path: /^\/api\/v1\/progress$/, status: 409 },
  // Production has no API yet: its 404 is what the app takes as "no API here" (src/api/client.ts).
  ...(PRODUCTION ? [{ method: 'GET' as const, path: /^\/api\/v1\//, status: 404 }] : []),
];

/**
 * Signed in, a request sent just before the session was renewed (a page load renews it when its last renewal, in any
 * tab, is 12 hours ago) is answered 401, and the app sends it again with the new cookies (src/api/client.ts). Allowed
 * only when that same request then gets another answer.
 */
const RETRIED: Allowed[] = [
  { method: 'GET', path: /^\/api\/v1\//, status: 401 },
  { method: 'PUT', path: /^\/api\/v1\/progress$/, status: 401 },
];

/**
 * The session ended elsewhere (blocked, signed out everywhere, a new password): the app's renewal is refused, and what
 * the device asked just then stays refused.
 */
export const SESSION_ENDED: Allowed[] = [{ method: 'POST', path: /^\/api\/v1\/auth\/refresh$/, status: 401 }, ...RETRIED];
/** A sign-in that is refused (a wrong password, or a blocked account). */
export const SIGN_IN_REFUSED: Allowed[] = [{ method: 'POST', path: /^\/api\/v1\/auth\/sign-in$/, status: 401 }];
/** A link that does not work (made up, used, or replaced by a newer one). */
export const LINK_REFUSED: Allowed[] = [{ method: 'POST', path: /^\/api\/v1\/auth\/(invite|reset)\/check$/, status: 410 }];

const matches = (rules: Allowed[], method: string, status: number, path: string): boolean =>
  rules.some((a) => a.method === method && a.status === status && a.path.test(path));

/**
 * Everything that goes wrong in a browser context: errors thrown on a page, console errors (and warnings of a missing
 * translation), answers of this site with status 400 and up except the allowed ones, a 401 that is not sent again after
 * a renewal, and requests to this site that got no answer at all. Chrome's own "Failed to load resource" console lines
 * are left to the answers and failed requests they are about. Requests that were aborted (a page that closed or went
 * elsewhere, a search typed over) or that the smoke guard stopped are not faults.
 */
export class Watcher {
  problems: string[] = [];
  private allowed: Allowed[] = [...ALWAYS];
  private quiet: RegExp[] = [];
  private failures: RegExp[] = [];
  /** 401s waiting for their request to be sent again: "GET /api/v1/progress" → how many. */
  private pending = new Map<string, number>();

  constructor(ctx: BrowserContext) {
    ctx.on('weberror', (e) => this.problems.push(`page error: ${e.error().message}`));
    ctx.on('console', (m) => {
      const text = m.text();
      if (this.quiet.some((q) => q.test(text))) return;
      if (m.type() === 'error' && !text.startsWith('Failed to load resource')) this.problems.push(`console error: ${text}`);
      if (m.type() === 'warning' && text.startsWith('[i18n]')) this.problems.push(`console warning: ${text}`);
    });
    ctx.on('response', (r) => {
      const url = new URL(r.url());
      if (url.origin !== ORIGIN) return;
      const method = r.request().method();
      const status = r.status();
      const key = `${method} ${url.pathname}${url.search}`;
      // Sent again after a renewal, and answered: the 401 before it was the renewal's.
      if (status !== 401 && this.pending.has(key)) {
        const left = this.pending.get(key)! - 1;
        if (left) this.pending.set(key, left);
        else this.pending.delete(key);
      }
      if (status < 400 || matches(this.allowed, method, status, url.pathname)) return;
      if (matches(RETRIED, method, status, url.pathname)) this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
      else this.problems.push(`${status} ${method} ${url.pathname}`);
    });
    ctx.on('requestfailed', (r) => {
      const url = new URL(r.url());
      if (url.origin !== ORIGIN) return;
      const error = r.failure()?.errorText ?? 'no answer';
      if (/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(error) || this.failures.some((f) => f.test(error))) return;
      this.problems.push(`${r.method()} ${url.pathname} got no answer: ${error}`);
    });
  }

  allow(...more: Allowed[]): void {
    this.allowed.push(...more);
  }

  /** Lets one console message through: only for a known app bug, which a test of its own reports. */
  allowConsole(text: RegExp): void {
    this.quiet.push(text);
  }

  /** Lets requests that fail this way through (net::ERR_INTERNET_DISCONNECTED, for the offline test). */
  allowFailure(error: RegExp): void {
    this.failures.push(error);
  }

  /** Back to nothing seen and only the usual answers allowed (the admin's context lasts for the whole worker). */
  reset(): void {
    this.problems = [];
    this.allowed = [...ALWAYS];
    this.quiet = [];
    this.failures = [];
    this.pending.clear();
  }

  /** Everything seen so far, after giving a 401 a few seconds to be sent again. */
  async found(): Promise<string[]> {
    for (let i = 0; i < 25 && this.pending.size; i++) await sleep(200);
    return [...this.problems, ...[...this.pending].map(([key, n]) => `401 ${key}${n > 1 ? ` (${n} times)` : ''}, not sent again after a renewal`)];
  }

  async expectClean(): Promise<void> {
    expect(await this.found(), 'errors on the page: thrown, logged, or answers that failed').toEqual([]);
  }
}

const watchers = new WeakMap<BrowserContext, Watcher>();
/** The watch on a page's browser context. */
export const watchOf = (page: Page): Watcher => watchers.get(page.context())!;

// --- people ----------------------------------------------------------------------------------------------------------

export type Size = 'phone' | 'tablet' | 'desktop';

/** One person's browser: a context of its own (cookies, storage), its first page, and its watch. */
export interface Device {
  ctx: BrowserContext;
  page: Page;
  watch: Watcher;
}

export interface DeviceOptions {
  size?: Size;
  colorScheme?: 'light' | 'dark';
  locale?: string;
}

/** An account a test made. `password` follows a change, so the clean-up can still sign in with it. */
export interface Person {
  id: string;
  email: string;
  name: string;
  password: string;
}

/** A password the rules take (10–128 characters, not common, not the email), new for every account. */
export const newPassword = (): string => `${randomBytes(12).toString('base64url')} four rests`;

/** The text after the last slash of a link: its token. */
const tokenOf = (link: string): string => link.slice(link.lastIndexOf('/') + 1);

/**
 * The suite's admin in one worker: signed in once, in a browser context of its own that the admin screens and its API
 * calls share (so the app renewing the session on a page load renews it for the calls too).
 */
export class Admin {
  me!: Me;
  readonly watch: Watcher;
  /** Accounts this worker made (through the API or the invite screen): the only ones it may change. */
  readonly owned = new Map<string, Owned>();

  constructor(readonly ctx: BrowserContext) {
    this.watch = new Watcher(ctx);
    watchers.set(ctx, this.watch);
  }

  async signIn(): Promise<void> {
    this.me = await signInAdmin(this.ctx.request);
    await this.ctx.route((url) => url.origin === ORIGIN && url.pathname.startsWith('/api/v1/'), (route) => this.guard(route));
  }

  async signOut(): Promise<void> {
    await send(this.ctx.request, 'POST', '/auth/sign-out');
  }

  /**
   * Every request the admin screens make. Reads go through. Changes go through only for this worker's accounts and for
   * invites with a smoke email (whose new account it then owns). The admin's own progress is never saved: the suite
   * plays nothing as the admin, and a page's first sync stays on the page. Anything else is refused and fails the test.
   */
  private async guard(route: Route): Promise<void> {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname.slice('/api/v1'.length);
    if (method === 'GET' || method === 'HEAD' || (method === 'POST' && path === '/auth/refresh')) return route.continue();
    if (method === 'PUT' && path === '/progress') return route.abort('blockedbyclient');
    if (method === 'POST' && path === '/admin/invites') {
      const body = req.postDataJSON() as { email?: unknown; name?: unknown } | null;
      if (typeof body?.email === 'string' && SMOKE_EMAIL.test(body.email) && body.email.startsWith(RUN_PREFIX)) {
        let res: APIResponse;
        try {
          res = await quietly('POST /admin/invites', () => route.fetch());
        } catch (e) {
          this.watch.problems.push((e as Error).message);
          return route.abort('failed');
        }
        if (res.ok()) {
          const { account } = (await res.json()) as InviteCreated;
          this.owned.set(account.id, { email: account.email, name: account.name });
        }
        return route.fulfill({ response: res });
      }
    }
    const one = /^\/admin\/accounts\/([0-9a-f]{24})(\/(invite|reset)-link)?$/.exec(path);
    if (one && (one[2] ? method === 'POST' : method === 'PATCH' || method === 'DELETE')) {
      try {
        mustOwn(this.owned, this.me.id, one[1]);
        return route.continue();
      } catch {
        // Refused below.
      }
    }
    this.watch.problems.push(`refused by the smoke guard: ${method} ${path}`);
    return route.abort('blockedbyclient');
  }

  /**
   * An API call as the admin. A page of this context may be renewing the session just then (a 401 for the old token):
   * then it is sent once more, a moment later.
   */
  private async ask(method: Method, path: string, data?: unknown): Promise<APIResponse> {
    const res = await send(this.ctx.request, method, path, data);
    if (res.status() !== 401) return res;
    await sleep(1500);
    return send(this.ctx.request, method, path, data);
  }

  private async call<T>(method: Method, path: string, data?: unknown): Promise<T> {
    const res = await this.ask(method, path, data);
    if (!res.ok()) throw new Error(`${method} ${path.replace(/\?.*$/, '')}: ${res.status()} ${await errorCode(res)}`);
    return (res.status() === 204 ? null : await res.json()) as T;
  }

  /** Invites a smoke account of this run (refused for any other email); the account is this worker's from now on. */
  async invite(email: string, name: string, roles: Role[]): Promise<InviteCreated> {
    if (!SMOKE_EMAIL.test(email) || !email.startsWith(RUN_PREFIX) || !name.startsWith('Smoke ')) throw new Error(`Refused: ${email} is not a smoke account of this run`);
    const created = await this.call<InviteCreated>('POST', '/admin/invites', { email, name, roles });
    this.owned.set(created.account.id, { email, name });
    return created;
  }

  /** A GET as the admin, which must succeed. */
  async read<T>(path: string): Promise<T> {
    return this.call<T>('GET', path);
  }

  /** Any account, to read (null when there is none). */
  async account(id: string): Promise<AccountDetail | null> {
    const res = await this.ask('GET', `/admin/accounts/${id}`);
    if (res.status() === 404) return null;
    if (!res.ok()) throw new Error(`GET /admin/accounts/:id: ${res.status()} ${await errorCode(res)}`);
    return (await res.json()) as AccountDetail;
  }

  /** Changes one of this worker's accounts. */
  async update(id: string, change: Record<string, unknown>): Promise<AccountDetail> {
    mustOwn(this.owned, this.me.id, id);
    return this.call<AccountDetail>('PATCH', `/admin/accounts/${id}`, change);
  }

  /** A new-password link for one of this worker's accounts. */
  async resetLink(id: string): Promise<LinkCreated> {
    mustOwn(this.owned, this.me.id, id);
    return this.call<LinkCreated>('POST', `/admin/accounts/${id}/reset-link`);
  }

  /** Cancels the invite of, or deletes, one of this worker's accounts. */
  async remove(id: string, status?: string): Promise<void> {
    mustOwn(this.owned, this.me.id, id);
    // A page may be renewing the session: once more after a 401, as ask() does.
    try {
      await removeAccount(this.ctx.request, id, status);
    } catch (e) {
      if (!String(e).includes(': 401 ')) throw e;
      await sleep(1500);
      await removeAccount(this.ctx.request, id, status);
    }
  }

  /** Whether `id` is one of this worker's accounts (for the admin screens: never act on any other). */
  owns(id: string): boolean {
    return this.owned.has(id) && id !== this.me.id && SMOKE_EMAIL.test(this.owned.get(id)!.email);
  }
}

/**
 * Takes an account off the site: an invite is canceled (it leaves nothing behind); an account deletes itself with its
 * password and all of its data, so its entry in Deleted accounts says "[smoke test]"; one that cannot (blocked, or its
 * password is not known) is deleted by the admin, whose entry the API keeps without a note.
 */
export async function cleanUp(admin: Admin, person: Person): Promise<void> {
  const now = await admin.account(person.id);
  if (!now) return;
  if (now.status === 'active' && person.password) {
    const req = await request.newContext();
    try {
      if ((await send(req, 'POST', '/auth/sign-in', { email: person.email, password: person.password })).ok()) {
        const res = await send(req, 'DELETE', '/me', { password: person.password, removeData: true, feedback: FEEDBACK });
        if (res.status() === 204) return;
      }
    } finally {
      await req.dispose();
    }
  }
  await admin.remove(person.id, now.status);
}

let tests = 0;

/** The accounts one test makes: smoke-<run>-<test>-<label>@example.invalid, all removed when the test ends. */
export class Throwaways {
  readonly made: Person[] = [];
  /** In the email of every account of this test: searching for it finds them all, and only them. */
  readonly tag: string;

  constructor(
    private readonly admin: Admin,
    workerIndex: number,
  ) {
    this.tag = `${RUN_PREFIX}w${workerIndex}t${++tests}${randomBytes(1).toString('hex')}-`;
  }

  /** An email and name for a new account of this test ("pending" → smoke-…-pending@example.invalid, "Smoke Pending …"). */
  identity(label: string): { email: string; name: string } {
    const email = `${this.tag}${label}@example.invalid`;
    if (!SMOKE_EMAIL.test(email)) throw new Error(`Not a smoke email: ${email}`);
    return { email, name: `Smoke ${label[0].toUpperCase()}${label.slice(1)} ${this.tag.slice(6, -1)}` };
  }

  /** Invited through the API, not accepted yet: the account and its link. */
  async invite(label: string, roles: Role[] = []): Promise<{ person: Person; link: string }> {
    const { email, name } = this.identity(label);
    const created = await this.admin.invite(email, name, roles);
    const person = { id: created.account.id, email, name, password: newPassword() };
    this.made.push(person);
    return { person, link: created.link };
  }

  /** Invited through the API and accepted on `device`, which is signed in as them. */
  async member(label: string, device: Device, roles: Role[] = []): Promise<Person> {
    const { person, link } = await this.invite(label, roles);
    await accept(device.ctx.request, link, person.password);
    return person;
  }

  /** An account the admin invited on the invite screen (its id came through the guard), to be removed with the rest. */
  adopt(email: string, password: string): Person {
    const id = [...this.admin.owned].find(([, a]) => a.email === email)?.[0];
    if (!id) throw new Error(`The invite for ${email} was not made through the smoke guard`);
    const person = { id, email, name: this.admin.owned.get(id)!.name, password };
    this.made.push(person);
    return person;
  }

  /** Removes every account of this test; what fails is left to global teardown, and said. */
  async cleanUp(): Promise<string[]> {
    const failed: string[] = [];
    for (const person of this.made) {
      try {
        await cleanUp(this.admin, person);
      } catch (e) {
        failed.push(`${person.email}: ${(e as Error).message}`);
      }
    }
    return failed;
  }
}

/** Accepts an invite through the API, from `req`'s cookie jar, which is then signed in as the new account. */
export async function accept(req: APIRequestContext, link: string, password: string): Promise<Me> {
  return call<Me>(req, 'POST', '/auth/invite/accept', { token: tokenOf(link), password });
}

/** Signs `device` in through the API. */
export async function signInApi(device: Device, person: Person): Promise<Me> {
  return call<Me>(device.ctx.request, 'POST', '/auth/sign-in', { email: person.email, password: person.password });
}

// --- the screens -----------------------------------------------------------------------------------------------------

export const accountSection = (page: Page): Locator => page.getByRole('region', { name: 'Account' });
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Settings → Account's row for the signed-in account: its name, then its email. */
export const accountRow = (page: Page, name: string): Locator => accountSection(page).getByRole('link', { name: new RegExp('^' + escapeRegExp(name)) });

/** The sign-in screen, filled in and sent. */
export async function signInWithForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto('./#/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Settings → Account → Sign out, keeping or removing this device's progress. */
export async function signOut(page: Page, progress: 'Keep' | 'Remove'): Promise<void> {
  await page.goto('./#/settings');
  const section = accountSection(page);
  await section.getByRole('button', { name: 'Sign out', exact: true }).click();
  const confirm = section.getByRole('alertdialog', { name: 'Sign out on this device?' });
  const choice = confirm.getByRole('group', { name: 'Progress on this device' });
  await expect(choice.getByRole('button', { name: 'Keep' })).toHaveAttribute('aria-pressed', 'true');
  if (progress === 'Remove') await choice.getByRole('button', { name: 'Remove' }).click();
  await confirm.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(section.locator('.row-status')).toHaveText('Signed out.');
  await expect(section.getByRole('link', { name: /^Sign in/ })).toBeVisible();
}

/** The admin screen of one of this worker's accounts, checked to be that account before anything is pressed. */
export async function openAccount(page: Page, admin: Admin, person: Person): Promise<void> {
  if (!admin.owns(person.id)) throw new Error(`Refused: account ${person.id} was not made by this smoke run`);
  await page.goto(`./#/admin/account/${person.id}`);
  await expect(page.getByRole('heading', { level: 1, name: person.name, exact: true })).toBeVisible();
  await expect(page.locator('.acct-sub-row')).toContainText(person.email);
}

/** A cookie's value in a context (the session cookies are HttpOnly: the page cannot read them). */
export async function cookie(ctx: BrowserContext, name: '__Host-session' | '__Secure-refresh'): Promise<string | undefined> {
  return (await ctx.cookies()).find((c) => c.name === name)?.value;
}

/** What the app keeps in this browser's storage under `key` (muzieklab.progress.v1, …), parsed. */
export async function stored(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

/** The page's background is dark in dark mode and light in light mode. */
export async function expectTheme(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  const rgb = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const lightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (scheme === 'dark') expect(lightness, `background ${rgb} is dark`).toBeLessThan(0.3);
  else expect(lightness, `background ${rgb} is light`).toBeGreaterThan(0.7);
}

/** Text that looks like one of the catalog's keys (settings.signIn, learn.ch9.s3.title): a message that was not found. */
const RAW_KEY = new RegExp(`\\b(${Object.keys(en).join('|')})\\.[a-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)*\\b`, 'g');

export async function expectNoRawKeys(page: Page): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText);
  expect(text.match(RAW_KEY) ?? [], 'message keys shown instead of their text').toEqual([]);
}

/**
 * Goes to `hash` in the app already open (the first time, it opens it), and checks the screen: its heading, no
 * sideways scroll, no button that cuts its words off, and no message key instead of its text.
 */
export async function checkScreen(page: Page, hash: string, heading: string | RegExp): Promise<void> {
  await test.step(hash, async () => {
    if (!page.url().startsWith('http')) await page.goto('./' + hash);
    else await page.evaluate((h) => void (location.hash = h), hash);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: typeof heading === 'string' })).toBeVisible();
    await expectNoSideScroll(page);
    await expectNoClippedLabels(page);
    await expectNoRawKeys(page);
  });
}

// --- fixtures --------------------------------------------------------------------------------------------------------

interface WorkerFixtures {
  /** The suite's admin, signed in once for this worker. */
  admin: Admin;
}

interface TestFixtures {
  /** A new page in the admin's context, watched: the admin screens. */
  adminPage: Page;
  /** A new person's browser (phone unless said), closed when the test ends; its pages are watched. */
  device: (options?: DeviceOptions) => Promise<Device>;
  /** The accounts this test makes, removed when it ends, even when it fails. */
  smoke: Throwaways;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // The default page is watched too: a test that uses it fails on any error seen there.
  page: async ({ page }, use) => {
    const watch = new Watcher(page.context());
    watchers.set(page.context(), watch);
    await use(page);
    await watch.expectClean();
  },

  admin: [
    async ({ browser }, use, workerInfo) => {
      if (NO_ACCOUNTS) throw new Error(NO_ACCOUNTS);
      // Also here, should global setup not have said so: a trace would keep the admin's sign-in, password and all.
      if (tracingOn(workerInfo.project.use.trace)) throw new Error(TRACING);
      const ctx = await browser.newContext({ baseURL: SITE, viewport: VIEWPORTS.desktop, locale: 'en-US', serviceWorkers: 'block' });
      const admin = new Admin(ctx);
      await admin.signIn();
      await use(admin);
      // Its session ends with the worker, so the admin's devices signed in do not grow with every run.
      await admin.signOut();
      await ctx.close();
    },
    { scope: 'worker' },
  ],

  adminPage: async ({ admin }, use) => {
    admin.watch.reset();
    const page = await admin.ctx.newPage();
    await use(page);
    // A 401 just before the end is given its moment to be sent again while the page is still open.
    await admin.watch.found();
    await page.close();
    await admin.watch.expectClean();
  },

  device: async ({ browser }, use) => {
    const made: Device[] = [];
    await use(async ({ size = 'phone', colorScheme, locale = 'en-US' } = {}) => {
      const ctx = await browser.newContext({ baseURL: SITE, viewport: VIEWPORTS[size], hasTouch: size !== 'desktop', colorScheme, locale, serviceWorkers: 'block' });
      const watch = new Watcher(ctx);
      watchers.set(ctx, watch);
      const device = { ctx, page: await ctx.newPage(), watch };
      made.push(device);
      return device;
    });
    const problems: string[] = [];
    for (const d of made) problems.push(...(await d.watch.found()));
    for (const d of made) await d.ctx.close();
    expect(problems, 'errors on the page: thrown, logged, or answers that failed').toEqual([]);
  },

  smoke: async ({ admin }, use, testInfo) => {
    const accounts = new Throwaways(admin, testInfo.workerIndex);
    await use(accounts);
    const failed = await accounts.cleanUp();
    expect(failed, 'accounts this test could not remove (global teardown tries again)').toEqual([]);
  },
});

export { expect };
