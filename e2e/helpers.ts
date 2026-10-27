import { expect, type Locator, type Page } from '@playwright/test';
import { PERMISSIONS, type AccountDetail, type AccountSummary, type ApiErrorBody, type Closure, type ErrorCode, type Me, type SavedProgress, type SaveProgressRequest } from '../shared/api';
import {
  FEEDBACK_STATUSES, type FeedbackDetail, type FeedbackListResponse, type FeedbackReport, type FeedbackSaved, type FeedbackStatus, type FeedbackSummary,
  type FeedbackMode, type FeedbackUpdateRequest,
} from '../shared/feedback';
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

/**
 * No button or segmented choice cuts its words off (longer translations must wrap or fit, DESIGN.md §11), nor a line
 * inside one that clips its own text (a Learn chapter's subtitle once ended in "…").
 */
export async function expectNoClippedLabels(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const clipped = await page.evaluate(() => {
    const words = (el: Element): boolean => /\p{L}/u.test(el.textContent ?? '');
    const cut = (el: Element): boolean => el.scrollWidth > el.clientWidth + 1;
    // A line that clips; text for screen readers only (.sr-only, a box of 1 px) is not shown at all.
    const clips = (el: Element): boolean => el.clientWidth > 1 && getComputedStyle(el).overflowX !== 'visible';
    return [...document.querySelectorAll<HTMLElement>('button, .seg-btn, a.btn, select')]
      .filter((el) => el.offsetParent !== null && words(el))
      .filter((el) => cut(el) || [...el.querySelectorAll('*')].some((x) => clips(x) && words(x) && cut(x)))
      .map((el) => (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.tagName);
  });
  expect(clipped, 'labels cut off').toEqual([]);
}

/**
 * The element's focus ring shows on every side when the keyboard reaches it: no box around it cuts the ring off (a
 * card with overflow: hidden, a side list that scrolls on its own). A list that scrolls up and down is only checked at
 * its sides: focus scrolls the element into its view.
 */
export async function expectFocusRing(el: Locator): Promise<void> {
  // Back one stop and forward again, so the element has focus from the keyboard (:focus-visible).
  await el.focus();
  await el.page().keyboard.press('Shift+Tab');
  await el.page().keyboard.press('Tab');
  await expect(el).toBeFocused();
  const cutBy = await el.evaluate((node) => {
    const style = getComputedStyle(node);
    if (!node.matches(':focus-visible') || style.outlineStyle === 'none') return 'no focus ring';
    // How far the ring reaches outside the element: 3 px wide, 2 px away (base.css), or nothing when drawn inside.
    const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
    const r = node.getBoundingClientRect();
    for (let box = node.parentElement; box; box = box.parentElement) {
      const o = getComputedStyle(box);
      const b = box.getBoundingClientRect();
      const left = b.left + box.clientLeft;
      const top = b.top + box.clientTop;
      const name = box.tagName.toLowerCase() + '.' + box.className;
      if (o.overflowX !== 'visible' && (r.left - ring < left - 0.5 || r.right + ring > left + box.clientWidth + 0.5)) return name;
      if (/hidden|clip/.test(o.overflowY) && (r.top - ring < top - 0.5 || r.bottom + ring > top + box.clientHeight + 0.5)) return name;
    }
    return null;
  });
  expect(cutBy, 'the focus ring is cut off by').toBeNull();
}

/**
 * The screen scrolls at the window's edge: every page that can scroll (and Path's units, which scroll in a box of their
 * own) reaches the right side of the window, so its scrollbar is there and not at the side of the content's column
 * (DESIGN.md §9 Scrolling). Side menus (a Learn chapter's, What's new's) are not pages and are left out.
 */
export async function expectScrollbarAtEdge(page: Page): Promise<void> {
  const off = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.shell-main, .page, .units')]
      .filter((el) => el.offsetParent !== null && /auto|scroll/.test(getComputedStyle(el).overflowY))
      .map((el) => ({ el: el.className, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => Math.abs(right - window.innerWidth) > 1),
  );
  expect(off, 'scroll boxes that stop short of the window\'s right edge').toEqual([]);
}

/**
 * Nothing scrolls sideways: not the window, and not a page that scrolls on its own. A page scrolls up and down
 * (overflow-y: auto), which makes it scroll sideways too when a row is wider than it, while the window does not.
 */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const wide = await page.evaluate(() => [
    ...(document.documentElement.scrollWidth > window.innerWidth + 1 ? ['the window'] : []),
    ...[...document.querySelectorAll<HTMLElement>('.page')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className),
  ]);
  expect(wide, 'no horizontal scroll').toEqual([]);
}

/**
 * Every pitch staff on the page has room for its notes: each whole note inside its own bar, after the clef and key
 * signature and clear of the note before it (DESIGN.md §3.5), and the notes, the cursor and the labels inside the
 * drawing. With bar lines, the cursor stays in the bar of the note it marks: clear of the bar lines on either side, of
 * the clef and key signature and of the notes next to it. The svg cuts off what runs past its edge, so the page never
 * scrolls sideways and expectNoSideScroll misses it.
 */
export async function expectStavesFit(page: Page): Promise<void> {
  const wrong = await page.evaluate(() =>
    [...document.querySelectorAll<SVGSVGElement>('.pitch-staff svg')].flatMap((svg, k) => {
      const span = (el: Element): [number, number] => {
        const b = (el as SVGGraphicsElement).getBBox();
        return [b.x, b.x + b.width];
      };
      const width = svg.viewBox.baseVal.width;
      const head = Math.max(0, ...[...svg.querySelectorAll('.vf-clef, .vf-keysignature')].map((el) => span(el)[1]));
      const out: string[] = [];
      let before = head;
      const notes = [...svg.querySelectorAll('.vf-stavenote')].map((note, i) => {
        const [l, r] = span(note);
        // Each bar is a stave of its own, drawn just before its note.
        let bar = note.previousElementSibling;
        while (bar && !bar.matches('.vf-stave')) bar = bar.previousElementSibling;
        const [start, end] = bar ? span(bar) : [0, width];
        if (l < Math.max(start, before) - 0.5) out.push(`staff ${k + 1}: note ${i + 1} runs into the bar line, signature or note before it`);
        if (r > Math.min(end, width) + 0.5) out.push(`staff ${k + 1}: note ${i + 1} runs over its bar line or off the staff`);
        before = r;
        return [l, r];
      });
      // The bars of a staff with bar lines, each from its bar line (1 unit wide) to the next one.
      const bars = [...svg.querySelectorAll('.vf-stave')].map(span);
      for (const el of svg.querySelectorAll(':scope > rect')) {
        const [l, r] = span(el);
        if (l < -0.5 || r > width + 0.5) out.push(`staff ${k + 1}: the cursor is cut off`);
        const bar = bars.length > 1 && bars.find(([start, end]) => start <= (l + r) / 2 && (l + r) / 2 <= end);
        if (!bar) continue;
        if (l < (bar === bars[0] ? head : bar[0] + 1) - 0.5 || r > bar[1] + 0.5) out.push(`staff ${k + 1}: the cursor runs over a bar line or the key signature`);
        if (notes.filter(([a, b]) => a < r - 0.5 && b > l + 0.5).length > 1) out.push(`staff ${k + 1}: the cursor covers two notes`);
      }
      for (const el of svg.querySelectorAll('text')) {
        const [l, r] = span(el);
        if (l < -0.5 || r > width + 0.5) out.push(`staff ${k + 1}: the label ${el.textContent} is cut off`);
      }
      return out;
    }),
  );
  expect(wrong, 'notes that do not fit their staff').toEqual([]);
}

/**
 * The document itself does not scroll: the page scrolls in its own box and the shell (tab bar, header) stays on screen.
 * Text for screen readers (.sr-only, absolutely placed) in a box that is not positioned would stretch the document.
 */
export async function expectNoPageScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    return doc.scrollHeight - doc.clientHeight;
  });
  expect(over, 'the document scrolls under the shell').toBeLessThanOrEqual(1);
}

