import en from '../../src/i18n/en.json' with { type: 'json' };
import nl from '../../src/i18n/nl.json' with { type: 'json' };
import { VIEWPORTS } from '../helpers';
import { checkScreen, escapeRegExp, expect, expectTheme, LINK_REFUSED, PRODUCTION, test, watchOf, type Size } from './helpers';

/**
 * Every screen of the deployed app, signed out, at phone, tablet and desktop, light and dark (docs/SMOKE.md): its
 * heading shows, nothing scrolls sideways, no button cuts its words off, no message key shows instead of its text, and
 * nothing fails on the page. One page per size and theme, going from screen to screen by the hash, as the app does.
 * Then the main screens in Dutch. The account and admin screens, signed in: accounts.spec.ts.
 *
 * Not on production: these are the screens of the test site's release, with its API (the sign-in screen, the account
 * screens, the invite and new-password links). Production has no API, and between releases it runs an older one.
 */

test.skip(PRODUCTION, "production has no API, and between releases runs an older one: these are the test site's screens");

/** Every Learn chapter: its heading is its number and title. */
const CHAPTERS = Object.entries(en.learn.chapters).map(([n, c]) => [`#/learn/${n}`, new RegExp(`^${n}\\s*${escapeRegExp(c.title)}$`)] as const);

/** Each route, and the heading it shows signed out: screens that need a run or an account go to another one. */
const SCREENS: (readonly [string, string | RegExp])[] = [
  ['#/', 'Home'],
  ['#/path', 'Learning path'],
  ['#/setup', 'Free practice'],
  ['#/calibrate', 'Calibrate timing'],
  ['#/changelog', "What's new"],
  ['#/notes', 'Read notes'],
  ['#/notes/key', 'Key'],
  ['#/scales', 'Scales'],
  ['#/scales/setup', 'Scale practice'],
  ['#/scales/key', 'Key'],
  ['#/learn', 'Learn'],
  ...CHAPTERS,
  ['#/settings', 'Settings'],
  ['#/signin', 'Sign in'],
  ['#/privacy', 'Privacy'],
  // Nothing played: back to setup or Home.
  ['#/play', 'Free practice'],
  ['#/results', 'Home'],
  ['#/notes/play', 'Read notes'],
  ['#/notes/done', 'Read notes'],
  ['#/scales/play', 'Scales'],
  ['#/scales/done', 'Scales'],
  // Signed out: to Sign in.
  ['#/account', 'Sign in'],
  ['#/admin', 'Sign in'],
  ['#/admin/invite', 'Sign in'],
  ['#/admin/deleted', 'Sign in'],
  ['#/admin/account/0123456789abcdef01234567', 'Sign in'],
  ['#/admin/feedback', 'Sign in'],
  ['#/admin/feedback/0123456789abcdef01234567', 'Sign in'],
  // Not a screen (the render page is only in development builds): Home.
  ['#/dev/render', 'Home'],
  ['#/no-such-screen', 'Home'],
];

/** Links that do not work, as the app shows them: made-up tokens of the right shape. */
const BAD_LINKS: (readonly [string, string])[] = [
  ['#/invite/' + 'A'.repeat(43), 'Accept invite'],
  ['#/reset/' + 'B'.repeat(43), 'New password'],
];

for (const size of ['phone', 'tablet', 'desktop'] as Size[]) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${size}, ${scheme}`, () => {
      test.use({ viewport: VIEWPORTS[size], hasTouch: size !== 'desktop', colorScheme: scheme });

      test(`every screen, signed out, at ${size} size in ${scheme} mode`, async ({ page }) => {
        for (const [hash, heading] of SCREENS) await checkScreen(page, hash, heading);
        await checkScreen(page, '#/', 'Home');
        await expectTheme(page, scheme);
        // The tabs: at the bottom on a phone, in a header above the screen on tablet and desktop (no sidebar).
        const header = page.getByRole('banner').getByRole('navigation', { name: 'Main' });
        if (size === 'phone') await expect(header).toHaveCount(0);
        else await expect(header).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

        // Made-up links, at one size only: wrong tokens count against this address (50 in 15 minutes go through).
        if (size === 'phone' && scheme === 'light') {
          watchOf(page).allow(...LINK_REFUSED);
          for (const [hash, heading] of BAD_LINKS) {
            await checkScreen(page, hash, heading);
            await expect(page.getByRole('alert')).toHaveText("This link doesn't work anymore. Ask the person who invited you for a new one.");
          }
        }
      });
    });
  }
}

test.describe('Dutch', () => {
  test.use({ locale: 'nl-NL', viewport: VIEWPORTS.desktop });

  test('the main screens are in Dutch on a Dutch browser', async ({ page }) => {
    const screens: [string, string, string][] = [
      ['#/', en.home.title, nl.home.title],
      ['#/path', en.path.title, nl.path.title],
      ['#/setup', en.setup.title, nl.setup.title],
      ['#/learn', en.learn.title, nl.learn.title],
      ['#/notes', en.notes.setup.title, nl.notes.setup.title],
      ['#/scales', en.scales.title, nl.scales.title],
      ['#/settings', en.settings.title, nl.settings.title],
      ['#/signin', en.signIn.title, nl.signIn.title],
    ];
    for (const [hash, english, dutch] of screens) {
      expect(dutch, `the Dutch heading of ${hash}`).not.toBe(english);
      await checkScreen(page, hash, dutch);
    }
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    // Sign in has no tabs: back to Home for them.
    await checkScreen(page, '#/', nl.home.title);
    await expect(page.getByRole('navigation', { name: nl.nav.main })).toContainText(nl.nav.learn);
  });
});
