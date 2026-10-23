import { expect, test } from '@playwright/test';
import { pad, seed, VIEWPORTS } from './helpers';

/** v1.1 quick wins: the daily challenge with Copy code, and Echo mode from setup to the reveal on Results. */

test('daily challenge: Home → Play → Results with Copy code', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: /^Play the daily challenge for / }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByText('Daily challenge', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.getByRole('heading', { name: 'Daily challenge done' })).toBeVisible();
  // The date under the title, nothing more: the daily follows the player's unit, so it is not the same for everyone.
  const today = await page.evaluate(() => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date()));
  await expect(page.locator('.screen-head-text .muted-text')).toHaveText(today);
  // The code is not on screen: Copy code copies it, says Copied, and has it in its title.
  await expect(page.getByText(/^T(24|34|44)+-/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy code' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toMatch(/^T(24|34|44)+-[WHQES]+-R[WHQES]*-\d+B-\d+(-X[0-9A-Z]+)?-[0-9A-Z]+$/);
  await expect(page.getByRole('button', { name: 'Copied' })).toHaveAttribute('title', 'Copy the exercise code: ' + code);
  await expect(page.getByText('+0 XP')).toBeVisible();

  // Nothing was played, so Try again is the main button: it plays the same exercise, with the same code.
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.getByRole('button', { name: 'Copy code' })).toHaveAttribute('title', 'Copy the exercise code: ' + code);
});

test('echo: listen, tap it back with the notation hidden, then Results reveals it', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, seenEchoHowTo: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }).click();
  await expect(page.getByText('Hear it, then tap it back from memory')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Fewer bars' }).click();
  await page.getByRole('button', { name: 'Start · 1 bar' }).click();

  await expect(page.getByText('LISTEN FIRST')).toBeVisible();
  await expect(pad(page)).toBeDisabled();
  await expect(page.locator('.staff, svg.vf')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play the rhythm' }).click();
  await expect(page.getByRole('heading', { name: 'Playing…' })).toBeVisible();
  await expect(page.getByText('1 play left')).toBeVisible();
  await page.getByRole('button', { name: 'Tap it back' }).click({ timeout: 15_000 });

  await expect(page.getByRole('heading', { name: 'Now tap it back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hear again · 1 left' })).toBeVisible();
  // Presses in the count-in are ignored: tap once the rhythm's first beat has come.
  await expect(page.getByRole('img', { name: /^Counting beat/ })).toBeAttached({ timeout: 8000 });
  await pad(page).click();
  await expect(page.locator('.echo-count b')).toHaveText('1');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('heading', { name: 'Echo done' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^The rhythm you heard, revealed/ })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Copy code' })).toHaveAttribute('title', /: E44-/);
});

test('a level-up is saved and shown on Home: the level chip opens its details', async ({ page }) => {
  await seed(page, { progress: { lessons: {}, practiceDays: [], lastSettings: null, xp: 1700 } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: 'Level 7' }).click();
  const sheet = page.getByRole('dialog', { name: 'Level 7 · Measure' });
  await expect(sheet.getByText('Groove at level 8')).toBeVisible();
  await expect(sheet.getByRole('list', { name: 'Ranks' }).locator('[aria-current="step"]')).toHaveText('Measure');
  await expect(sheet.getByText('50 XP to level 8')).toBeVisible();
  await expect(page.getByText('350 / 400 XP')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the level sheet closes when a tablet turns to the desktop layout, and stays closed when it turns back', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.tablet);
  await page.goto('./');
  await page.getByRole('button', { name: 'Level 1' }).click();
  await expect(page.getByRole('dialog', { name: 'Level 1 · Tick' })).toBeVisible();
  // An iPad in landscape (1194 px) gets the desktop layout, whose level card needs no sheet.
  await page.setViewportSize({ width: 1194, height: 834 });
  await expect(page.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize(VIEWPORTS.tablet);
  await expect(page.getByRole('button', { name: 'Level 1' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('daily challenge on day one: short and tap only, under the lesson card', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await expect(page.locator('.daily-card')).toContainText('4 bars · new every day');
  await page.getByRole('button', { name: /^Play the daily challenge for / }).click();
  // How to play shows (first time), without the hold section: the path teaches holding from unit 2.
  const howTo = page.getByRole('dialog', { name: 'How to play' });
  await expect(howTo).toBeVisible();
  await expect(howTo.getByText('New: hold each note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.getByRole('heading', { name: 'Daily challenge done' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy code' })).toHaveAttribute('title', /^Copy the exercise code: T44-[HQ]+-R-4B-(60|66|72)-/);
});