/** Seeds localStorage before the app loads. */
export async function seed(page: Page, data: { prefs?: object; progress?: object }): Promise<void> {
  await page.addInitScript((d) => {
    if (d.prefs) localStorage.setItem('muzieklab.prefs.v1', JSON.stringify(d.prefs));
    if (d.progress) localStorage.setItem('muzieklab.progress.v1', JSON.stringify(d.progress));
  }, data);
}

export const pad = (page: Page): Locator => page.getByRole('button', { name: 'Tap pad' });

/** One bar of four quarter notes at 120 BPM, tap only: a free-practice run of a few seconds. */
export const QUARTERS = { mode: 'tap', hold: false, meters: ['4/4'], notes: ['quarter'], rests: [], dotted: false, ties: false, triplets: false, bars: 1, tempo: 120,
  metronome: 'on', countIn: 1, density: 'balanced', restAmount: 'few' };

/**
 * Plays along on the keyboard, every beat `lateMs` after it, from the first counted beat on Play: on the beat with 0, a
 * steady late tapper (Bluetooth headphones) with more. Each key event carries its own time stamp, so a timer that fires
 * late does not move a tap.
 */
export async function tapLate(page: Page, beats: number, beatMs: number, lateMs: number): Promise<void> {
  await page.evaluate(
    ({ beats, beatMs, lateMs }) =>
      new Promise<void>((resolve) => {
        const key = (type: string, at: number): void => {
          const ev = new KeyboardEvent(type, { key: 'j', code: 'KeyJ', bubbles: true });
          Object.defineProperty(ev, 'timeStamp', { value: at });
          window.dispatchEvent(ev);
        };
        const look = (): void => {
          if (!document.querySelector('[role="img"][aria-label^="Counting beat 1 "]')) return void requestAnimationFrame(look);
          const t0 = performance.now();
          for (let k = 0; k < beats; k++) {
            const at = t0 + k * beatMs + lateMs;
            window.setTimeout(() => {
              key('keydown', at);
              key('keyup', at + 80);
            }, at + 80 - performance.now());
          }
          window.setTimeout(resolve, beats * beatMs + lateMs);
        };
        look();
      }),
    { beats, beatMs, lateMs },
  );
}

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
  roleNames: {},
  permissions: ['self.manage', 'progress.own', 'class.join'],
  premium: { active: true, until: '2027-01-31' },
  createdAt: '2026-10-20T09:00:00.000Z',
  feedbackMode: false,
};

