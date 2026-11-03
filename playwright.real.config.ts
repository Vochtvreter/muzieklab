import { defineConfig } from '@playwright/test';

/**
 * End-to-end checks against the real API (e2e/real-api.spec.ts): the app in a real browser, the API bundle and a real
 * MongoDB, nothing mocked. Run with `npm run e2e:real` (CI job real-api); `npm run e2e` leaves this spec out.
 *
 * Both servers start fresh for every run and are never reused, so a developer's own API or database is never touched
 * (a port in use fails the run instead). Ports can be moved with REAL_API_PORT, REAL_APP_PORT and REAL_MONGO_PORT.
 */
const API_PORT = process.env.REAL_API_PORT ?? '3100';
const APP_PORT = process.env.REAL_APP_PORT ?? '4180';
const MONGO_PORT = process.env.REAL_MONGO_PORT ?? '27118';
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;

// Read by the servers (webServer inherits the environment) and by the spec (so do the workers): where the app is,
// and the database the create-admin command writes to.
process.env.REAL_API_PORT = API_PORT;
process.env.REAL_APP_PORT = APP_PORT;
process.env.REAL_APP_URL = APP_URL;
process.env.REAL_MONGODB_URI = `mongodb://127.0.0.1:${MONGO_PORT}/muzieklab_e2e?replicaSet=rs0`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'real-api.spec.ts',
  // Tests share the API but not accounts (each makes its own), so they may run side by side.
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_URL,
    browserName: 'chromium',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // The bundle as deployed (one file), rebuilt from the current code.
      command: 'npm --prefix server run build && node e2e/real-api-server.mjs api',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      // MongoDB's first start downloads its binary (cached afterwards).
      timeout: 180_000,
      // SIGTERM, so the script stops the API and removes MongoDB's data folder.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
      stdout: 'pipe',
    },
    {
      command: 'node e2e/real-api-server.mjs app',
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
