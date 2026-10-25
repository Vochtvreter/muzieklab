import { request, type Page } from '@playwright/test';
import { PERMISSIONS, type Me, type SavedProgress } from '../../shared/api';
import { VIEWPORTS } from '../helpers';
import {
  accountRow, accountSection, call, checkScreen, cookie, expect, expectTheme, linkPattern, newPassword, NO_ACCOUNTS, send, SIGN_IN_REFUSED,
  signInWithForm, signOut, SITE, stored, test, type Size,
} from './helpers';

/**
 * Accounts on the deployed site with its real API (docs/SMOKE.md): the suite's admin, signed in once per worker, looks
 * at its own screens without changing anything; then accounts the test makes itself (smoke-…@example.invalid) are
 * invited, accepted, signed out and renewed, in one tab and in several at once. Every one is removed when its test
 * ends.
 */

test.skip(!!NO_ACCOUNTS, NO_ACCOUNTS ?? '');

/**
 * As if the session was last renewed over 12 hours ago (src/api/client.ts, RENEWED_KEY): the next tab that starts
 * renews it. Within 12 hours of a renewal, in any tab, a start does not renew again.
 */
const twelveHoursOn = (page: Page) => page.evaluate(() => localStorage.removeItem('muzieklab.renewed.v1'));

/** Progress this device had before signing in: it goes to the account at the first sync. */
const PLAYED = { xp: 120, practiceDays: ['2026-10-20'], lessons: { '1.1': { stars: 2, bestAccuracy: 85 } } };

