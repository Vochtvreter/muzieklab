import { expect, test } from '@playwright/test';
import { VIEWPORTS } from './helpers';

/** Settings → Install app: the browser's install dialog where it offers one, the Share-menu steps on iPhone. */
test.use({ viewport: VIEWPORTS.phone, hasTouch: true });

test('install button shows the browser install dialog', async ({ page }) => {
  await page.goto('./#/settings');
  const install = page.getByRole('button', { name: 'Install', exact: true });
  await expect(install).toHaveCount(0);
  // Stand in for Chrome's beforeinstallprompt, which headless Chromium does not fire.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>;
    e.prompt = () => {
      (window as unknown as Record<string, boolean>).prompted = true;
      return Promise.resolve();
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await install.click();
  expect(await page.evaluate(() => (window as unknown as Record<string, boolean>).prompted)).toBe(true);
  await expect(page.getByText('Installed', { exact: true })).toBeVisible();
  await expect(install).toHaveCount(0);
});

test.describe('iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });

  test('shows the Share menu steps', async ({ page }) => {
    await page.goto('./#/settings');
    await expect(page.getByText('Tap the Share button, then Add to Home Screen.')).toBeVisible();
  });
});
