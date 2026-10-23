import { expect, test } from '@playwright/test';
import type { AccountDetail, AdminUpdateRequest, InviteRequest, Me } from '../shared/api';
import {
  ACCOUNTS, accountDetail, adminApi, apiError, expectClickable, INVITE_LINK_CREATED, ME_ADMIN, ME_MEMBER, MEMBER, mockApi, RESET_LINK_CREATED, seedAccount, SIGNED_OUT,
  signedInAs, TOKEN, VIEWPORTS,
} from './helpers';

/**
 * Accounts, phase 1 (BACKEND-PLAN.md §5): sign in and out, accept an invite, a new password, the Account screen, and
 * how the app behaves with no API at all. The API is mocked (helpers.ts mockApi); the service worker is blocked so
 * page.route sees every request.
 */
test.use({ viewport: VIEWPORTS.phone, hasTouch: true, serviceWorkers: 'block' });

const LINK = { email: 'lies@example.com', name: 'Lies Bakker', expiresAt: '2026-10-29T10:00:00.000Z' };
const LIES: Me = { ...ME_MEMBER, id: '6718f0c2a1b2c3d4e5f60003', email: LINK.email, name: LINK.name };
const accountSection = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Account' });

test('sign in: a wrong password, then the right one; Settings shows the account; sign out', async ({ page }) => {
  const api = await mockApi(page, {
    ...SIGNED_OUT,
    'POST /auth/sign-in': ({ body }) =>
      (body as { password: string }).password === 'a good long password' ? { json: ME_MEMBER } : apiError('invalid_credentials', 401),
    'POST /auth/sign-out': { status: 204 },
  });
  await page.goto('./#/settings');
  await accountSection(page).getByRole('link', { name: /^Sign in/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveTitle('Sign in · Muzieklab');
  // A form on its own: no tab bar.
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByText('Forgot your password? Ask the person who invited you.')).toBeVisible();

  // Empty: the fields say what is missing, and nothing is sent.
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Type your email.')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeFocused();
  expect(api.callsTo('POST /auth/sign-in')).toHaveLength(0);

  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong password');
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Email or password is not right.');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  expect(api.callsTo('POST /auth/sign-in')[0].body).toEqual({ email: 'sam@example.com', password: 'wrong password' });

  // Show password shows what was typed.
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();

  await page.getByLabel('Password', { exact: true }).fill('a good long password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  const section = accountSection(page);
  await expect(section.getByRole('link', { name: /^Sam Jansen/ })).toContainText('sam@example.com');
  // A member is not an admin: no Accounts row.
  await expect(section.getByRole('link', { name: /^Accounts/ })).toHaveCount(0);
  // The account is cached for offline use: only what Me holds.
  const cached = await page.evaluate(() => localStorage.getItem('muzieklab.account.v1'));
  expect(JSON.parse(cached ?? '{}').email).toBe('sam@example.com');
  expect(cached).not.toContain('a good long password');

  await section.getByRole('button', { name: 'Sign out' }).click();
  await expect(section.getByRole('status')).toHaveText('Signed out.');
  await expect(section.getByRole('link', { name: /^Sign in/ })).toBeVisible();
  expect(api.callsTo('POST /auth/sign-out')).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('muzieklab.account.v1'))).toBeNull();
});

test('sign in: too many tries says how long to wait', async ({ page }) => {
  await mockApi(page, { ...SIGNED_OUT, 'POST /auth/sign-in': apiError('too_many_attempts', 429, { retryAfter: 120 }) });
  await page.goto('./#/signin');
  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByLabel('Password', { exact: true }).fill('another guess');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Too many tries. Try again in 2 minutes.');
});

test('sign in: no answer from the API says so', async ({ page }) => {
  await mockApi(page, { ...SIGNED_OUT, 'POST /auth/sign-in': (/* offline */) => ({ status: 502, json: undefined }) });
  await page.goto('./#/signin');
  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a good long password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
});

