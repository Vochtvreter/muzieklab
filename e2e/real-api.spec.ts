import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import type { InviteCreated, Me } from '../shared/api';

/**
 * Accounts against the real API (BACKEND-PLAN.md §5): the app's production build in a real browser, the API bundle and
 * a real MongoDB, nothing mocked. Only `npm run e2e:real` runs this (playwright.real.config.ts starts the servers).
 *
 * - The first admin comes from the create-admin command, as on the server.
 * - Each test makes its own accounts (unique emails and names), so tests can run side by side on one database.
 * - Several people are several browser contexts: their own cookies and storage, and their own network address (the
 *   API trusts the proxy's X-Forwarded-For, as it trusts Caddy's). Wrong passwords count per email and per address,
 *   so one test's wrong passwords never make another test's sign-in wait.
 * - What a test needs but does not check (an admin, a member) is set up through the API; the flow it checks goes
 *   through the screens.
 */

const APP = process.env.REAL_APP_URL ?? 'http://127.0.0.1:4180/';
const ORIGIN = new URL(APP).origin;
const API = new URL('api/v1', APP).href;
const SERVER_BUNDLE = fileURLToPath(new URL('../server/dist/server.cjs', import.meta.url));

const ADMIN_PASSWORD = 'violin bow and rosin 42';
const MEMBER_PASSWORD = 'four quarter notes rest';
const NEW_PASSWORD = 'a new tune in seven notes';

const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;

interface Person {
  ctx: BrowserContext;
  page: Page;
}
interface Account extends Person {
  me: Me;
  email: string;
  name: string;
  password: string;
}

