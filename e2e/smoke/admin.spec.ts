import type { AccountDetail } from '../../shared/api';
import {
  accountRow, accountSection, expect, LINK_REFUSED, linkPattern, newPassword, NO_ACCOUNTS, openAccount, SESSION_ENDED, SIGN_IN_REFUSED, signInWithForm, test,
} from './helpers';

/**
 * The admin screens on the deployed site, used on the suite's own accounts only (docs/SMOKE.md): the list's search and
 * status filter, a new invite link and canceling an invite, renaming, blocking and unblocking, and a new-password link.
 * Every account is opened by its id and checked to be the test's own before anything is pressed; the admin's browser
 * refuses any change to another account (helpers.ts, Admin.guard).
 */

test.skip(!!NO_ACCOUNTS, NO_ACCOUNTS ?? '');

test("accounts list: search finds this test's accounts and the status filter narrows them; an invite gets a new link and is canceled", async ({
  admin,
  adminPage: a,
  smoke,
  device,
}) => {
  const { person: pending, link: firstLink } = await smoke.invite('pending');
  const active = await smoke.member('active', await device());

  await a.goto('./#/admin');
  const list = a.locator('section[aria-labelledby="h-accounts"]');
  await expect(list).toBeVisible();
  // Only this test's accounts have this in their email.
  await a.getByLabel('Search').fill(smoke.tag);
  await expect(a.locator('a.acct-row')).toHaveCount(2);
  await expect(list.getByRole('heading', { name: '2 accounts found' })).toBeVisible();
  await expect(a.locator('a.acct-row', { hasText: pending.name })).toContainText('Invited');
  await expect(a.locator('a.acct-row', { hasText: active.name })).toContainText('Active');
  const status = a.getByRole('group', { name: 'Status' });
  await status.getByRole('button', { name: 'Invited' }).click();
  await expect(status.getByRole('button', { name: 'Invited' })).toHaveAttribute('aria-pressed', 'true');
  await expect(a.locator('a.acct-row')).toHaveCount(1);
  await expect(a.locator('a.acct-row')).toContainText(pending.name);
  await status.getByRole('button', { name: 'Active' }).click();
  await expect(a.locator('a.acct-row')).toHaveCount(1);
  await expect(a.locator('a.acct-row')).toContainText(active.name);
  await status.getByRole('button', { name: 'Blocked' }).click();
  await expect(a.locator('.acct-empty')).toHaveText('No accounts match.');
  await status.getByRole('button', { name: 'All' }).click();
  await expect(a.locator('a.acct-row')).toHaveCount(2);

  // A new invite link: the first one stops working, the new one opens the invite.
  await openAccount(a, admin, pending);
  const invite = a.getByRole('region', { name: 'Invite' });
  await invite.getByRole('button', { name: /^New invite link/ }).click();
  await expect(invite.locator('.form-done')).toHaveText('New link ready. Send it yourself.');
  const link = await a.getByLabel('Invite link', { exact: true }).inputValue();
  expect(linkPattern('invite').test(link), "the new link is this site's #/invite/<token>").toBe(true);
  const other = await device({ size: 'desktop' });
  other.watch.allow(...LINK_REFUSED);
  await other.page.goto(firstLink);
  await expect(other.page.getByRole('alert')).toHaveText("This link doesn't work anymore. Ask the person who invited you for a new one.");
  await other.page.goto('about:blank');
  await other.page.goto(link);
  await expect(other.page.getByRole('heading', { level: 1, name: `Welcome, ${pending.name}` })).toBeVisible();

  // Canceling the invite removes the account (and leaves nothing in Deleted accounts).
  await invite.getByRole('button', { name: /^Cancel invite/ }).click();
  const confirm = a.getByRole('alertdialog', { name: `Cancel the invite for ${pending.name}?` });
  await confirm.getByRole('button', { name: 'Cancel invite', exact: true }).click();
  await expect(a).toHaveURL(/#\/admin$/);
  await expect(a.locator('.acct-card--status .form-done')).toHaveText(`The invite for ${pending.name} was canceled.`);
  expect(await admin.account(pending.id), 'the canceled invite').toBeNull();
});

test('one account: rename, block (sign-in refused) and unblock, and a new-password link that sets a new password', async ({
  admin,
  adminPage: a,
  smoke,
  device,
}) => {
  const m = await device({ size: 'phone' });
  m.watch.allow(...SESSION_ENDED, ...SIGN_IN_REFUSED);
  const person = await smoke.member('managed', m);
  await m.page.goto('./#/settings');
  await expect(accountRow(m.page, person.name)).toBeVisible();

  // Rename (still a "Smoke …" name).
  await openAccount(a, admin, person);
  const renamed = `${person.name} renamed`;
  const profile = a.getByRole('region', { name: 'Name and email' });
  await profile.getByLabel('Name').fill(renamed);
  await profile.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(profile.locator('.form-done')).toHaveText('Saved.');
  person.name = renamed;
  await expect(a.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  expect(((await admin.account(person.id)) as AccountDetail).name).toBe(renamed);

  // Block: signed out at the next start, and sign-in is refused with the same words as a wrong password.
  const access = a.getByRole('region', { name: 'Access' });
  await access.getByRole('button', { name: /^Block/ }).click();
  const confirm = a.getByRole('alertdialog', { name: `Block ${renamed}?` });
  await confirm.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(access.locator('.row-status')).toHaveText("Blocked. They're signed out.");
  await expect(a.locator('.acct-sub-row .status-pill')).toHaveText('Blocked');
  await m.page.reload();
  await expect(accountSection(m.page).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  await signInWithForm(m.page, person.email, person.password);
  await expect(m.page.getByRole('alert')).toHaveText('Email or password is not right.');

  // Unblock: the same sign-in goes through.
  await access.getByRole('button', { name: /^Unblock/ }).click();
  await expect(access.locator('.row-status')).toHaveText('Unblocked. They can sign in again.');
  await expect(a.locator('.acct-sub-row .status-pill')).toHaveText('Active');
  await m.page.getByLabel('Password', { exact: true }).fill(person.password);
  await m.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(m.page).toHaveURL(/#\/settings$/);
  await expect(accountRow(m.page, renamed)).toBeVisible();

  // A new-password link, used on another device: a new password, and the phone is signed out.
  await access.getByRole('button', { name: /^New password link/ }).click();
  await expect(access.locator('.form-done')).toHaveText('New link ready. Send it yourself.');
  const link = await a.getByLabel('New password link', { exact: true }).inputValue();
  expect(linkPattern('reset').test(link), "the link is this site's #/reset/<token>").toBe(true);
  const other = await device({ size: 'desktop' });
  await other.page.goto(link);
  await expect(other.page.getByRole('heading', { level: 1, name: 'New password' })).toBeVisible();
  await expect(other.page.getByText(`Choose a new password for ${person.email}.`)).toBeVisible();
  const password = newPassword();
  await other.page.getByLabel('New password').fill(password);
  await other.page.getByRole('button', { name: 'Save password' }).click();
  person.password = password;
  await expect(other.page).toHaveURL(/#\/settings$/);
  await expect(accountSection(other.page).locator('.row-status')).toHaveText('Password saved. Your other devices are signed out.');
  await expect(accountRow(other.page, renamed)).toBeVisible();
  await m.page.reload();
  await expect(accountSection(m.page).getByRole('link', { name: /^Sign in/ })).toBeVisible();
  await signInWithForm(m.page, person.email, password);
  await expect(m.page).toHaveURL(/#\/settings$/);
  await expect(accountRow(m.page, renamed)).toBeVisible();
});
