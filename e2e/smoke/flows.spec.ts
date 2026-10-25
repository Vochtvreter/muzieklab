import type { Page } from '@playwright/test';
import { QUARTERS, seed, SOL_DONE, tapLate, VIEWPORTS } from '../helpers';
import { expect, stored, test, watchOf } from './helpers';

/**
 * The main things to do in the deployed app, quickly and signed out (docs/SMOKE.md): play rhythm on the keyboard to
 * Results, the daily challenge and a path lesson, a Read notes round, a Scales round, and a Learn chapter. Progress
 * stays in each test's own browser.
 */

test('rhythm: one bar of free practice, tapped on the keyboard, to Results with every beat a hit', async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: QUARTERS } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  await page.getByRole('button', { name: /^Start · / }).click();
  // Four quarter notes at 120 BPM, a key press on each beat (each press carries its own time, so a late timer does
  // not move it).
  await tapLate(page, 4, 500, 0);
  await expect(page.getByRole('heading', { name: 'Exercise done' })).toBeVisible();
  // Results' counts, by label: Perfect, Great, Good, Miss, Extra.
  const cells = await page.locator('.counts > div').evaluateAll((divs) =>
    divs.map((d) => [d.querySelector('.count-label')?.textContent ?? '', Number(d.querySelector('.count-n')?.textContent)] as const),
  );
  const counts = Object.fromEntries(cells) as Record<string, number>;
  expect(counts.Miss, 'no beat missed').toBe(0);
  expect(counts.Perfect + counts.Great + counts.Good, 'every beat a hit').toBe(4);
  expect(((await stored(page, 'muzieklab.progress.v1')) as { xp?: number } | null)?.xp).toBeGreaterThan(0);
});

test('daily challenge: Home → Play → Results', async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: /^Play the daily challenge for / }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByText('Daily challenge', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.getByRole('heading', { name: 'Daily challenge done' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy code' })).toHaveAttribute('title', /^Copy the exercise code: T(24|34|44)+-/);
});

test('learning path: the next lesson from Home → Play → Results', async ({ page }) => {
  await seed(page, { progress: { lessons: SOL_DONE }, prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();
});

test('read notes: a round from Home, answered, to its summary', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('link', { name: /^Read notes/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Read notes' })).toBeVisible();
  await page.getByRole('button', { name: /^Start · / }).click();
  await page.getByRole('group', { name: 'Note names' }).getByRole('button').first().click();
  await expect(page.locator('.nfeedback')).toHaveText(/^(Right|That was)/);
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
});

/** A G major round on the computer keyboard (desktop), to Round done. */
async function playGMajor(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./');
  await page.getByRole('link', { name: /^Scales/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Scales' })).toBeVisible();
  await page.getByRole('button', { name: 'G major: no stars yet' }).click();
  await page.getByRole('button', { name: 'Practice G major' }).click();
  await expect(page.getByText('Scale 1 of 1')).toBeVisible();
  // G A B C D E F♯ G: A S D F G H (white keys from G), I (F♯), K (G).
  for (const k of ['a', 's', 'd', 'f', 'g', 'h', 'i', 'k']) await page.keyboard.press(k);
  await expect(page.locator('.nfeedback')).toHaveText(/^G major: done/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
}

/**
 * Known app bug, 0.16.0: when a scale is done, ScalesPlay looks up the step after the last note
 * (src/ui/screens/scales/ScalesPlay.tsx, `stepHow(steps[pos - 1])` with pos past the last step), so the console says
 * "[i18n] missing message: scales.how.undefined". Nothing on screen is wrong. The round is checked here with that one
 * warning let through; the test after it fails while the bug is there, and passes (turning red) once it is fixed.
 */
const SCALES_HOW_BUG = /^\[i18n\] missing message: scales\.how\.undefined$/;

test('scales: a G major round played on the computer keyboard, three stars', async ({ page }) => {
  watchOf(page).allowConsole(SCALES_HOW_BUG);
  await playGMajor(page);
  await expect(page.getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
});

test('scales: a finished scale looks up no missing message (known bug: scales.how.undefined)', async ({ page }) => {
  test.fail(true, 'ScalesPlay looks up the step after the last note when a scale is done (0.16.0)');
  await playGMajor(page);
});

test('learn: a chapter and one of its sections open from the list, and its quick check answers', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn');
  await page.getByRole('button', { name: /^10\s*Key signatures/ }).click();
  await page.getByRole('link', { name: /^10\.2/ }).click();
  await expect(page).toHaveURL(/#\/learn\/10\?s=10\.2$/);
  await expect(page.getByRole('heading', { name: /10\.2\s*The order of sharps and flats/ })).toBeInViewport();
  await page.locator('.learn-chapter').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const check = page.getByRole('group', { name: 'How long does a key signature hold?' });
  await check.getByRole('button', { name: 'For the whole piece' }).click();
  await expect(check.getByRole('status')).toHaveText(/^Right\. A key signature holds/);
});