let made = 0;
/** An email and name no other test (or earlier run against the same database) uses. */
function someone(first: string): { email: string; name: string } {
  const id = `${Date.now().toString(36)}${(made++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return { email: `${first.toLowerCase()}.${id}@example.com`, name: `${first} ${id}` };
}

let addresses = 0;

const test = base.extend<{ person: (size?: keyof typeof SIZES) => Promise<Person> }>({
  /** A new person: a browser context of their own (traced like the default one: `trace` in the config). */
  person: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async (size = 'phone') => {
      const ctx = await browser.newContext({
        baseURL: APP,
        viewport: SIZES[size],
        locale: 'en-US',
        // Not under test here, and every new context would download the whole precache.
        serviceWorkers: 'block',
        extraHTTPHeaders: { 'X-Forwarded-For': `198.18.${testInfo.workerIndex % 256}.${(addresses++ % 254) + 1}` },
      });
      contexts.push(ctx);
      return { ctx, page: await ctx.newPage() };
    });
    for (const ctx of contexts) await ctx.close();
  },
});

/** The server's create-admin command (BACKEND-PLAN.md §5.1) on the test database: the invite link it prints. */
function createAdmin(email: string, name: string): string {
  const out = execFileSync(process.execPath, [SERVER_BUNDLE, 'create-admin', '--email', email, '--name', name, '--url', ORIGIN], {
    env: { ...process.env, MONGODB_URI: process.env.REAL_MONGODB_URI },
    encoding: 'utf8',
  });
  const link = /\S+#\/invite\/[A-Za-z0-9_-]+/.exec(out)?.[0];
  if (!link) throw new Error('create-admin printed no invite link:\n' + out);
  return link;
}

const tokenOf = (link: string): string => link.slice(link.lastIndexOf('/') + 1);

/** POST through the app's own address, as the app does: the API refuses changes without this site's Origin. */
async function post<T>(who: Person, path: string, data: unknown): Promise<T> {
  const res = await who.ctx.request.post(API + path, { data, headers: { Origin: ORIGIN } });
  expect(res.ok(), `POST ${path}: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

/** A signed-in admin, made with create-admin. */
async function anAdmin(person: (size?: keyof typeof SIZES) => Promise<Person>): Promise<Account> {
  const { email, name } = someone('Ann');
  const link = createAdmin(email, name);
  const who = await person('desktop');
  const me = await post<Me>(who, '/auth/invite/accept', { token: tokenOf(link), password: ADMIN_PASSWORD });
  return { ...who, me, email, name, password: ADMIN_PASSWORD };
}

/** A signed-in member (no roles), invited by `admin`. */
async function aMember(person: (size?: keyof typeof SIZES) => Promise<Person>, admin: Person): Promise<Account> {
  const { email, name } = someone('Bob');
  const invite = await post<InviteCreated>(admin, '/admin/invites', { email, name, roles: [] });
  const who = await person('phone');
  const me = await post<Me>(who, '/auth/invite/accept', { token: tokenOf(invite.link), password: MEMBER_PASSWORD });
  return { ...who, me, email, name, password: MEMBER_PASSWORD };
}

const accountSection = (page: Page) => page.getByRole('region', { name: 'Account' });
// The one-line results (Settings → Account's notice, Block and Unblock) are plain text: the app's live region
// (#announcer) reads them out, so they are found by their class, not as role="status".
const accountRow = (page: Page, name: string) => accountSection(page).getByRole('link', { name: new RegExp('^' + name) });
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('./#/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the first admin: the create-admin link, a weak password, then signed in with Accounts in Settings', async ({ person }) => {
  const { email, name } = someone('Ann');
  const link = createAdmin(email, name);
  expect(link).toMatch(new RegExp('^' + escapeRegExp(APP) + '#/invite/[A-Za-z0-9_-]{43}$'));
  const { ctx, page } = await person('desktop');

  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: `Welcome, ${name}` })).toBeVisible();
  await expect(page.getByText(`Choose a password for ${email}.`)).toBeVisible();
  const password = page.getByLabel('New password');
  await password.fill('password1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText("This password is too common. Choose one that's harder to guess.")).toBeVisible();
  await expect(password).toHaveAttribute('aria-invalid', 'true');

  await password.fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).locator('.row-status')).toHaveText("You're signed in. Welcome to Muzieklab.");
  await expect(accountRow(page, name)).toContainText(email);
  await accountSection(page).getByRole('link', { name: /^Accounts/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`^${name} \\(you\\)`) })).toContainText('Active');

  // The session cookie: HttpOnly, SameSite=Lax, for the whole site (`session` over http; `__Host-session` on https).
  // The refresh cookie: the same, for the sign-in routes only (`refresh` over http; `__Secure-refresh` on https).
  const cookies = (await ctx.cookies()).filter((c) => c.name.endsWith('session') || c.name.endsWith('refresh'));
  expect(cookies).toHaveLength(2);
  expect(cookies.find((c) => c.name === 'session')).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  expect(cookies.find((c) => c.name === 'refresh')).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/v1/auth' });
  expect(await page.evaluate(() => document.cookie)).toBe('');
  // A change without this site's Origin is refused, even with the cookie.
  const forged = await ctx.request.post(API + '/auth/sign-out');
  expect(forged.status()).toBe(403);
  expect((await forged.json()).error).toBe('bad_origin');

  // The link worked once.
  await page.goto(link);
  await expect(page.getByText("This link doesn't work anymore. Ask the person who invited you for a new one.")).toBeVisible();
});