/** A signed-in admin: every permission. */
export const ME_ADMIN: Me = {
  id: '6718f0c2a1b2c3d4e5f60002',
  email: 'ann@example.com',
  name: 'Ann de Vries',
  locale: 'en',
  roles: ['admin'],
  roleNames: {},
  permissions: [...PERMISSIONS],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
  feedbackMode: true,
};

/** The account had no progress saved: GET /progress before the first save. */
export const NO_PROGRESS: SavedProgress = { rev: 0, data: null, resetAt: null, updatedAt: null };

/**
 * The progress routes as the server answers them, without keeping anything between tests: the account has no copy
 * (GET), and every save goes through with the next rev. For a test that needs the account to keep its copy, see
 * progressServer.
 */
export const PROGRESS_ECHO: MockRoutes = {
  'GET /progress': { json: NO_PROGRESS },
  'PUT /progress': ({ body }) => {
    const { rev, prefs, progress } = body as SaveProgressRequest;
    return { json: { rev: rev + 1, data: { prefs, progress }, resetAt: null, updatedAt: '2026-10-25T10:00:00.000Z' } satisfies SavedProgress };
  },
  'DELETE /progress': { json: NO_PROGRESS },
};

/** An account that keeps its progress, for one test: a save from an older rev is refused with the copy (409). */
export function progressServer(start: SavedProgress = NO_PROGRESS): { routes: MockRoutes; copy(): SavedProgress } {
  let copy = start;
  let n = 0;
  const at = (): string => new Date(Date.UTC(2026, 9, 25, 10, 0, n++)).toISOString();
  return {
    copy: () => copy,
    routes: {
      'GET /progress': () => ({ json: copy }),
      'PUT /progress': ({ body }) => {
        const { rev, prefs, progress } = body as SaveProgressRequest;
        if (rev !== copy.rev) return apiError('rev_conflict', 409, { current: copy });
        copy = { rev: rev + 1, data: { prefs, progress }, resetAt: copy.resetAt, updatedAt: at() };
        return { json: copy };
      },
      'DELETE /progress': () => {
        if (copy.data) {
          const now = at();
          copy = { rev: copy.rev + 1, data: { ...copy.data, progress: {} }, resetAt: now, updatedAt: now };
        }
        return { json: copy };
      },
    },
  };
}