test('sign in when signed in already goes to Account; Account when signed out goes to Sign in', async ({ page }) => {
  const api = await mockApi(page, MEMBER);
  await page.goto('./#/signin');
  await expect(page).toHaveURL(/#\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  api.set(SIGNED_OUT);
  await page.goto('./#/account');
  await page.reload();
  await expect(page).toHaveURL(/#\/signin$/);
});

test('privacy from sign in, and back', async ({ page }) => {
  await mockApi(page, SIGNED_OUT);
  await page.goto('./#/signin');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('Last updated: October 23, 2026')).toBeVisible();
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test('accept invite: a weak password is refused at the field; then signed in, and the link leaves the history', async ({ page }) => {
  const api = await mockApi(page, {
    ...SIGNED_OUT,
    'POST /auth/invite/check': { json: LINK },
    'POST /auth/invite/accept': ({ body }) => {
      const b = body as { password: string; name?: string };
      return b.password === 'password1234' ? apiError('password_common', 422) : { json: { ...LIES, name: b.name ?? LIES.name } };
    },
  });
  await page.goto('./');
  await page.goto('./#/invite/' + TOKEN);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Lies Bakker' })).toBeVisible();
  await expect(page.getByText('Choose a password for lies@example.com.')).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('Lies Bakker');
  expect(api.callsTo('POST /auth/invite/check')[0].body).toEqual({ token: TOKEN });

  // Too short: said at once, without asking the server.
  await page.getByLabel('New password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use 10 to 128 characters.')).toBeVisible();
  expect(api.callsTo('POST /auth/invite/accept')).toHaveLength(0);

  await page.getByLabel('New password').fill('password1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  const field = page.getByLabel('New password');
  await expect(page.getByText("This password is too common. Choose one that's harder to guess.")).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toBeFocused();

  await page.getByLabel('Name').fill('Lies B.');
  await field.fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).getByRole('status')).toHaveText("You're signed in. Welcome to Muzieklab.");
  await expect(accountSection(page).getByRole('link', { name: /^Lies B\./ })).toBeVisible();
  expect(api.callsTo('POST /auth/invite/accept')[1].body).toEqual({ token: TOKEN, password: 'a tune in seven notes', name: 'Lies B.' });
  // The token was replaced in the history: Back goes to where the person was before the link.
  await page.goBack();
  await expect(page).not.toHaveURL(/invite/);
});

test('accept invite: a used or expired link says so, with the way Home', async ({ page }) => {
  await mockApi(page, { ...SIGNED_OUT, 'POST /auth/invite/check': apiError('link_invalid', 410) });
  await page.goto('./#/invite/' + TOKEN);
  await expect(page.getByRole('alert')).toHaveText("This link doesn't work anymore. Ask the person who invited you for a new one.");
  await expect(page.getByLabel('New password')).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test('accept invite: no answer offers to try again', async ({ page }) => {
  const api = await mockApi(page, { ...SIGNED_OUT, 'POST /auth/invite/check': { status: 503 } });
  await page.goto('./#/invite/' + TOKEN);
  await expect(page.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  api.set({ 'POST /auth/invite/check': { json: LINK } });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Lies Bakker' })).toBeVisible();
});

test('new password: saved, signed in, and Settings says the other devices are signed out', async ({ page }) => {
  const api = await mockApi(page, {
    ...SIGNED_OUT,
    'POST /auth/reset/check': { json: { ...LINK, email: ME_MEMBER.email, name: ME_MEMBER.name } },
    'POST /auth/reset/confirm': { json: ME_MEMBER },
  });
  await page.goto('./#/reset/' + TOKEN);
  await expect(page.getByRole('heading', { level: 1, name: 'New password' })).toBeVisible();
  await expect(page.getByText('Choose a new password for sam@example.com.')).toBeVisible();
  // The hidden username, so a password manager saves the new password for this account.
  await expect(page.locator('input[autocomplete="username"]')).toHaveValue('sam@example.com');
  await page.getByLabel('New password').fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).getByRole('status')).toHaveText('Password saved. Your other devices are signed out.');
  expect(api.callsTo('POST /auth/reset/confirm')[0].body).toEqual({ token: TOKEN, password: 'a tune in seven notes' });
  // The notice is for that visit of Settings only.
  await page.getByRole('link', { name: /^What's new/ }).click();
  await page.getByRole('link', { name: 'Back to settings' }).click();
  await expect(accountSection(page).getByRole('status')).toHaveCount(0);
});

test('account: name, email and password', async ({ page }) => {
  let me = { ...ME_MEMBER };
  const api = await mockApi(page, {
    ...MEMBER,
    'PATCH /me': ({ body }) => {
      me = { ...me, ...(body as Partial<Me>) };
      return { json: me };
    },
    'POST /me/email': ({ body }) => {
      const b = body as { email: string; password: string };
      if (b.password !== 'my password here') return apiError('wrong_password', 401);
      me = { ...me, email: b.email };
      return { json: me };
    },
    'POST /me/password': ({ body }) =>
      (body as { currentPassword: string }).currentPassword === 'my password here' ? { status: 204 } : apiError('wrong_password', 401),
  });
  await page.goto('./#/settings');
  await accountSection(page).getByRole('link', { name: /^Sam Jansen/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await expect(page.getByText('Premium until January 31, 2027')).toBeVisible();

  // Name: Save only once it changed.
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  await page.getByLabel('Name').fill('Sam J.');
  await save.click();
  await expect(page.getByText('Name saved.')).toBeVisible();
  expect(api.callsTo('PATCH /me')[0].body).toEqual({ name: 'Sam J.' });

  // Email: a wrong password is said at the password field.
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByLabel('New email')).toBeFocused();
  await page.getByLabel('New email').fill('sam.j@example.com');
  await page.getByLabel('Current password').first().fill('nope');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByText("That's not your current password.")).toBeVisible();
  await page.getByLabel('Current password').first().fill('my password here');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByText('Email changed. Sign in with it from now on.')).toBeVisible();
  await expect(page.getByText('sam.j@example.com')).toBeVisible();

  // Password.
  const passwords = page.getByRole('region', { name: 'Password' });
  await passwords.getByLabel('Current password').fill('my password here');
  await passwords.getByLabel('New password').fill('a tune in seven notes');
  await passwords.getByRole('button', { name: 'Change password' }).click();
  await expect(passwords.getByRole('status')).toHaveText('Password changed. Your other devices are signed out.');
  await expect(passwords.getByLabel('Current password')).toHaveValue('');
  expect(api.callsTo('POST /me/password')[0].body).toEqual({ currentPassword: 'my password here', newPassword: 'a tune in seven notes' });

  // Back in Settings, the account row has the new name and email.
  await page.getByRole('link', { name: 'Back to settings' }).click();
  await expect(accountSection(page).getByRole('link', { name: /^Sam J\./ })).toContainText('sam.j@example.com');
});

test('account: sign out everywhere, confirmed', async ({ page }) => {
  const api = await mockApi(page, MEMBER);
  await page.goto('./#/account');
  await page.getByRole('button', { name: /^Sign out everywhere/ }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Sign out everywhere?' });
  await expect(confirm).toContainText('Every device with this account is signed out, this one too.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(api.callsTo('POST /auth/sign-out-everywhere')).toHaveLength(0);
  await page.getByRole('button', { name: /^Sign out everywhere/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).getByRole('status')).toHaveText('Signed out on every device.');
  expect(api.callsTo('POST /auth/sign-out-everywhere')).toHaveLength(1);
});

test('account: download my data', async ({ page }) => {
  await mockApi(page, {
    ...MEMBER,
    'GET /me/export': { json: { exportedAt: '2026-10-23T12:00:00.000Z', account: ME_MEMBER, sessions: [], audit: [] }, headers: { 'content-disposition': 'attachment; filename="muzieklab-account.json"' } },
  });
  await page.goto('./#/account');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download my data/ }).click();
  expect((await download).suggestedFilename()).toBe('muzieklab-account.json');
  await expect(page.getByText('Downloaded: muzieklab-account.json.')).toBeVisible();
});

test('account: delete, confirmed with the password', async ({ page }) => {
  const api = await mockApi(page, {
    ...signedInAs(ME_ADMIN),
    'DELETE /me': ({ body }) => {
      const pw = (body as { password: string }).password;
      return pw === 'wrong' ? apiError('wrong_password', 401) : pw === 'last' ? apiError('last_admin', 409) : { status: 204 };
    },
  });
  await page.goto('./#/account');
  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
  const password = confirm.getByLabel('Password', { exact: true });
  await expect(password).toBeFocused();
  // No password: nothing is sent.
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm.getByText('Type your password.')).toBeVisible();
  expect(api.callsTo('DELETE /me')).toHaveLength(0);
  await password.fill('wrong');
  await password.press('Enter');
  await expect(confirm.getByText("That's not your current password.")).toBeVisible();
  await password.fill('last');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm.getByRole('alert')).toHaveText("You're the last admin. Make someone else admin first.");
  await password.fill('right');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).getByRole('status')).toHaveText('Your account was deleted.');
  await expect(accountSection(page).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  expect(api.callsTo('DELETE /me').map((c) => c.body)).toEqual([{ password: 'wrong' }, { password: 'last' }, { password: 'right' }]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('muzieklab.account.v1'))).toBeNull();
});

