import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountExport, LinkCreated, Me } from '../../../shared/api.js';
import { collections } from '../db.js';
import {
  PASSWORD,
  makeApp,
  seedAccount,
  sessionCookie,
  signIn,
  signedInAdmin,
  startMongo,
  stopMongo,
  tokenOf,
  type Mongo,
  type TestApp,
} from '../test/helpers.js';

let mongo: Mongo;
beforeAll(async () => {
  mongo = await startMongo();
});
afterAll(async () => {
  await stopMongo(mongo);
});

const NEW_PASSWORD = 'a melody in d minor';

async function annSignedIn(t: TestApp) {
  const account = await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann' });
  return { account, cookie: await signIn(t, 'ann@example.com') };
}

/** An admin makes a new-password link for the account; returns a check of whether it still works (200 or 410). */
async function resetLink(t: TestApp, accountId: string) {
  const admin = await signedInAdmin(t);
  const made = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${accountId}/reset-link`, cookie: admin.cookie });
  expect(made.statusCode).toBe(200);
  const token = tokenOf(made.json<LinkCreated>().link);
  return async () => (await t.call({ method: 'POST', url: '/api/v1/auth/reset/check', payload: { token } })).statusCode;
}

describe('PATCH /me', () => {
  it('changes the name and the locale, and audits it', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'PATCH', url: '/api/v1/me', cookie, payload: { name: ' Annie ', locale: 'nl' } });
    expect(res.statusCode).toBe(200);
    expect(res.json<Me>()).toMatchObject({ name: 'Annie', locale: 'nl' });
    const back = await t.call({ method: 'PATCH', url: '/api/v1/me', cookie, payload: { locale: null } });
    expect(back.json<Me>()).toMatchObject({ name: 'Annie', locale: null });
    const entries = await collections(t.db).audit.find({ targetId: account._id }).toArray();
    expect(entries.map((e) => [e.action, e.details])).toEqual([
      ['account.update', { fields: ['name', 'locale'] }],
      ['account.update', { fields: ['locale'] }],
    ]);
  });

  it('refuses an empty or too long name and an unknown locale', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    for (const payload of [{ name: '   ' }, { name: 'x'.repeat(81) }, { locale: 'fr' }, { email: 'x@example.com' }]) {
      const res = await t.call({ method: 'PATCH', url: '/api/v1/me', cookie, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'bad_request' });
    }
    // 80 characters, counted as people count them.
    const ok = await t.call({ method: 'PATCH', url: '/api/v1/me', cookie, payload: { name: '🎵'.repeat(80) } });
    expect(ok.statusCode).toBe(200);
  });
});

describe('POST /me/password', () => {
  it('needs the current password and a good new one', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const wrong = await t.call({
      method: 'POST',
      url: '/api/v1/me/password',
      cookie,
      payload: { currentPassword: 'not it at all', newPassword: NEW_PASSWORD },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ error: 'wrong_password' });
    const weak = await t.call({
      method: 'POST',
      url: '/api/v1/me/password',
      cookie,
      payload: { currentPassword: PASSWORD, newPassword: 'ann@example.com rocks' },
    });
    expect(weak.statusCode).toBe(422);
    expect(weak.json()).toMatchObject({ error: 'password_has_email' });
  });

  it('changes it and signs out every other device, but not this one', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    const other = await signIn(t, 'ann@example.com');
    const res = await t.call({
      method: 'POST',
      url: '/api/v1/me/password',
      cookie,
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.statusCode).toBe(204);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(200);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: other })).statusCode).toBe(401);
    await signIn(t, 'ann@example.com', NEW_PASSWORD);
    const stored = await collections(t.db).accounts.findOne({ _id: account._id });
    expect(stored?.passwordChangedAt).toEqual(t.clock.now());
    expect(await collections(t.db).audit.countDocuments({ action: 'account.change_password', targetId: account._id })).toBe(1);
  });

  it('makes a new-password link stop working', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    const check = await resetLink(t, account._id.toHexString());
    expect(await check()).toBe(200);
    const res = await t.call({ method: 'POST', url: '/api/v1/me/password', cookie, payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });
    expect(res.statusCode).toBe(204);
    expect(await check()).toBe(410);
  });

  it('slows down guesses of the current password', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const guess = () =>
      t.call({ method: 'POST', url: '/api/v1/me/password', cookie, payload: { currentPassword: 'guess number', newPassword: NEW_PASSWORD } });
    for (let i = 0; i < 5; i++) expect((await guess()).statusCode).toBe(401);
    expect((await guess()).statusCode).toBe(429);
  });
});

describe('POST /me/email', () => {
  it('needs the password, a real address and one no one else has', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    await seedAccount(t.db, { email: 'taken@example.com', status: 'invited', password: null });
    const cases: [object, number, string][] = [
      [{ password: 'not it at all', email: 'new@example.com' }, 401, 'wrong_password'],
      [{ password: PASSWORD, email: 'no-at-sign' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'a@b' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'two words@example.com' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: `${'x'.repeat(250)}@example.com` }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'Taken@Example.com' }, 409, 'email_taken'],
    ];
    for (const [payload, status, error] of cases) {
      const res = await t.call({ method: 'POST', url: '/api/v1/me/email', cookie, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(status);
      expect(res.json()).toMatchObject({ error });
    }
  });

  it('changes the sign-in email', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'POST', url: '/api/v1/me/email', cookie, payload: { password: PASSWORD, email: ' Ann@New.example ' } });
    expect(res.statusCode).toBe(200);
    expect(res.json<Me>().email).toBe('ann@new.example');
    await signIn(t, 'ann@new.example');
    const old = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password: PASSWORD } });
    expect(old.statusCode).toBe(401);
    const entry = await collections(t.db).audit.findOne({ action: 'account.change_email', targetId: account._id });
    expect(entry?.details).toEqual({ email: 'ann@new.example', previousEmail: 'ann@example.com' });
  });

  it('makes a new-password link stop working', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    const check = await resetLink(t, account._id.toHexString());
    expect(await check()).toBe(200);
    const res = await t.call({ method: 'POST', url: '/api/v1/me/email', cookie, payload: { password: PASSWORD, email: 'ann@new.example' } });
    expect(res.statusCode).toBe(200);
    expect(await check()).toBe(410);
  });
});

describe('GET /me/export', () => {
  it('is everything stored about the account, as a download', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    await t.call({ method: 'PATCH', url: '/api/v1/me', cookie, payload: { locale: 'en' } });
    const res = await t.call({ method: 'GET', url: '/api/v1/me/export', cookie, headers: { 'user-agent': 'curl/8.5.0' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="muzieklab-account.json"');
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    const body = res.json<AccountExport>();
    expect(body).toEqual({
      exportedAt: t.clock.now().toISOString(),
      account: {
        id: account._id.toHexString(),
        email: 'ann@example.com',
        name: 'Ann',
        locale: 'en',
        roles: [],
        premium: { active: false, until: null },
        createdAt: account.createdAt.toISOString(),
        status: 'active',
        lastSignInAt: t.clock.now().toISOString(),
        passwordChangedAt: null,
      },
      sessions: [{ device: 'Unknown device', createdAt: t.clock.now().toISOString(), lastSeenAt: t.clock.now().toISOString() }],
      audit: [
        {
          id: expect.any(String),
          at: t.clock.now().toISOString(),
          actorId: account._id.toHexString(),
          action: 'account.update',
          targetId: account._id.toHexString(),
          details: { fields: ['locale'] },
        },
      ],
      progress: { rev: 0, data: null, resetAt: null, updatedAt: null },
    });
    // Nothing secret in it.
    expect(res.body).not.toMatch(/scrypt|passwordHash|_id/);
  });
});

describe('DELETE /me', () => {
  it('needs the password', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: 'not it at all' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'wrong_password' });
    const none = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie });
    expect(none.statusCode).toBe(400);
  });

  it('removes everything about the account, and scrubs its name and email from the audit', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const invited = await t.call({
      method: 'POST',
      url: '/api/v1/admin/invites',
      cookie: admin.cookie,
      payload: { email: 'bob@example.com', name: 'Bob', roles: [] },
    });
    const token = invited.json().link.split('/').pop();
    const accepted = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { token, password: NEW_PASSWORD } });
    const cookie = sessionCookie(accepted)!;
    const bobId = accepted.json<Me>().id;
    await signIn(t, 'bob@example.com', NEW_PASSWORD); // a second device
    await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${bobId}/reset-link`, cookie: admin.cookie }); // a token

    const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: NEW_PASSWORD } });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.map((x) => [x.name, x.value, x.maxAge])).toEqual([['__Host-session', '', 0], ['__Secure-refresh', '', 0]]);

    const c = collections(t.db);
    expect(await c.accounts.countDocuments({ email: 'bob@example.com' })).toBe(0);
    expect(await c.sessions.countDocuments({ accountId: { $ne: admin.account._id } })).toBe(0);
    expect(await c.tokens.countDocuments()).toBe(0);
    const audit = await c.audit.find().sort({ _id: 1 }).toArray();
    expect(audit.map((e) => [e.action, e.details])).toEqual([
      ['account.invite', { deleted: true }],
      ['account.accept_invite', {}],
      ['account.reset_link', { expiresAt: expect.any(String) }],
      ['account.delete_self', {}],
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/bob/i);
    // The email is free again.
    const again = await t.call({ method: 'POST', url: '/api/v1/admin/invites', cookie: admin.cookie, payload: { email: 'bob@example.com', name: 'Bob', roles: [] } });
    expect(again.statusCode).toBe(200);
  });

  it('refuses the last admin', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie: admin.cookie, payload: { password: PASSWORD } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'last_admin' });
    // With a second active admin it works.
    await seedAccount(t.db, { email: 'second@example.com', roles: ['admin'] });
    const ok = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie: admin.cookie, payload: { password: PASSWORD } });
    expect(ok.statusCode).toBe(204);
  });
});
