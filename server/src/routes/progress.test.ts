import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountExport, SavedProgress } from '../../../shared/api.js';
import { collections } from '../db.js';
import { PASSWORD, makeApp, seedAccount, signIn, signedInAdmin, startMongo, stopMongo, type Mongo, type TestApp } from '../test/helpers.js';
import { storableProblem } from './progress.js';

let mongo: Mongo;
beforeAll(async () => {
  mongo = await startMongo();
});
afterAll(async () => {
  await stopMongo(mongo);
});

const URL = '/api/v1/progress';

async function annSignedIn(t: TestApp) {
  const account = await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann' });
  return { account, cookie: await signIn(t, 'ann@example.com') };
}

/** Progress as the app saves it: lesson ids hold a dot, which MongoDB keeps as a key. */
const PROGRESS = { lessons: { '7.3': { stars: 3, bestAccuracy: 94 } }, xp: 1840, practiceDays: ['2026-10-23'], learnRead: ['8.2'] };
const PREFS = { theme: 'dark', noteNames: 'solfege' };

describe('GET /progress', () => {
  it('needs a session', async () => {
    const t = await makeApp(mongo);
    const res = await t.call({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('is rev 0 with no data before the first save', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'GET', url: URL, cookie });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json<SavedProgress>()).toEqual({ rev: 0, data: null, resetAt: null, updatedAt: null });
  });
});

describe('PUT /progress', () => {
  it('saves the first copy as rev 1, and each next one with the rev it was made from', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    const first = await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 0, prefs: PREFS, progress: PROGRESS } });
    expect(first.statusCode).toBe(200);
    expect(first.json<SavedProgress>()).toEqual({
      rev: 1,
      data: { prefs: PREFS, progress: PROGRESS },
      resetAt: null,
      updatedAt: t.clock.now().toISOString(),
    });

    t.clock.advance(60_000);
    const more = { ...PROGRESS, xp: 1900 };
    const second = await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 1, prefs: PREFS, progress: more } });
    expect(second.json<SavedProgress>()).toMatchObject({ rev: 2, data: { progress: more }, updatedAt: t.clock.now().toISOString() });

    const back = await t.call({ method: 'GET', url: URL, cookie });
    expect(back.json<SavedProgress>()).toMatchObject({ rev: 2, data: { prefs: PREFS, progress: more } });
    const stored = await collections(t.db).progress.findOne({ _id: account._id });
    expect(stored).toMatchObject({ schema: 1, rev: 2, progress: { lessons: { '7.3': { stars: 3 } } } });
  });

  it('refuses a save from an older copy with 409 and the account copy, so the app can merge', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 0, prefs: PREFS, progress: PROGRESS } });
    // Another device, which saw nothing yet, and one that saw rev 1 after the account moved on to rev 2.
    const late = await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 0, prefs: {}, progress: { xp: 5 } } });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({
      error: 'rev_conflict',
      message: expect.any(String),
      current: { rev: 1, data: { prefs: PREFS, progress: PROGRESS }, resetAt: null, updatedAt: expect.any(String) },
    });
    await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 1, prefs: PREFS, progress: { ...PROGRESS, xp: 2000 } } });
    const old = await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 1, prefs: PREFS, progress: PROGRESS } });
    expect(old.statusCode).toBe(409);
    expect(old.json().current).toMatchObject({ rev: 2, data: { progress: { xp: 2000 } } });
    // A rev the account never had (ahead of it) is a conflict too, never a save.
    const ahead = await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 9, prefs: PREFS, progress: PROGRESS } });
    expect(ahead.statusCode).toBe(409);
  });

  it('lets one of two saves from the same rev through', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 0, prefs: PREFS, progress: PROGRESS } });
    const both = await Promise.all(
      [1, 2].map((xp) => t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 1, prefs: PREFS, progress: { xp } } })),
    );
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await collections(t.db).progress.findOne()).toMatchObject({ rev: 2 });
  });

  it('keeps the first of two first saves sent at once', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const both = await Promise.all(
      [1, 2].map((xp) => t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 0, prefs: {}, progress: { xp } } })),
    );
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await collections(t.db).progress.countDocuments()).toBe(1);
  });

  it('refuses a body that is not the contract, keys MongoDB would read as operators, and a document too big', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const bad = [
      { prefs: {}, progress: {} },
      { rev: -1, prefs: {}, progress: {} },
      { rev: 1.5, prefs: {}, progress: {} },
      { rev: '1', prefs: {}, progress: {} },
      { rev: 0, prefs: [], progress: {} },
      { rev: 0, prefs: {}, progress: null },
      { rev: 0, prefs: {}, progress: {}, extra: true },
      { rev: 0, prefs: {}, progress: { lessons: { $where: 1 } } },
      { rev: 0, prefs: { list: [{ $set: 1 }] }, progress: {} },
      { rev: 0, prefs: {}, progress: { big: 'x'.repeat(210 * 1024) } },
    ];
    for (const payload of bad) {
      const res = await t.call({ method: 'PUT', url: URL, cookie, payload });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'bad_request' });
    }
    expect(await collections(t.db).progress.countDocuments()).toBe(0);
  });

  it('needs the Origin of the site, like every change', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'PUT', url: URL, cookie, headers: { origin: 'https://evil.example' }, payload: { rev: 0, prefs: {}, progress: {} } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'bad_origin' });
  });

  it('keeps each account to its own copy', async () => {
    const t = await makeApp(mongo);
    const ann = await annSignedIn(t);
    await seedAccount(t.db, { email: 'bob@example.com' });
    const bob = await signIn(t, 'bob@example.com');
    await t.call({ method: 'PUT', url: URL, cookie: ann.cookie, payload: { rev: 0, prefs: PREFS, progress: PROGRESS } });
    const res = await t.call({ method: 'GET', url: URL, cookie: bob });
    expect(res.json<SavedProgress>()).toMatchObject({ rev: 0, data: null });
  });
});

