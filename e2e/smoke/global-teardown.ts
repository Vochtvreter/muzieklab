import { request } from '@playwright/test';
import { call, NO_ACCOUNTS, RUN_PREFIX, signInAdmin, sweep } from './helpers';

/**
 * Once after the smoke tests: removes every account of this run that is still there. Each test removes its own when it
 * ends, so normally there are none; a test that crashed or timed out in its clean-up leaves some, and they go here.
 * Playwright runs this even when global setup failed: it signs in only when global setup's sign-in went through.
 */
export default async function globalTeardown(): Promise<void> {
  if (NO_ACCOUNTS || process.env.SMOKE_ADMIN_OK !== '1') return;
  const req = await request.newContext();
  try {
    const me = await signInAdmin(req);
    try {
      const removed = await sweep(req, me, (a) => a.email.startsWith(RUN_PREFIX));
      if (removed.length) console.log(`Smoke: removed ${removed.length} account(s) this run left behind: ${removed.join(', ')}`);
    } finally {
      await call(req, 'POST', '/auth/sign-out');
    }
  } finally {
    await req.dispose();
  }
}