test('admin: signed in once for this worker; /me, Settings, Account and its own admin page, looked at and not changed', async ({ admin, adminPage: page }) => {
  const me = await call<Me>(admin.ctx.request, 'GET', '/me');
  expect(me.id).toBe(admin.me.id);
  expect(me.roles).toContain('admin');
  expect(me.permissions).toEqual([...PERMISSIONS]);

  await page.goto('./#/settings');
  await expect(accountRow(page, me.name)).toContainText(me.email);
  await expect(accountSection(page).getByRole('link', { name: /^Accounts/ })).toBeVisible();
  await expect(accountSection(page).getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();

  await checkScreen(page, '#/account', 'Account');
  await expect(page.getByRole('region', { name: 'Profile' }).getByLabel('Name')).toHaveValue(me.name);
  await expect(page.getByRole('region', { name: 'Profile' }).locator('.row-note')).toContainText('Admin');

  // Its own roles cannot be changed: the switches are off-limits, and the screen says so.
  await checkScreen(page, `#/admin/account/${me.id}`, me.name);
  const roles = page.getByRole('region', { name: 'Roles' });
  await expect(roles.getByText("You can't change your own roles.")).toBeVisible();
  for (const role of ['Admin', 'Editor', 'Teacher']) await expect(roles.getByRole('switch', { name: role })).toBeDisabled();
  await expect(roles.getByRole('switch', { name: 'Admin' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('region', { name: 'Access' }).getByRole('link', { name: /^This is your account/ })).toBeVisible();
});

test('admin: the account and admin screens at phone, tablet and desktop, light and dark, looked at and not changed', async ({ admin, adminPage: page }) => {
  const screens: [string, string][] = [
    ['#/settings', 'Settings'],
    ['#/account', 'Account'],
    ['#/privacy', 'Privacy'],
    ['#/admin', 'Accounts'],
    ['#/admin/invite', 'Invite someone'],
    ['#/admin/deleted', 'Deleted accounts'],
    [`#/admin/account/${admin.me.id}`, admin.me.name],
  ];
  // The theme follows the account (a synced setting): only on System do the light and dark passes differ.
  const theme = (await admin.read<SavedProgress>('/progress')).data?.prefs.theme ?? 'system';
  expect(theme, "the smoke admin's Color theme (Settings): set it back to System, so both light and dark are checked").toBe('system');
  for (const size of ['phone', 'tablet', 'desktop'] as Size[]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize(VIEWPORTS[size]);
      await page.emulateMedia({ colorScheme });
      for (const [hash, heading] of screens) {
        await checkScreen(page, hash, heading);
        if (hash === screens[0][0]) await expectTheme(page, colorScheme);
        // Loaded, not only its heading: the list, the account's sections, or its details.
        if (hash === '#/admin') await expect(page.locator('section[aria-labelledby="h-accounts"]')).toBeVisible();
        if (hash === '#/account') await expect(page.getByRole('region', { name: 'Your data' })).toBeVisible();
        if (hash.startsWith('#/admin/account/')) await expect(page.getByRole('region', { name: 'Details' })).toBeVisible();
      }
    }
  }
});

test('invite: the admin invites someone on the invite screen, who accepts in a fresh browser and is signed in; a wrong password is refused', async ({
  adminPage: a,
  smoke,
  device,
}) => {
  const { email, name } = smoke.identity('invited');
  await a.goto('./#/admin');
  await a.getByRole('link', { name: 'Invite someone' }).click();
  await expect(a.getByRole('heading', { level: 1, name: 'Invite someone' })).toBeVisible();
  const person = a.getByRole('region', { name: 'Person' });
  await person.getByLabel('Email').fill(email);
  await person.getByLabel('Name').fill(name);
  for (const role of ['Admin', 'Editor', 'Teacher']) await expect(a.getByRole('switch', { name: role })).toHaveAttribute('aria-checked', 'false');
  await a.getByRole('button', { name: 'Create invite' }).click();
  await expect(a.getByRole('heading', { name: `Invite for ${name} is ready` })).toBeVisible();
  // Read from the page, as the admin would copy it. Never printed: links are not logged.
  const link = await a.getByLabel('Invite link').inputValue();
  expect(linkPattern('invite').test(link), "the invite link is this site's #/invite/<token>").toBe(true);
  expect((await a.getByLabel('Message to send').inputValue()).includes(link), 'the message holds the link').toBe(true);
  const invited = smoke.adopt(email, newPassword());

  const m = await device({ size: 'phone' });
  await m.page.goto(link);
  await expect(m.page.getByRole('heading', { level: 1, name: `Welcome, ${name}` })).toBeVisible();
  await expect(m.page.getByText(`Choose a password for ${email}.`)).toBeVisible();
  await m.page.getByLabel('New password').fill(invited.password);
  await m.page.getByRole('button', { name: 'Create account' }).click();
  await expect(m.page).toHaveURL(/#\/settings$/);
  await expect(accountSection(m.page).locator('.row-status')).toHaveText("You're signed in. Welcome to Muzieklab.");
  await expect(accountRow(m.page, name)).toContainText(email);
  await expect(accountSection(m.page).getByRole('link', { name: /^Accounts/ })).toHaveCount(0);

  // The admin's list has them now, active.
  await a.getByRole('link', { name: 'Done' }).click();
  await a.getByLabel('Search').fill(email);
  await expect(a.locator('a.acct-row')).toHaveCount(1);
  await expect(a.locator('a.acct-row')).toContainText('Active');

  // Another browser: a wrong password is refused (once: wrong passwords count), the right one signs in.
  const other = await device({ size: 'desktop' });
  other.watch.allow(...SIGN_IN_REFUSED);
  await signInWithForm(other.page, email, `not it ${newPassword()}`);
  await expect(other.page.getByRole('alert')).toHaveText('Email or password is not right.');
  await expect(other.page.getByLabel('Password', { exact: true })).toBeFocused();
  await other.page.getByLabel('Password', { exact: true }).fill(invited.password);
  await other.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(other.page).toHaveURL(/#\/settings$/);
  await expect(accountRow(other.page, name)).toBeVisible();
});

test('sign out: Keep leaves the progress on this device and Remove takes it off; the session ends either way', async ({ smoke, device }) => {
  const d = await device({ size: 'phone' });
  // This device was played on before signing in (put back on every load until the app has its own copy).
  await d.page.addInitScript((p) => {
    if (!localStorage.getItem('muzieklab.progress.v1')) localStorage.setItem('muzieklab.progress.v1', JSON.stringify(p));
  }, PLAYED);
  const person = await smoke.member('signout', d);
  await d.page.goto('./#/settings');
  const section = accountSection(d.page);
  await expect(section.locator('.sync-line')).toHaveText('Progress saved to your account');
  await expect(section.locator('.row-status')).toHaveText('The progress on this device is on your account now too.');

  // The session token, sent from elsewhere: it works now, and after signing out it does not.
  const replay = await request.newContext({ extraHTTPHeaders: { Cookie: `__Host-session=${await cookie(d.ctx, '__Host-session')}` } });
  try {
    expect((await send(replay, 'GET', '/me')).status(), 'the session token before signing out').toBe(200);
    await signOut(d.page, 'Keep');
    expect(await stored(d.page, 'muzieklab.progress.v1')).toMatchObject({ xp: PLAYED.xp });
    expect(await stored(d.page, 'muzieklab.account.v1')).toBeNull();
    expect(await stored(d.page, 'muzieklab.sync.v1')).toBeNull();
    // The session is over on the server too: its token is refused.
    expect((await send(replay, 'GET', '/me')).status(), 'the session token after signing out').toBe(401);
  } finally {
    await replay.dispose();
  }

  await signInWithForm(d.page, person.email, person.password);
  await expect(d.page).toHaveURL(/#\/settings$/);
  await expect(section.locator('.sync-line')).toHaveText('Progress saved to your account');
  await signOut(d.page, 'Remove');
  expect(await stored(d.page, 'muzieklab.progress.v1'), "this device's progress after Remove").toBeNull();
  expect(await stored(d.page, 'muzieklab.prefs.v1'), 'the settings stay').not.toBeNull();
  // The account still has it.
  const again = await device({ size: 'desktop' });
  await signInWithForm(again.page, person.email, person.password);
  await expect(again.page).toHaveURL(/#\/settings$/);
  await expect.poll(async () => ((await stored(again.page, 'muzieklab.progress.v1')) as { xp?: number } | null)?.xp).toBe(PLAYED.xp);
});

test('staying signed in: a reload renews the session, and a lost session token is renewed from the refresh token', async ({ smoke, device }) => {
  const d = await device({ size: 'desktop' });
  const person = await smoke.member('renew', d);
  const name = d.page.getByRole('region', { name: 'Profile' }).getByLabel('Name');
  await d.page.goto('./#/account');
  await expect(name).toHaveValue(person.name);
  await d.page.waitForLoadState('networkidle');
  let renewals = 0;
  d.ctx.on('request', (r) => {
    if (r.url().endsWith('/api/v1/auth/refresh')) renewals++;
  });

  // A start renews the session when its last renewal is 12 hours ago: both tokens change.
  const before = await cookie(d.ctx, '__Secure-refresh');
  await twelveHoursOn(d.page);
  const renewed = d.page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh'));
  await d.page.reload();
  expect((await renewed).status(), 'the renewal on a reload').toBe(204);
  await expect(name).toHaveValue(person.name);
  expect((await cookie(d.ctx, '__Secure-refresh')) !== before, 'the refresh token was replaced').toBe(true);

  // A reload soon after does not renew again.
  await d.page.waitForLoadState('networkidle');
  renewals = 0;
  await d.page.reload();
  await expect(name).toHaveValue(person.name);
  await d.page.waitForLoadState('networkidle');
  expect(renewals, 'renewals on a reload soon after one').toBe(0);

  // An hour on, the browser has dropped the session token (its Max-Age): the refresh token gets a new one. Only that
  // cookie is deleted, once nothing is on its way (context.clearCookies re-adds the others, and could put back an old
  // refresh token that a renewal had just replaced).
  await d.page.waitForLoadState('networkidle');
  const cdp = await d.ctx.newCDPSession(d.page);
  await cdp.send('Network.deleteCookies', { name: '__Host-session', url: SITE });
  await cdp.detach();
  expect(await cookie(d.ctx, '__Host-session')).toBeUndefined();
  const again = d.page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh'));
  await d.page.reload();
  expect((await again).status(), 'the renewal without a session token').toBe(204);
  await expect(name).toHaveValue(person.name);
  expect(await cookie(d.ctx, '__Host-session')).toBeDefined();
  expect((await call<Me>(d.ctx.request, 'GET', '/me')).id).toBe(person.id);
});

/**
 * Every tab renews the session when it starts, if its last renewal is over 12 hours ago, and a renewal ends the session
 * token it replaces. Until 0.16.2 a tab whose request was sent with a token another tab had replaced since got a 401 on
 * its one retry, and showed itself signed out: of three tabs opened at once on the test site, one or two landed on
 * #/signin, and with four reloaded at once the session itself was ended. Now the tabs renew one at a time and use each
 * other's renewals (src/api/client.ts, renewSession): of tabs that start together, one renews.
 *
 * Tabs opened and reloaded one after another, each renewing as it starts (as if 12 hours on each time), and tabs
 * opened and reloaded at once: all stay signed in, and the session goes on.
 */
test('staying signed in: tabs opened one after another, and at once, stay signed in, and the session goes on', async ({ smoke, device }) => {
  const d = await device({ size: 'desktop' });
  const person = await smoke.member('tabs', d);
  const nameIn = (page: Page) => page.getByRole('region', { name: 'Profile' }).getByLabel('Name');
  await d.page.goto('./#/account');
  await expect(nameIn(d.page)).toHaveValue(person.name);
  await d.page.waitForLoadState('networkidle');
  let renewals = 0;
  d.ctx.on('request', (r) => {
    if (r.url().endsWith('/api/v1/auth/refresh')) renewals++;
  });
  // A tab shows the cached account at once, so each is checked once nothing is on its way: still on Account, and
  // still signed in in Settings. Afterwards each is back on Account.
  const stayed = async (tabs: Page[], when: string) => {
    await Promise.all(tabs.map((tab) => tab.waitForLoadState('networkidle')));
    for (const [i, tab] of tabs.entries()) {
      const which = `tab ${i + 1} of ${tabs.length}, ${when}`;
      await expect(tab, which).toHaveURL(/#\/account$/);
      await expect(nameIn(tab), which).toHaveValue(person.name);
      await tab.evaluate(() => void (location.hash = '#/settings'));
      await expect(accountRow(tab, person.name), which).toContainText(person.email);
      await tab.evaluate(() => void (location.hash = '#/account'));
      await expect(nameIn(tab), which).toHaveValue(person.name);
    }
  };

  // One after another: each tab renews the session as it starts, then each is reloaded in turn.
  const tabs = [d.page];
  for (const n of [2, 3]) {
    await twelveHoursOn(d.page);
    const tab = await d.ctx.newPage();
    await tab.goto('./#/account');
    await expect(nameIn(tab), `tab ${n}, opened after the others`).toHaveValue(person.name);
    await tab.waitForLoadState('networkidle');
    tabs.push(tab);
  }
  for (const [i, tab] of tabs.entries()) {
    await twelveHoursOn(d.page);
    await tab.reload();
    await expect(nameIn(tab), `tab ${i + 1} of 3, reloaded in turn`).toHaveValue(person.name);
    await tab.waitForLoadState('networkidle');
  }
  // Each still signed in, the earlier ones too, whose session token later renewals replaced.
  await stayed(tabs, 'afterwards');
  expect(renewals, 'renewals by the tabs opened and reloaded one after another').toBe(5);
  expect((await call<Me>(d.ctx.request, 'GET', '/me')).id, 'the session afterwards').toBe(person.id);

  // At once: one renews, and the others use its renewal.
  await twelveHoursOn(d.page);
  renewals = 0;
  const together = await Promise.all([1, 2, 3].map(() => d.ctx.newPage()));
  await Promise.all(together.map((tab) => tab.goto('./#/account')));
  await stayed(together, 'opened at once');
  expect(renewals, 'renewals by the 3 tabs opened at once').toBe(1);

  const all = [...tabs, ...together];
  await twelveHoursOn(d.page);
  renewals = 0;
  await Promise.all(all.map((tab) => tab.reload()));
  await stayed(all, 'reloaded at once');
  expect(renewals, 'renewals by the 6 tabs reloaded at once').toBe(1);

  // The session goes on: its session token works, and so does its refresh token.
  expect((await call<Me>(d.ctx.request, 'GET', '/me')).id, 'the session afterwards').toBe(person.id);
  expect((await send(d.ctx.request, 'POST', '/auth/refresh')).status(), 'a renewal afterwards').toBe(204);
  expect(await d.watch.found(), 'errors in the tabs').toEqual([]);
});
