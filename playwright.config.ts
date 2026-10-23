import { defineConfig } from '@playwright/test';

/** End-to-end checks against the production build (`vite preview`). Run with `npm run e2e`. */
export default defineConfig({
  testDir: 'e2e',
  // Needs the real API and a database: `npm run e2e:real` (playwright.real.config.ts) runs it.
  testIgnore: '**/real-api.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    browserName: 'chromium',
    // The tests read English text; the app follows the browser's language until one is picked in Settings.
    locale: 'en-US',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
