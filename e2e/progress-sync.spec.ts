import { expect, test, type Page } from '@playwright/test';
import type { SaveProgressRequest } from '../shared/api';
import { announcer, apiError, ME_MEMBER, mockApi, progressServer, recordAnnouncements, seed, seedAccount, SIGNED_OUT, signedInAs, VIEWPORTS } from './helpers';

/**
 * Progress on the account (BACKEND-PLAN.md §6): a first sign-in adds this device's progress to the account, the
 * account's progress and synced settings come to the device, changes are saved, Sign out keeps or removes the
 * device's copy, and Reset progress resets the account too. The API is mocked (helpers.ts progressServer).
 */
test.use({ viewport: VIEWPORTS.phone, hasTouch: true, serviceWorkers: 'block' });

const accountSection = (page: Page) => page.getByRole('region', { name: 'Account' });
const syncLine = (page: Page) => accountSection(page).locator('.sync-line');
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);
const storedProgress = async (page: Page) => JSON.parse((await stored(page, 'muzieklab.progress.v1')) ?? 'null');

test('a first sign-in adds this device’s progress to the account, and Settings says it is saved', async ({ page }) => {
  await seed(page, { progress: { xp: 340, practiceDays: ['2026-10-24'], lessons: { '1.1': { stars: 3, bestAccuracy: 92 } } } });
  const server = progressServer();
  const api = await mockApi(page, { ...SIGNED_OUT, ...server.routes, 'POST /auth/sign-in': { json: ME_MEMBER } });
  await page.goto('./#/signin');
  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a good long password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
  await expect(accountSection(page).getByText('The progress on this device is on your account now too.')).toBeVisible();
  await expect(announcer(page)).toHaveText('The progress on this device is on your account now too.');
  const sent = api.callsTo('PUT /progress')[0].body as SaveProgressRequest;
  expect(sent.rev).toBe(0);
  expect(sent.progress).toMatchObject({ xp: 340, lessons: { '1.1': { stars: 3, bestAccuracy: 92 } } });
  // Only the settings that follow the account: no volumes or calibration.
  expect(sent.prefs).not.toHaveProperty('volumes');
  expect(sent.prefs).not.toHaveProperty('calibrationMs');
  expect(server.copy().rev).toBe(1);
});

test('the account’s progress and settings come to a device, merged with its own', async ({ page }) => {
  await seed(page, { progress: { xp: 50, lessons: { '1.2': { stars: 1, bestAccuracy: 40 } } } });
  await seedAccount(page, ME_MEMBER);
  const server = progressServer({
    rev: 4,
    data: { prefs: { theme: 'dark', noteNames: 'solfege' }, progress: { xp: 900, lessons: { '1.1': { stars: 4, bestAccuracy: 97 } }, learnRead: ['1.1'] } },
    resetAt: null,
    updatedAt: '2026-10-24T18:00:00.000Z',
  });
  await mockApi(page, { ...signedInAs(ME_MEMBER), ...server.routes });
  await page.goto('./');
  // The account's theme, without a visit to Settings.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await storedProgress(page))?.lessons).toEqual({
    '1.1': { stars: 4, bestAccuracy: 97 },
    '1.2': { stars: 1, bestAccuracy: 40 },
  });
  expect((await storedProgress(page)).xp).toBe(900);
  // The merge goes back to the account, on top of rev 4.
  await expect.poll(() => server.copy().rev).toBe(5);
  expect(server.copy().data?.progress).toMatchObject({ lessons: { '1.2': { stars: 1, bestAccuracy: 40 } } });
  await page.goto('./#/settings');
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
});

