import { VIEWPORTS } from '../helpers';
import { checkScreen, expect, test, watchOf } from './helpers';

/**
 * The app works offline once its service worker is installed (docs/SMOKE.md): the deployed sw.js precaches the
 * release, and a reload with no network still opens Home, Learn, Read notes, Scales and Settings; any other address is
 * still the server's. The other smoke tests block the service worker so that they always load the release from the
 * server; this one needs it.
 */

test.use({ serviceWorkers: 'allow', viewport: VIEWPORTS.phone, hasTouch: true });

test('offline: after the service worker is installed, the app reloads and opens its screens with no network', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => void (await navigator.serviceWorker.ready));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { message: 'the service worker controls the page', timeout: 30_000 }).toBe(true);
  await checkScreen(page, '#/settings', 'Settings');
  await expect(page.getByText('Works offline')).toBeVisible();

  // Offline, the API gets no answer (the app asks who is signed in, and this test asks for its health).
  watchOf(page).allowFailure(/^net::ERR_INTERNET_DISCONNECTED$/);
  await context.setOffline(true);
  try {
    await page.reload();
    await checkScreen(page, '#/', 'Home');
    await checkScreen(page, '#/learn', 'Learn');
    await checkScreen(page, '#/learn/11', /^11\s*Scales$/);
    await checkScreen(page, '#/notes', 'Read notes');
    await checkScreen(page, '#/scales', 'Scales');
    await checkScreen(page, '#/settings', 'Settings');
    await expect(page.getByText('Works offline')).toBeVisible();
    // Opened afresh (not from the hash of a page already open), offline too.
    await page.goto('about:blank');
    await page.goto('./#/learn');
    await expect(page.getByRole('heading', { level: 1, name: 'Learn', exact: true })).toBeVisible();
    // The API is not cached: it really is offline.
    expect(await page.evaluate(() => fetch('./api/v1/health').then(() => 'answered', () => 'failed'))).toBe('failed');
  } finally {
    await context.setOffline(false);
  }
  // Online again: any other address is still the server's 404, not the app from the service worker, whose ./assets
  // would then point under that path (/learn/assets/…) and leave the page blank.
  // The server's 404 has no body, which Chromium shows as its own error page and reports as a failed navigation.
  watchOf(page).allow({ method: 'GET', path: /\/learn\/1$/, status: 404 });
  watchOf(page).allowFailure(/ERR_HTTP_RESPONSE_CODE_FAILURE/);
  const answer = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/learn/1'));
  await page.goto('./learn/1').catch((e: Error) => {
    if (!/ERR_HTTP_RESPONSE_CODE_FAILURE/.test(e.message)) throw e;
  });
  const deep = await answer;
  expect(deep.fromServiceWorker(), 'the service worker leaves ./learn/1 to the server').toBe(false);
  expect(deep.status()).toBe(404);
});