/** Nobody signed in: GET /me is a 401. Once a test signs in, the progress is saved (PROGRESS_ECHO). */
export const SIGNED_OUT: MockRoutes = {
  'GET /me': apiError('unauthenticated', 401),
  'POST /auth/sign-out': apiError('unauthenticated', 401),
  ...PROGRESS_ECHO,
};

/** Signed in as `me`: GET /me answers with it, signing out works, and the progress is saved (PROGRESS_ECHO). */
export const signedInAs = (me: Me): MockRoutes => ({
  'GET /me': { json: me },
  'POST /auth/sign-out': { status: 204 },
  'POST /auth/sign-out-everywhere': { status: 204 },
  ...PROGRESS_ECHO,
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

/**
 * Deleted accounts (GET /admin/closures), newest day first: one of each kind, and an archived one without feedback or
 * saved progress. The first has the longest feedback a screen should still show whole.
 */
export const CLOSURES: Closure[] = [
  {
    id: '3f9c1a7e5b2d4c6e8a0b1c2d3e4f5a6b',
    day: '2026-10-24',
    kind: 'archived',
    feedback: 'The scales got too hard for me after chapter 7, and I had no time to practice every day.\nMaybe later!',
    archive: {
      joined: '2026-03',
      data: {
        prefs: { theme: 'dark', noteNames: 'solfege' },
        progress: { xp: 1840, practiceDays: ['2026-10-20', '2026-10-21', '2026-10-23'], lessons: { '1.1': { stars: 3, bestAccuracy: 94 }, '1.2': { stars: 2, bestAccuracy: 81 } } },
      },
    },
  },
  { id: '8b2e4d6f0a1c3e5a7b9d1f3a5c7e9b0d', day: '2026-10-20', kind: 'removed', feedback: 'Moving to another app.', archive: null },
  { id: 'c4a6e8b0d2f4a6c8e0b2d4f6a8c0e2b4', day: '2026-10-02', kind: 'admin', feedback: null, archive: null },
  { id: '0e2c4a6b8d0f2e4c6a8b0d2f4e6c8a0b', day: '2026-09-15', kind: 'archived', feedback: null, archive: { joined: '2026-09', data: null } },
];

/** The admin screens' API: the list (searched by `q`, filtered by `status`), each account in detail, and deleted accounts. */
export function adminApi(accounts: AccountSummary[] = ACCOUNTS, me: Me = ME_ADMIN): MockRoutes {
  return {
    ...signedInAs(me),
    'GET /admin/closures': { json: { closures: CLOSURES } },
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

/**
 * A feedback report as the app sends it (POST /feedback): a bug on Home, marked on a phone in the dark theme, with the
 * long selector and browser a real report has.
 */
export const FEEDBACK_REPORT: FeedbackReport = {
  kind: 'bug',
  title: 'Start lesson does nothing on the first tap',
  description: 'On my phone the first tap on Start lesson does nothing.\nThe second tap starts the lesson.',
  target: {
    mode: 'element',
    selector: '#root > div.shell > main.shell-main > div.page > section.home-hero > div.home-actions > button.btn.btn--accent',
    label: 'button “Start lesson”',
    text: 'Start lesson',
    html: '<button type="button" class="btn btn--accent">Start lesson</button>',
    rect: { x: 16.5, y: 412.25, width: 358, height: 52 },
    scroll: { x: 0, y: 0 },
  },
  context: {
    version: '0.17.0',
    url: 'https://test.vivanova.app/#/',
    route: '/',
    viewport: { width: 390, height: 844, dpr: 3 },
    breakpoint: 'phone',
    orientation: 'portrait',
    pointer: 'coarse',
    theme: { setting: 'system', shown: 'dark' },
    locale: 'en',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    at: '2026-10-25T11:58:00.000Z',
    prefs: { theme: 'system', language: 'en', seenHowTo: true },
  },
};

const feedbackDetail = (id: string, report: FeedbackReport, more: Partial<FeedbackDetail> = {}): FeedbackDetail => ({
  id,
  kind: report.kind,
  title: report.title,
  description: report.description,
  route: report.context.route,
  label: report.target.label,
  mode: report.target.mode,
  status: 'new',
  author: { id: ME_MEMBER.id, name: ME_MEMBER.name },
  createdAt: '2026-10-25T12:00:00.000Z',
  report,
  note: '',
  reviewer: null,
  reviewedAt: null,
  ...more,
});

/**
 * Feedback reports (Settings → Account → Feedback), newest first: three new ones and an accepted one, none declined
 * (New 3 · Accepted 1 · Declined 0 · All 4). The second has no title (the app names it "Change on #/settings") and
 * comes from an account deleted since; the third has the longest title and description a screen should show whole.
 * Every time is midday UTC, so each is the same day in every time zone the tests run in.
 */
export const FEEDBACK: FeedbackDetail[] = [
  feedbackDetail('6718f0c2a1b2c3d4e5f6b001', FEEDBACK_REPORT),
  feedbackDetail(
    '6718f0c2a1b2c3d4e5f6b002',
    {
      kind: 'change',
      title: '',
      description: 'Say what each leniency does in milliseconds too.',
      target: {
        mode: 'area',
        selector: '#set-timing > div.set-card > div.seg-row',
        label: 'group “Timing leniency”',
        text: 'Strict Normal Relaxed Fair timing for most players.',
        html: '<div class="seg-row">…</div>',
        rect: { x: 340, y: 210, width: 560, height: 120 },
        scroll: { x: 0, y: 320 },
      },
      context: {
        ...FEEDBACK_REPORT.context,
        url: 'https://test.vivanova.app/#/settings',
        route: '/settings',
        viewport: { width: 1280, height: 800, dpr: 2 },
        breakpoint: 'desktop',
        orientation: 'landscape',
        pointer: 'fine',
        theme: { setting: 'light', shown: 'light' },
        locale: 'nl',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      },
    },
    { author: null, createdAt: '2026-10-24T12:00:00.000Z' },
  ),
  feedbackDetail(
    '6718f0c2a1b2c3d4e5f6b003',
    {
      kind: 'idea',
      title: 'Let me choose which notes Read notes asks for, so I can practise only the ones I keep getting wrong',
      description:
        'I always mix up the notes above the staff (A5, B5 and C6), but Read notes asks for every note of the clef. ' +
        'If I could tick the notes I want, I would practise those for a week and then add the rest again.\n\n' +
        'Maybe the setup screen could show the staff with a check box under each note, and remember what I picked.',
      target: {
        mode: 'element',
        selector: '#root > div.shell > main.shell-main > div.page > div.screen-head > h1.screen-title',
        label: 'heading “Read notes”',
        text: 'Read notes',
        html: '<h1 class="screen-title">Read notes</h1>',
        rect: { x: 48, y: 96, width: 738, height: 40 },
        scroll: { x: 0, y: 0 },
      },
      context: {
        ...FEEDBACK_REPORT.context,
        url: 'https://test.vivanova.app/#/notes',
        route: '/notes',
        viewport: { width: 834, height: 1194, dpr: 2 },
        breakpoint: 'tablet',
        theme: { setting: 'light', shown: 'light' },
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      },
    },
    { author: { id: ACCOUNTS[0].id, name: ACCOUNTS[0].name }, createdAt: '2026-10-23T12:00:00.000Z' },
  ),
  feedbackDetail(
    '6718f0c2a1b2c3d4e5f6b004',
    {
      ...FEEDBACK_REPORT,
      title: 'The tab bar covers the last row of Settings',
      description: 'The About row is under the tab bar and cannot be tapped.',
      target: { ...FEEDBACK_REPORT.target, selector: '#set-about > div.set-card > a.row', label: 'link “About”', text: 'About' },
      context: { ...FEEDBACK_REPORT.context, url: 'https://test.vivanova.app/#/settings', route: '/settings' },
    },
    {
      status: 'accepted',
      createdAt: '2026-10-22T12:00:00.000Z',
      note: 'Picked up for 0.17.1, with the tab bar fix.',
      reviewer: { id: ME_ADMIN.id, name: ME_ADMIN.name },
      reviewedAt: '2026-10-23T12:00:00.000Z',
    },
  ),
];

/** When the feedback mock says a review was saved. */
export const REVIEWED_AT = '2026-10-25T12:30:00.000Z';

/**
 * The feedback routes as the server answers them, keeping what one test changes (a copy of `start` of its own): POST
 * /feedback stores a new report from `me`; the admin list (filtered by `status`, with every status's count); one report;
 * its review (PATCH: only a real change names `me` as the reviewer); and DELETE. Call it in the test, so no two tests
 * share the reports; a table of routes made once for several tests (the Dutch screens) must only read them.
 */
export function feedbackServer(start: FeedbackDetail[] = FEEDBACK, me: Me = ME_ADMIN): { routes: MockRoutes; reports(): FeedbackDetail[] } {
  let reports = start.map((r) => ({ ...r }));
  let made = 0;
  // The list's rows: no report, note or review.
  const summary = (r: FeedbackDetail): FeedbackSummary => ({
    id: r.id, kind: r.kind, title: r.title, description: r.description, route: r.route, label: r.label, mode: r.mode, status: r.status, author: r.author,
    createdAt: r.createdAt,
  });
  const find = (id: string): FeedbackDetail | undefined => reports.find((r) => r.id === id);
  return {
    reports: () => reports,
    routes: {
      'POST /feedback': ({ body }) => {
        const id = '6718f0c2a1b2c3d4e5f6c' + String(++made).padStart(3, '0');
        reports = [feedbackDetail(id, body as FeedbackReport, { author: { id: me.id, name: me.name }, createdAt: '2026-10-25T12:15:00.000Z' }), ...reports];
        return { json: { id } satisfies FeedbackSaved };
      },
      'GET /admin/feedback': ({ query }) => {
        const status = query.get('status');
        const counts = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, reports.filter((r) => r.status === s).length])) as Record<FeedbackStatus, number>;
        return { json: { reports: reports.filter((r) => !status || r.status === status).map(summary), counts } satisfies FeedbackListResponse };
      },
      'GET /admin/feedback/:id': ({ params }) => {
        const r = find(params.id);
        return r ? { json: r } : apiError('not_found', 404);
      },
      'PATCH /admin/feedback/:id': ({ params, body }) => {
        const r = find(params.id);
        if (!r) return apiError('not_found', 404);
        const { status, note } = body as FeedbackUpdateRequest;
        const change: Partial<FeedbackDetail> = {};
        if (status !== undefined && status !== r.status) change.status = status;
        if (note !== undefined && note.trim() !== r.note) change.note = note.trim();
        if (Object.keys(change).length) Object.assign(r, change, { reviewer: { id: me.id, name: me.name }, reviewedAt: REVIEWED_AT });
        return { json: r };
      },
      'DELETE /admin/feedback/:id': ({ params }) => {
        if (!find(params.id)) return apiError('not_found', 404);
        reports = reports.filter((r) => r.id !== params.id);
        return { status: 204 };
      },
      'PUT /admin/feedback-mode': ({ body }) => ({ json: { on: (body as FeedbackMode).on } satisfies FeedbackMode }),
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

/**
 * From now on, keeps every text the live region says (until the page reloads); the returned function reads them, in
 * order. For checking that something is not read out (again): `announcer` only shows the latest text.
 */
export async function recordAnnouncements(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const region = document.getElementById('announcer');
    if (!region) throw new Error('no #announcer in the page');
    const said: string[] = [];
    (window as unknown as { muzieklabSaid: string[] }).muzieklabSaid = said;
    new MutationObserver(() => {
      if (region.textContent) said.push(region.textContent);
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => [...(window as unknown as { muzieklabSaid: string[] }).muzieklabSaid]);
}