test('a change is saved to the account, and a save without a connection waits for it', async ({ page, context }) => {
  await seedAccount(page, ME_MEMBER);
  const server = progressServer();
  const api = await mockApi(page, { ...signedInAs(ME_MEMBER), ...server.routes });
  await page.goto('./#/settings');
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
  // No connection: mocked routes still answer offline, so the save gets what no API gives (not JSON).
  await context.setOffline(true);
  api.set({ 'PUT /progress': { status: 502, json: undefined } });
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(syncLine(page)).toHaveText("Not saved yet. Your progress is saved when you're back online.");
  api.set({ 'PUT /progress': server.routes['PUT /progress'] });
  // Back online: the save goes at once (the 'online' event), not after the retry wait.
  await context.setOffline(false);
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
  expect(server.copy().data?.prefs).toMatchObject({ theme: 'dark' });
});

test('a save the API fails says so, and Try again saves', async ({ page }) => {
  await seedAccount(page, ME_MEMBER);
  const server = progressServer();
  const api = await mockApi(page, { ...signedInAs(ME_MEMBER), ...server.routes, 'PUT /progress': { status: 500, json: { error: 'internal', message: 'boom' } } });
  await page.goto('./#/settings');
  await expect(syncLine(page)).toHaveText(/^Your progress couldn't be saved\./);
  const said = await recordAnnouncements(page);
  // With the keyboard, and it fails again: the button keeps its focus, and the line is read out, as it looks the same.
  const retry = syncLine(page).getByRole('button', { name: 'Try again' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect.poll(said).toEqual(["Your progress couldn't be saved."]);
  await expect(retry).toBeFocused();
  // Saved: the button goes, and the focus goes to the account row instead of the page.
  api.set({ 'PUT /progress': server.routes['PUT /progress'] });
  await page.keyboard.press('Enter');
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
  await expect(accountSection(page).getByRole('link', { name: /^Sam Jansen/ })).toBeFocused();
  await expect.poll(said).toEqual(["Your progress couldn't be saved.", 'Progress saved to your account']);
});

test('sign out with Remove is refused while the progress is not on the account; Keep still signs out', async ({ page }) => {
  await seed(page, { progress: { xp: 340, practiceDays: ['2026-10-24'] } });
  await seedAccount(page, ME_MEMBER);
  const api = await mockApi(page, { ...signedInAs(ME_MEMBER), ...progressServer().routes, 'PUT /progress': apiError('internal', 500) });
  await page.goto('./#/settings');
  await expect(syncLine(page)).toHaveText(/^Your progress couldn't be saved\./);
  const section = accountSection(page);
  await section.getByRole('button', { name: 'Sign out' }).click();
  const confirm = section.getByRole('alertdialog', { name: 'Sign out on this device?' });
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await confirm.getByRole('button', { name: 'Sign out' }).click();
  await expect(confirm.getByRole('alert')).toHaveText("Your progress isn't on your account yet, so it can't be removed from this device. Choose Keep, or try again in a moment.");
  expect((await storedProgress(page)).xp).toBe(340);
  expect(api.callsTo('POST /auth/sign-out')).toHaveLength(0);
  await confirm.getByRole('button', { name: 'Keep' }).click();
  await confirm.getByRole('button', { name: 'Sign out' }).click();
  await expect(section.locator('.row-status')).toHaveText('Signed out.');
  expect((await storedProgress(page)).xp).toBe(340);
});

test('sign out keeps this device’s progress, or removes it for a shared device', async ({ page }) => {
  await seed(page, { progress: { xp: 340, practiceDays: ['2026-10-24'] } });
  await seedAccount(page, ME_MEMBER);
  const server = progressServer();
  await mockApi(page, { ...signedInAs(ME_MEMBER), ...server.routes });
  await page.goto('./#/settings');
  await expect(syncLine(page)).toHaveText('Progress saved to your account');

  const section = accountSection(page);
  await section.getByRole('button', { name: 'Sign out' }).click();
  const confirm = section.getByRole('alertdialog', { name: 'Sign out on this device?' });
  await expect(confirm).toContainText('Your progress stays on your account.');
  await expect(confirm.getByRole('button', { name: 'Keep' })).toHaveAttribute('aria-pressed', 'true');
  // It opens with the focus on that choice, so a screen reader reads it out and Escape closes it.
  await expect(confirm.getByRole('button', { name: 'Keep' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(section.getByRole('button', { name: 'Sign out' })).toBeFocused();
  // Signing out fails (no answer): the focus stays on the pressed button, in the confirm, so Escape still closes it.
  await page.route('**/api/v1/auth/sign-out', (r) => r.abort());
  await page.keyboard.press('Enter');
  await confirm.getByRole('button', { name: 'Sign out' }).focus();
  await page.keyboard.press('Enter');
  await expect(confirm.getByRole('alert')).toHaveText("Can't reach Muzieklab right now. Check your connection and try again.");
  await expect(confirm.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(section.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.unroute('**/api/v1/auth/sign-out');
  await section.getByRole('button', { name: 'Sign out' }).click();
  // Cancel goes back to the row, and the choice starts at Keep again.
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(section.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await section.getByRole('button', { name: 'Sign out' }).click();
  await expect(confirm.getByRole('button', { name: 'Keep' })).toHaveAttribute('aria-pressed', 'true');

  await confirm.getByRole('button', { name: 'Remove' }).click();
  await confirm.getByRole('button', { name: 'Sign out' }).focus();
  await page.keyboard.press('Enter');
  await expect(section.locator('.row-status')).toHaveText('Signed out.');
  // Sign in took the place of the confirm that had the focus, and the focus with it.
  await expect(section.getByRole('link', { name: /^Sign in/ })).toBeFocused();
  await expect.poll(() => stored(page, 'muzieklab.progress.v1')).toBeNull();
  expect(await stored(page, 'muzieklab.sync.v1')).toBeNull();
  // It was on the account before it went.
  expect(server.copy().data?.progress).toMatchObject({ xp: 340 });
});

test('sign out with Keep leaves the progress on this device', async ({ page }) => {
  await seed(page, { progress: { xp: 340, practiceDays: ['2026-10-24'] } });
  await seedAccount(page, ME_MEMBER);
  await mockApi(page, signedInAs(ME_MEMBER));
  await page.goto('./#/settings');
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
  await accountSection(page).getByRole('button', { name: 'Sign out' }).click();
  await accountSection(page).getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(accountSection(page).locator('.row-status')).toHaveText('Signed out.');
  expect((await storedProgress(page)).xp).toBe(340);
  expect(await stored(page, 'muzieklab.sync.v1')).toBeNull();
});

test('Reset progress, signed in, says it resets every device, and resets the account', async ({ page }) => {
  await seed(page, { progress: { xp: 340, practiceDays: ['2026-10-24'] } });
  await seedAccount(page, ME_MEMBER);
  const server = progressServer();
  const api = await mockApi(page, { ...signedInAs(ME_MEMBER), ...server.routes });
  await page.goto('./#/settings');
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Streak, stars and XP, on every device with your account. No undo.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset' }).click();
  await expect.poll(() => api.callsTo('DELETE /progress').length).toBe(1);
  await expect.poll(() => server.copy().data?.progress).toEqual({});
  expect(server.copy().resetAt).not.toBeNull();
  await expect(syncLine(page)).toHaveText('Progress saved to your account');
});

test('a session that ended while saving signs out, and keeps the progress here', async ({ page }) => {
  await seed(page, { progress: { xp: 340 } });
  await seedAccount(page, ME_MEMBER);
  await mockApi(page, {
    ...signedInAs(ME_MEMBER),
    'GET /progress': { status: 401, json: { error: 'unauthenticated', message: 'Not signed in' } },
  });
  await page.goto('./#/settings');
  await expect(accountSection(page).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  expect((await storedProgress(page)).xp).toBe(340);
});

test('without an account nothing is sent', async ({ page }) => {
  await seed(page, { progress: { xp: 340 } });
  const api = await mockApi(page, SIGNED_OUT);
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(accountSection(page).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  expect(api.calls.filter((c) => c.path === '/progress')).toEqual([]);
});
