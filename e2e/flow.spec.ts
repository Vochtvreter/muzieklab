import { expect, test } from '@playwright/test';
import { pad, VIEWPORTS } from './helpers';

/**
 * The main loop: Home → lesson 1.1 (quarter notes, 60 BPM, 2 bars, one bar of count-in) → How to play → tap along →
 * pause → resume → Results → Home. Taps are not timed precisely; the test checks the screens, not the score.
 */
for (const [name, input] of [['phone', 'pad'], ['desktop', 'key']] as const) {
  test(`play a lesson to the end (${name})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(VIEWPORTS[name]);
    /** One tap; false when the pad is gone (the run ended and Results replaced Play between checks). */
    const tap = async (): Promise<boolean> => {
      if (input === 'key') {
        await page.keyboard.down('j');
        await page.waitForTimeout(150);
        await page.keyboard.up('j');
      } else {
        const box = await pad(page)
          .boundingBox({ timeout: 2000 })
          .catch(() => null);
        if (!box) return false;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(150);
        await page.mouse.up();
      }
      return true;
    };

    await page.goto('./');
    await expect(page.getByText('No streak yet')).toBeVisible();
    await page.getByRole('button', { name: 'Continue lesson' }).click();
    await expect(page).toHaveURL(/#\/play$/);
    await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();

    await page.waitForTimeout(1500);
    await tap();
    if (input === 'key') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: /Resume/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Count-in (4 s) + 2 bars (8 s) + grace: tap along until Results shows.
    for (let i = 0; i < 16 && !page.url().includes('/results'); i++) {
      if (!(await tap())) break;
      await page.waitForTimeout(850);
    }
    await expect(page).toHaveURL(/#\/results$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Lesson 1.1 done' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    await page.goto('./#/');
    await expect(page.getByText('1-day streak')).toBeVisible();
  });
}
