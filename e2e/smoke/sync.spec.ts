import type { SavedProgress } from '../../shared/api';
import { QUARTERS, tapLate } from '../helpers';
import { accountSection, call, expect, NO_ACCOUNTS, signInWithForm, signOut, stored, test, type Device } from './helpers';

/**
 * Progress on the account across devices, on the deployed site (docs/SMOKE.md): one of the suite's own accounts plays
 * on one device, another device signs in and has it, a setting changed there comes back to the first, and signing out
 * with Remove takes the progress off a device. The account is removed when the test ends.
 */

test.skip(!!NO_ACCOUNTS, NO_ACCOUNTS ?? '');

/** The account's copy, as the API keeps it. */
const saved = (d: Device): Promise<SavedProgress> => call<SavedProgress>(d.ctx.request, 'GET', '/progress');
const xpOf = (v: unknown): number | undefined => (v as { xp?: number } | null)?.xp;

test('progress: an exercise played on a phone is on a laptop that signs in; a theme set there comes back; Remove takes it off the phone', async ({
  smoke,
  device,
}) => {
  const phone = await device({ size: 'phone' });
  // One bar of quarter notes is set up, and the how-to sheets were seen (they stay on the device).
  await phone.page.addInitScript((last) => {
    if (!localStorage.getItem('muzieklab.prefs.v1')) localStorage.setItem('muzieklab.prefs.v1', JSON.stringify({ seenHowTo: true, seenHold: true, holdMode: 'tap' }));
    if (!localStorage.getItem('muzieklab.progress.v1')) localStorage.setItem('muzieklab.progress.v1', JSON.stringify({ lessons: {}, practiceDays: [], lastSettings: last }));
  }, QUARTERS);
  const person = await smoke.member('sync', phone);
  // Signed in through the API: the app learns it on its first account screen, and syncs from then on.
  await phone.page.goto('./#/settings');
  await expect(accountSection(phone.page).locator('.sync-line')).toHaveText('Progress saved to your account');

  await phone.page.goto('./#/setup');
  await phone.page.getByRole('button', { name: /^Start · / }).click();
  await tapLate(phone.page, 4, 500, 0);
  await expect(phone.page.getByRole('heading', { name: 'Exercise done' })).toBeVisible();
  const xp = xpOf(await stored(phone.page, 'muzieklab.progress.v1'));
  expect(xp, 'XP for the exercise').toBeGreaterThan(0);
  // Saved to the account a moment after the exercise.
  await expect.poll(async () => xpOf((await saved(phone)).data?.progress), { message: "the account's XP", timeout: 15_000 }).toBe(xp);

  const laptop = await device({ size: 'desktop' });
  await signInWithForm(laptop.page, person.email, person.password);
  await expect(laptop.page).toHaveURL(/#\/settings$/);
  await expect(accountSection(laptop.page).locator('.sync-line')).toHaveText('Progress saved to your account');
  await expect.poll(async () => xpOf(await stored(laptop.page, 'muzieklab.progress.v1')), { message: "the laptop's XP" }).toBe(xp);

  // A setting that follows the account: dark on the laptop, then on the phone at its next start.
  await laptop.page.goto('./#/settings');
  await laptop.page.getByRole('group', { name: 'Color theme' }).getByRole('button', { name: 'Dark' }).click();
  await expect(laptop.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await saved(laptop)).data?.prefs.theme, { message: "the account's theme", timeout: 15_000 }).toBe('dark');
  await phone.page.reload();
  await expect(phone.page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Signing out with Remove takes the progress off the phone; the setting stays, and the account keeps the progress.
  await signOut(phone.page, 'Remove');
  expect(await stored(phone.page, 'muzieklab.progress.v1'), "the phone's progress after Remove").toBeNull();
  await expect(phone.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(xpOf((await saved(laptop)).data?.progress), "the account's XP after the phone signed out").toBe(xp);
});
