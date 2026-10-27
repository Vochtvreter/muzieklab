import { Collection, ObjectId } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AccountExport, AuditListResponse, Me } from '../../../shared/api.js';
import {
  FEEDBACK_DESCRIPTION_MAX,
  FEEDBACK_NOTE_MAX,
  type FeedbackDetail,
  type FeedbackListResponse,
  type FeedbackMode,
  type FeedbackReport,
  type FeedbackSaved,
} from '../../../shared/feedback.js';
import { collections, type FeedbackDoc } from '../db.js';
import {
  PASSWORD,
  makeApp,
  seedAccount,
  signIn,
  signedInAdmin,
  startMongo,
  stopMongo,
  type Mongo,
  type TestApp,
} from '../test/helpers.js';
import { FEEDBACK_PER_HOUR } from './feedback.js';

let mongo: Mongo;
beforeAll(async () => {
  mongo = await startMongo();
});
afterAll(async () => {
  await stopMongo(mongo);
});
afterEach(() => {
  vi.restoreAllMocks();
});

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
    version: '0.17.0',
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
    prefs: { theme: 'system', instruments: { piano: { range: [48, 72] } } },
  },
};

/** Another report, about another screen and spot. */
const idea: FeedbackReport = {
  ...report,
  kind: 'idea',
  title: 'A darker accent',
  description: 'The accent could be a little darker.',
  target: { ...report.target, mode: 'area', label: 'heading “Settings”', selector: 'main h1' },
  context: { ...report.context, url: 'https://test.vivanova.app/#/settings', route: '/settings' },
};

const DETAIL = (id: string) => `/api/v1/admin/feedback/${id}`;

/** Lets teachers send reports (the built-in teacher role, as an admin would change it); returns a teacher signed in. */
async function reporter(t: TestApp, email: string, name: string) {
  await collections(t.db).roles.updateOne({ _id: 'teacher' }, { $addToSet: { permissions: 'feedback.give' } });
  const account = await seedAccount(t.db, { email, name, roles: ['teacher'] });
  return { account, cookie: await signIn(t, email) };
}

function send(t: TestApp, cookie: string | undefined, payload: object = report) {
  return t.call({ method: 'POST', url: '/api/v1/feedback', cookie, payload });
}

/** Sends a report and returns its id. */
async function sent(t: TestApp, cookie: string, payload: FeedbackReport = report): Promise<string> {
  const res = await send(t, cookie, payload);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<FeedbackSaved>().id;
}

function list(t: TestApp, cookie: string | undefined, query = '') {
  return t.call({ method: 'GET', url: `/api/v1/admin/feedback${query}`, cookie });
}

function patch(t: TestApp, cookie: string, id: string, payload: object) {
  return t.call({ method: 'PATCH', url: DETAIL(id), cookie, payload });
}

async function auditOf(t: TestApp, cookie: string) {
  return (await t.call({ method: 'GET', url: '/api/v1/admin/audit', cookie })).json<AuditListResponse>().entries;
}

