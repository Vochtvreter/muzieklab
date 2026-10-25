import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuditListResponse, FeedbackSent } from '../../../shared/api.js';
import { parseIssueBody, REPORT_MARKER, type FeedbackReport } from '../../../shared/feedback.js';
import { collections } from '../db.js';
import { makeApp, seedAccount, signIn, signedInAdmin, startMongo, stopMongo, type Mongo } from '../test/helpers.js';
import { FEEDBACK_PER_HOUR } from './feedback.js';

let mongo: Mongo;
beforeAll(async () => {
  mongo = await startMongo();
});
afterAll(async () => {
  await stopMongo(mongo);
});

const GITHUB = { token: 'github_pat_server', repo: 'Vochtvreter/muzieklab' };

const report: FeedbackReport = {
  kind: 'bug',
  title: '',
  description: 'Start lesson does nothing on the first tap.',
  target: {
    mode: 'element',
    selector: 'main > button.start-btn',
    label: 'button “Start lesson”',
    text: 'Start lesson',
    html: '<button class="btn start-btn">Start lesson</button>',
    rect: { x: 10, y: 20, width: 300, height: 54 },
    scroll: { x: 0, y: 0 },
  },
  context: {
    version: '0.14.0',
    url: 'https://test.vivanova.app/#/',
    route: '/',
    viewport: { width: 390, height: 844, dpr: 3 },
    breakpoint: 'phone',
    orientation: 'portrait',
    pointer: 'coarse',
    theme: { setting: 'system', shown: 'light' },
    locale: 'en',
    userAgent: 'test',
    at: '2026-10-25T10:00:00.000Z',
    prefs: { theme: 'system' },
  },
};

/** GitHub as far as these tests need it: it opens issue 42, and keeps what it was sent. */
function github(status = 201) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/Vochtvreter/muzieklab/issues/42' }), { status }),
  );
}

describe('POST /feedback', () => {
  it('opens the issue with the server’s token, built by the server, and logs who sent it', async () => {
    const fetch = github();
    const t = await makeApp(mongo, { github: GITHUB, fetch: fetch as unknown as typeof globalThis.fetch });
    const admin = await signedInAdmin(t);
    const res = await t.call({ method: 'POST', url: '/api/v1/feedback', cookie: admin.cookie, payload: report });
    expect(res.statusCode).toBe(200);
    expect(res.json<FeedbackSent>()).toEqual({ number: 42, url: 'https://github.com/Vochtvreter/muzieklab/issues/42' });

    const [target, init] = fetch.mock.calls[0];
    expect(target).toBe('https://api.github.com/repos/Vochtvreter/muzieklab/issues');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer github_pat_server');
    const sent = JSON.parse(init!.body as string) as { title: string; body: string; labels: string[] };
    expect(sent.title).toBe('Bug: button “Start lesson” on /');
    expect(sent.labels).toEqual(['feedback', 'type:bug', 'status:triage']);
    expect(sent.body).toContain(`<!-- ${REPORT_MARKER} -->`);
    expect(parseIssueBody(sent.body)).toMatchObject({ kind: 'bug', context: { route: '/' } });
    // The repository is public: the issue does not name the account.
    expect(sent.body).not.toContain('admin@example.com');
    expect(sent.body).not.toContain('Admin');

    const audit = (await t.call({ method: 'GET', url: '/api/v1/admin/audit', cookie: admin.cookie })).json<AuditListResponse>();
    expect(audit.entries[0]).toMatchObject({ action: 'feedback.send', actorId: admin.account._id.toHexString(), details: { issue: 42, kind: 'bug' } });
  });

  it('needs feedback.give: admins have it, and other roles once an admin gives it', async () => {
    const t = await makeApp(mongo, { github: GITHUB, fetch: github() as unknown as typeof fetch });
    await seedAccount(t.db, { email: 'ted@example.com', roles: ['teacher'] });
    const cookie = await signIn(t, 'ted@example.com');
    expect((await t.call({ method: 'POST', url: '/api/v1/feedback', cookie, payload: report })).statusCode).toBe(403);
    await collections(t.db).roles.updateOne({ _id: 'teacher' }, { $push: { permissions: 'feedback.give' } });
    expect((await t.call({ method: 'POST', url: '/api/v1/feedback', cookie, payload: report })).statusCode).toBe(200);
    expect((await t.call({ method: 'POST', url: '/api/v1/feedback', payload: report })).statusCode).toBe(401);
  });

  it('answers 503 without a token, and 502 when GitHub refuses or does not answer', async () => {
    const off = await makeApp(mongo);
    const a = await signedInAdmin(off);
    const res = await off.call({ method: 'POST', url: '/api/v1/feedback', cookie: a.cookie, payload: report });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'feedback_unavailable' });

    for (const fetch of [github(401), vi.fn(() => Promise.reject(new TypeError('fetch failed')))]) {
      const t = await makeApp(mongo, { github: GITHUB, fetch: fetch as unknown as typeof globalThis.fetch });
      const admin = await signedInAdmin(t);
      const failed = await t.call({ method: 'POST', url: '/api/v1/feedback', cookie: admin.cookie, payload: report });
      expect(failed.statusCode).toBe(502);
      expect(failed.json()).toMatchObject({ error: 'feedback_failed' });
    }
  });

  it('refuses a report that is empty or not in the shape the app sends', async () => {
    const t = await makeApp(mongo, { github: GITHUB, fetch: github() as unknown as typeof fetch });
    const admin = await signedInAdmin(t);
    for (const payload of [
      { ...report, description: '   ' },
      { ...report, kind: 'rant' },
      { ...report, labels: ['status:approved'] },
      { ...report, target: { ...report.target, html: 'x'.repeat(5000) } },
    ]) {
      expect((await t.call({ method: 'POST', url: '/api/v1/feedback', cookie: admin.cookie, payload })).statusCode).toBe(400);
    }
  });

  it(`takes at most ${FEEDBACK_PER_HOUR} reports an hour from one account`, async () => {
    const t = await makeApp(mongo, { github: GITHUB, fetch: github() as unknown as typeof fetch });
    const admin = await signedInAdmin(t);
    let cookie = admin.cookie;
    const send = () => t.call({ method: 'POST', url: '/api/v1/feedback', cookie, payload: report });
    for (let i = 0; i < FEEDBACK_PER_HOUR; i++) expect((await send()).statusCode).toBe(200);
    const res = await send();
    expect(res.statusCode).toBe(429);
    expect(res.json<{ retryAfter: number }>().retryAfter).toBeGreaterThan(0);
    t.clock.advance(60 * 60_000 + 1);
    // An hour on, the session's short-lived cookie has ended (the app renews it); sign in again.
    cookie = await signIn(t, 'admin@example.com');
    expect((await send()).statusCode).toBe(200);
  });
});
