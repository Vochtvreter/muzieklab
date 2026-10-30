import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FEEDBACK_MAX, type AccountExport, type LinkCreated, type Me } from '../../../shared/api.js';
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

  it('refuses a name that shows nothing or turns the text around it, and keeps the joiners an emoji or a name needs', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    // A zero-width space, a Hangul filler, word joiners, the blank Braille pattern and the interlinear annotation
    // characters show nothing; a tab; a right-to-left override and isolate.
    for (const name of ['\u200B', ' \u3164 ', '\u2060\u2060', '\u2800', ' \u2800 ', '\uFFF9\uFFFA\uFFFB', 'Ann\tde Vries', 'Smoke \u202Enimda', 'Ann \u2067de Vries']) {
      const res = await t.call({ method: 'PATCH', url: '/api/v1/me', cookie, payload: { name } });
      expect(res.statusCode, JSON.stringify(name)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'bad_request' });
    }
    // A family (an emoji joined by zero-width joiners), and a Persian name with a zero-width non-joiner.
    for (const name of ['👨\u200D👩\u200D👧', 'می\u200Cخواهم']) {
      const res = await t.call({ method: 'PATCH', url: '/api/v1/me', cookie, payload: { name } });
      expect(res.statusCode, JSON.stringify(name)).toBe(200);
      expect(res.json<Me>().name).toBe(name);
    }
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
      // A control or hidden character: an address no one could type to sign in, or one that looks like another's.
      [{ password: PASSWORD, email: 'new\u200B@example.com' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: '\u200Btaken@example.com' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'taken@example.com\u2060' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'a\u0000b@example.com' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'new@exam\u001bple.com' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'new\u202E@example.com' }, 422, 'email_invalid'],
      [{ password: PASSWORD, email: 'new\u2800@example.com' }, 422, 'email_invalid'],
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
      feedback: [],
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
    expect(await collections(t.db).closures.countDocuments()).toBe(0);
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
    // Without removeData (an app before 0.16.0): nothing is kept, only that an account was deleted.
    expect(await c.closures.find().project({ _id: 0, day: 0 }).toArray()).toEqual([{ kind: 'removed', feedback: null, archive: null }]);
    // The email is free again.
    const again = await t.call({ method: 'POST', url: '/api/v1/admin/invites', cookie: admin.cookie, payload: { email: 'bob@example.com', name: 'Bob', roles: [] } });
    expect(again.statusCode).toBe(200);
  });

  it('keeps an anonymous copy of the progress and prefs, and the feedback, without a name, email, id or time', async () => {
    const t = await makeApp(mongo);
    const now = t.clock.now();
    const account = await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann Smit', createdAt: new Date(Date.UTC(2026, 2, 3, 9)) });
    const cookie = await signIn(t, 'ann@example.com');
    const prefs = { theme: 'dark', noteNames: 'solfege' };
    const progress = { xp: 1840, lessons: { '7.3': { stars: 3, bestAccuracy: 94 } }, practiceDays: ['2026-10-24'] };
    const saved = await t.call({ method: 'PUT', url: '/api/v1/progress', cookie, payload: { rev: 0, prefs, progress } });
    expect(saved.statusCode).toBe(200);

    const res = await t.call({
      method: 'DELETE',
      url: '/api/v1/me',
      cookie,
      payload: { password: PASSWORD, removeData: false, feedback: '  Too hard after chapter 7.  ' },
    });
    expect(res.statusCode).toBe(204);
    const c = collections(t.db);
    expect(await c.accounts.countDocuments()).toBe(0);
    expect(await c.progress.countDocuments()).toBe(0);
    const closures = await c.closures.find().toArray();
    expect(closures).toEqual([
      {
        _id: expect.stringMatching(/^[0-9a-f]{32}$/),
        // The day only: not the time of the deletion.
        day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        kind: 'archived',
        feedback: 'Too hard after chapter 7.',
        archive: { joined: '2026-03', data: { prefs, progress } },
      },
    ]);
    const text = JSON.stringify(closures);
    expect(text).not.toMatch(/ann|smit/i);
    expect(text).not.toContain(account._id.toHexString());
    // Its audit entry is the same as for one deleted with its data, so the two cannot be matched up.
    const entry = await c.audit.findOne({ action: 'account.delete_self' });
    expect(entry?.details).toEqual({});
  });

  it('with removeData, keeps only the feedback', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    await t.call({ method: 'PUT', url: '/api/v1/progress', cookie, payload: { rev: 0, prefs: {}, progress: { xp: 5 } } });
    const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: PASSWORD, removeData: true, feedback: 'Moving on' } });
    expect(res.statusCode).toBe(204);
    const c = collections(t.db);
    expect(await c.progress.countDocuments()).toBe(0);
    expect(await c.closures.find().project({ _id: 0, day: 0 }).toArray()).toEqual([{ kind: 'removed', feedback: 'Moving on', archive: null }]);
  });

  it('archives an account that never saved progress, and keeps empty feedback as none', async () => {
    const t = await makeApp(mongo);
    const { account, cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: PASSWORD, removeData: false, feedback: '   ' } });
    expect(res.statusCode).toBe(204);
    expect(await collections(t.db).closures.find().project({ _id: 0, day: 0 }).toArray()).toEqual([
      { kind: 'archived', feedback: null, archive: { joined: account.createdAt.toISOString().slice(0, 7), data: null } },
    ]);
  });

  it('keeps feedback that shows nothing (a pasted zero-width space, a Hangul filler) as none', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: PASSWORD, removeData: true, feedback: '\u200b\u2800\u2060 \u3164\n' } });
    expect(res.statusCode).toBe(204);
    expect(await collections(t.db).closures.find().project({ _id: 0, day: 0 }).toArray()).toEqual([{ kind: 'removed', feedback: null, archive: null }]);
  });

  it('refuses feedback over the limit, and a removeData that is not true or false, and deletes nothing', async () => {
    const t = await makeApp(mongo);
    const { cookie } = await annSignedIn(t);
    for (const payload of [
      { password: PASSWORD, feedback: 'x'.repeat(FEEDBACK_MAX + 1) },
      { password: PASSWORD, removeData: 'yes' },
      { password: PASSWORD, feedback: 7 },
    ]) {
      const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 60)).toBe(400);
    }
    const c = collections(t.db);
    expect(await c.accounts.countDocuments()).toBe(1);
    expect(await c.closures.countDocuments()).toBe(0);
    // The limit counts characters as people do: 1000 emoji are 2000 UTF-16 units.
    const ok = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: PASSWORD, feedback: '🎵'.repeat(FEEDBACK_MAX) } });
    expect(ok.statusCode).toBe(204);
  });

  it('refuses the last admin', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const res = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie: admin.cookie, payload: { password: PASSWORD } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'last_admin' });
    expect(await collections(t.db).closures.countDocuments()).toBe(0);
    // With a second active admin it works.
    await seedAccount(t.db, { email: 'second@example.com', roles: ['admin'] });
    const ok = await t.call({ method: 'DELETE', url: '/api/v1/me', cookie: admin.cookie, payload: { password: PASSWORD } });
    expect(ok.statusCode).toBe(204);
  });
});