describe('POST /feedback', () => {
  it('stores the report as sent, for review, and logs who sent it; nothing goes to GitHub', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const res = await send(t, admin.cookie);
    expect(res.statusCode).toBe(200);
    const { id } = res.json<FeedbackSaved>();
    expect(res.json()).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/) });

    expect(await collections(t.db).feedback.find().toArray()).toEqual([
      {
        _id: new ObjectId(id),
        ...report,
        status: 'new',
        authorId: admin.account._id,
        createdAt: t.clock.now(),
        note: '',
        reviewerId: null,
        reviewedAt: null,
      } satisfies FeedbackDoc,
    ]);
    const [entry] = await auditOf(t, admin.cookie);
    expect(entry).toMatchObject({
      action: 'feedback.send',
      actorId: admin.account._id.toHexString(),
      targetId: null,
      details: { report: id, kind: 'bug' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps no invite or new-password token from the address: whoever has one can claim the account', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const token = 'Ab3_x-'.repeat(7) + 'Z';
    for (const kind of ['invite', 'reset']) {
      const id = await sent(t, admin.cookie, { ...report, context: { ...report.context, url: `https://test.vivanova.app/#/${kind}/${token}`, route: `/${kind}/${token}` } });
      const res = await t.call({ method: 'GET', url: DETAIL(id), cookie: admin.cookie });
      expect(res.body).not.toContain(token);
      expect(res.json<FeedbackDetail>().report.context).toMatchObject({ url: `https://test.vivanova.app/#/${kind}/:token`, route: `/${kind}/:token` });
    }
    expect((await list(t, admin.cookie)).body).not.toContain(token);
  });

  it('shows none either from a report kept with its token, before the API left it out', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const token = 'Zq9-_x'.repeat(7) + 'A';
    const _id = new ObjectId();
    await collections(t.db).feedback.insertOne({
      _id,
      ...report,
      context: { ...report.context, url: `https://test.vivanova.app/#/reset/${token}`, route: `/reset/${token}` },
      status: 'new',
      authorId: admin.account._id,
      createdAt: t.clock.now(),
      note: '',
      reviewerId: null,
      reviewedAt: null,
    });
    const listed = await list(t, admin.cookie);
    expect(listed.body).not.toContain(token);
    expect(listed.json<FeedbackListResponse>().reports[0].route).toBe('/reset/:token');
    const detail = await t.call({ method: 'GET', url: DETAIL(_id.toHexString()), cookie: admin.cookie });
    expect(detail.body).not.toContain(token);
    expect(detail.json<FeedbackDetail>()).toMatchObject({ route: '/reset/:token', report: { context: { url: 'https://test.vivanova.app/#/reset/:token', route: '/reset/:token' } } });
    // Nor its author's download of their data.
    const own = await t.call({ method: 'GET', url: '/api/v1/me/export', cookie: admin.cookie });
    expect(own.statusCode).toBe(200);
    expect(own.body).not.toContain(token);
  });

  it('needs feedback.give: admins have it, and other roles once an admin gives it', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ted@example.com', roles: ['teacher'] });
    const cookie = await signIn(t, 'ted@example.com');
    expect((await send(t, cookie)).statusCode).toBe(403);
    await collections(t.db).roles.updateOne({ _id: 'teacher' }, { $push: { permissions: 'feedback.give' } });
    expect((await send(t, cookie)).statusCode).toBe(200);
    expect((await send(t, undefined)).statusCode).toBe(401);
    expect(await collections(t.db).feedback.countDocuments()).toBe(1);
  });

  it('refuses a report that is empty, not in the shape the app sends, or has settings MongoDB would read as operators', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const prefs = (value: unknown) => ({ ...report, context: { ...report.context, prefs: value } });
    for (const payload of [
      { ...report, description: '   ' },
      // Longer than the app's field lets anyone type.
      { ...report, description: 'x'.repeat(FEEDBACK_DESCRIPTION_MAX + 1) },
      { ...report, kind: 'rant' },
      { ...report, labels: ['status:approved'] },
      { ...report, status: 'accepted' },
      { ...report, target: { ...report.target, html: 'x'.repeat(5000) } },
      prefs(null),
      prefs({ $where: 'sleep(1000)' }),
      prefs({ theme: 'dark', instruments: { piano: { $set: { x: 1 } } } }),
      prefs({ lists: [{ ok: 1 }, { $gt: 1 }] }),
      prefs({ 'a\0b': 1 }),
    ]) {
      const res = await send(t, admin.cookie, payload);
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'bad_request' });
    }
    expect(await collections(t.db).feedback.countDocuments()).toBe(0);
    // Dots and dollars inside keys and values are only text.
    expect((await send(t, admin.cookie, prefs({ 'a.b': '$1', price$: 2 }))).statusCode).toBe(200);
    expect((await send(t, admin.cookie, { ...report, description: 'x'.repeat(FEEDBACK_DESCRIPTION_MAX) })).statusCode).toBe(200);
  });

  it(`takes at most ${FEEDBACK_PER_HOUR} reports an hour from one account`, async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    let cookie = admin.cookie;
    for (let i = 0; i < FEEDBACK_PER_HOUR; i++) expect((await send(t, cookie)).statusCode).toBe(200);
    const res = await send(t, cookie);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: 'too_many_attempts' });
    expect(res.json<{ retryAfter: number }>().retryAfter).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBe(String(res.json<{ retryAfter: number }>().retryAfter));
    expect(await collections(t.db).feedback.countDocuments()).toBe(FEEDBACK_PER_HOUR);
    // Another account is not held up.
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    expect((await send(t, ted.cookie)).statusCode).toBe(200);
    t.clock.advance(60 * 60_000 + 1);
    // An hour on, the session's short-lived cookie has ended (the app renews it); sign in again.
    cookie = await signIn(t, 'admin@example.com');
    expect((await send(t, cookie)).statusCode).toBe(200);
  });

  it('counts reports sent at the same time, so they cannot get past the limit together', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const answers = await Promise.all(Array.from({ length: FEEDBACK_PER_HOUR + 5 }, () => send(t, admin.cookie)));
    const codes = answers.map((res) => res.statusCode);
    expect(codes.filter((code) => code === 200)).toHaveLength(FEEDBACK_PER_HOUR);
    expect(codes.filter((code) => code === 429)).toHaveLength(5);
    expect(await collections(t.db).feedback.countDocuments()).toBe(FEEDBACK_PER_HOUR);
    // And the next one, on its own, waits too.
    expect((await send(t, admin.cookie)).statusCode).toBe(429);
  });

  it('does not count a report that could not be stored', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    for (let i = 0; i < FEEDBACK_PER_HOUR - 1; i++) expect((await send(t, admin.cookie)).statusCode).toBe(200);
    vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new Error('MongoDB is down'));
    expect((await send(t, admin.cookie)).statusCode).toBe(500);
    expect((await send(t, admin.cookie)).statusCode).toBe(200);
    expect((await send(t, admin.cookie)).statusCode).toBe(429);
    expect(await collections(t.db).feedback.countDocuments()).toBe(FEEDBACK_PER_HOUR);
  });
});

