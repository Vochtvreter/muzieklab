import { expect, test } from '@playwright/test';
import type { AccountDetail, AdminUpdateRequest, Closure, InviteRequest, Me, SaveProgressRequest } from '../shared/api';
import {
  ACCOUNTS, accountDetail, adminApi, announcer, apiError, CLOSURES, expectClickable, INVITE_LINK_CREATED, ME_ADMIN, ME_MEMBER, MEMBER, mockApi, recordAnnouncements,
  RESET_LINK_CREATED, seed, seedAccount, SIGNED_OUT, signedInAs, TOKEN, VIEWPORTS,
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
/** The one-line message Settings → Account shows after an account change (also announced: see `announcer`). */
const notice = (page: import('@playwright/test').Page) => accountSection(page).locator('.row-status');
/**
 * A form's done line (FormDone: a green check). It is plain text: the app's live region (#announcer) reads it out, so
 * a test finds it by its class, and checks the announcement with `announcer`.
 */
const done = (scope: import('@playwright/test').Page | import('@playwright/test').Locator, text: string) => scope.locator('.form-done').filter({ hasText: text });

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
  await section.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(notice(page)).toHaveText('Signed out.');
  await expect(announcer(page)).toHaveText('Signed out.');
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

test('sign in: a busy server says so, never "too many tries"; the next try gets in', async ({ page }) => {
  // The server's line for password checks is full (BACKEND-PLAN.md §5.2): it took no try. It says retryAfter 1, as a
  // counter's wait does in its last second, so only the code tells "busy" from "too many tries".
  let tries = 0;
  const api = await mockApi(page, {
    ...SIGNED_OUT,
    'POST /auth/sign-in': () =>
      tries++ === 0 ? { status: 429, json: { error: 'busy', message: 'The server is busy', retryAfter: 1 }, headers: { 'retry-after': '1' } } : { json: ME_MEMBER },
  });
  await page.goto('./#/signin');
  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a good long password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Muzieklab is busy. Try again in a moment.');
  // Not a field's fault: nothing is marked invalid.
  await expect(page.getByLabel('Password', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  expect(api.callsTo('POST /auth/sign-in')).toHaveLength(2);
});

test('sign in, in Dutch: a busy server says so too', async ({ page }) => {
  await seed(page, { prefs: { language: 'nl' } });
  await mockApi(page, { ...SIGNED_OUT, 'POST /auth/sign-in': { status: 429, json: { error: 'busy', message: 'The server is busy', retryAfter: 1 } } });
  await page.goto('./#/signin');
  await page.getByLabel('E-mailadres').fill('sam@example.com');
  await page.getByLabel('Wachtwoord', { exact: true }).fill('een goed lang wachtwoord');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('alert')).toHaveText('Muzieklab heeft het even druk. Probeer het zo opnieuw.');
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
  await expect(page.getByText('Last updated: October 25, 2026')).toBeVisible();
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
  // A tab in the name (pasted from a spreadsheet): said at the field too, as the server would refuse it.
  await page.getByLabel('Name').fill('Lies\tBakker');
  await page.getByLabel('New password').fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Remove the tabs and other hidden characters.')).toBeVisible();
  await expect(page.getByLabel('Name')).toBeFocused();
  await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  expect(api.callsTo('POST /auth/invite/accept')).toHaveLength(0);
  await page.getByLabel('Name').fill('Lies Bakker');

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
  await expect(notice(page)).toHaveText("You're signed in. Welcome to Muzieklab.");
  await expect(announcer(page)).toHaveText("You're signed in. Welcome to Muzieklab.");
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
  await expect(notice(page)).toHaveText('Password saved. Your other devices are signed out.');
  expect(api.callsTo('POST /auth/reset/confirm')[0].body).toEqual({ token: TOKEN, password: 'a tune in seven notes' });
  // The notice is for that visit of Settings only.
  await page.getByRole('link', { name: /^What's new/ }).click();
  await page.getByRole('link', { name: 'Back to settings' }).click();
  await expect(notice(page)).toHaveCount(0);
});

/** What a link's screen says while someone else (Sam) is signed in on the device. */
const SAM_SIGNED_IN = "You're signed in as Sam Jansen on this device. Sign out first to use this link. Progress you keep on this device is added to this link's account too.";
const SAMS_PROGRESS = { xp: 340, lessons: { '1.1': { stars: 3, bestAccuracy: 97 } } };

test('accept invite on a device where someone else is signed in: sign out first, on Remove, so their progress stays theirs', async ({ page }) => {
  await seed(page, { progress: SAMS_PROGRESS });
  await seedAccount(page, ME_MEMBER);
  const api = await mockApi(page, { ...MEMBER, 'POST /auth/invite/check': { json: LINK }, 'POST /auth/invite/accept': { json: LIES } });
  await page.goto('./#/invite/' + TOKEN);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Lies Bakker' })).toBeVisible();
  // Sam is signed in here: no form, but who is, and Sign out, which asks about this device's progress as in Settings.
  await expect(page.getByText(SAM_SIGNED_IN)).toBeVisible();
  await expect(page.getByLabel('New password')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Sign out on this device?' });
  // The device is shared, so the confirm opens on Remove, and Cancel puts it back there.
  const remove = confirm.getByRole('button', { name: 'Remove' });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await expect(remove).toBeFocused();
  await confirm.getByRole('button', { name: 'Keep' }).click();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await confirm.getByRole('button', { name: 'Sign out' }).click();
  // Signed out: the form, with the focus on its first field.
  await expect(page.getByLabel('Name')).toBeFocused();
  expect(api.callsTo('POST /auth/sign-out')).toHaveLength(1);
  const sams = api.callsTo('PUT /progress').length;
  await page.getByLabel('New password').fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).getByRole('link', { name: /^Lies Bakker/ })).toBeVisible();
  await expect(notice(page)).toHaveText("You're signed in. Welcome to Muzieklab.");
  // Lies's new account starts with nothing of Sam's.
  await expect.poll(() => api.callsTo('PUT /progress').length).toBeGreaterThan(sams);
  for (const { body } of api.callsTo('PUT /progress').slice(sams)) {
    const { progress } = body as SaveProgressRequest;
    expect(progress.xp ?? 0).toBe(0);
    expect(progress).not.toHaveProperty(['lessons', '1.1']);
  }
});

test('accept invite after signing someone else out with Keep: their progress goes to the new account, as the screen said', async ({ page }) => {
  await seed(page, { progress: SAMS_PROGRESS });
  await seedAccount(page, ME_MEMBER);
  const api = await mockApi(page, { ...MEMBER, 'POST /auth/invite/check': { json: LINK }, 'POST /auth/invite/accept': { json: LIES } });
  await page.goto('./#/invite/' + TOKEN);
  await expect(page.getByText(SAM_SIGNED_IN)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Sign out on this device?' });
  await confirm.getByRole('button', { name: 'Keep' }).click();
  await confirm.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Name')).toBeFocused();
  const sams = api.callsTo('PUT /progress').length;
  await page.getByLabel('New password').fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  // Kept, Sam's progress is this device's at Lies's first sign-in on it, which adds it to her account.
  await expect(notice(page)).toHaveText('The progress on this device is on your account now too.');
  await expect.poll(() => api.callsTo('PUT /progress').length).toBeGreaterThan(sams);
  const { progress } = api.callsTo('PUT /progress')[sams].body as SaveProgressRequest;
  expect(progress.xp).toBe(340);
  expect(progress).toHaveProperty(['lessons', '1.1'], expect.objectContaining({ stars: 3, bestAccuracy: 97 }));
});

test("new password while signed in: the account's own link shows the form; another account's asks to sign out first", async ({ page }) => {
  await seedAccount(page, ME_MEMBER);
  const api = await mockApi(page, { ...MEMBER, 'POST /auth/reset/check': { json: { ...LINK, email: ME_MEMBER.email, name: ME_MEMBER.name } } });
  await page.goto('./#/reset/' + TOKEN);
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.getByText(/^You're signed in as/)).toHaveCount(0);

  // Lies's link, opened on Sam's device.
  api.set({ 'POST /auth/reset/check': { json: LINK }, 'POST /auth/reset/confirm': { json: LIES } });
  await page.reload();
  await expect(page.getByText(SAM_SIGNED_IN)).toBeVisible();
  await expect(page.getByLabel('New password')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Sign out on this device?' });
  await expect(confirm.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
  await confirm.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('New password')).toBeFocused();
  await page.getByLabel('New password').fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).getByRole('link', { name: /^Lies Bakker/ })).toBeVisible();
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
  await expect(done(page, 'Name saved.')).toBeVisible();
  // Read out by the live region that was there all along (focus left the busy Save button).
  await expect(announcer(page)).toHaveText('Name saved.');
  expect(api.callsTo('PATCH /me')[0].body).toEqual({ name: 'Sam J.' });

  // Email: a wrong password is said at the password field.
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByLabel('New email')).toBeFocused();
  await page.getByLabel('New email').fill('sam.j@example.com');
  await page.getByLabel('Current password').first().fill('nope');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByText("That's not your current password.")).toBeVisible();
  await page.getByLabel('Current password').first().fill('my password here');
  // Enter in the field, as on a keyboard: the form closes with the focus in it, and the focus goes back to Change
  // email, as after Cancel, not to the page.
  await page.getByLabel('Current password').first().press('Enter');
  await expect(done(page, 'Email changed. Sign in with it from now on.')).toBeVisible();
  await expect(announcer(page)).toHaveText('Email changed. Sign in with it from now on.');
  await expect(page.getByText('sam.j@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change email' })).toBeFocused();

  // Password.
  const passwords = page.getByRole('region', { name: 'Password' });
  await passwords.getByLabel('Current password').fill('my password here');
  await passwords.getByLabel('New password').fill('a tune in seven notes');
  await passwords.getByRole('button', { name: 'Change password' }).click();
  await expect(passwords.locator('.form-done')).toHaveText('Password changed. Your other devices are signed out.');
  await expect(announcer(page)).toHaveText('Password changed. Your other devices are signed out.');
  // Not a second live region of its own: the announcement is the one that is read (once).
  await expect(passwords.locator('.form-done')).not.toHaveAttribute('role', 'status');
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
  // Signing out loses nothing: no red question and no red button (that is for Delete account).
  const ink = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
  const miss = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--miss').trim());
  const rgb = (hex: string): string => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  await expect(confirm.getByText('Sign out everywhere?')).toHaveCSS('color', rgb(ink));
  await expect(confirm.getByRole('button', { name: 'Sign out' })).not.toHaveCSS('background-color', rgb(miss));
  await expect(confirm.getByRole('button', { name: 'Sign out' })).toHaveClass(/small-btn--tonal/);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(api.callsTo('POST /auth/sign-out-everywhere')).toHaveLength(0);
  await page.getByRole('button', { name: /^Sign out everywhere/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(notice(page)).toHaveText('Signed out on every device.');
  // The button that was pressed is gone: the result is read out by the live region that was there all along.
  await expect(announcer(page)).toHaveText('Signed out on every device.');
  expect(api.callsTo('POST /auth/sign-out-everywhere')).toHaveLength(1);
  // Switching the language shows the line in Dutch, but does not read it out again as if it happened twice.
  const said = await recordAnnouncements(page);
  await page.getByRole('button', { name: 'Nederlands' }).click();
  await expect(notice(page)).toHaveText('Op elk apparaat uitgelogd.');
  await page.waitForTimeout(500);
  expect(await said()).toEqual([]);
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
  await expect(done(page, 'Downloaded: muzieklab-account.json.')).toBeVisible();
  await expect(announcer(page)).toHaveText('Downloaded: muzieklab-account.json.');
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
  await expect(page.getByRole('button', { name: /^Delete account/ })).toContainText('You choose whether an anonymous copy of your progress is kept.');
  await page.getByRole('button', { name: /^Delete account/ }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
  // The choice comes first, on Keep anonymously, and says what that does.
  const choice = confirm.getByRole('group', { name: 'Your progress and settings' });
  await expect(choice.getByRole('button', { name: 'Keep anonymously' })).toBeFocused();
  await expect(choice.getByRole('button', { name: 'Keep anonymously' })).toHaveAttribute('aria-pressed', 'true');
  await expect(confirm.getByText(/^They're kept without your name, email/)).toBeVisible();
  const password = confirm.getByLabel('Password', { exact: true });
  // No password: nothing is sent.
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirm.getByText('Type your password.')).toBeVisible();
  await expect(password).toBeFocused();
  expect(api.callsTo('DELETE /me')).toHaveLength(0);
  await password.fill('wrong');
  await password.press('Enter');
  await expect(confirm.getByText("That's not your current password.")).toBeVisible();
  await password.fill('last');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirm.getByRole('alert')).toHaveText("You're the last admin. Make someone else admin first.");
  // Everything goes, with a word on why.
  await choice.getByRole('button', { name: 'Delete too' }).click();
  await expect(confirm.getByText("They're deleted with your account. Nothing of your account is kept.")).toBeVisible();
  await confirm.getByLabel('Why are you leaving? (optional)').fill('  Too few lessons for me  ');
  await password.fill('right');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(notice(page)).toHaveText('Your account and its data were deleted.');
  await expect(announcer(page)).toHaveText('Your account and its data were deleted.');
  await expect(accountSection(page).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  expect(api.callsTo('DELETE /me').map((c) => c.body)).toEqual([
    { password: 'wrong', removeData: false },
    { password: 'last', removeData: false },
    { password: 'right', removeData: true, feedback: 'Too few lessons for me' },
  ]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('muzieklab.account.v1'))).toBeNull();
});

test('account: delete, keeping an anonymous copy; Cancel puts the choice back', async ({ page }) => {
  const api = await mockApi(page, { ...MEMBER, 'DELETE /me': { status: 204 } });
  await page.goto('./#/account');
  await page.getByRole('button', { name: /^Delete account/ }).click();
  let confirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
  await confirm.getByRole('button', { name: 'Delete too' }).click();
  await confirm.getByLabel('Why are you leaving? (optional)').fill('Not now');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Delete account/ })).toBeFocused();
  // Opened again: Keep anonymously, and no feedback.
  await page.getByRole('button', { name: /^Delete account/ }).click();
  confirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
  await expect(confirm.getByRole('button', { name: 'Keep anonymously' })).toHaveAttribute('aria-pressed', 'true');
  await expect(confirm.getByLabel('Why are you leaving? (optional)')).toHaveValue('');
  await confirm.getByLabel('Password', { exact: true }).fill('right');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(notice(page)).toHaveText('Your account was deleted. An anonymous copy of your progress is kept.');
  expect(api.callsTo('DELETE /me').map((c) => c.body)).toEqual([{ password: 'right', removeData: false }]);
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

// Not "Offline": the device may well be online, with the API restarting or answering 502 during a deploy.
const OFFLINE = "Muzieklab can't be reached right now. You can change your account again once it can.";
const STILL = "Muzieklab still can't be reached.";
const BACK = 'Muzieklab can be reached again.';

test('offline with a cached account: the account shows, read only; Try again picks it up once the API answers', async ({ page }) => {
  await seedAccount(page, ME_MEMBER);
  await page.goto('./#/settings');
  const section = accountSection(page);
  await expect(section.getByRole('link', { name: /^Sam Jansen/ })).toBeVisible();
  await expect(section.getByText(OFFLINE)).toBeVisible();
  await expect(section.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await section.getByRole('link', { name: /^Sam Jansen/ }).click();
  await expect(page.getByText(OFFLINE)).toBeVisible();
  await expect(page.getByText('sam@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
  // Still no answer (a 502 fails at once): Try again keeps its focus while it checks, shows that it does, says that
  // there is still no answer, and is ready again.
  const api = await mockApi(page, { 'GET /me': { status: 502 } });
  const retry = page.getByRole('button', { name: 'Try again' });
  await retry.click();
  const checking = page.getByRole('button', { name: 'Checking…' });
  await expect(checking).toBeFocused();
  await expect(checking).toHaveAttribute('aria-disabled', 'true');
  await expect(announcer(page)).toHaveText(STILL);
  await expect(retry).toBeFocused();
  expect(api.callsTo('GET /me')).toHaveLength(1);
  await expect(page.getByText(OFFLINE)).toBeVisible();
  // The API is back (no 'online' event: it was the API, not the network): Try again shows the forms, says so, and
  // focus goes to the start of the profile instead of the page.
  api.set(MEMBER);
  await retry.click();
  await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible();
  await expect(page.getByText(OFFLINE)).toHaveCount(0);
  await expect(announcer(page)).toHaveText(BACK);
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeFocused();
});

test('offline in Settings: Try again there, and Settings asks again by itself when it opens later', async ({ page }) => {
  await seedAccount(page, ME_MEMBER);
  await page.clock.install();
  await page.goto('./#/settings');
  const section = accountSection(page);
  await expect(section.getByText(OFFLINE)).toBeVisible();
  const api = await mockApi(page, { 'GET /me': { status: 503 } });
  await section.getByRole('button', { name: 'Try again' }).click();
  await expect(section.getByRole('button', { name: 'Checking…' })).toBeFocused();
  await expect(announcer(page)).toHaveText(STILL);
  await expect(section.getByRole('button', { name: 'Try again' })).toBeFocused();
  expect(api.callsTo('GET /me')).toHaveLength(1);
  await expect(section.getByText(OFFLINE)).toBeVisible();
  // To Path and back soon after: not asked again yet (at most once every 10 s).
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Path' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(section.getByText(OFFLINE)).toBeVisible();
  expect(api.callsTo('GET /me')).toHaveLength(1);
  // The API comes back while the player is on Path; opening Settings later asks again, and Sign out is back.
  api.set(MEMBER);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Path' }).click();
  // Playwright's clock keeps pace with real time while it runs, and under load that catch-up can land after a
  // fastForward and undo it; jump again until the page's own clock is really 10 s on.
  const before = await page.evaluate(() => Date.now());
  await expect(async () => {
    if ((await page.evaluate(() => Date.now())) < before + 10_000) await page.clock.fastForward(10_000);
    expect(await page.evaluate(() => Date.now())).toBeGreaterThanOrEqual(before + 10_000);
  }).toPass();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(section.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(section.getByText(OFFLINE)).toHaveCount(0);
  expect(api.callsTo('GET /me')).toHaveLength(2);
});

test('offline in Settings: Try again once the API is back says so, and focus goes to the account', async ({ page }) => {
  await seedAccount(page, ME_MEMBER);
  await page.goto('./#/settings');
  const section = accountSection(page);
  await expect(section.getByText(OFFLINE)).toBeVisible();
  await mockApi(page, MEMBER);
  await section.getByRole('button', { name: 'Try again' }).click();
  await expect(section.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(section.getByText(OFFLINE)).toHaveCount(0);
  await expect(announcer(page)).toHaveText(BACK);
  // The note and its button are gone: focus is on the account, not the page.
  await expect(section.getByRole('link', { name: /^Sam Jansen/ })).toBeFocused();
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

test('admin accounts: the list that Try again brings after a failed first load is read out', async ({ page }) => {
  const api = await mockApi(page, { ...adminApi(), 'GET /admin/accounts': { status: 502 } });
  await page.goto('./#/admin');
  await expect(page.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  api.set({ 'GET /admin/accounts': adminApi()['GET /admin/accounts'] });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('section[aria-labelledby="h-accounts"]').getByRole('heading', { name: '4 accounts' })).toBeVisible();
  // The focused Try again is gone: the live region says what came instead.
  await expect(announcer(page)).toHaveText('4 accounts');
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
  await expect(page.getByRole('link', { name: /^This is your account/ })).toContainText('Change your password or delete your account in Account.');

  await page.goto('./#/admin/account/' + sam.id);
  await expect(page.getByRole('heading', { level: 1, name: 'Sam Jansen' })).toBeVisible();
  await expect(statusPill(page)).toHaveText('Active');
  await page.getByRole('button', { name: /^Block/ }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Block Sam Jansen?' });
  await expect(confirm).toContainText("Sam Jansen is signed out and can't sign in until you unblock them.");
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(api.callsTo('PATCH /admin/accounts/:id')).toHaveLength(0);

  await page.getByRole('button', { name: /^Block/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click();
  await expect(page.getByRole('region', { name: 'Access' }).locator('.row-status')).toHaveText("Blocked. They're signed out.");
  await expect(announcer(page)).toHaveText("Blocked. They're signed out.");
  await expect(statusPill(page)).toHaveText('Blocked');
  expect(api.callsTo('PATCH /admin/accounts/:id')[0].body).toEqual({ status: 'blocked' });
  // A blocked account gets no new-password link.
  await expect(page.getByRole('button', { name: /^New password link/ })).toHaveCount(0);

  await page.getByRole('button', { name: /^Unblock/ }).click();
  await expect(page.getByRole('region', { name: 'Access' }).locator('.row-status')).toHaveText('Unblocked. They can sign in again.');
  await expect(announcer(page)).toHaveText('Unblocked. They can sign in again.');
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
      // A switch gives or takes away its own role, in the roles Sam has then. As if another admin had made Sam the only
      // admin meanwhile, taking admin away is refused.
      if (b.removeRoles?.includes('admin') && sam.roles.includes('admin')) return apiError('last_admin', 409);
      if (b.addRoles || b.removeRoles) sam = { ...sam, roles: [...sam.roles.filter((r) => !b.removeRoles?.includes(r)), ...(b.addRoles ?? [])] };
      if (b.premium) sam = { ...sam, premium: b.premium.active ? { active: true, until: b.premium.until } : { active: false, until: null } };
      return { json: sam };
    },
  });
  await page.goto('./#/admin/account/' + sam.id);
  // The switches show the new state before the request has gone out: wait for each request before reading it.
  const patches = () => api.callsTo('PATCH /admin/accounts/:id');
  const sent = async (n: number) => {
    await expect.poll(() => patches().length).toBe(n);
    return patches()[n - 1].body;
  };
  const admin = page.getByRole('switch', { name: 'Admin' });
  await admin.click();
  await expect(admin).toHaveAttribute('aria-checked', 'true');
  expect(await sent(1)).toEqual({ addRoles: ['admin'] });
  await admin.click();
  await expect(page.getByRole('region', { name: 'Roles' }).getByRole('alert')).toHaveText("You're the last admin. Make someone else admin first.");
  await expect(admin).toHaveAttribute('aria-checked', 'true');
  expect(await sent(2)).toEqual({ removeRoles: ['admin'] });

  // Premium: on without an end, then with a last day, then off.
  const premium = page.getByRole('switch', { name: 'Premium' });
  await expect(page.getByLabel('Last day (optional)')).toHaveCount(0);
  await premium.click();
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await expect(premium).toContainText('No end date');
  expect(await sent(3)).toEqual({ premium: { active: true, until: null } });
  // The last day is a calendar day: sent as the field has it, and shown as that day.
  await page.getByLabel('Last day (optional)').fill('2027-03-31');
  await page.getByRole('button', { name: 'Save date' }).click();
  await expect(premium).toContainText('Until March 31, 2027');
  await expect(done(page.getByRole('region', { name: 'Premium' }), 'Saved.')).toBeVisible();
  await expect(announcer(page)).toHaveText('Saved.');
  expect(await sent(4)).toEqual({ premium: { active: true, until: '2027-03-31' } });
  await expect(page.getByRole('button', { name: 'Save date' })).toBeDisabled();
  // A day in the past is refused before anything is sent; the field says so, and has focus.
  await page.getByLabel('Last day (optional)').fill('2020-01-01');
  await page.getByRole('button', { name: 'Save date' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Pick today or a later day.' })).toBeVisible();
  await expect(page.getByLabel('Last day (optional)')).toBeFocused();
  await expect(page.getByLabel('Last day (optional)')).toHaveAttribute('aria-invalid', 'true');
  expect(patches()).toHaveLength(4);
  await premium.click();
  await expect(premium).toHaveAttribute('aria-checked', 'false');
  expect(await sent(5)).toEqual({ premium: { active: false } });
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
  await expect(card.locator('.form-done')).toHaveText('Saved.');
  await expect(announcer(page)).toHaveText('Saved.');
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
  await expect(done(page, 'New link ready. Send it yourself.')).toBeVisible();
  await expect(announcer(page)).toHaveText('New link ready. Send it yourself.');
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
  await expect(page.locator('.acct-card--status')).toHaveText('The invite for Lies Bakker was canceled.');
  await expect(announcer(page)).toHaveText('The invite for Lies Bakker was canceled.');
  const [cancel] = api.callsTo('DELETE /admin/accounts/:id');
  expect(cancel.params.id).toBe(LIES_INVITED.id);
  // Only an account that is still invited: the API refuses it if the invite was accepted meanwhile.
  expect(cancel.query.get('expect')).toBe('invited');
});

test('admin one account: Cancel invite after the invite was accepted meanwhile deletes nothing, and says so', async ({ page }) => {
  let lies: AccountDetail = accountDetail(LIES_INVITED);
  const api = await mockApi(page, {
    ...adminApi(),
    'GET /admin/accounts/:id': () => ({ json: lies }),
    'DELETE /admin/accounts/:id': ({ query }) => (query.get('expect') && query.get('expect') !== lies.status ? apiError('wrong_status', 409) : { status: 204 }),
  });
  await page.goto('./#/admin/account/' + LIES_INVITED.id);
  await expect(statusPill(page)).toHaveText('Invited');
  // Lies opens her link and sets a password while the admin's screen still says Invited.
  lies = { ...lies, status: 'active', inviteExpiresAt: null, sessions: 1, lastSignInAt: '2026-10-23T12:00:00.000Z' };
  await page.getByRole('button', { name: /^Cancel invite/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel invite' }).click();
  await expect(page.getByRole('alert')).toHaveText('Lies Bakker accepted the invite meanwhile, so the account was not removed.');
  await expect(statusPill(page)).toHaveText('Active');
  await expect(page).toHaveURL(new RegExp('#/admin/account/' + LIES_INVITED.id + '$'));
  // The question is gone, not turned into Delete account's.
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete account' })).toBeVisible();
  expect(api.callsTo('DELETE /admin/accounts/:id').map((c) => c.query.get('expect'))).toEqual(['invited']);
});

test('admin one account: a new password link for an active account, with its own message', async ({ page }) => {
  // A second press makes another link (the first stops working). Its answer is held back until `reply()`.
  const second = { ...RESET_LINK_CREATED, link: RESET_LINK_CREATED.link.replace(/.$/, 'Z') };
  let made = 0;
  let reply = (): void => undefined;
  const held = new Promise<void>((resolve) => (reply = resolve));
  const api = await mockApi(page, {
    ...adminApi(),
    'POST /admin/accounts/:id/reset-link': async () => {
      if (made++ === 0) return { json: RESET_LINK_CREATED };
      await held;
      return { json: second };
    },
  });
  await page.goto('./#/admin/account/' + SAM_ACTIVE.id);
  // No scroll anchoring, as in Safari: the page itself must not move when the result is replaced.
  await page.addStyleTag({ content: '* { overflow-anchor: none !important; }' });
  // The same button while it says "Making a link…".
  const button = page.getByRole('button', { name: /^(New password link|Making a link…)/ });
  await expect(button).toContainText('Works for 24 hours, once.');
  await button.click();
  await expect(page.getByLabel('New password link', { exact: true })).toHaveValue(RESET_LINK_CREATED.link);
  await expect(page.getByLabel('Message to send')).toHaveValue(
    new RegExp('^' + escaped(`Hi Sam Jansen, here's a link to choose a new password for Muzieklab: ${RESET_LINK_CREATED.link} — it works until October 24, 2026 at `)),
  );
  await expect(done(page, 'New link ready. Send it yourself.')).toBeVisible();
  await expect(announcer(page)).toHaveText('New link ready. Send it yourself.');
  await page.getByRole('button', { name: 'Copy message' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

  // The admin has scrolled down to the result (the page scrolls) and presses again: nothing moves, during or after.
  await page.getByRole('button', { name: 'Copied' }).evaluate((el) => el.scrollIntoView({ block: 'end' }));
  expect(await page.locator('.page').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expectClickable(button);
  const top = async (): Promise<number> => Math.round((await button.boundingBox())!.y);
  const before = await top();
  // The same words after the second press are read out again: the button was busy (focus left it), and only this
  // says that a new link was made.
  const said = await recordAnnouncements(page);
  await button.click();
  await expect(button).toHaveAccessibleName(/^Making a link…/);
  expect(await top()).toBe(before);
  // Meanwhile the old link keeps its place, dimmed, and cannot be copied.
  await expect(page.locator('.link-result')).toHaveAttribute('inert', '');
  await expect(page.locator('.link-result')).toHaveCSS('opacity', '0.45');
  reply();
  await expect(page.getByLabel('New password link', { exact: true })).toHaveValue(second.link);
  await expect(page.getByLabel('Message to send')).toHaveValue(new RegExp(escaped(second.link)));
  await expect(page.locator('.link-result')).not.toHaveAttribute('inert', /.*/);
  await expect.poll(said).toEqual(['New link ready. Send it yourself.']);
  expect(await top()).toBe(before);
  // The new link can be copied.
  await expectClickable(page.getByRole('button', { name: 'Copy message' }));
  expect(api.callsTo('POST /admin/accounts/:id/reset-link')).toHaveLength(2);
});

test('admin one account: a second password link that fails keeps the earlier one in place, dimmed, until a new one replaces it', async ({ page }) => {
  // The first press makes a link; the next two get no answer (502, held back until `reply()`); the fourth makes one.
  const fourth = { ...RESET_LINK_CREATED, link: RESET_LINK_CREATED.link.replace(/.$/, 'Q') };
  let made = 0;
  let reply = (): void => undefined;
  const api = await mockApi(page, {
    ...adminApi(),
    'POST /admin/accounts/:id/reset-link': async () => {
      made++;
      if (made === 1) return { json: RESET_LINK_CREATED };
      await new Promise<void>((resolve) => (reply = resolve));
      return made === 4 ? { json: fourth } : { status: 502 };
    },
  });
  await page.goto('./#/admin/account/' + SAM_ACTIVE.id);
  // No scroll anchoring, as in Safari: the page itself must not move when the answer changes.
  await page.addStyleTag({ content: '* { overflow-anchor: none !important; }' });
  const button = page.getByRole('button', { name: /^(New password link|Making a link…)/ });
  const result = page.locator('.link-result');
  const body = result.locator('.link-result-body');
  const field = page.getByLabel('New password link', { exact: true });
  const alert = page.getByRole('alert');
  const failed = "Can't reach Muzieklab right now. Check your connection and try again. The link below may not work anymore.";
  await button.click();
  await expect(field).toHaveValue(RESET_LINK_CREATED.link);

  // Scrolled down to the result, as when copying the message.
  await page.getByRole('button', { name: 'Copy message' }).evaluate((el) => el.scrollIntoView({ block: 'end' }));
  expect(await page.locator('.page').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expectClickable(button);
  const top = async (): Promise<number> => Math.round((await button.boundingBox())!.y);
  const before = await top();
  const said = await recordAnnouncements(page);

  // The second press fails: the earlier link keeps its place, under why, dimmed and not usable (it may no longer work).
  await button.click();
  await expect(button).toHaveAccessibleName(/^Making a link…/);
  await expect(result).toHaveAttribute('inert', '');
  reply();
  await expect(alert).toHaveText(failed);
  await expect(button).toHaveAccessibleName(/^New password link/);
  expect(await top()).toBe(before);
  await expect(field).toHaveValue(RESET_LINK_CREATED.link);
  await expect(done(page, 'New link ready. Send it yourself.')).toHaveCount(0);
  await expect(result).not.toHaveAttribute('inert', /.*/);
  await expect(body).toHaveAttribute('inert', '');
  await expect(body).toHaveCSS('opacity', '0.45');
  // Why it failed is not dimmed, and is in view.
  await expect(alert).toHaveCSS('opacity', '1');
  await expect(alert).toBeInViewport();
  // Inert: Copy cannot be pressed or focused.
  const copy = page.getByRole('button', { name: 'Copy message' });
  await copy.evaluate((el: HTMLElement) => el.focus());
  await expect(copy).not.toBeFocused();

  // The third press fails too: the same words are a new alert (read out again), and still nothing moves.
  await alert.evaluate((el) => el.setAttribute('data-seen', ''));
  await button.click();
  await expect(button).toHaveAccessibleName(/^Making a link…/);
  // Meanwhile the earlier answer stays, dimmed as a whole (not twice).
  await expect(result).toHaveCSS('opacity', '0.45');
  await expect(body).toHaveCSS('opacity', '1');
  expect(await top()).toBe(before);
  reply();
  await expect(alert).not.toHaveAttribute('data-seen');
  await expect(alert).toHaveText(failed);
  expect(await top()).toBe(before);

  // The fourth press works: the new link takes the earlier one's place, in view, and is read out.
  await button.click();
  await expect(button).toHaveAccessibleName(/^Making a link…/);
  expect(await top()).toBe(before);
  reply();
  await expect(field).toHaveValue(fourth.link);
  await expect(alert).toHaveCount(0);
  await expect(done(page, 'New link ready. Send it yourself.')).toBeInViewport();
  await expect(body).not.toHaveAttribute('inert', /.*/);
  await expect(result).not.toHaveAttribute('inert', /.*/);
  await expect(body).toHaveCSS('opacity', '1');
  await expect.poll(said).toEqual(['New link ready. Send it yourself.']);
  expect(await top()).toBe(before);
  await expectClickable(page.getByRole('button', { name: 'Copy message' }));
  expect(api.callsTo('POST /admin/accounts/:id/reset-link')).toHaveLength(4);
});

test('admin one account: a password link pressed at the bottom of the screen comes into view, whether it fails or works', async ({ page }) => {
  // The first press gets no answer (502); the next ones make a link, each held back until `reply()`.
  const third = { ...RESET_LINK_CREATED, link: RESET_LINK_CREATED.link.replace(/.$/, 'R') };
  let made = 0;
  let reply = (): void => undefined;
  await mockApi(page, {
    ...adminApi(),
    'POST /admin/accounts/:id/reset-link': async () => {
      made++;
      if (made === 1) return { status: 502 };
      await new Promise<void>((resolve) => (reply = resolve));
      return { json: made === 2 ? RESET_LINK_CREATED : third };
    },
  });
  await page.goto('./#/admin/account/' + SAM_ACTIVE.id);
  const button = page.getByRole('button', { name: /^(New password link|Making a link…)/ });
  const alert = page.getByRole('alert');
  // Scrolled just far enough to see the button: what a press shows would be under the screen's edge.
  const atBottom = (): Promise<void> => button.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await atBottom();
  await button.click();
  // No earlier link: only why, brought into view, with the button still on screen.
  await expect(alert).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  await expect(page.locator('.link-result')).toHaveCount(0);
  await expectClickable(alert, { scroll: false });
  await expectClickable(button, { scroll: false });

  // Why stays, dimmed, while the next press runs, until the link takes its place: in view, whole, and read out.
  await atBottom();
  await button.click();
  await expect(button).toHaveAccessibleName(/^Making a link…/);
  await expect(alert).toBeVisible();
  await expect(page.locator('.link-stale')).toHaveCSS('opacity', '0.45');
  reply();
  await expect(page.getByLabel('New password link', { exact: true })).toHaveValue(RESET_LINK_CREATED.link);
  await expect(alert).toHaveCount(0);
  await expect(announcer(page)).toHaveText('New link ready. Send it yourself.');
  await expectClickable(page.getByRole('button', { name: 'Copy message' }), { scroll: false });
  await expectClickable(button, { scroll: false });

  // The admin scrolls back up while the next link is made: the page stays where they are.
  await button.click();
  await expect(button).toHaveAccessibleName(/^Making a link…/);
  await page.locator('.page').evaluate((el) => el.scrollTo(0, 0));
  reply();
  await expect(page.getByLabel('New password link', { exact: true })).toHaveValue(third.link);
  expect(await page.locator('.page').evaluate((el) => el.scrollTop)).toBe(0);
});

test('admin: Deleted accounts, from Accounts: each with its day, kind and feedback, filtered and downloaded', async ({ page }) => {
  await mockApi(page, adminApi());
  await page.goto('./#/admin');
  await page.getByRole('link', { name: /^Deleted accounts/ }).click();
  await expect(page).toHaveURL(/#\/admin\/deleted$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Deleted accounts' })).toBeVisible();
  await expect(page).toHaveTitle('Deleted accounts · Muzieklab');
  const list = page.locator('section[aria-labelledby="h-closures"]');
  await expect(list.getByRole('heading', { name: '4 deleted accounts' })).toBeVisible();
  const rows = list.getByRole('article');
  await expect(rows).toHaveCount(4);
  // The newest: archived, with what they wrote (its line break kept) and what the copy holds.
  const first = page.getByRole('article', { name: 'October 24, 2026, Archived' });
  await expect(first.locator('blockquote')).toHaveText(CLOSURES[0].feedback!);
  await expect(first).toContainText('Joined March 2026 · Level 8 · 1840 XP · 2 lessons · 3 days practiced');
  await expect(page.getByRole('article', { name: 'October 20, 2026, Data deleted' })).toContainText('Moving to another app.');
  // An admin's deletion has no feedback to show; an owner who wrote none says so.
  await expect(page.getByRole('article', { name: 'October 2, 2026, By an admin' })).not.toContainText('No feedback.');
  const last = page.getByRole('article', { name: 'September 15, 2026, Archived' });
  await expect(last).toContainText('No feedback.');
  await expect(last).toContainText('Joined September 2026 · No progress saved');

  const filter = page.getByRole('group', { name: 'How it was deleted' });
  await filter.getByRole('button', { name: 'Archived' }).click();
  await expect(filter.getByRole('button', { name: 'Archived' })).toHaveAttribute('aria-pressed', 'true');
  await expect(list.getByRole('heading', { name: '2 deleted accounts found' })).toBeVisible();
  await expect(announcer(page)).toHaveText('2 deleted accounts found');
  await expect(rows).toHaveCount(2);
  await filter.getByRole('button', { name: 'All' }).click();
  await expect(rows).toHaveCount(4);

  // The file holds every entry, whatever the filter.
  await filter.getByRole('button', { name: 'By an admin' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download as a file/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('muzieklab-deleted-accounts.json');
  const { readFile } = await import('node:fs/promises');
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toEqual({ closures: CLOSURES });

  await page.getByRole('link', { name: 'Back to accounts' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
});

test('admin: Deleted accounts beyond the newest the list brings: says so, and the file has every one', async ({ page }) => {
  // As the API caps the list at 500: here the newest four of five.
  const older: Closure = { id: '1a3c5e7a9b1d3f5a7c9e1b3d5f7a9c1e', day: '2025-11-02', kind: 'removed', feedback: null, archive: null };
  const api = await mockApi(page, {
    ...adminApi(),
    'GET /admin/closures': ({ query }) => ({ json: query.get('all') === 'true' ? { closures: [...CLOSURES, older], total: 5 } : { closures: CLOSURES, total: 5 } }),
  });
  await page.goto('./#/admin/deleted');
  const list = page.locator('section[aria-labelledby="h-closures"]');
  await expect(list.getByRole('article')).toHaveCount(4);
  await expect(list.locator('.row-note')).toHaveText('Showing the newest 4 of 5. The file has them all.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download as a file/ }).click();
  const file = await download;
  const { readFile } = await import('node:fs/promises');
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toEqual({ closures: [...CLOSURES, older] });
  expect(api.callsTo('GET /admin/closures').map((c) => c.query.get('all'))).toEqual([null, 'true']);
});

test('admin: Deleted accounts with none yet, after an error and Try again', async ({ page }) => {
  let fail = true;
  const api = await mockApi(page, { ...adminApi(), 'GET /admin/closures': () => (fail ? { status: 502 } : { json: { closures: [], total: 0 } }) });
  await page.goto('./#/admin/deleted');
  await expect(page.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.acct-empty')).toHaveText('No account has been deleted yet.');
  await expect(page.getByRole('button', { name: /^Download as a file/ })).toHaveCount(0);
  expect(api.callsTo('GET /admin/closures')).toHaveLength(2);
});

test('admin: Deleted accounts without access: the message, and nothing asked', async ({ page }) => {
  const api = await mockApi(page, { ...MEMBER, 'GET /admin/closures': { json: { closures: CLOSURES, total: CLOSURES.length } } });
  await page.goto('./#/admin/deleted');
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  expect(api.callsTo('GET /admin/closures')).toHaveLength(0);
});

test('admin one account: Delete account, confirmed; the list says so', async ({ page }) => {
  const api = await mockApi(page, { ...adminApi(), 'DELETE /admin/accounts/:id': { status: 204 } });
  await page.goto('./#/admin/account/' + PIET_BLOCKED.id);
  await expect(statusPill(page)).toHaveText('Blocked');
  await expect(page.getByRole('button', { name: /^Unblock/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('alertdialog', { name: "Delete Piet Visser's account?" });
  await expect(confirm).toContainText('Their account and everything stored with it are deleted. No undo.');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.locator('.acct-card--status')).toHaveText("Piet Visser's account was deleted.");
  await expect(announcer(page)).toHaveText("Piet Visser's account was deleted.");
  expect(api.callsTo('DELETE /admin/accounts/:id').map((c) => c.params.id)).toEqual([PIET_BLOCKED.id]);
});

test('admin one account: an account that is not there anymore says so, with the way back', async ({ page }) => {
  await mockApi(page, adminApi());
  await page.goto('./#/admin/account/6718f0c2a1b2c3d4e5f6ffff');
  await expect(page.getByRole('alert')).toHaveText("This account isn't there anymore. Another admin may have deleted it.");
  await page.locator('.acct-message').getByRole('link', { name: 'Back to accounts' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
});

// --- what goes wrong: field errors, links that stopped working, other admins, no answer -----------------------------

test('account: a failed save is the form error, never the name field; an empty field says what is missing', async ({ page }) => {
  const api = await mockApi(page, { ...MEMBER, 'PATCH /me': { status: 500, json: { error: 'internal', message: 'boom' } } });
  await page.goto('./#/account');
  const name = page.getByLabel('Name');
  await name.fill('Sam J.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Profile' }).getByRole('alert')).toHaveText('Something went wrong on our side. Try again later.');
  // The name itself is fine: not marked invalid, and the message is not its description.
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  await expect(name).not.toHaveAttribute('aria-describedby', /.+/);
  expect(api.callsTo('PATCH /me')).toHaveLength(1);

  // An empty name: said at the field (announced, and its description), and the field gets focus.
  await name.fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const empty = page.getByRole('alert').filter({ hasText: 'Type your name.' });
  await expect(empty).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(await name.getAttribute('aria-describedby')).toBe(await empty.getAttribute('id'));
  expect(api.callsTo('PATCH /me')).toHaveLength(1);
  // A tab in it (pasted from a spreadsheet): said at the field as well, and nothing is sent.
  await name.fill('Sam\tJansen');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Remove the tabs and other hidden characters.' })).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(api.callsTo('PATCH /me')).toHaveLength(1);

  // Change email with nothing typed: each field says what is missing, as Sign in does; nothing is sent.
  await page.getByRole('button', { name: 'Change email' }).click();
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByText('Type your email.')).toBeVisible();
  await expect(page.getByLabel('New email')).toBeFocused();
  await page.getByLabel('New email').fill('sam.j@example.com');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByText('Type your password.')).toBeVisible();
  await expect(page.getByLabel('Current password').first()).toBeFocused();
  expect(api.callsTo('POST /me/email')).toHaveLength(0);
});

test('accept invite: a link that stopped working after the check (a new one was made) says so, with the way Home', async ({ page }) => {
  await mockApi(page, { ...SIGNED_OUT, 'POST /auth/invite/check': { json: LINK }, 'POST /auth/invite/accept': apiError('link_invalid', 410) });
  await page.goto('./#/invite/' + TOKEN);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Lies Bakker' })).toBeVisible();
  await page.getByLabel('New password').fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText("This link doesn't work anymore. Ask the person who invited you for a new one.");
  await expect(page.getByLabel('New password')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
});

test('new password: a link that stopped working after the check says so, with the way Home', async ({ page }) => {
  await mockApi(page, {
    ...SIGNED_OUT,
    'POST /auth/reset/check': { json: { ...LINK, email: ME_MEMBER.email, name: ME_MEMBER.name } },
    'POST /auth/reset/confirm': apiError('link_invalid', 410),
  });
  await page.goto('./#/reset/' + TOKEN);
  await page.getByLabel('New password').fill('a tune in seven notes');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('alert')).toHaveText("This link doesn't work anymore. Ask the person who invited you for a new one.");
  await expect(page.getByLabel('New password')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
});

test('accept invite: too many tries at the link check says how long to wait, and Try again checks again', async ({ page }) => {
  const api = await mockApi(page, { ...SIGNED_OUT, 'POST /auth/invite/check': apiError('too_many_attempts', 429, { retryAfter: 30 }) });
  await page.goto('./#/invite/' + TOKEN);
  await expect(page.getByRole('alert')).toHaveText('Too many tries. Try again in 30 seconds.');
  await expect(page.getByLabel('New password')).toHaveCount(0);
  api.set({ 'POST /auth/invite/check': { json: LINK } });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Lies Bakker' })).toBeVisible();
});

test('admin one account: another admin changed the status meanwhile (wrong_status): the message, and the account as it is now', async ({ page }) => {
  const api = await mockApi(page, { ...adminApi(), 'POST /admin/accounts/:id/reset-link': apiError('wrong_status', 409) });
  await page.goto('./#/admin/account/' + SAM_ACTIVE.id);
  await expect(statusPill(page)).toHaveText('Active');
  expect(api.callsTo('GET /admin/accounts/:id')).toHaveLength(1);
  // Bob blocks Sam while Ann has him open.
  api.set({ 'GET /admin/accounts/:id': { json: accountDetail({ ...SAM_ACTIVE, status: 'blocked' }) } });
  await page.getByRole('button', { name: /^New password link/ }).click();
  await expect(statusPill(page)).toHaveText('Blocked');
  await expect(page.getByRole('button', { name: /^Unblock/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^New password link/ })).toHaveCount(0);
  expect(api.callsTo('GET /admin/accounts/:id')).toHaveLength(2);
  // Why, kept through the reload that took the pressed row away, and focus on it rather than lost with the button.
  const why = page.getByRole('alert');
  await expect(why).toHaveText('Sam Jansen was blocked meanwhile, so no new link was made.');
  await expect(page.locator('section[aria-labelledby="h-access"] .row-pad').first()).toBeFocused();

  // Ann unblocks him: the message goes with the next press, as it no longer says how things are.
  api.set({ 'PATCH /admin/accounts/:id': { json: accountDetail(SAM_ACTIVE) } });
  await page.getByRole('button', { name: /^Unblock/ }).click();
  await expect(page.getByRole('region', { name: 'Access' }).locator('.row-status')).toHaveText('Unblocked. They can sign in again.');
  await expect(statusPill(page)).toHaveText('Active');
  await expect(page.getByText('Sam Jansen was blocked meanwhile, so no new link was made.')).toHaveCount(0);
});

test('admin one account: the invite accepted meanwhile is said until the next press, such as a new password link', async ({ page }) => {
  let lies: AccountDetail = accountDetail(LIES_INVITED);
  await mockApi(page, {
    ...adminApi(),
    'GET /admin/accounts/:id': () => ({ json: lies }),
    'DELETE /admin/accounts/:id': () => apiError('wrong_status', 409),
    'POST /admin/accounts/:id/reset-link': { json: RESET_LINK_CREATED },
  });
  await page.goto('./#/admin/account/' + LIES_INVITED.id);
  await expect(statusPill(page)).toHaveText('Invited');
  lies = { ...lies, status: 'active', inviteExpiresAt: null, sessions: 1, lastSignInAt: '2026-10-23T12:00:00.000Z' };
  await page.getByRole('button', { name: /^Cancel invite/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel invite' }).click();
  const why = page.getByText('Lies Bakker accepted the invite meanwhile, so the account was not removed.');
  await expect(why).toBeVisible();
  await page.getByRole('button', { name: /^New password link/ }).click();
  await expect(done(page, 'New link ready. Send it yourself.')).toBeVisible();
  await expect(why).toHaveCount(0);
});

test('admin one account: a new invite link after the invite was accepted meanwhile says so, and keeps focus', async ({ page }) => {
  let lies: AccountDetail = accountDetail(LIES_INVITED);
  await mockApi(page, {
    ...adminApi(),
    'GET /admin/accounts/:id': () => ({ json: lies }),
    'POST /admin/accounts/:id/invite-link': () => (lies.status === 'invited' ? { json: INVITE_LINK_CREATED } : apiError('wrong_status', 409)),
  });
  await page.goto('./#/admin/account/' + LIES_INVITED.id);
  await expect(statusPill(page)).toHaveText('Invited');
  lies = { ...lies, status: 'active', inviteExpiresAt: null, sessions: 1, lastSignInAt: '2026-10-23T12:00:00.000Z' };
  await page.getByRole('button', { name: /^New invite link/ }).click();
  await expect(statusPill(page)).toHaveText('Active');
  await expect(page.getByRole('alert')).toHaveText('Lies Bakker accepted the invite meanwhile, so no new link was made.');
  await expect(page.locator('section[aria-labelledby="h-access"] .row-pad').first()).toBeFocused();
  await expect(page.getByRole('button', { name: /^New invite link/ })).toHaveCount(0);
});

test('admin screens with no answer from the API: Try again, then the screen', async ({ page }) => {
  await seedAccount(page, ME_ADMIN);
  const me = page.waitForResponse('**/api/v1/me');
  await page.goto('./#/admin');
  await me;
  await expect(page.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  await expect(page.getByRole('link', { name: 'Invite someone' })).toHaveCount(0);
  await mockApi(page, adminApi());
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('section[aria-labelledby="h-accounts"]').getByRole('heading', { name: '4 accounts' })).toBeVisible();
});

for (const hash of ['#/admin', '#/admin/invite', '#/admin/account/' + ACCOUNTS[0].id, '#/admin/deleted', '#/admin/feedback', '#/admin/feedback/6718f0c2a1b2c3d4e5f6b001']) {
  test(`admin screens signed out (${hash}): Sign in instead`, async ({ page }) => {
    const api = await mockApi(page, SIGNED_OUT);
    await page.goto('./' + hash);
    await expect(page).toHaveURL(/#\/signin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    expect(api.calls.map((c) => c.method + ' ' + c.path)).toEqual(['GET /me']);
  });
}

test('admin accounts: what a search or filter found is read out', async ({ page }) => {
  await mockApi(page, adminApi());
  await page.goto('./#/admin');
  const list = page.locator('section[aria-labelledby="h-accounts"]');
  await expect(list.getByRole('heading', { name: '4 accounts' })).toBeVisible();
  await page.getByLabel('Search').fill('piet');
  await expect(list.getByRole('heading', { name: '1 account found' })).toBeVisible();
  await expect(announcer(page)).toHaveText('1 account found');
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Invited' }).click();
  await expect(page.locator('.acct-empty')).toHaveText('No accounts match.');
  await expect(announcer(page)).toHaveText('No accounts match.');
});

/**
 * Premium's last day is a calendar day: the same day on every screen, wherever it is (finding: a date-time at midnight
 * UTC showed the day before west of UTC). Run far west and far east of UTC.
 */
for (const timezoneId of ['Pacific/Pago_Pago', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  test.describe(`premium's last day in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test('Account and the admin screen show the day as it was saved', async ({ page }) => {
      const sam = accountDetail({ ...SAM_ACTIVE, premium: { active: true, until: '2027-01-01' } });
      await mockApi(page, { ...adminApi(ACCOUNTS, { ...ME_ADMIN, premium: { active: true, until: '2027-01-01' } }), 'GET /admin/accounts/:id': { json: sam } });
      await page.goto('./#/account');
      await expect(page.getByText('Admin · Premium until January 1, 2027')).toBeVisible();
      await page.goto('./#/admin/account/' + sam.id);
      await expect(page.getByRole('switch', { name: 'Premium' })).toContainText('Until January 1, 2027');
      await expect(page.getByLabel('Last day (optional)')).toHaveValue('2027-01-01');
    });
  });
}
