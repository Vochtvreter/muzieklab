import { readFile } from 'node:fs/promises';
import type { AccountExport } from '../../shared/api';
import { accountRow, accountSection, expect, FEEDBACK, newPassword, NO_ACCOUNTS, SESSION_ENDED, signInApi, signInWithForm, test } from './helpers';

/**
 * What an account does for itself on the deployed site (docs/SMOKE.md), on one of the suite's own accounts: change its
 * password, download its data, sign out everywhere, and delete itself with its password (which also removes it).
 */

test.skip(!!NO_ACCOUNTS, NO_ACCOUNTS ?? '');

test('my account: change the password, download my data, sign out everywhere, then delete the account', async ({ admin, smoke, device }) => {
  const laptop = await device({ size: 'desktop' });
  const person = await smoke.member('self', laptop);
  const phone = await device({ size: 'phone' });
  phone.watch.allow(...SESSION_ENDED);
  await signInApi(phone, person);
  await phone.page.goto('./#/settings');
  await expect(accountRow(phone.page, person.name)).toBeVisible();

  // A new password: this device stays signed in, the other one is signed out.
  const page = laptop.page;
  await page.goto('./#/account');
  const passwords = page.getByRole('region', { name: 'Password' });
  const password = newPassword();
  await passwords.getByLabel('Current password').fill(person.password);
  await passwords.getByLabel('New password').fill(password);
  await passwords.getByRole('button', { name: 'Change password' }).click();
  await expect(passwords.locator('.form-done')).toHaveText('Password changed. Your other devices are signed out.');
  person.password = password;
  await expect(passwords.getByLabel('Current password')).toHaveValue('');
  await phone.page.reload();
  await expect(accountSection(phone.page).getByRole('link', { name: /^Sign in/ })).toBeVisible();

  // Download my data: a JSON file with the account, its devices, what was done to it, and its progress.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download my data/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('muzieklab-account.json');
  const data = JSON.parse(await readFile((await download.path())!, 'utf8')) as AccountExport;
  expect(data.account).toMatchObject({ id: person.id, email: person.email, name: person.name, status: 'active' });
  expect(data.sessions.length, 'devices signed in').toBeGreaterThan(0);
  expect(data.audit.map((e) => e.action)).toEqual(expect.arrayContaining(['account.accept_invite', 'account.change_password']));
  expect(data).toHaveProperty('progress.rev');
  await expect(page.getByRole('region', { name: 'Your data' }).locator('.form-done')).toHaveText('Downloaded: muzieklab-account.json.');

  // Sign out everywhere: this device and the other one.
  await signInApi(phone, person);
  await phone.page.reload();
  await expect(accountRow(phone.page, person.name)).toBeVisible();
  await page.getByRole('button', { name: /^Sign out everywhere/ }).click();
  const everywhere = page.getByRole('alertdialog', { name: 'Sign out everywhere?' });
  await everywhere.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).locator('.row-status')).toHaveText('Signed out on every device.');
  await phone.page.reload();
  await expect(accountSection(phone.page).getByRole('link', { name: /^Sign in/ })).toBeVisible();

  // Delete the account, with nothing kept: signed out, and gone from the admin's list.
  await signInWithForm(page, person.email, person.password);
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goto('./#/account');
  await page.getByRole('button', { name: /^Delete account/ }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
  const keep = confirm.getByRole('group', { name: 'Your progress and settings' });
  await expect(keep.getByRole('button', { name: 'Keep anonymously' })).toHaveAttribute('aria-pressed', 'true');
  await keep.getByRole('button', { name: 'Delete too' }).click();
  await confirm.getByLabel('Why are you leaving? (optional)').fill(FEEDBACK);
  await confirm.getByLabel('Password', { exact: true }).fill(person.password);
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(accountSection(page).locator('.row-status')).toHaveText('Your account and its data were deleted.');
  await expect(accountSection(page).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  expect(await admin.account(person.id), 'the deleted account').toBeNull();
});
