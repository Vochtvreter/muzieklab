import { expect, type Locator, type Page } from '@playwright/test';
import { PERMISSIONS, type AccountDetail, type AccountSummary, type ApiErrorBody, type ErrorCode, type Me } from '../shared/api';
import { PATH_UNITS } from '../src/game/tracks';

/** Screen sizes the app must work at: the canvas boards plus small, landscape and laptop screens. */
export const VIEWPORTS = {
  'phone-se': { width: 320, height: 568 },
  'phone-small': { width: 375, height: 667 },
  phone: { width: 390, height: 844 },
  // What a phone browser leaves of the screen under its toolbars (Safari on an iPhone 14 and on an iPhone SE), so
  // exercise screens are checked at the height a player really has (DESIGN.md §9).
  'phone-browser': { width: 390, height: 664 },
  'phone-se-browser': { width: 375, height: 553 },
  'phone-landscape': { width: 844, height: 390 },
  tablet: { width: 834, height: 1194 },
  'tablet-landscape': { width: 1180, height: 820 },
  'laptop-720': { width: 1280, height: 720 },
  desktop: { width: 1280, height: 800 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** The element can be scrolled to and a click on its centre lands on it (nothing covers it). */
export async function expectClickable(el: Locator, opts: { scroll?: boolean } = {}): Promise<void> {
  await expect(el).toBeVisible();
  // Off for screens that must fit without scrolling (Play): scripts can scroll overflow: hidden boxes, people cannot.
  if (opts.scroll !== false) await el.scrollIntoViewIfNeeded();
  // Web fonts that load late reflow the page; measure after them, and measure and hit-test in one step.
  await el.evaluate(() => document.fonts.ready.then(() => undefined));
  // Scrolled again on every try: a box still opening (an accordion) can move the element after the first scroll.
  const rescroll = opts.scroll !== false;
  const probe = (): Promise<string> =>
    el.evaluate((node, again) => {
      if (again) node.scrollIntoView({ block: 'nearest' });
      const r = node.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return 'centre is off screen';
      const top = document.elementFromPoint(x, y);
      return top && (node === top || node.contains(top)) ? 'ok' : 'covered by ' + (top ? top.tagName.toLowerCase() + '.' + top.className : 'nothing');
    }, rescroll);
  await expect.poll(probe, { message: 'the element is on screen and nothing covers it', timeout: 3000 }).toBe('ok');
}

/** An exercise screen fits: its page does not scroll (DESIGN.md §9: laid out to fit, it never scrolls during play). */
export async function expectFits(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const over = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.page') ?? document.documentElement;
    return el.scrollHeight - el.clientHeight;
  });
  expect(over, 'the screen scrolls').toBeLessThanOrEqual(1);
}

/** A touch target at least 44 px tall (DESIGN.md §9, visual design tokens). */
export async function expectTouchHeight(el: Locator): Promise<void> {
  expect((await el.boundingBox())!.height, 'shorter than 44 px').toBeGreaterThanOrEqual(44);
}

/** The box shows all of its content (nothing spills out of a card that was squeezed too small). */
export async function expectNotSqueezed(el: Locator): Promise<void> {
  const spill = await el.evaluate((node) => node.scrollHeight - node.clientHeight);
  expect(spill, 'content spills out of the box').toBeLessThanOrEqual(1);
}

/** Two boxes do not overlap (sibling cards never draw over each other). */
export async function expectNoOverlap(a: Locator, b: Locator): Promise<void> {
  const [ra, rb] = [(await a.boundingBox())!, (await b.boundingBox())!];
  const overlap = ra.x < rb.x + rb.width && rb.x < ra.x + ra.width && ra.y < rb.y + rb.height && rb.y < ra.y + ra.height;
  expect(overlap, 'boxes overlap').toBe(false);
}

/** No button or segmented choice cuts its words off (longer translations must wrap or fit, DESIGN.md §11). */
export async function expectNoClippedLabels(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, .seg-btn, a.btn, select')]
      .filter((el) => el.offsetParent !== null && /\p{L}/u.test(el.textContent ?? '') && el.scrollWidth > el.clientWidth + 1)
      .map((el) => (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.tagName),
  );
  expect(clipped, 'labels cut off').toEqual([]);
}

export async function expectNoSideScroll(page: Page): Promise<void> {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, 'no horizontal scroll').toBe(false);
}

/** Seeds localStorage before the app loads. */
export async function seed(page: Page, data: { prefs?: object; progress?: object }): Promise<void> {
  await page.addInitScript((d) => {
    if (d.prefs) localStorage.setItem('muzieklab.prefs.v1', JSON.stringify(d.prefs));
    if (d.progress) localStorage.setItem('muzieklab.progress.v1', JSON.stringify(d.progress));
  }, data);
}

export const pad = (page: Page): Locator => page.getByRole('button', { name: 'Tap pad' });

type Lessons = Record<string, { stars: number; bestAccuracy: number }>;