describe('who may review', () => {
  it('needs feedback.review to list, read, change and delete reports; sending is not enough', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    const id = await sent(t, ted.cookie);
    const tries = (cookie: string | undefined) => [
      list(t, cookie),
      t.call({ method: 'GET', url: DETAIL(id), cookie }),
      t.call({ method: 'PATCH', url: DETAIL(id), cookie, payload: { status: 'accepted' } }),
      t.call({ method: 'DELETE', url: DETAIL(id), cookie }),
    ];
    for (const res of await Promise.all(tries(ted.cookie))) expect(res.statusCode).toBe(403);
    for (const res of await Promise.all(tries(undefined))) expect(res.statusCode).toBe(401);
    expect(await collections(t.db).feedback.findOne({}, { projection: { status: 1 } })).toMatchObject({ status: 'new' });

    // Given to teachers through their stored role (Settings → Roles), it works for them at once.
    await collections(t.db).roles.updateOne({ _id: 'teacher' }, { $addToSet: { permissions: 'feedback.review' } });
    expect((await list(t, ted.cookie)).statusCode).toBe(200);
    expect((await t.call({ method: 'GET', url: DETAIL(id), cookie: ted.cookie })).statusCode).toBe(200);
    expect((await patch(t, ted.cookie, id, { status: 'declined' })).json<FeedbackDetail>()).toMatchObject({
      status: 'declined',
      reviewer: { id: ted.account._id.toHexString(), name: 'Ted' },
    });
    expect((await t.call({ method: 'DELETE', url: DETAIL(id), cookie: ted.cookie })).statusCode).toBe(204);
    // Admins have it without being given it.
    expect((await list(t, admin.cookie)).statusCode).toBe(200);
  });
});

