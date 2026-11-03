import { request, type FullConfig } from '@playwright/test';
import type { Health } from '../../shared/api';
import { call, NO_ACCOUNTS, send, SITE, signInAdmin, sweep, TRACING, tracingOn } from './helpers';

/** Accounts of runs older than this are leftovers: a run takes minutes, so a younger one may still be running. */
const LEFTOVER_AFTER_MS = 2 * 60 * 60_000;

/**
 * Once before the smoke tests (playwright.smoke.config.ts): when they will sign in, checks that the API answers with
 * its database and that the admin account signs in and is an admin, and removes smoke accounts that runs which
 * crashed left behind. One failure here stops the run, and global teardown, which Playwright runs even then, signs in
 * only after this one did (SMOKE_ADMIN_OK): a wrong password is tried once a run.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  delete process.env.SMOKE_ADMIN_OK;
  if (NO_ACCOUNTS) {
    console.log(`Smoke tests of ${SITE}: ${NO_ACCOUNTS}.`);
    return;
  }
  // The workers read it (they inherit this process's environment) and skip the tests that sign in.
  if (config.projects.some((p) => tracingOn(p.use.trace))) {
    process.env.SMOKE_TRACING = '1';
    console.log(`Smoke tests of ${SITE}: ${TRACING}.`);
    return;
  }
  const req = await request.newContext();
  try {
    const health = await send(req, 'GET', '/health');
    const body = health.ok() ? ((await health.json()) as Health) : null;
    if (body?.status !== 'ok' || body.db !== 'ok') throw new Error(`${SITE}api/v1/health is not ok (${health.status()}): the tests that sign in need the API and its database`);

    const me = await signInAdmin(req);
    process.env.SMOKE_ADMIN_OK = '1';
    try {
      const old = Date.now() - LEFTOVER_AFTER_MS;
      const removed = await sweep(req, me, (a) => Date.parse(a.createdAt) < old);
      if (removed.length) console.log(`Smoke: removed ${removed.length} account(s) that earlier runs left behind: ${removed.join(', ')}`);
    } finally {
      await call(req, 'POST', '/auth/sign-out');
    }
  } finally {
    await req.dispose();
  }
}