test('an admin invites a member, who accepts: no Accounts for them, and the admin API refuses them', async ({ person }) => {
  const admin = await anAdmin(person);
  const bob = someone('Bob');
  const a = admin.page;
  await a.goto('./#/settings');
  await accountSection(a).getByRole('link', { name: /^Accounts/ }).click();
  await a.getByRole('link', { name: 'Invite someone' }).click();
  await a.getByLabel('Email').fill(bob.email);
  await a.getByLabel('Name').fill(bob.name);
  for (const role of ['Admin', 'Editor', 'Teacher']) await expect(a.getByRole('switch', { name: role })).toHaveAttribute('aria-checked', 'false');
  await a.getByRole('button', { name: 'Create invite' }).click();
  await expect(a.getByRole('heading', { name: `Invite for ${bob.name} is ready` })).toBeVisible();
  const link = await a.getByLabel('Invite link').inputValue();
  expect(link).toMatch(new RegExp('^' + escapeRegExp(APP) + '#/invite/[A-Za-z0-9_-]{43}$'));
  expect(await a.getByLabel('Message to send').inputValue()).toContain(link);

  const member = await person('phone');
  const m = member.page;
  await m.goto(link);
  await expect(m.getByRole('heading', { level: 1, name: `Welcome, ${bob.name}` })).toBeVisible();
  await expect(m.getByText(`Choose a password for ${bob.email}.`)).toBeVisible();
  await m.getByLabel('New password').fill(MEMBER_PASSWORD);
  await m.getByRole('button', { name: 'Create account' }).click();
  await expect(m).toHaveURL(/#\/settings$/);
  await expect(accountRow(m, bob.name)).toContainText(bob.email);
  await expect(accountSection(m).getByRole('link', { name: /^Accounts/ })).toHaveCount(0);

  // The server checks too: a member may not list accounts, and the admin screens say so.
  const list = await member.ctx.request.get(API + '/admin/accounts');
  expect(list.status()).toBe(403);
  expect((await list.json()).error).toBe('forbidden');
  await m.goto('./#/admin');
  await expect(m.getByText("You don't have access to this page.")).toBeVisible();

  // The admin's list has them, active now.
  await a.getByRole('link', { name: 'Done' }).click();
  await a.getByLabel('Search').fill(bob.email);
  await expect(a.getByRole('link', { name: new RegExp('^' + bob.name) })).toContainText('Active');
});

test('a session token that ran out is renewed by the app: still signed in, on start and on a save', async ({ person }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const { ctx, page } = member;
  const cookie = async (name: string) => (await ctx.cookies()).find((c) => c.name === name)?.value;
  await page.goto('./#/account');
  await expect(page.getByLabel('Name')).toHaveValue(member.name);

  // An hour on, the browser has dropped the session token (its Max-Age); the refresh token is left.
  const refresh = await cookie('refresh');
  await ctx.clearCookies({ name: 'session' });
  const renewed = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh') && r.status() === 204);
  await page.reload();
  await renewed;
  await expect(page.getByLabel('Name')).toHaveValue(member.name);
  expect(await cookie('session')).toBeDefined();
  expect(await cookie('refresh')).not.toBe(refresh);

  // The same while a screen is open: the save renews the session and goes through.
  await ctx.clearCookies({ name: 'session' });
  await page.getByLabel('Name').fill(member.name + ' B.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.form-done')).toHaveText('Name saved.');
  await expect(page).toHaveURL(/#\/account$/);
});

test('a renewal whose answer never came back (a reload on the way) is made again on start: still signed in', async ({ person, request }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const { ctx, page } = member;
  const cookie = async (name: string) => (await ctx.cookies()).find((c) => c.name === name)?.value;
  await page.goto('./#/account');
  await expect(page.getByLabel('Name')).toHaveValue(member.name);

  // The session token ran out, and a renewal reached the server, but its answer never reached the browser (the page
  // was reloaded meanwhile, or the connection dropped): the server swapped the refresh token the browser still has.
  const refresh = await cookie('refresh');
  await ctx.clearCookies({ name: 'session' });
  const lost = await request.post(API + '/auth/refresh', { headers: { Origin: ORIGIN, Cookie: `refresh=${refresh}` } });
  expect(lost.status()).toBe(204);

  // On start the app renews with that token again, moments later, and gets the pair the lost answer had.
  await page.reload();
  await expect(page.getByLabel('Name')).toHaveValue(member.name);
  expect(await cookie('session')).toBeDefined();
  expect(await cookie('refresh')).not.toBe(refresh);
});

test('tabs opened at once, and reloaded at once, all stay signed in, and the session goes on', async ({ person }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const { ctx, page } = member;
  await page.goto('./#/account');
  await expect(page.getByLabel('Name')).toHaveValue(member.name);
  await page.waitForLoadState('networkidle');
  // As if the session was last renewed over 12 hours ago, so every tab that starts wants to renew it.
  const twelveHoursOn = () => page.evaluate(() => localStorage.removeItem('muzieklab.renewed.v1'));
  let renewals = 0;
  ctx.on('request', (r) => {
    if (r.url().endsWith('/api/v1/auth/refresh')) renewals++;
  });
  // A tab shows the cached account at once, so each is checked once nothing is on its way: still on Account, and
  // still signed in in Settings.
  const stayed = async (tabs: Page[], when: string) => {
    await Promise.all(tabs.map((tab) => tab.waitForLoadState('networkidle')));
    for (const [i, tab] of tabs.entries()) {
      await expect(tab, `tab ${i + 1} of ${tabs.length}, ${when}`).toHaveURL(/#\/account$/);
      await expect(tab.getByLabel('Name')).toHaveValue(member.name);
      await tab.evaluate(() => void (location.hash = '#/settings'));
      await expect(accountRow(tab, member.name), `tab ${i + 1} of ${tabs.length}, ${when}`).toContainText(member.email);
      await tab.evaluate(() => void (location.hash = '#/account'));
    }
  };

  // One of them renews; the others wait for it and use its renewal, and what they sent with the session token it
  // replaced is sent again.
  await twelveHoursOn();
  const tabs = [page, ...(await Promise.all([1, 2, 3].map(() => ctx.newPage())))];
  await Promise.all(tabs.slice(1).map((tab) => tab.goto('./#/account')));
  await stayed(tabs, 'opened at once');
  expect(renewals, 'renewals by the 3 tabs opened at once').toBe(1);

  await twelveHoursOn();
  renewals = 0;
  await Promise.all(tabs.map((tab) => tab.reload()));
  await stayed(tabs, 'reloaded at once');
  expect(renewals, 'renewals by the 4 tabs reloaded at once').toBe(1);

  // The session goes on: its session token works, and so does its refresh token.
  expect((await ctx.request.get(API + '/me')).status()).toBe(200);
  expect((await ctx.request.post(API + '/auth/refresh', { headers: { Origin: ORIGIN } })).status()).toBe(204);
  expect((await ctx.request.get(API + '/me')).status()).toBe(200);
});

test('blocking signs a member out at their next request and refuses sign-in until unblocked', async ({ person }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const m = member.page;
  await m.goto('./#/account');
  await expect(m.getByLabel('Name')).toHaveValue(member.name);

  const a = admin.page;
  await a.goto(`./#/admin/account/${member.me.id}`);
  await expect(a.getByRole('heading', { level: 1, name: member.name })).toBeVisible();
  await a.getByRole('button', { name: /^Block/ }).click();
  const confirm = a.getByRole('alertdialog');
  await expect(confirm).toContainText(`Block ${member.name}?`);
  await confirm.getByRole('button', { name: 'Block', exact: true }).click();
  const access = a.getByRole('region', { name: 'Access' });
  await expect(access.locator('.row-status')).toHaveText("Blocked. They're signed out.");

  // The member's next request finds the session gone: signed out, to Sign in.
  await m.getByLabel('Name').fill(member.name + ' B.');
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(m).toHaveURL(/#\/signin$/);
  await m.getByLabel('Email').fill(member.email);
  await m.getByLabel('Password', { exact: true }).fill(member.password);
  await m.getByRole('button', { name: 'Sign in' }).click();
  await expect(m.getByRole('alert')).toHaveText('Email or password is not right.');

  await access.getByRole('button', { name: /^Unblock/ }).click();
  await expect(access.locator('.row-status')).toHaveText('Unblocked. They can sign in again.');
  await m.getByRole('button', { name: 'Sign in' }).click();
  await expect(m).toHaveURL(/#\/settings$/);
  await expect(accountRow(m, member.name)).toBeVisible();
});

test("a new-password link: set on another device, and the member's other devices are signed out", async ({ person }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const m = member.page;
  await m.goto('./#/settings');
  await expect(accountRow(m, member.name)).toBeVisible();

  const a = admin.page;
  await a.goto(`./#/admin/account/${member.me.id}`);
  await a.getByRole('button', { name: /^New password link/ }).click();
  // The done line is plain text, read out by the live region (#announcer): found by its class.
  await expect(a.locator('.form-done')).toHaveText('New link ready. Send it yourself.');
  const link = await a.getByLabel('New password link', { exact: true }).inputValue();
  expect(link).toMatch(new RegExp('^' + escapeRegExp(APP) + '#/reset/[A-Za-z0-9_-]{43}$'));

  // Another device, signed out.
  const other = (await person('phone')).page;
  await other.goto(link);
  await expect(other.getByRole('heading', { level: 1, name: 'New password' })).toBeVisible();
  await expect(other.getByText(`Choose a new password for ${member.email}.`)).toBeVisible();
  await other.getByLabel('New password').fill(NEW_PASSWORD);
  await other.getByRole('button', { name: 'Save password' }).click();
  await expect(other).toHaveURL(/#\/settings$/);
  await expect(accountSection(other).locator('.row-status')).toHaveText('Password saved. Your other devices are signed out.');
  await expect(accountRow(other, member.name)).toBeVisible();

  // The first device is signed out; the old password no longer works, the new one does.
  await m.reload();
  await expect(accountSection(m).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  await signIn(m, member.email, member.password);
  await expect(m.getByRole('alert')).toHaveText('Email or password is not right.');
  await m.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await m.getByRole('button', { name: 'Sign in' }).click();
  await expect(m).toHaveURL(/#\/settings$/);

  // The link worked once.
  await other.goto(link);
  await expect(other.getByText("This link doesn't work anymore.", { exact: false })).toBeVisible();
});

test('too many wrong passwords: a wait, then the right password works', async ({ person }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const { page } = await person('phone');
  await page.goto('./#/signin');
  await page.getByLabel('Email').fill(member.email);
  const password = page.getByLabel('Password', { exact: true });
  const submit = page.getByRole('button', { name: 'Sign in' });
  const alert = page.getByRole('alert');
  const send = async (pw: string): Promise<number> => {
    await password.fill(pw);
    const answer = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/sign-in'));
    await submit.click();
    return (await answer).status();
  };

  // Five wrong passwords are only "not right".
  for (let i = 1; i <= 5; i++) {
    expect(await send(`wrong password ${i}`)).toBe(401);
    await expect(alert).toHaveText('Email or password is not right.');
  }
  // Then a wait. (Normally the very next try; on a slow machine the first wait may be over by then, and the next
  // failure starts a longer one.)
  await expect(async () => {
    expect(await send('wrong password again')).toBe(429);
  }).toPass({ timeout: 30_000 });
  await expect(alert).toHaveText(/^Too many tries\. Try again in \d+ seconds?\.$/);

  // Tries during the wait are refused unchecked; once it is over, the right password works.
  await password.fill(member.password);
  await expect(async () => {
    if (!page.url().endsWith('#/settings')) {
      const answer = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/sign-in'));
      await submit.click();
      expect((await answer).status(), 'still waiting').toBe(200);
    }
    await expect(page).toHaveURL(/#\/settings$/);
  }).toPass({ timeout: 45_000, intervals: [500, 1000] });
  await expect(accountRow(page, member.name)).toBeVisible();
});

test('a member deletes their account: a wrong password first, then signed out for good and gone from the list', async ({ person }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const a = admin.page;
  await a.goto('./#/admin');
  await a.getByLabel('Search').fill(member.email);
  await expect(a.getByRole('link', { name: new RegExp('^' + member.name) })).toBeVisible();

  const m = member.page;
  await m.goto('./#/account');
  await m.getByRole('button', { name: /^Delete account/ }).click();
  const confirm = m.getByRole('alertdialog');
  await expect(confirm).toContainText('Delete your account?');
  const password = confirm.getByLabel('Password', { exact: true });
  await password.fill('not my password at all');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirm.getByText("That's not your current password.")).toBeVisible();
  // Keep anonymously (the default), and why: the feedback is unique to this test, as tests share the database.
  const why = `Leaving, test ${Math.random().toString(36).slice(2)}`;
  await confirm.getByLabel('Why are you leaving? (optional)').fill(why);
  await password.fill(member.password);
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(m).toHaveURL(/#\/settings$/);
  await expect(accountSection(m).locator('.row-status')).toHaveText('Your account was deleted. An anonymous copy of your progress is kept.');
  await expect(accountSection(m).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  await expect.poll(() => m.evaluate(() => localStorage.getItem('muzieklab.account.v1'))).toBeNull();
  await signIn(m, member.email, member.password);
  await expect(m.getByRole('alert')).toHaveText('Email or password is not right.');

  // Gone from the admin's list, and its page says so.
  await a.reload();
  // The first list first, so the search's answer is the one that is read out.
  await expect(a.locator('section[aria-labelledby="h-accounts"]')).toBeVisible();
  await a.getByLabel('Search').fill(member.email);
  // Found by its class: the live region (#announcer) says the same words.
  await expect(a.locator('.acct-empty')).toHaveText('No accounts match.');
  await expect(a.locator('#announcer')).toHaveText('No accounts match.');
  await a.goto(`./#/admin/account/${member.me.id}`);
  await expect(a.getByText("This account isn't there anymore. Another admin may have deleted it.")).toBeVisible();

  // Deleted accounts has it: archived, with the feedback, and nothing that says whose it was.
  await a.goto('./#/admin');
  await a.getByRole('link', { name: /^Deleted accounts/ }).click();
  const entry = a.locator('.closure-row').filter({ hasText: why });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Archived');
  await expect(entry).toContainText('Joined');
  await expect(a.locator('main')).not.toContainText(member.email);
  await expect(a.locator('main')).not.toContainText(member.name);
});

test('progress on the account: two devices merge, and a reset on one resets the other', async ({ person }) => {
  const admin = await anAdmin(person);
  const member = await aMember(person, admin);
  const progressOf = async (page: Page) => JSON.parse((await page.evaluate(() => localStorage.getItem('muzieklab.progress.v1'))) ?? 'null');
  const syncLine = (page: Page) => accountSection(page).locator('.sync-line');

  // The phone was used before the account: its progress goes to the account on the first sync.
  const phone = member.page;
  await phone.addInitScript(() => {
    if (!localStorage.getItem('muzieklab.progress.v1')) {
      localStorage.setItem('muzieklab.progress.v1', JSON.stringify({ xp: 340, practiceDays: ['2026-10-24'], lessons: { '1.1': { stars: 3, bestAccuracy: 92 } } }));
    }
  });
  await phone.goto('./#/settings');
  await expect(syncLine(phone)).toHaveText('Progress saved to your account');
  await expect(accountSection(phone).locator('.row-status')).toHaveText('The progress on this device is on your account now too.');

  // A laptop with progress of its own signs in: the two merge, and nothing is lost.
  const laptop = (await person('desktop')).page;
  await laptop.addInitScript(() => {
    if (!localStorage.getItem('muzieklab.progress.v1')) {
      localStorage.setItem('muzieklab.progress.v1', JSON.stringify({ xp: 60, practiceDays: ['2026-10-25'], lessons: { '1.2': { stars: 2, bestAccuracy: 81 } } }));
    }
  });
  await signIn(laptop, member.email, member.password);
  await expect(laptop).toHaveURL(/#\/settings$/);
  await expect(syncLine(laptop)).toHaveText('Progress saved to your account');
  await expect.poll(async () => (await progressOf(laptop))?.lessons).toEqual({
    '1.1': { stars: 3, bestAccuracy: 92 },
    '1.2': { stars: 2, bestAccuracy: 81 },
  });
  expect(await progressOf(laptop)).toMatchObject({ xp: 340, practiceDays: ['2026-10-24', '2026-10-25'] });

  // The phone picks up the laptop's lesson when it starts again.
  await phone.reload();
  await expect.poll(async () => Object.keys((await progressOf(phone))?.lessons ?? {}).sort()).toEqual(['1.1', '1.2']);

  // Reset progress on the laptop resets the account; the phone takes the reset instead of bringing its copy back.
  await laptop.getByRole('button', { name: 'Reset progress' }).click();
  await laptop.getByRole('alertdialog').getByRole('button', { name: 'Reset' }).click();
  await expect(syncLine(laptop)).toHaveText('Progress saved to your account');
  await phone.reload();
  await expect.poll(async () => (await progressOf(phone))?.xp ?? 0).toBe(0);
  await expect(syncLine(phone)).toHaveText('Progress saved to your account');
});