describe('GET /admin/feedback', () => {
  it('lists reports newest first, with their authors, and counts every status', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ted = await reporter(t, 'ted@example.com', 'Ted Smit');
    const first = await sent(t, ted.cookie);
    t.clock.advance(1000);
    const second = await sent(t, admin.cookie, idea);
    // The same moment: the newer id comes first.
    const third = await sent(t, ted.cookie);

    const res = await list(t, admin.cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json<FeedbackListResponse>();
    expect(body.reports.map((r) => r.id)).toEqual([third, second, first]);
    expect(body.counts).toEqual({ new: 3, accepted: 0, declined: 0 });
    expect(body.reports[1]).toEqual({
      id: second,
      kind: 'idea',
      title: 'A darker accent',
      description: 'The accent could be a little darker.',
      route: '/settings',
      label: 'heading “Settings”',
      mode: 'area',
      status: 'new',
      author: { id: admin.account._id.toHexString(), name: 'Admin' },
      createdAt: t.clock.now().toISOString(),
    });
    expect(body.reports[0]).toMatchObject({ title: '', route: '/', mode: 'element', author: { name: 'Ted Smit' } });
    // A list row holds no markup or settings: the report itself is one GET away.
    expect(res.body).not.toContain('start-btn');
    expect(res.body).not.toContain('instruments');
  });

  it('shows one status at a time, and the counts stay those of every report', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await sent(t, admin.cookie));
    await patch(t, admin.cookie, ids[0], { status: 'accepted' });
    await patch(t, admin.cookie, ids[1], { status: 'declined' });
    await patch(t, admin.cookie, ids[2], { status: 'declined' });

    const counts = { new: 1, accepted: 1, declined: 2 };
    const only = async (status: string) => {
      const body = (await list(t, admin.cookie, `?status=${status}`)).json<FeedbackListResponse>();
      expect(body.counts).toEqual(counts);
      return body.reports.map((r) => [r.id, r.status]);
    };
    expect(await only('new')).toEqual([[ids[3], 'new']]);
    expect(await only('accepted')).toEqual([[ids[0], 'accepted']]);
    expect(await only('declined')).toEqual([
      [ids[2], 'declined'],
      [ids[1], 'declined'],
    ]);
    expect((await list(t, admin.cookie)).json<FeedbackListResponse>().reports).toHaveLength(4);
    for (const query of ['?status=triage', '?status=', '?status=new&status=accepted', '?q=x']) {
      expect((await list(t, admin.cookie, query)).statusCode, query).toBe(400);
    }
    // No reports at all: every count is there, as 0.
    const empty = await makeApp(mongo);
    const other = await signedInAdmin(empty);
    expect((await list(empty, other.cookie)).json()).toEqual({ reports: [], counts: { new: 0, accepted: 0, declined: 0 } });
  });

  it('shows at most 500, the newest', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const start = t.clock.ms;
    await collections(t.db).feedback.insertMany(
      Array.from({ length: 501 }, (_, i) => ({
        _id: new ObjectId(),
        ...report,
        status: 'new' as const,
        authorId: admin.account._id,
        createdAt: new Date(start - i * 1000),
        note: '',
        reviewerId: null,
        reviewedAt: null,
      })),
    );
    const body = (await list(t, admin.cookie)).json<FeedbackListResponse>();
    expect(body.reports).toHaveLength(500);
    expect(body.reports[0].createdAt).toBe(new Date(start).toISOString());
    expect(body.reports[499].createdAt).toBe(new Date(start - 499_000).toISOString());
    expect(body.counts.new).toBe(501);
  });
});