/**
 * Progress `lessons` with `stars` on every Learning path lesson up to and including `id` (its number in the path, "3.5"),
 * under their progress keys ("pitch:1.1", rhythm "1.1"). The path starts with sol (unit 1), then rhythm unit 1 (unit 2).
 */
export function pathUpTo(id: string, stars = 2, bestAccuracy = 88): Lessons {
  const all = PATH_UNITS.flatMap((u) => u.lessons);
  const n = all.findIndex((l) => l.id === id);
  return Object.fromEntries(all.slice(0, n + 1).map((l) => [l.key, { stars, bestAccuracy }]));
}

/** Sol's unit passed: the path goes on with rhythm lesson 1.1, which the path calls lesson 2.1. */
export const SOL_DONE: Lessons = pathUpTo('1.5');

// --- accounts: the API, mocked (no API server runs for e2e) -------------------------------------------------------

/** One request the page made to /api/v1. `path` has no /api/v1 and no query ('/admin/accounts'). */
export interface ApiCall {
  method: string;
  path: string;
  query: URLSearchParams;
  /** The JSON body, parsed (undefined without one). */
  body: unknown;
  /** The values of a route key's `:name` parts ('GET /admin/accounts/:id' → { id }). */
  params: Record<string, string>;
}

export interface MockReply {
  /** 200 by default; 204 sends no body. */
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}

/** A fixed answer, or one made from the request. */
export type MockHandler = MockReply | ((call: ApiCall) => MockReply | Promise<MockReply>);

/** Keyed 'METHOD /path', the path as in shared/api.ts with `:name` for a part that varies: 'PATCH /admin/accounts/:id'. */
export type MockRoutes = Record<string, MockHandler>;

export interface MockApi {
  /** Every request the page made to the API, in order. */
  calls: ApiCall[];
  /** The requests one route key answered. */
  callsTo(key: string): ApiCall[];
  /** Adds routes, or replaces their answers (for the rest of the test). */
  set(routes: MockRoutes): void;
}

function matchKey(key: string, method: string, path: string): Record<string, string> | null {
  const [m, pattern] = key.split(' ');
  if (m !== method) return null;
  const want = pattern.split('/');
  const got = path.split('/');
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

/**
 * Answers the page's /api/v1 requests from `routes`; anything else gets a JSON 404 `not_found` naming the request, so a
 * missing mock shows up as an error on the screen instead of as "no API". Call it before page.goto, and block the
 * service worker in the spec (`test.use({ serviceWorkers: 'block' })`): requests a service worker handles bypass
 * page.route.
 */
export async function mockApi(page: Page, routes: MockRoutes = {}): Promise<MockApi> {
  const table: MockRoutes = { ...routes };
  const calls: ApiCall[] = [];
  const keyOf = new Map<ApiCall, string>();
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const raw = req.postData();
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    let reply: MockReply = { status: 404, json: { error: 'not_found', message: `unmocked ${req.method()} ${path}` } satisfies ApiErrorBody };
    for (const [key, handler] of Object.entries(table).reverse()) {
      const params = matchKey(key, req.method(), path);
      if (!params) continue;
      const call: ApiCall = { method: req.method(), path, query: url.searchParams, body, params };
      calls.push(call);
      keyOf.set(call, key);
      reply = typeof handler === 'function' ? await handler(call) : handler;
      break;
    }
    const status = reply.status ?? 200;
    await route.fulfill({
      status,
      headers: { 'cache-control': 'no-store', ...reply.headers },
      contentType: 'application/json',
      body: status === 204 || reply.json === undefined ? '' : JSON.stringify(reply.json),
    });
  });
  return {
    calls,
    callsTo: (key) => calls.filter((c) => keyOf.get(c) === key),
    set: (more) => {
      for (const [k, v] of Object.entries(more)) {
        delete table[k];
        table[k] = v;
      }
    },
  };
}

/** An error answer as the API sends it (ApiErrorBody). */
export const apiError = (error: ErrorCode, status: number, extra: Partial<ApiErrorBody> = {}): MockReply => ({
  status,
  json: { error, message: error, ...extra } satisfies ApiErrorBody,
});

/** A signed-in member: no roles, premium through January 31, 2027 (a calendar day, the same in every time zone). */
export const ME_MEMBER: Me = {
  id: '6718f0c2a1b2c3d4e5f60001',
  email: 'sam@example.com',
  name: 'Sam Jansen',
  locale: null,
  roles: [],
  permissions: ['self.manage', 'progress.own', 'class.join'],
  premium: { active: true, until: '2027-01-31' },
  createdAt: '2026-10-20T09:00:00.000Z',
};

/** A signed-in admin: every permission. */
export const ME_ADMIN: Me = {
  id: '6718f0c2a1b2c3d4e5f60002',
  email: 'ann@example.com',
  name: 'Ann de Vries',
  locale: 'en',
  roles: ['admin'],
  permissions: [...PERMISSIONS],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
};

/** Nobody signed in: GET /me is a 401. */
export const SIGNED_OUT: MockRoutes = {
  'GET /me': apiError('unauthenticated', 401),
  'POST /auth/sign-out': apiError('unauthenticated', 401),
};

