import { expect, test } from '@playwright/test';
import { seed, VIEWPORTS } from './helpers';

/** v1.1 quick wins: the daily challenge with its code and Copy, and Echo mode from setup to the reveal on Results. */

test('daily challenge: Home → Play → Results with the code and Copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page, { prefs: { seenHowTo: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: /^Play the daily challenge for / }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByText('Daily challenge', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.getByRole('heading', { name: 'Daily challenge done' })).toBeVisible();
  await expect(page.getByText(/same for everyone$/)).toBeVisible();
  const code = (await page.locator('#excode').textContent())!;
  expect(code).toMatch(/^T(24|34|44)+-[WHQES]+-R[WHQES]*-\d+B-\d+(-X[0-9A-Z]+)?-[0-9A-Z]+$/);
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await expect(page.getByText('+0 XP')).toBeVisible();

  // Retry plays the same exercise: the same code.
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.locator('#excode')).toHaveText(code);
});

test('echo: listen, tap it back with the notation hidden, then Results reveals it', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page, { prefs: { seenHowTo: true, seenEchoHowTo: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }).click();
  await expect(page.getByText('Hear it, then tap it back from memory')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Fewer bars' }).click();
  await page.getByRole('button', { name: 'Start · 1 bar' }).click();

  await expect(page.getByText('LISTEN FIRST')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rhythm pad' })).toBeDisabled();
  await expect(page.locator('.staff, svg.vf')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play the rhythm' }).click();
  await expect(page.getByRole('heading', { name: 'Playing…' })).toBeVisible();
  await expect(page.getByText('1 play left')).toBeVisible();
  await page.getByRole('button', { name: 'Tap it back' }).click({ timeout: 15_000 });

  await expect(page.getByRole('heading', { name: 'Now tap it back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hear again · 1 left' })).toBeVisible();
  // Presses in the count-in are ignored: tap once the rhythm's first beat has come.
  await expect(page.getByRole('img', { name: /^Counting beat/ })).toBeAttached({ timeout: 8000 });
  await page.getByRole('button', { name: 'Rhythm pad' }).click();
  await expect(page.locator('.echo-count b')).toHaveText('1');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('heading', { name: 'Echo done' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^The rhythm you heard, revealed/ })).toBeAttached();
  await expect(page.locator('#excode')).toHaveText(/^E44-/);
});

test('a level-up is saved and shown on Home', async ({ page }) => {
  await seed(page, { progress: { lessons: {}, practiceDays: [], lastSettings: null, xp: 1700 } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await expect(page.getByText('Level 7')).toBeVisible();
  await expect(page.getByText('· Measure')).toBeVisible();
  await expect(page.getByText('350 / 400 XP')).toBeVisible();
  await expect(page.getByText('50 XP to level 8')).toBeVisible();
});