describe('GET /admin/feedback/:id', () => {
  it('is the report as sent, with the review', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    const id = await sent(t, ted.cookie);
    const res = await t.call({ method: 'GET', url: DETAIL(id), cookie: admin.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json<FeedbackDetail>()).toEqual({
      id,
      kind: 'bug',
      title: '',
      description: report.description,
      route: '/',
      label: 'button “Start lesson”',
      mode: 'element',
      status: 'new',
      author: { id: ted.account._id.toHexString(), name: 'Ted' },
      createdAt: t.clock.now().toISOString(),
      report,
      note: '',
      reviewer: null,
      reviewedAt: null,
    });
  });

  it('answers 404 for an id that is not one, or a report that is not there', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    for (const id of ['nope', new ObjectId().toHexString(), 'f'.repeat(64)]) {
      for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
        const res = await t.call({ method, url: DETAIL(id), cookie: admin.cookie, ...(method === 'PATCH' ? { payload: { note: 'x' } } : {}) });
        expect(res.statusCode, `${method} ${id}`).toBe(404);
        expect(res.json()).toMatchObject({ error: 'not_found' });
      }
    }
    expect((await t.call({ method: 'GET', url: DETAIL('f'.repeat(65)), cookie: admin.cookie })).statusCode).toBe(400);
  });
});

describe('PATCH /admin/feedback/:id', () => {
  it('accepts or declines a report, and says who did, and when', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const id = await sent(t, admin.cookie);
    t.clock.advance(60_000);
    const res = await patch(t, admin.cookie, id, { status: 'accepted' });
    expect(res.statusCode).toBe(200);
    expect(res.json<FeedbackDetail>()).toMatchObject({
      id,
      status: 'accepted',
      note: '',
      reviewer: { id: admin.account._id.toHexString(), name: 'Admin' },
      reviewedAt: t.clock.now().toISOString(),
      report,
    });
    const [entry] = await auditOf(t, admin.cookie);
    expect(entry).toMatchObject({ action: 'feedback.review', actorId: admin.account._id.toHexString(), targetId: null });
    expect(entry.details).toEqual({ report: id, status: 'accepted' });

    // Another admin changes it back: the review is theirs now.
    const ann = await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann', roles: ['admin'] });
    const annCookie = await signIn(t, 'ann@example.com');
    t.clock.advance(60_000);
    expect((await patch(t, annCookie, id, { status: 'new' })).json<FeedbackDetail>()).toMatchObject({
      status: 'new',
      reviewer: { id: ann._id.toHexString(), name: 'Ann' },
      reviewedAt: t.clock.now().toISOString(),
    });
  });

  it('keeps a note for the team, trimmed, with its line breaks, and logs that it changed but not what it says', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const id = await sent(t, admin.cookie);
    const res = await patch(t, admin.cookie, id, { note: '  Seen on iPad too.\r\nNeeds the 0.17 build.  ' });
    expect(res.statusCode).toBe(200);
    expect(res.json<FeedbackDetail>()).toMatchObject({ status: 'new', note: 'Seen on iPad too.\nNeeds the 0.17 build.', reviewer: { name: 'Admin' } });
    let [entry] = await auditOf(t, admin.cookie);
    expect(entry.details).toEqual({ report: id, note: true });
    expect(JSON.stringify(await auditOf(t, admin.cookie))).not.toContain('iPad');

    // Both at once.
    expect((await patch(t, admin.cookie, id, { status: 'declined', note: 'Duplicate of #12' })).json()).toMatchObject({
      status: 'declined',
      note: 'Duplicate of #12',
    });
    [entry] = await auditOf(t, admin.cookie);
    expect(entry.details).toEqual({ report: id, status: 'declined', note: true });

    // '' clears it; 2000 characters are taken, counted as people count them (2000 emoji are 4000 UTF-16 units).
    expect((await patch(t, admin.cookie, id, { note: '   ' })).json()).toMatchObject({ note: '' });
    const long = '🎵'.repeat(FEEDBACK_NOTE_MAX);
    expect((await patch(t, admin.cookie, id, { note: long })).json()).toMatchObject({ note: long });
  });

  it('changes nothing when nothing changes: no write, no audit entry, the review stays as it was', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const id = await sent(t, admin.cookie);
    await patch(t, admin.cookie, id, { status: 'accepted', note: 'Yes' });
    const reviewedAt = t.clock.now().toISOString();
    const entries = (await auditOf(t, admin.cookie)).length;
    await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann', roles: ['admin'] });
    const annCookie = await signIn(t, 'ann@example.com');
    t.clock.advance(60_000);
    for (const payload of [{}, { status: 'accepted' }, { note: ' Yes ' }, { status: 'accepted', note: 'Yes' }]) {
      const res = await patch(t, annCookie, id, payload);
      expect(res.statusCode).toBe(200);
      expect(res.json<FeedbackDetail>()).toMatchObject({ status: 'accepted', note: 'Yes', reviewer: { name: 'Admin' }, reviewedAt });
    }
    expect(await auditOf(t, admin.cookie)).toHaveLength(entries);
  });

  it('refuses a note that is too long or has control characters, and fields it does not take', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const id = await sent(t, admin.cookie);
    for (const payload of [
      { note: 'x'.repeat(FEEDBACK_NOTE_MAX + 1) },
      { note: 'a\u0007b' },
      { note: 'a\tb' },
      { note: 'a\u0000b' },
      { note: 7 },
      { status: 'triage' },
      { status: null },
      { title: 'Better title' },
      { reviewerId: admin.account._id.toHexString() },
    ]) {
      const res = await patch(t, admin.cookie, id, payload);
      expect(res.statusCode, JSON.stringify(payload).slice(0, 60)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'bad_request' });
    }
    expect((await t.call({ method: 'GET', url: DETAIL(id), cookie: admin.cookie })).json()).toMatchObject({
      status: 'new',
      note: '',
      reviewer: null,
      reviewedAt: null,
    });
    expect((await auditOf(t, admin.cookie)).filter((e) => e.action === 'feedback.review')).toEqual([]);
  });
});