/** Signed in as `me`: GET /me answers with it, and signing out works. */
export const signedInAs = (me: Me): MockRoutes => ({
  'GET /me': { json: me },
  'POST /auth/sign-out': { status: 204 },
  'POST /auth/sign-out-everywhere': { status: 204 },
});
export const MEMBER: MockRoutes = signedInAs(ME_MEMBER);
export const ADMIN: MockRoutes = signedInAs(ME_ADMIN);

/** An invite or new-password token as the server makes them (32 random bytes, base64url). */
export const TOKEN = 'q3Vb9JzR1kLx7Pm2Ws5Tn8Yc4Hd6Fg0Ae-Ui_Oj3Ks';

/** Accounts for the admin list: one of each status. */
export const ACCOUNTS: AccountSummary[] = [
  { id: '6718f0c2a1b2c3d4e5f60003', email: 'lies@example.com', name: 'Lies Bakker', status: 'invited', roles: ['teacher'], premium: { active: false, until: null },
    lastSignInAt: null, createdAt: '2026-10-22T10:00:00.000Z' },
  { id: ME_MEMBER.id, email: ME_MEMBER.email, name: ME_MEMBER.name, status: 'active', roles: [], premium: ME_MEMBER.premium,
    lastSignInAt: '2026-10-23T08:30:00.000Z', createdAt: ME_MEMBER.createdAt },
  { id: '6718f0c2a1b2c3d4e5f60004', email: 'piet@example.com', name: 'Piet Visser', status: 'blocked', roles: [], premium: { active: false, until: null },
    lastSignInAt: '2026-10-10T19:00:00.000Z', createdAt: '2026-10-05T10:00:00.000Z' },
  { id: ME_ADMIN.id, email: ME_ADMIN.email, name: ME_ADMIN.name, status: 'active', roles: ['admin'], premium: ME_ADMIN.premium,
    lastSignInAt: '2026-10-23T07:00:00.000Z', createdAt: ME_ADMIN.createdAt },
];

/** One account in detail (the admin's one-account screen). */
export const accountDetail = (a: AccountSummary, more: Partial<AccountDetail> = {}): AccountDetail => ({
  ...a,
  inviteExpiresAt: a.status === 'invited' ? '2026-10-29T10:00:00.000Z' : null,
  sessions: a.status === 'active' ? 2 : 0,
  ...more,
});

/** Seeds the cached account (muzieklab.account.v1), as a signed-in device keeps it for offline use. */
export async function seedAccount(page: Page, me: Me): Promise<void> {
  await page.addInitScript((m) => localStorage.setItem('muzieklab.account.v1', JSON.stringify(m)), me);
}

/**
 * Every visible text field fits and can be used: at least 44 px tall, inside the screen sideways, and with 16 px text or
 * more, so iOS does not zoom in when it gets focus.
 */
export async function expectFieldsFit(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([hidden]), textarea, select')]
      .filter((el) => el.offsetParent !== null && (el as HTMLInputElement).type !== 'range')
      .flatMap((el) => {
        const r = el.getBoundingClientRect();
        const name = el.id || el.getAttribute('name') || el.tagName;
        const out: string[] = [];
        if (r.height < 44) out.push(`${name}: ${Math.round(r.height)} px tall`);
        if (r.left < 0 || r.right > window.innerWidth + 1) out.push(`${name}: off screen sideways`);
        if (parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`${name}: text under 16 px`);
        return out;
      }),
  );
  expect(bad, 'text fields').toEqual([]);
}

/** The admin screens' API: the list (searched by `q`, filtered by `status`) and each account in detail. */
export function adminApi(accounts: AccountSummary[] = ACCOUNTS, me: Me = ME_ADMIN): MockRoutes {
  return {
    ...signedInAs(me),
    'GET /admin/accounts': ({ query }) => {
      const q = (query.get('q') ?? '').toLowerCase();
      const status = query.get('status');
      return { json: { accounts: accounts.filter((a) => (!q || (a.name + ' ' + a.email).toLowerCase().includes(q)) && (!status || a.status === status)) } };
    },
    'GET /admin/accounts/:id': ({ params }) => {
      const a = accounts.find((x) => x.id === params.id);
      return a ? { json: accountDetail(a) } : apiError('not_found', 404);
    },
  };
}

/** A link as POST /admin/invites, …/invite-link and …/reset-link answer with it. */
export const INVITE_LINK_CREATED = { link: 'https://vivanova.app/#/invite/' + TOKEN, expiresAt: '2026-10-30T10:00:00.000Z' };
export const RESET_LINK_CREATED = { link: 'https://vivanova.app/#/reset/' + TOKEN.split('').reverse().join(''), expiresAt: '2026-10-24T15:10:00.000Z' };

/**
 * The app's polite live region (components/Announcer.tsx): what a screen reader is told after an action whose result
 * shows on another screen, or a search's count. It is in the page from the start; a text stays in it for a few seconds.
 */
export const announcer = (page: Page): Locator => page.locator('#announcer');
