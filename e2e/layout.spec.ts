import { expect, test } from '@playwright/test';
import { expectClickable, expectNoOverlap, expectNoSideScroll, expectNotSqueezed, pad, VIEWPORTS, type ViewportName } from './helpers';

/**
 * Known layout bugs from the MVP QA, fixed in the follow-up layout PR. `test.fail` keeps CI green while they are open
 * and turns red the moment one starts passing, so the entry gets removed with its fix.
 */
const KNOWN: Record<string, string> = {
  'phone-se/home': 'Continue card squeezed under Free practice',
  'phone-se/settings': 'Leniency label covered by the segmented control',
  'phone-landscape/home': 'Continue card squeezed under Free practice',
  'phone-landscape/play': 'Pad below the fold on a screen that cannot scroll',
};
const known = (vp: string, screen: string): void => {
  const why = KNOWN[`${vp}/${screen}`];
  test.fail(!!why, why);
};

/** Every screen's main action can be reached and tapped, at every supported size, with no sideways scroll. */
for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(name, () => {
    test.use({ viewport: VIEWPORTS[name], hasTouch: !name.startsWith('desktop') && !name.startsWith('laptop') });

    test('home: continue lesson and free practice', async ({ page }) => {
      known(name, 'home');
      await page.goto('./');
      await expectClickable(page.getByRole('button', { name: 'Continue lesson' }));
      await expectClickable(page.getByRole('link', { name: 'Start free practice' }));
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.free-card'));
      await expectNotSqueezed(page.locator('.continue-card'));
      await expectNoSideScroll(page);
    });

    test('setup: start button', async ({ page }) => {
      known(name, 'setup');
      await page.goto('./#/setup');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      await expectNoSideScroll(page);
    });

    test('path: start lesson', async ({ page }) => {
      known(name, 'path');
      await page.goto('./#/path');
      await expectClickable(page.getByRole('button', { name: /^Start lesson/ }));
      await expectNoSideScroll(page);
    });

    test('settings: leniency and reset progress', async ({ page }) => {
      known(name, 'settings');
      await page.goto('./#/settings');
      await expectClickable(page.getByText('Leniency', { exact: true }));
      await expectClickable(page.getByRole('button', { name: 'Reset progress' }));
      await expectNoSideScroll(page);
    });

    test('calibration: pad', async ({ page }) => {
      known(name, 'calibration');
      await page.goto('./#/calibrate');
      await expectClickable(pad(page));
      await expectNoSideScroll(page);
    });

    test('play: how to play, then the pad', async ({ page }) => {
      known(name, 'play');
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expectClickable(pad(page), { scroll: false });
      await expectNoSideScroll(page);
    });
  });
}