describe('DELETE /admin/feedback/:id', () => {
  it('deletes the report, and logs it', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const id = await sent(t, admin.cookie);
    const keep = await sent(t, admin.cookie, idea);
    const res = await t.call({ method: 'DELETE', url: DETAIL(id), cookie: admin.cookie });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect((await t.call({ method: 'GET', url: DETAIL(id), cookie: admin.cookie })).statusCode).toBe(404);
    expect((await t.call({ method: 'DELETE', url: DETAIL(id), cookie: admin.cookie })).statusCode).toBe(404);
    expect((await list(t, admin.cookie)).json<FeedbackListResponse>()).toMatchObject({
      reports: [{ id: keep }],
      counts: { new: 1, accepted: 0, declined: 0 },
    });
    const [entry] = await auditOf(t, admin.cookie);
    expect(entry).toMatchObject({ action: 'feedback.delete', actorId: admin.account._id.toHexString(), targetId: null, details: { report: id } });
  });
});

describe('PUT /admin/feedback-mode', () => {
  const mode = (t: TestApp, cookie: string | undefined, payload: object) => t.call({ method: 'PUT', url: '/api/v1/admin/feedback-mode', cookie, payload });
  const modeOf = async (t: TestApp, cookie: string) => (await t.call({ method: 'GET', url: '/api/v1/me', cookie })).json<Me>().feedbackMode;

  it('is off until an admin turns it on, for everyone, and back off; each change is logged once', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    expect(await modeOf(t, ted.cookie)).toBe(false);
    expect(await modeOf(t, admin.cookie)).toBe(false);

    const on = await mode(t, admin.cookie, { on: true });
    expect(on.statusCode).toBe(200);
    expect(on.json<FeedbackMode>()).toEqual({ on: true });
    // Every account's Me says so, also the ones that only send.
    expect(await modeOf(t, ted.cookie)).toBe(true);
    expect(await modeOf(t, admin.cookie)).toBe(true);
    // On again changes nothing.
    expect((await mode(t, admin.cookie, { on: true })).json<FeedbackMode>()).toEqual({ on: true });

    t.clock.advance(1000);
    expect((await mode(t, admin.cookie, { on: false })).json<FeedbackMode>()).toEqual({ on: false });
    expect(await modeOf(t, ted.cookie)).toBe(false);
    expect(await collections(t.db).settings.findOne({ _id: 'app' })).toMatchObject({ feedbackMode: false, updatedAt: t.clock.now() });

    const entries = (await auditOf(t, admin.cookie)).filter((e) => e.action === 'feedback.mode');
    expect(entries.map((e) => [e.actorId, e.details])).toEqual([
      [admin.account._id.toHexString(), { on: false }],
      [admin.account._id.toHexString(), { on: true }],
    ]);
  });

  it('needs feedback.review, and takes only { on }', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    expect((await mode(t, ted.cookie, { on: true })).statusCode).toBe(403);
    expect((await mode(t, undefined, { on: true })).statusCode).toBe(401);
    for (const payload of [{}, { on: 'yes' }, { on: true, everyone: true }]) {
      expect((await mode(t, admin.cookie, payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await modeOf(t, admin.cookie)).toBe(false);
    await collections(t.db).roles.updateOne({ _id: 'teacher' }, { $addToSet: { permissions: 'feedback.review' } });
    expect((await mode(t, ted.cookie, { on: true })).statusCode).toBe(200);
    expect(await modeOf(t, admin.cookie)).toBe(true);
  });
});

describe('reports when an account is deleted', () => {
  /** Ted sends one report and Ann (an admin) one; each reviews the other's. */
  async function setUp() {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    // Teachers send and review here.
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    await collections(t.db).roles.updateOne({ _id: 'teacher' }, { $addToSet: { permissions: 'feedback.review' } });
    const ann = await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann', roles: ['admin'] });
    const annCookie = await signIn(t, 'ann@example.com');
    const teds = await sent(t, ted.cookie);
    const anns = await sent(t, annCookie, idea);
    expect((await patch(t, ted.cookie, anns, { status: 'accepted' })).statusCode).toBe(200);
    expect((await patch(t, annCookie, teds, { note: 'Checked' })).statusCode).toBe(200);
    const reviewedAt = t.clock.now().toISOString();
    const get = async (id: string) => (await t.call({ method: 'GET', url: DETAIL(id), cookie: admin.cookie })).json<FeedbackDetail>();
    const deleteSelf = (cookie: string, removeData?: boolean) =>
      t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: PASSWORD, ...(removeData === undefined ? {} : { removeData }) } });
    return { t, admin, ted, ann, annCookie, teds, anns, reviewedAt, get, deleteSelf };
  }

  for (const [removeData, how] of [
    [true, 'with all of its data'],
    [false, 'keeping an anonymous copy'],
    [undefined, 'from an app before 0.16.0, which does not say (everything goes)'],
  ] as const) {
    it(`deletes them with an account its owner deletes, ${how}`, async () => {
      const { t, admin, teds, anns, reviewedAt, get, ted, deleteSelf } = await setUp();
      expect((await deleteSelf(ted.cookie, removeData)).statusCode).toBe(204);
      expect((await t.call({ method: 'GET', url: DETAIL(teds), cookie: admin.cookie })).statusCode).toBe(404);
      expect(await collections(t.db).feedback.countDocuments({ $or: [{ _id: new ObjectId(teds) }, { authorId: ted.account._id }] })).toBe(0);
      expect((await list(t, admin.cookie)).json<FeedbackListResponse>().reports.map((r) => r.id)).toEqual([anns]);
      // The report Ted reviewed stays, with the review but without the reviewer.
      expect(await get(anns)).toMatchObject({ status: 'accepted', author: { name: 'Ann' }, reviewer: null, reviewedAt });
      expect(await collections(t.db).feedback.countDocuments({ reviewerId: ted.account._id })).toBe(0);
    });
  }

  it('leaves the same trace whether or not an anonymous copy is kept, so the log and the reports do not say which', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    const kim = await reporter(t, 'kim@example.com', 'Kim');
    const teds = await sent(t, ted.cookie);
    const kims = await sent(t, kim.cookie);
    await patch(t, admin.cookie, teds, { status: 'accepted', note: 'Yes' });
    await patch(t, admin.cookie, kims, { status: 'accepted', note: 'Yes' });
    const deleteSelf = (cookie: string, removeData: boolean) =>
      t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: PASSWORD, removeData } });
    expect((await deleteSelf(ted.cookie, true)).statusCode).toBe(204);
    expect((await deleteSelf(kim.cookie, false)).statusCode).toBe(204);

    const entries = await auditOf(t, admin.cookie);
    /** What an admin can see of an account and its report, with their ids made the same. */
    const trace = async (account: ObjectId, report: string) => ({
      report: (await t.call({ method: 'GET', url: DETAIL(report), cookie: admin.cookie })).statusCode,
      log: entries
        .filter((e) => e.actorId === account.toHexString() || e.targetId === account.toHexString() || e.details.report === report)
        .map(({ action, actorId, targetId, details }) =>
          JSON.parse(JSON.stringify({ action, actorId, targetId, details }).replaceAll(account.toHexString(), 'ACCOUNT').replaceAll(report, 'REPORT')),
        ),
    });
    const traced = await trace(ted.account._id, teds);
    expect(traced.report).toBe(404);
    expect(traced.log.map((e: { action: string }) => e.action)).toEqual(['account.delete_self', 'feedback.review', 'feedback.send']);
    expect(await trace(kim.account._id, kims)).toEqual(traced);
    expect(await collections(t.db).feedback.countDocuments()).toBe(0);
  });

  it('keeps them without the author or reviewer when an admin deletes the account', async () => {
    const { t, admin, ann, teds, anns, reviewedAt, get } = await setUp();
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${ann._id}`, cookie: admin.cookie })).statusCode).toBe(204);
    expect(await get(anns)).toMatchObject({ author: null, status: 'accepted', reviewer: { name: 'Ted' } });
    expect(await get(teds)).toMatchObject({ author: { name: 'Ted' }, note: 'Checked', reviewer: null, reviewedAt });
    expect(await collections(t.db).feedback.countDocuments({ $or: [{ authorId: ann._id }, { reviewerId: ann._id }] })).toBe(0);
  });

  it('shows no author for one whose account is gone some other way', async () => {
    const { t, admin, ted, teds, get } = await setUp();
    await collections(t.db).accounts.deleteOne({ _id: ted.account._id });
    expect(await get(teds)).toMatchObject({ author: null });
    const row = (await list(t, admin.cookie)).json<FeedbackListResponse>().reports.find((r) => r.id === teds);
    expect(row?.author).toBeNull();
  });
});

describe('GET /me/export', () => {
  it('holds the reports the account sent, newest first, with their status, but not the note or the reviewer', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ted = await reporter(t, 'ted@example.com', 'Ted');
    const first = await sent(t, ted.cookie);
    const firstAt = t.clock.now().toISOString();
    t.clock.advance(1000);
    const second = await sent(t, ted.cookie, idea);
    await sent(t, admin.cookie);
    await patch(t, admin.cookie, first, { status: 'declined', note: 'Works as meant' });

    const res = await t.call({ method: 'GET', url: '/api/v1/me/export', cookie: ted.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json<AccountExport>().feedback).toEqual([
      { id: second, createdAt: t.clock.now().toISOString(), status: 'new', report: idea },
      { id: first, createdAt: firstAt, status: 'declined', report },
    ]);
    expect(res.body).not.toContain('Works as meant');
    expect(res.body).not.toContain(admin.account._id.toHexString());
  });
});