describe('DELETE /progress', () => {
  it('empties the progress, keeps the prefs, and says when', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 0, prefs: PREFS, progress: PROGRESS } });
    t.clock.advance(1000);
    const res = await t.call({ method: 'DELETE', url: URL, cookie });
    expect(res.statusCode).toBe(200);
    const at = t.clock.now().toISOString();
    expect(res.json<SavedProgress>()).toEqual({ rev: 2, data: { prefs: PREFS, progress: {} }, resetAt: at, updatedAt: at });
    // A device with the copy from before the reset is told about it when it saves.
    const old = await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 1, prefs: PREFS, progress: PROGRESS } });
    expect(old.statusCode).toBe(409);
    expect(old.json().current).toMatchObject({ rev: 2, resetAt: at });
  });

  it('changes nothing when nothing was saved', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'DELETE', url: URL, cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json<SavedProgress>()).toEqual({ rev: 0, data: null, resetAt: null, updatedAt: null });
    expect(await collections(t.db).progress.countDocuments()).toBe(0);
  });
});

describe('the account and its progress', () => {
  it('exports it', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    await t.call({ method: 'PUT', url: URL, cookie, payload: { rev: 0, prefs: PREFS, progress: PROGRESS } });
    const res = await t.call({ method: 'GET', url: '/api/v1/me/export', cookie });
    expect(res.json<AccountExport>().progress).toMatchObject({ rev: 1, data: { prefs: PREFS, progress: PROGRESS } });
  });

  it('deletes it with the account, by its owner or by an admin', async () => {
    const t = await makeApp(mongo);
    const ann = await annSignedIn(t);
    await t.call({ method: 'PUT', url: URL, cookie: ann.cookie, payload: { rev: 0, prefs: PREFS, progress: PROGRESS } });
    const bob = await seedAccount(t.db, { email: 'bob@example.com' });
    const bobCookie = await signIn(t, 'bob@example.com');
    await t.call({ method: 'PUT', url: URL, cookie: bobCookie, payload: { rev: 0, prefs: {}, progress: PROGRESS } });
    const c = collections(t.db);
    expect(await c.progress.countDocuments()).toBe(2);

    const self = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie: ann.cookie, payload: { password: PASSWORD } });
    expect(self.statusCode).toBe(204);
    expect(await c.progress.countDocuments({ _id: ann.account._id })).toBe(0);

    const admin = await signedInAdmin(t);
    const byAdmin = await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${bob._id.toHexString()}`, cookie: admin.cookie });
    expect(byAdmin.statusCode).toBe(204);
    expect(await c.progress.countDocuments()).toBe(0);
  });
});

describe('storableProblem', () => {
  it('passes the app documents and finds operator keys, NUL and deep nesting', () => {
    expect(storableProblem({ lessons: { '7.3': { stars: 3 } }, days: ['2026-10-23'], n: null })).toBeNull();
    expect(storableProblem({ a: { $gt: 1 } })).toMatch(/\$gt/);
    expect(storableProblem({ 'a\0b': 1 })).toMatch(/cannot be stored/);
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = { d: deep };
    expect(storableProblem(deep)).toBe('nested too deep');
  });
});
