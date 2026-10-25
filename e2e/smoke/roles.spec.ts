import type { BrowserContext, Page } from '@playwright/test';
import { PERMISSIONS, ROLES, type Me, type Permission, type Role } from '../../shared/api';
import { VIEWPORTS } from '../helpers';
import {
  accept, accountRow, accountSection, call, checkScreen, cleanUp, errorCode, expect, NO_ACCOUNTS, openAccount, send, SITE, test, Throwaways, Watcher, type Admin,
  type Method, type Person,
} from './helpers';

/**
 * Roles and premium on the deployed site (docs/SMOKE.md): one of the suite's own accounts goes through every role in
 * shared/api.ts ROLES, one at a time (invited with the first, the others switched in the admin screen), then none, then
 * premium. Each time /me has the permissions the role gives (server/src/auth/policy.ts, written out again here), and the
 * app shows what it should: Accounts and the admin screens for an admin only, refused screens and 403s for the others.
 * The tests run in order on that one account, which is removed at the end. Each starts from the roles the account has
 * now, so one that fails does not take the others with it: Playwright goes on with the next in a new worker, which
 * invites a new account.
 */

test.skip(!!NO_ACCOUNTS, NO_ACCOUNTS ?? '');
// In order, in one worker (the config runs tests in parallel), and not serial: a failure does not skip the rest.
test.describe.configure({ mode: 'default' });

const EVERY_ACCOUNT: readonly Permission[] = ['self.manage', 'progress.own', 'class.join'];
/** What each role adds (BACKEND-PLAN.md §4.2). A new role in ROLES does not compile until it is here. */
const GRANTS: Record<Role, readonly Permission[]> = { admin: PERMISSIONS, editor: ['content.edit', 'content.publish'], teacher: ['class.create'] };
const LABELS: Record<Role, string> = { admin: 'Admin', editor: 'Editor', teacher: 'Teacher' };
const permissionsFor = (roles: Role[]): Permission[] => PERMISSIONS.filter((p) => EVERY_ACCOUNT.includes(p) || roles.some((r) => GRANTS[r].includes(p)));

/** The roles the account has, step by step: each role on its own, admin last, then none. */
const STEPS: Role[][] = [...ROLES.filter((r) => r !== 'admin').map((r) => [r]), ['admin'], []];

let person: Person;
let accounts: Throwaways;
/** The account's own browser (phone), signed in all along. */
let ctx: BrowserContext;
let watch: Watcher;

