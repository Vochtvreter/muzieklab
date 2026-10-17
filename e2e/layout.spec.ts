import { expect, test } from '@playwright/test';
import { expectClickable, expectNoOverlap, expectNoSideScroll, expectNotSqueezed, pad, VIEWPORTS, type ViewportName } from './helpers';

/**
 * Known layout bugs from the MVP QA, fixed in the follow-up layout PR. `test.fail` keeps CI green while they are open
 * and turns red the moment one starts passing, so the entry gets removed with its fix.
 */
const KNOWN: Record<string, string> = {};
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

    test('home: level, XP and the daily challenge', async ({ page }) => {
      known(name, 'home-daily');
      await page.goto('./');
      await expect(page.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: /^Play the daily challenge for / }));
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.daily-card'));
      await expectNoOverlap(page.locator('.daily-card'), page.locator('.free-card'));
      await expectNotSqueezed(page.locator('.daily-card'));
      await expectNoSideScroll(page);
    });

    test('setup: start button', async ({ page }) => {
      known(name, 'setup');
      await page.goto('./#/setup');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      await expectClickable(page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }));
      await expectNoSideScroll(page);
    });

    test('echo: listen, then the tap-back card and the pad', async ({ page }) => {
      known(name, 'echo');
      await page.goto('./#/setup');
      await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectClickable(page.getByRole('button', { name: 'Play the rhythm' }), { scroll: false });
      await expectNotSqueezed(page.locator('.echo-card'));
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expect(pad(page)).toBeVisible();
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

    test('play with the analog metronome: pendulum and the pad', async ({ page }) => {
      known(name, 'play-analog');
      await page.goto('./#/settings');
      await page.getByRole('group', { name: 'Metronome style' }).getByRole('button', { name: 'Analog' }).click();
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.locator('.beats--analog')).toBeVisible();
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expectClickable(pad(page), { scroll: false });
      await expectNoSideScroll(page);
    });
  });
}