test('a session that ended signs the account out (a 401 on any request)', async ({ page }) => {
  await mockApi(page, { ...MEMBER, 'POST /me/password': apiError('unauthenticated', 401) });
  await page.goto('./#/account');
  const passwords = page.getByRole('region', { name: 'Password' });
  await passwords.getByLabel('Current password').fill('my password here');
  await passwords.getByLabel('New password').fill('a tune in seven notes');
  await passwords.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/#\/signin$/);
});

test('no API (production today): no Account section, and no request until Settings opens', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requests.push(r.url());
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Start lesson' })).toBeVisible();
  expect(requests).toEqual([]);
  const me = page.waitForResponse('**/api/v1/me');
  await page.goto('./#/settings');
  await me;
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
  await expect(accountSection(page)).toHaveCount(0);
  // About still has the privacy statement.
  await expectClickable(page.getByRole('link', { name: /^Privacy/ }));
});

test('offline with a cached account: the account shows, changes wait', async ({ page }) => {
  await seedAccount(page, ME_MEMBER);
  await page.goto('./#/settings');
  const section = accountSection(page);
  await expect(section.getByRole('link', { name: /^Sam Jansen/ })).toBeVisible();
  await expect(section.getByText("Offline: account changes wait until you're online.")).toBeVisible();
  await expect(section.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await section.getByRole('link', { name: /^Sam Jansen/ }).click();
  await expect(page.getByText("Offline: account changes wait until you're online.")).toBeVisible();
  await expect(page.getByText('sam@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
});

test('account with no API and nothing cached: says so, and Try again asks again', async ({ page }) => {
  await page.goto('./#/account');
  await expect(page.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  await mockApi(page, MEMBER);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Sam Jansen');
});

// --- admin: accounts, invite, one account ------------------------------------------------------------------------

const [LIES_INVITED, SAM_ACTIVE, PIET_BLOCKED] = ACCOUNTS;
const statusPill = (page: import('@playwright/test').Page) => page.locator('.acct-head .status-pill');
const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('admin accounts: the search asks once typing pauses, the status filter, and a row opens the account', async ({ page }) => {
  const api = await mockApi(page, adminApi());
  await page.goto('./#/settings');
  await accountSection(page).getByRole('link', { name: /^Accounts/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
  const list = page.locator('section[aria-labelledby="h-accounts"]');
  await expect(list.getByRole('heading', { name: '4 accounts' })).toBeVisible();
  // Newest first, as the API sends them; the admin's own row says so.
  await expect(list.getByRole('link')).toHaveText([/^Lies Bakker/, /^Sam Jansen/, /^Piet Visser/, /^Ann de Vries \(you\)/]);
  await expect(list.getByRole('link', { name: /^Lies Bakker/ })).toContainText('lies@example.comInvitedTeacher');

  const before = api.callsTo('GET /admin/accounts').length;
  await page.getByLabel('Search').pressSequentially('piet', { delay: 40 });
  await expect(list.getByRole('heading', { name: '1 account found' })).toBeVisible();
  await expect(list.getByRole('link')).toHaveText([/^Piet Visser/]);
  expect(api.callsTo('GET /admin/accounts').slice(before).map((c) => c.query.get('q'))).toEqual(['piet']);

  await page.getByLabel('Search').fill('');
  await expect(list.getByRole('heading', { name: '4 accounts' })).toBeVisible();
  const filter = page.getByRole('group', { name: 'Status' });
  await expect(filter.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  await filter.getByRole('button', { name: 'Invited' }).click();
  await expect(filter.getByRole('button', { name: 'Invited' })).toHaveAttribute('aria-pressed', 'true');
  await expect(list.getByRole('link')).toHaveText([/^Lies Bakker/]);
  expect(api.callsTo('GET /admin/accounts').at(-1)!.query.get('status')).toBe('invited');

  await list.getByRole('link', { name: /^Lies Bakker/ }).click();
  await expect(page).toHaveURL(new RegExp('#/admin/account/' + LIES_INVITED.id + '$'));
  await expect(page.getByRole('heading', { level: 1, name: 'Lies Bakker' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to accounts' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
});

test('admin accounts: no answer offers Try again; a list the account may no longer see says so', async ({ page }) => {
  const api = await mockApi(page, { ...adminApi(), 'GET /admin/accounts': { status: 502 } });
  await page.goto('./#/admin');
  await expect(page.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  api.set({ 'GET /admin/accounts': apiError('forbidden', 403) });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  await page.locator('.acct-message').getByRole('link', { name: 'Back to settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});

test('admin accounts as a member: no Accounts row, and the page says there is no access', async ({ page }) => {
  const api = await mockApi(page, MEMBER);
  await page.goto('./#/settings');
  await expect(accountSection(page).getByRole('link', { name: /^Sam Jansen/ })).toBeVisible();
  await expect(accountSection(page).getByRole('link', { name: /^Accounts/ })).toHaveCount(0);
  await page.goto('./#/admin');
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  expect(api.callsTo('GET /admin/accounts')).toHaveLength(0);
});

test('admin invite: a taken email is said at the field; then the link and the message, each with Copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const api = await mockApi(page, {
    ...adminApi(),
    'POST /admin/invites': ({ body }) => {
      const b = body as InviteRequest;
      if (b.email === 'sam@example.com') return apiError('email_taken', 409);
      return { json: { ...INVITE_LINK_CREATED, account: accountDetail({ ...LIES_INVITED, id: '6718f0c2a1b2c3d4e5f60009', email: b.email, name: b.name, roles: b.roles }) } };
    },
  });
  await page.goto('./#/admin');
  await page.getByRole('link', { name: 'Invite someone' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invite someone' })).toBeVisible();
  await expect(page).toHaveTitle('Invite someone · Muzieklab');

  // Empty: the fields say what is missing, and nothing is sent.
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.getByText('Type their email.')).toBeVisible();
  await expect(page.getByText('Type their name.')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeFocused();
  expect(api.callsTo('POST /admin/invites')).toHaveLength(0);

  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByLabel('Name').fill('Noor Hendriks');
  await expect(page.getByRole('switch', { name: 'Editor' })).toContainText('(coming later)');
  await page.getByRole('switch', { name: 'Teacher' }).click();
  await expect(page.getByRole('switch', { name: 'Teacher' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.getByText("There's already an account with this email.")).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Email')).toBeFocused();

  await page.getByLabel('Email').fill('noor@example.com');
  await page.getByLabel('Email').press('Enter');
  const ready = page.getByRole('heading', { level: 2, name: 'Invite for Noor Hendriks is ready' });
  await expect(ready).toBeFocused();
  expect(api.callsTo('POST /admin/invites').at(-1)!.body).toEqual({ email: 'noor@example.com', name: 'Noor Hendriks', roles: ['teacher'] });
  await expect(page.getByLabel('Invite link')).toHaveValue(INVITE_LINK_CREATED.link);
  await expect(page.getByText('This link is shown only now. Make a new one if it gets lost.')).toBeVisible();
  const message = `Hi Noor Hendriks, I've made you an account for Muzieklab. Open this link to choose your password: ${INVITE_LINK_CREATED.link} — it works until October 30, 2026 at `;
  await expect(page.getByLabel('Message to send')).toHaveValue(new RegExp('^' + escaped(message)));

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(INVITE_LINK_CREATED.link);
  await page.getByRole('button', { name: 'Copy message' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp('^' + escaped(message)));

  // Invite someone else: an empty form, ready to type.
  await page.getByRole('button', { name: 'Invite someone else' }).click();
  await expect(page.getByLabel('Email')).toHaveValue('');
  await expect(page.getByLabel('Email')).toBeFocused();
  await expect(page.getByRole('switch', { name: 'Teacher' })).toHaveAttribute('aria-checked', 'false');
  await page.getByLabel('Email').fill('kees@example.com');
  await page.getByLabel('Name').fill('Kees');
  await page.getByRole('button', { name: 'Create invite' }).click();
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
});

test('admin one account: your own roles are off limits; Block is confirmed, then Unblock', async ({ page }) => {
  let sam: AccountDetail = accountDetail(SAM_ACTIVE);
  const api = await mockApi(page, {
    ...adminApi(),
    'PATCH /admin/accounts/:id': ({ body }) => {
      const b = body as AdminUpdateRequest;
      sam = { ...sam, status: b.status ?? sam.status, sessions: b.status === 'blocked' ? 0 : sam.sessions };
      return { json: sam };
    },
  });
  // Your own account: the roles are shown but cannot change; no Block or Delete, a way to Account instead.
  await page.goto('./#/admin/account/' + ME_ADMIN.id);
  await expect(page.getByRole('heading', { level: 1, name: 'Ann de Vries' })).toBeVisible();
  for (const role of ['Admin', 'Editor', 'Teacher']) await expect(page.getByRole('switch', { name: role })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Admin' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText("You can't change your own roles.")).toBeVisible();
  await expect(page.getByRole('button', { name: /^Block/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^This is your account/ })).toHaveAttribute('href', '#/account');

  await page.goto('./#/admin/account/' + sam.id);
  await expect(page.getByRole('heading', { level: 1, name: 'Sam Jansen' })).toBeVisible();
  await expect(statusPill(page)).toHaveText('Active');
  await page.getByRole('button', { name: /^Block/ }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Block Sam Jansen?' });
  await expect(confirm).toContainText("They're signed out and can't sign in until you unblock them.");
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(api.callsTo('PATCH /admin/accounts/:id')).toHaveLength(0);

  await page.getByRole('button', { name: /^Block/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click();
  await expect(page.getByRole('status').filter({ hasText: "Blocked. They're signed out." })).toBeVisible();
  await expect(statusPill(page)).toHaveText('Blocked');
  expect(api.callsTo('PATCH /admin/accounts/:id')[0].body).toEqual({ status: 'blocked' });
  // A blocked account gets no new-password link.
  await expect(page.getByRole('button', { name: /^New password link/ })).toHaveCount(0);

  await page.getByRole('button', { name: /^Unblock/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Unblocked. They can sign in again.' })).toBeVisible();
  await expect(statusPill(page)).toHaveText('Active');
  expect(api.callsTo('PATCH /admin/accounts/:id')[1].body).toEqual({ status: 'active' });
});

test('admin one account: a role and premium are saved at once; a guard rail comes back as a message', async ({ page }) => {
  let sam: AccountDetail = accountDetail(SAM_ACTIVE, { premium: { active: false, until: null } });
  const api = await mockApi(page, {
    ...adminApi(),
    'GET /admin/accounts/:id': { json: sam },
    'PATCH /admin/accounts/:id': ({ body }) => {
      const b = body as AdminUpdateRequest;
      // As if another admin had made Sam the only admin meanwhile.
      if (b.roles && !b.roles.includes('admin') && sam.roles.includes('admin')) return apiError('last_admin', 409);
      if (b.roles) sam = { ...sam, roles: b.roles };
      if (b.premium) sam = { ...sam, premium: b.premium.active ? { active: true, until: b.premium.until } : { active: false, until: null } };
      return { json: sam };
    },
  });
  await page.goto('./#/admin/account/' + sam.id);
  const admin = page.getByRole('switch', { name: 'Admin' });
  await admin.click();
  await expect(admin).toHaveAttribute('aria-checked', 'true');
  expect(api.callsTo('PATCH /admin/accounts/:id')[0].body).toEqual({ roles: ['admin'] });
  await admin.click();
  await expect(page.getByRole('region', { name: 'Roles' }).getByRole('alert')).toHaveText("You're the last admin. Make someone else admin first.");
  await expect(admin).toHaveAttribute('aria-checked', 'true');

  // Premium: on without an end, then with a last day, then off.
  const premium = page.getByRole('switch', { name: 'Premium' });
  await expect(page.getByLabel('Last day (optional)')).toHaveCount(0);
  await premium.click();
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await expect(premium).toContainText('No end date');
  expect(api.callsTo('PATCH /admin/accounts/:id').at(-1)!.body).toEqual({ premium: { active: true, until: null } });
  await page.getByLabel('Last day (optional)').fill('2027-03-31');
  await page.getByRole('button', { name: 'Save date' }).click();
  await expect(premium).toContainText('Until March 31, 2027');
  const until = (api.callsTo('PATCH /admin/accounts/:id').at(-1)!.body as { premium: { until: string } }).premium.until;
  // The end of that day where the admin is, so the day itself still counts.
  expect(await page.evaluate((u) => {
    const d = new Date(u);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
  }, until)).toEqual([2027, 3, 31, 23, 59]);
  await expect(page.getByRole('button', { name: 'Save date' })).toBeDisabled();
  // A day in the past is refused before anything is sent.
  const calls = api.callsTo('PATCH /admin/accounts/:id').length;
  await page.getByLabel('Last day (optional)').fill('2020-01-01');
  await page.getByRole('button', { name: 'Save date' }).click();
  await expect(page.getByText('Pick today or a later day.')).toBeVisible();
  expect(api.callsTo('PATCH /admin/accounts/:id')).toHaveLength(calls);
  await premium.click();
  await expect(premium).toHaveAttribute('aria-checked', 'false');
  expect(api.callsTo('PATCH /admin/accounts/:id').at(-1)!.body).toEqual({ premium: { active: false } });
});

test('admin one account: name and email are saved together; a taken email is said at the field', async ({ page }) => {
  let sam: AccountDetail = accountDetail(SAM_ACTIVE);
  const api = await mockApi(page, {
    ...adminApi(),
    'PATCH /admin/accounts/:id': ({ body }) => {
      const b = body as AdminUpdateRequest;
      if (b.email === 'ann@example.com') return apiError('email_taken', 409);
      sam = { ...sam, ...(b.name ? { name: b.name } : {}), ...(b.email ? { email: b.email.toLowerCase() } : {}) };
      return { json: sam };
    },
  });
  await page.goto('./#/admin/account/' + sam.id);
  const card = page.getByRole('region', { name: 'Name and email' });
  const save = card.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await card.getByLabel('Email').fill('ann@example.com');
  await save.click();
  await expect(card.getByText("There's already an account with this email.")).toBeVisible();
  await expect(card.getByLabel('Email')).toBeFocused();
  await card.getByLabel('Name').fill('Sam de Jong');
  await card.getByLabel('Email').fill('Sam.deJong@example.com');
  await save.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sam de Jong' })).toBeVisible();
  await expect(card.getByRole('status')).toHaveText('Saved.');
  await expect(card.getByLabel('Email')).toHaveValue('sam.dejong@example.com');
  expect(api.callsTo('PATCH /admin/accounts/:id').at(-1)!.body).toEqual({ name: 'Sam de Jong', email: 'Sam.deJong@example.com' });
});

test('admin one account: a new invite link with its message; Cancel invite, kept, then done', async ({ page }) => {
  const api = await mockApi(page, {
    ...adminApi(),
    'POST /admin/accounts/:id/invite-link': { json: INVITE_LINK_CREATED },
    'DELETE /admin/accounts/:id': { status: 204 },
  });
  await page.goto('./#/admin/account/' + LIES_INVITED.id);
  await expect(page.getByRole('heading', { level: 1, name: 'Lies Bakker' })).toBeVisible();
  await expect(statusPill(page)).toHaveText('Invited');
  await expect(page.getByRole('region', { name: 'Details' })).toContainText('Invite link');
  await page.getByRole('button', { name: /^New invite link/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'New link ready. Send it yourself.' })).toBeVisible();
  await expect(page.getByLabel('Invite link', { exact: true })).toHaveValue(INVITE_LINK_CREATED.link);
  await expect(page.getByLabel('Message to send')).toHaveValue(/^Hi Lies Bakker, I've made you an account for Muzieklab\./);
  expect(api.callsTo('POST /admin/accounts/:id/invite-link')[0].params.id).toBe(LIES_INVITED.id);

  // Keep invite closes the question; nothing is sent.
  await page.getByRole('button', { name: /^Cancel invite/ }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Cancel the invite for Lies Bakker?' });
  await expect(confirm).toContainText('The link stops working and the account is removed.');
  await confirm.getByRole('button', { name: 'Keep invite' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Cancel invite/ })).toBeFocused();
  expect(api.callsTo('DELETE /admin/accounts/:id')).toHaveLength(0);

  await page.getByRole('button', { name: /^Cancel invite/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel invite' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.getByRole('status').filter({ hasText: 'The invite for Lies Bakker was canceled.' })).toBeVisible();
  expect(api.callsTo('DELETE /admin/accounts/:id')[0].params.id).toBe(LIES_INVITED.id);
});

test('admin one account: a new password link for an active account, with its own message', async ({ page }) => {
  await mockApi(page, { ...adminApi(), 'POST /admin/accounts/:id/reset-link': { json: RESET_LINK_CREATED } });
  await page.goto('./#/admin/account/' + SAM_ACTIVE.id);
  await expect(page.getByRole('button', { name: /^New password link/ })).toContainText('Works for 24 hours, once.');
  await page.getByRole('button', { name: /^New password link/ }).click();
  await expect(page.getByLabel('New password link', { exact: true })).toHaveValue(RESET_LINK_CREATED.link);
  await expect(page.getByLabel('Message to send')).toHaveValue(
    new RegExp('^' + escaped(`Hi Sam Jansen, here's a link to choose a new password for Muzieklab: ${RESET_LINK_CREATED.link} — it works until October 24, 2026 at `)),
  );
});

test('admin one account: Delete account, confirmed; the list says so', async ({ page }) => {
  const api = await mockApi(page, { ...adminApi(), 'DELETE /admin/accounts/:id': { status: 204 } });
  await page.goto('./#/admin/account/' + PIET_BLOCKED.id);
  await expect(statusPill(page)).toHaveText('Blocked');
  await expect(page.getByRole('button', { name: /^Unblock/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('alertdialog', { name: "Delete Piet Visser's account?" });
  await expect(confirm).toContainText('No undo.');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.getByRole('status').filter({ hasText: "Piet Visser's account was deleted." })).toBeVisible();
  expect(api.callsTo('DELETE /admin/accounts/:id').map((c) => c.params.id)).toEqual([PIET_BLOCKED.id]);
});

test('admin one account: an account that is not there anymore says so, with the way back', async ({ page }) => {
  await mockApi(page, adminApi());
  await page.goto('./#/admin/account/6718f0c2a1b2c3d4e5f6ffff');
  await expect(page.getByRole('alert')).toHaveText("This account isn't there anymore. Another admin may have deleted it.");
  await page.locator('.acct-message').getByRole('link', { name: 'Back to accounts' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
});