test.beforeAll(async ({ admin, browser }, workerInfo) => {
  accounts = new Throwaways(admin, workerInfo.workerIndex);
  const invited = await accounts.invite('roles', STEPS[0]);
  person = invited.person;
  ctx = await browser.newContext({ baseURL: SITE, viewport: VIEWPORTS.phone, hasTouch: true, locale: 'en-US', serviceWorkers: 'block' });
  watch = new Watcher(ctx);
  // As an admin, this account's admin screens are only looked at: nothing they would change goes through.
  await ctx.route(
    (url) => url.pathname.startsWith('/api/v1/admin/'),
    (route) => {
      if (route.request().method() === 'GET') return route.continue();
      watch.problems.push(`refused by the smoke guard: ${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.abort('blockedbyclient');
    },
  );
  await accept(ctx.request, invited.link, person.password);
});

test.afterAll(async ({ admin }) => {
  await ctx?.close();
  if (person) await cleanUp(admin, person);
});

/** Switches the account's roles to `to` in the admin's one-account screen, from those it has now, waiting for each to save. */
async function switchRoles(page: Page, admin: Admin, to: Role[]): Promise<void> {
  const from = (await admin.account(person.id))?.roles ?? [];
  await openAccount(page, admin, person);
  const region = page.getByRole('region', { name: 'Roles' });
  for (const role of ROLES) {
    const on = to.includes(role);
    if (from.includes(role) === on) continue;
    const toggle = region.getByRole('switch', { name: LABELS[role] });
    await expect(toggle).toHaveAttribute('aria-checked', String(!on));
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/v1/admin/accounts/${person.id}`) && r.request().method() === 'PATCH');
    await toggle.click();
    expect((await saved).status(), `${LABELS[role]} ${on ? 'on' : 'off'}`).toBe(200);
    await expect(toggle).toHaveAttribute('aria-checked', String(on));
  }
}

/** Not an admin: no Accounts in Settings, every admin screen says so, and every admin route answers 403. */
async function expectNoAdmin(m: Page): Promise<void> {
  await expect(accountSection(m).getByRole('link', { name: /^Accounts/ })).toHaveCount(0);
  const screens: [string, string][] = [
    ['#/admin', 'Accounts'],
    ['#/admin/invite', 'Invite someone'],
    ['#/admin/deleted', 'Deleted accounts'],
    [`#/admin/account/${person.id}`, 'Account'],
  ];
  for (const [hash, heading] of screens) {
    await checkScreen(m, hash, heading);
    await expect(m.getByRole('status').filter({ hasText: "You don't have access to this page." })).toBeVisible();
  }
  // Reads and changes alike. The changes name only this account itself, or a new smoke account: were one to go
  // through, it would only touch the suite's own accounts.
  const asks: [Method, string, unknown?][] = [
    ['GET', '/admin/accounts'],
    ['GET', `/admin/accounts/${person.id}`],
    ['GET', '/admin/closures'],
    ['GET', '/admin/audit'],
    ['PATCH', `/admin/accounts/${person.id}`, { name: person.name }],
    ['POST', `/admin/accounts/${person.id}/reset-link`],
    ['POST', `/admin/accounts/${person.id}/invite-link`],
    ['DELETE', `/admin/accounts/${person.id}?expect=active`],
    ['POST', '/admin/invites', { ...accounts.identity('notmade'), roles: [] }],
  ];
  for (const [method, path, data] of asks) {
    const res = await send(ctx.request, method, path, data);
    expect(`${res.status()} ${await errorCode(res)}`, `${method} ${path.replace(/\?.*/, '')}`).toBe('403 forbidden');
  }
}

for (const [i, roles] of STEPS.entries()) {
  const role = roles[0];
  const title = !role
    ? 'none, every role switched off: no Accounts, and the admin screens and routes refuse it'
    : role === 'admin'
      ? 'admin, switched on in the admin screen: Accounts and the admin screens, and it cannot change its own roles'
      : `${role}, ${i === 0 ? 'invited with it' : 'switched on in the admin screen'}: its permissions, and the admin screens and routes refuse it`;

  test(`roles: ${title}`, async ({ admin, adminPage }) => {
    watch.reset();
    await switchRoles(adminPage, admin, roles);
    const me = await call<Me>(ctx.request, 'GET', '/me');
    expect(me.roles).toEqual(roles);
    expect(me.permissions).toEqual(permissionsFor(roles));

    const m = await ctx.newPage();
    await m.goto('./#/settings');
    await expect(accountRow(m, person.name)).toContainText(person.email);
    // Account says which role it has (nothing for none).
    await checkScreen(m, '#/account', 'Account');
    const facts = m.getByRole('region', { name: 'Profile' }).locator('.row-note');
    if (role) await expect(facts).toHaveText(LABELS[role]);
    else await expect(facts).toHaveCount(0);
    await checkScreen(m, '#/settings', 'Settings');

    if (role !== 'admin') await expectNoAdmin(m);
    else {
      await expect(accountSection(m).getByRole('link', { name: /^Accounts/ })).toBeVisible();
      await checkScreen(m, '#/admin', 'Accounts');
      await expect(m.locator('section[aria-labelledby="h-accounts"]')).toBeVisible();
      await checkScreen(m, '#/admin/invite', 'Invite someone');
      await expect(m.getByRole('button', { name: 'Create invite' })).toBeVisible();
      await checkScreen(m, '#/admin/deleted', 'Deleted accounts');
      await checkScreen(m, `#/admin/account/${person.id}`, person.name);
      const own = m.getByRole('region', { name: 'Roles' });
      await expect(own.getByText("You can't change your own roles.")).toBeVisible();
      for (const r of ROLES) await expect(own.getByRole('switch', { name: LABELS[r] })).toBeDisabled();
      // The API refuses it too (sent from its own session, about itself).
      const res = await send(ctx.request, 'PATCH', `/admin/accounts/${person.id}`, { roles: [] });
      expect(`${res.status()} ${await errorCode(res)}`).toBe('409 own_account');
      expect((await send(ctx.request, 'GET', '/admin/accounts?q=' + encodeURIComponent(person.email))).status()).toBe(200);
    }
    await m.close();
    await watch.expectClean();
  });
}

test('premium: switched on with a last day in the admin screen; /me and Account show it; then off', async ({ admin, adminPage: a }) => {
  watch.reset();
  await openAccount(a, admin, person);
  const region = a.getByRole('region', { name: 'Premium' });
  const premium = region.getByRole('switch', { name: 'Premium' });
  const patched = () => a.waitForResponse((r) => r.url().endsWith(`/api/v1/admin/accounts/${person.id}`) && r.request().method() === 'PATCH' && r.ok());
  await expect(premium).toHaveAttribute('aria-checked', 'false');
  let saved = patched();
  await premium.click();
  await saved;
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await expect(premium).toHaveAccessibleDescription('No end date');

  // Two months on, as a calendar day (the same in every time zone).
  const day = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const shown = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
  await region.getByLabel('Last day (optional)').fill(day);
  saved = patched();
  await region.getByRole('button', { name: 'Save date' }).click();
  await saved;
  await expect(region.locator('.form-done')).toHaveText('Saved.');
  await expect(premium).toHaveAccessibleDescription(`Until ${shown}`);
  const me = await call<Me>(ctx.request, 'GET', '/me');
  expect(me.premium).toEqual({ active: true, until: day });
  const m = await ctx.newPage();
  await m.goto('./#/account');
  // After the roles the account has, if any: "Editor · Premium until …".
  await expect(m.getByRole('region', { name: 'Profile' }).locator('.row-note')).toHaveText([...me.roles.map((r) => LABELS[r]), `Premium until ${shown}`].join(' · '));
  await m.close();

  saved = patched();
  await premium.click();
  await saved;
  await expect(premium).toHaveAttribute('aria-checked', 'false');
  await expect(premium).toHaveAccessibleDescription('Gives premium features (coming later).');
  expect((await call<Me>(ctx.request, 'GET', '/me')).premium.active).toBe(false);
  await watch.expectClean();
});
