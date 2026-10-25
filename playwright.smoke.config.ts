import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';

/**
 * Smoke tests of a deployed site (e2e/smoke, docs/SMOKE.md): the test site unless SMOKE_URL names another. Nothing is
 * built or started here. Run with `npm run smoke`; the tests that sign in need MUZIEKLAB_TEST_EMAIL and
 * MUZIEKLAB_TEST_PASSWORD (an admin of that site), and are skipped without them. In a Claude session, Chromium is at
 * PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium; elsewhere `npx playwright install chromium` provides it.
 *
 * Nothing is recorded that could hold a password: no traces (they keep every request body and every typed value), no
 * videos, and no page snapshot on failure (error-context.md lists the value of every field on the page). With tracing
 * turned on anyway (--trace), global setup skips the tests that sign in. Screenshots of a failure stay on this
 * computer (test-results/smoke); CI takes none.
 */
const SMOKE_URL = new URL('./', process.env.SMOKE_URL || 'https://test.vivanova.app/').href;

// Read by the workers too (they inherit the environment): the site, and one id for the whole run, which every account
// it makes carries (smoke-<run>-…@example.invalid), so its own clean-up finds them and never another run's.
process.env.SMOKE_URL = SMOKE_URL;
process.env.SMOKE_RUN_ID ||= Date.now().toString(36) + randomBytes(2).toString('hex');
// No page snapshot (error-context.md) on failure: it holds what is typed into every field, passwords too.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

export default defineConfig({
  testDir: 'e2e/smoke',
  // Its own folder: each run empties its output folder, so `npm run e2e` and this never clear each other's results.
  outputDir: 'test-results/smoke',
  // Checks the site and the admin account once, and removes accounts that runs which crashed left behind.
  globalSetup: './e2e/smoke/global-setup.ts',
  // Removes whatever this run made and did not remove itself.
  globalTeardown: './e2e/smoke/global-teardown.ts',
  fullyParallel: true,
  // Each worker signs the admin in once: two workers keep the run short and the admin's devices few.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: SMOKE_URL,
    browserName: 'chromium',
    // The tests read English text; the app follows the browser's language until one is picked in Settings.
    locale: 'en-US',
    // The release on the server, never a copy the service worker kept (the offline test allows it for itself).
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'off',
    video: 'off',
    screenshot: process.env.CI ? 'off' : 'only-on-failure',
  },
});
