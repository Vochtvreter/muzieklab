import type { FastifyContextConfig, RouteOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InviteCreated, LinkCreated, Me } from '../../../shared/api.js';
import { buildApp } from '../app.js';
import { collections } from '../db.js';
import {
  COOKIE,
  HOST,
  ORIGIN,
  PASSWORD,
  freshDb,
  makeApp,
  seedAccount,
  sessionCookie,
  signIn,
  signedInAdmin,
  startMongo,
  stopMongo,
  tokenOf,
  type Mongo,
} from '../test/helpers.js';

let mongo: Mongo;
beforeAll(async () => {
  mongo = await startMongo();
});
afterAll(async () => {
  await stopMongo(mongo);
});

const DAY = 24 * 60 * 60_000;
const NEW_PASSWORD = 'a melody in d minor';

describe('POST /auth/sign-in', () => {
  it('sets the session cookie and answers Me with the permissions', async () => {
    const t = await makeApp(mongo);
    const account = await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann', roles: ['teacher'] });
    const res = await t.call({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: { email: '  Ann@Example.com ', password: PASSWORD },
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0' },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers['set-cookie']).toMatch(/^__Host-session=[^;]+; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    expect(res.json<Me>()).toEqual({
      id: account._id.toHexString(),
      email: 'ann@example.com',
      name: 'Ann',
      locale: null,
      roles: ['teacher'],
      permissions: ['self.manage', 'progress.own', 'class.join', 'class.create'],
      premium: { active: false, until: null },
      createdAt: account.createdAt.toISOString(),
    });
    const c = collections(t.db);
    expect((await c.accounts.findOne({ _id: account._id }))?.lastSignInAt).toEqual(t.clock.now());
    // Only the token's hash is stored, with the device's name.
    const session = await c.sessions.findOne({ accountId: account._id });
    expect(session?._id).toMatch(/^[0-9a-f]{64}$/);
    expect(session?._id).not.toContain(cookie.value);
    expect(session?.device).toBe('Firefox on Linux');
  });

  it('uses a plain `session` cookie without Secure when COOKIE_SECURE is false', async () => {
    const t = await makeApp(mongo, { cookieSecure: false });
    await seedAccount(t.db, { email: 'dev@example.com' });
    const res = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'dev@example.com', password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toMatch(/^session=[^;]+; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/);
    const cookie = sessionCookie(res, 'session')!;
    const me = await t.call({ method: 'GET', url: '/api/v1/me', cookie });
    expect(me.statusCode).toBe(200);
  });

  it('gives a wrong password and an unknown email the same answer', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const wrong = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password: 'not the password' } });
    const unknown = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'nobody@example.com', password: PASSWORD } });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'invalid_credentials', message: 'Email or password is not right' });
    expect(unknown.json()).toEqual(wrong.json());
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('refuses blocked and invited accounts like a wrong password', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'blocked@example.com', status: 'blocked' });
    await seedAccount(t.db, { email: 'invited@example.com', status: 'invited', password: null });
    for (const email of ['blocked@example.com', 'invited@example.com']) {
      const res = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password: PASSWORD } });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'invalid_credentials' });
    }
  });

  it('slows down after 5 failures: the 6th try waits, even with the right password, and works after the wait', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const signInWith = (password: string) =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password } });
    for (let i = 0; i < 5; i++) expect((await signInWith('wrong password!')).statusCode).toBe(401);
    const sixth = await signInWith('wrong password!');
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toEqual({ error: 'too_many_attempts', message: expect.any(String), retryAfter: 2 });
    expect(sixth.headers['retry-after']).toBe('2');
    t.clock.advance(1000);
    const right = await signInWith(PASSWORD);
    expect(right.statusCode).toBe(429);
    expect(right.json().retryAfter).toBe(1);
    t.clock.advance(1000);
    expect((await signInWith(PASSWORD)).statusCode).toBe(200);
    // The good sign-in cleared the email's counter.
    expect((await signInWith('wrong password!')).statusCode).toBe(401);
  });

  it('counts failures per address too, across emails', async () => {
    const t = await makeApp(mongo);
    const from = (ip: string, email: string) =>
      t.call({
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        payload: { email, password: 'wrong password!' },
        headers: { 'x-forwarded-for': ip },
      });
    for (let i = 0; i < 5; i++) expect((await from('203.0.113.7', `person${i}@example.com`)).statusCode).toBe(401);
    expect((await from('203.0.113.7', 'someone-else@example.com')).statusCode).toBe(429);
    expect((await from('198.51.100.1', 'someone-else@example.com')).statusCode).toBe(401);
  });

  it('refuses a body that is not the contract', async () => {
    const t = await makeApp(mongo);
    for (const payload of [{ email: 'a@example.com' }, { email: 'a@example.com', password: 5 }, { email: 'a@b.c', password: 'x', extra: 1 }]) {
      const res = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'bad_request' });
    }
    const text = await t.call({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: 'email=a@example.com',
      headers: { 'content-type': 'text/plain' },
    });
    expect(text.statusCode).toBe(415);
    expect(text.json()).toMatchObject({ error: 'bad_request' });
  });
});

describe('sessions', () => {
  it('GET /me needs a valid session', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(200);
    const none = await t.call({ method: 'GET', url: '/api/v1/me' });
    expect(none.statusCode).toBe(401);
    expect(none.json()).toEqual({ error: 'unauthenticated', message: 'Not signed in' });
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: 'x'.repeat(43) })).statusCode).toBe(401);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: 'garbage' })).statusCode).toBe(401);
  });

  it('sign-out ends only this session; sign-out-everywhere ends all of them', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const [phone, laptop, tablet] = [await signIn(t, 'ann@example.com'), await signIn(t, 'ann@example.com'), await signIn(t, 'ann@example.com')];

    const out = await t.call({ method: 'POST', url: '/api/v1/auth/sign-out', cookie: phone });
    expect(out.statusCode).toBe(204);
    expect(out.headers['set-cookie']).toMatch(/^__Host-session=; Max-Age=0; Path=\/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax$/);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: phone })).statusCode).toBe(401);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: laptop })).statusCode).toBe(200);

    expect((await t.call({ method: 'POST', url: '/api/v1/auth/sign-out-everywhere', cookie: laptop })).statusCode).toBe(204);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: laptop })).statusCode).toBe(401);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: tablet })).statusCode).toBe(401);
    expect(await collections(t.db).sessions.countDocuments()).toBe(0);
    // Signing out needs a session.
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/sign-out' })).statusCode).toBe(401);
  });

  it('signing in again on a device ends the session it had', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const first = await signIn(t, 'ann@example.com');
    const res = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', cookie: first, payload: { email: 'ann@example.com', password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    expect(sessionCookie(res)).not.toBe(first);
    expect(await collections(t.db).sessions.countDocuments()).toBe(1);
  });

  it('refuses a session 30 days after its last use', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    t.clock.advance(29 * DAY);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(200); // moves the end on
    t.clock.advance(29 * DAY);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(200);
    t.clock.advance(30 * DAY + 1);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(401);
  });

  it('moves lastSeenAt on at most once an hour, and sends the cookie again then', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    const sessions = collections(t.db).sessions;
    const signedInAt = t.clock.now();

    t.clock.advance(59 * 60_000);
    const quiet = await t.call({ method: 'GET', url: '/api/v1/me', cookie });
    expect(quiet.headers['set-cookie']).toBeUndefined();
    expect((await sessions.findOne())?.lastSeenAt).toEqual(signedInAt);

    t.clock.advance(2 * 60_000);
    const moved = await t.call({ method: 'GET', url: '/api/v1/me', cookie });
    expect(sessionCookie(moved)).toBe(cookie);
    const session = await sessions.findOne();
    expect(session?.lastSeenAt).toEqual(t.clock.now());
    expect(session?.expiresAt).toEqual(new Date(t.clock.ms + 30 * DAY));

    t.clock.advance(30 * 60_000);
    await t.call({ method: 'GET', url: '/api/v1/me', cookie });
    expect((await sessions.findOne())?.lastSeenAt).toEqual(session?.lastSeenAt);
  });

  it('ends the use of a session when its account is blocked behind its back', async () => {
    const t = await makeApp(mongo);
    const account = await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    await collections(t.db).accounts.updateOne({ _id: account._id }, { $set: { status: 'blocked' } });
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(401);
  });
});

describe('the Origin check', () => {
  it('refuses a request that changes something without an Origin from this site', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const payload = { email: 'ann@example.com', password: PASSWORD };
    const post = (headers: Record<string, string | undefined>) =>
      t.app.inject({ method: 'POST', url: '/api/v1/auth/sign-in', payload, headers: { host: HOST, ...headers } });

    for (const origin of [undefined, 'https://evil.example', 'null', 'https://test.vivanova.app:8443', 'not a url']) {
      const res = await post(origin === undefined ? {} : { origin });
      expect(res.statusCode, String(origin)).toBe(403);
      expect(res.json()).toEqual({ error: 'bad_origin', message: expect.any(String) });
    }
    expect((await post({ origin: ORIGIN })).statusCode).toBe(200);
    expect((await post({ origin: `${ORIGIN}:443`, host: `${HOST}:443` })).statusCode).toBe(200);
  });

  it('checks the port too, and lets development on localhost through', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const payload = { email: 'ann@example.com', password: PASSWORD };
    const post = (host: string, origin: string) =>
      t.app.inject({ method: 'POST', url: '/api/v1/auth/sign-in', payload, headers: { host, origin } });
    expect((await post('localhost:5173', 'http://localhost:5173')).statusCode).toBe(200);
    expect((await post('localhost:5173', 'http://localhost:5174')).statusCode).toBe(403);
  });

  it('needs no Origin for GET', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: { host: HOST, cookie: `${COOKIE}=${cookie}` } });
    expect(res.statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
  });
});

describe('deny by default', () => {
  it('gives every route `public` or a `permission`, as in the route table', async () => {
    const db = await freshDb(mongo);
    const app = buildApp({ db, commit: 'test' });
    const routes: RouteOptions[] = [];
    // Plugins load at ready(), so this hook sees every route the API registers.
    app.addHook('onRoute', (route) => {
      routes.push(route);
    });
    await app.ready();
    const table = routes
      .filter((r) => r.method !== 'HEAD')
      .map((r) => `${r.method} ${r.url} ${r.config?.public ? 'public' : r.config?.permission}`)
      .sort();
    expect(table).toEqual(
      [
        'GET /api/v1/health public',
        'POST /api/v1/auth/sign-in public',
        'POST /api/v1/auth/sign-out self.manage',
        'POST /api/v1/auth/sign-out-everywhere self.manage',
        'POST /api/v1/auth/invite/check public',
        'POST /api/v1/auth/reset/check public',
        'POST /api/v1/auth/invite/accept public',
        'POST /api/v1/auth/reset/confirm public',
        'GET /api/v1/me self.manage',
        'PATCH /api/v1/me self.manage',
        'POST /api/v1/me/password self.manage',
        'POST /api/v1/me/email self.manage',
        'GET /api/v1/me/export self.manage',
        'DELETE /api/v1/me self.manage',
        'GET /api/v1/admin/accounts accounts.read',
        'POST /api/v1/admin/invites accounts.invite',
        'GET /api/v1/admin/accounts/:id accounts.read',
        'PATCH /api/v1/admin/accounts/:id accounts.read',
        'POST /api/v1/admin/accounts/:id/invite-link accounts.invite',
        'POST /api/v1/admin/accounts/:id/reset-link accounts.invite',
        'DELETE /api/v1/admin/accounts/:id accounts.delete',
        'GET /api/v1/admin/audit audit.read',
      ].sort(),
    );
    // HEAD routes Fastify adds for GET ones carry the same config.
    for (const route of routes) expect(Boolean(route.config?.public) !== Boolean(route.config?.permission)).toBe(true);
    await app.close();
  });

  it('refuses to start with a route that says neither, or both', async () => {
    const db = await freshDb(mongo);
    const configs: FastifyContextConfig[] = [{}, { public: true, permission: 'self.manage' }];
    for (const config of configs) {
      const app = buildApp({ db, commit: 'test' });
      app.register(async (child) => {
        child.get('/oops', { config }, async () => 'oops');
      });
      await expect(app.ready()).rejects.toThrow('GET /oops: config needs exactly one of');
    }
  });

  it('answers unknown routes 404, signed in or not', async () => {
    const t = await makeApp(mongo);
    const res = await t.call({ method: 'POST', url: '/api/v1/nope', payload: {} });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
  });

  it('answers 403 when signed in without the permission', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com', roles: ['teacher', 'editor'] });
    const cookie = await signIn(t, 'ann@example.com');
    const res = await t.call({ method: 'GET', url: '/api/v1/admin/accounts', cookie });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', message: expect.any(String) });
    expect((await t.call({ method: 'GET', url: '/api/v1/admin/accounts' })).statusCode).toBe(401);
  });
});

describe('invites', () => {
  async function invite(t: Awaited<ReturnType<typeof makeApp>>, cookie: string, email = 'bob@example.com') {
    const res = await t.call({
      method: 'POST',
      url: '/api/v1/admin/invites',
      cookie,
      payload: { email, name: 'Bob', roles: ['teacher'] },
    });
    expect(res.statusCode).toBe(200);
    return res.json<InviteCreated>();
  }

  it('makes a link on this site; the link shows whose it is and signs them in once', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const created = await invite(t, admin.cookie, ' Bob@Example.com ');
    expect(created.link).toMatch(new RegExp(`^${ORIGIN}/#/invite/[A-Za-z0-9_-]{43}$`));
    expect(created.expiresAt).toBe(new Date(t.clock.ms + 7 * DAY).toISOString());
    expect(created.account).toMatchObject({
      email: 'bob@example.com',
      name: 'Bob',
      status: 'invited',
      roles: ['teacher'],
      inviteExpiresAt: created.expiresAt,
      sessions: 0,
      lastSignInAt: null,
    });
    const token = tokenOf(created.link);
    // Only the hash is stored.
    expect(await collections(t.db).tokens.countDocuments({ _id: token })).toBe(0);

    const check = await t.call({ method: 'POST', url: '/api/v1/auth/invite/check', payload: { token } });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toEqual({ email: 'bob@example.com', name: 'Bob', expiresAt: created.expiresAt });

    const weak = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { token, password: 'qwertyuiop' } });
    expect(weak.statusCode).toBe(422);
    expect(weak.json()).toMatchObject({ error: 'password_common' });
    const short = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { token, password: 'short' } });
    expect(short.json()).toMatchObject({ error: 'password_length' });
    const named = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { token, password: 'bob@example.com!!' } });
    expect(named.json()).toMatchObject({ error: 'password_has_email' });

    const accepted = await t.call({
      method: 'POST',
      url: '/api/v1/auth/invite/accept',
      payload: { token, password: NEW_PASSWORD, name: '  Bobby ' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json<Me>()).toMatchObject({ email: 'bob@example.com', name: 'Bobby', roles: ['teacher'] });
    const cookie = sessionCookie(accepted)!;
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(200);
    const account = await collections(t.db).accounts.findOne({ email: 'bob@example.com' });
    expect(account).toMatchObject({ status: 'active', name: 'Bobby' });
    expect(account?.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);

    for (const [url, payload] of [
      ['/api/v1/auth/invite/check', { token }],
      ['/api/v1/auth/invite/accept', { token, password: NEW_PASSWORD }],
    ] as const) {
      const again = await t.call({ method: 'POST', url, payload });
      expect(again.statusCode).toBe(410);
      expect(again.json()).toMatchObject({ error: 'link_invalid' });
    }
    expect((await signIn(t, 'bob@example.com', NEW_PASSWORD)).length).toBe(43);
  });

  it('cancels the old link when a new one is made, and refuses expired links', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const created = await invite(t, admin.cookie);
    const relink = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${created.account.id}/invite-link`, cookie: admin.cookie });
    expect(relink.statusCode).toBe(200);
    const fresh = relink.json<LinkCreated>();
    expect(fresh.link).not.toBe(created.link);
    const check = (token: string) => t.call({ method: 'POST', url: '/api/v1/auth/invite/check', payload: { token } });
    expect((await check(tokenOf(created.link))).statusCode).toBe(410);
    expect((await check(tokenOf(fresh.link))).statusCode).toBe(200);

    t.clock.advance(7 * DAY + 1);
    expect((await check(tokenOf(fresh.link))).statusCode).toBe(410);
    // The admin screen still shows when it stopped working.
    const detail = await t.call({ method: 'GET', url: `/api/v1/admin/accounts/${created.account.id}`, cookie: admin.cookie });
    expect(detail.json().inviteExpiresAt).toBe(fresh.expiresAt);
  });

  it('refuses an invite for an email that has an account, whatever its status', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    await seedAccount(t.db, { email: 'blocked@example.com', status: 'blocked' });
    await invite(t, admin.cookie, 'bob@example.com');
    for (const email of ['BOB@example.com', 'blocked@example.com', 'admin@example.com']) {
      const res = await t.call({ method: 'POST', url: '/api/v1/admin/invites', cookie: admin.cookie, payload: { email, name: 'X', roles: [] } });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'email_taken' });
    }
    const bad = await t.call({ method: 'POST', url: '/api/v1/admin/invites', cookie: admin.cookie, payload: { email: 'not an email', name: 'X', roles: [] } });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toMatchObject({ error: 'email_invalid' });
  });

  it('is for admins only', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'teacher@example.com', roles: ['teacher'] });
    const cookie = await signIn(t, 'teacher@example.com');
    const res = await t.call({ method: 'POST', url: '/api/v1/admin/invites', cookie, payload: { email: 'x@example.com', name: 'X', roles: [] } });
    expect(res.statusCode).toBe(403);
  });

  it('counts wrong tokens against the address', async () => {
    const t = await makeApp(mongo);
    for (let i = 0; i < 5; i++) {
      const res = await t.call({ method: 'POST', url: '/api/v1/auth/invite/check', payload: { token: `wrong-${i}` } });
      expect(res.statusCode).toBe(410);
    }
    const res = await t.call({ method: 'POST', url: '/api/v1/auth/reset/confirm', payload: { token: 'wrong', password: NEW_PASSWORD } });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: 'too_many_attempts', retryAfter: 2 });
  });
});

describe('new-password links', () => {
  it('are only for active accounts', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const invited = await seedAccount(t.db, { email: 'invited@example.com', status: 'invited', password: null });
    const blocked = await seedAccount(t.db, { email: 'blocked@example.com', status: 'blocked' });
    for (const account of [invited, blocked]) {
      const res = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${account._id}/reset-link`, cookie: admin.cookie });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'wrong_status' });
    }
    const active = await seedAccount(t.db, { email: 'active@example.com' });
    const res = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${active._id}/invite-link`, cookie: admin.cookie });
    expect(res.json()).toMatchObject({ error: 'wrong_status' });
    const missing = await t.call({ method: 'POST', url: '/api/v1/admin/accounts/0123456789abcdef01234567/reset-link', cookie: admin.cookie });
    expect(missing.statusCode).toBe(404);
  });

  it('set a new password, sign out every other device and sign this one in', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const oldSession = await signIn(t, 'ann@example.com');
    const made = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${ann._id}/reset-link`, cookie: admin.cookie });
    expect(made.statusCode).toBe(200);
    const { link, expiresAt } = made.json<LinkCreated>();
    expect(link).toMatch(new RegExp(`^${ORIGIN}/#/reset/[A-Za-z0-9_-]{43}$`));
    expect(expiresAt).toBe(new Date(t.clock.ms + 24 * 60 * 60_000).toISOString());
    const token = tokenOf(link);

    const check = await t.call({ method: 'POST', url: '/api/v1/auth/reset/check', payload: { token } });
    expect(check.json()).toEqual({ email: 'ann@example.com', name: 'Test person', expiresAt });
    // An invite check does not take a new-password token.
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/invite/check', payload: { token } })).statusCode).toBe(410);

    const confirmed = await t.call({ method: 'POST', url: '/api/v1/auth/reset/confirm', payload: { token, password: NEW_PASSWORD } });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json<Me>().email).toBe('ann@example.com');
    const cookie = sessionCookie(confirmed)!;
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(200);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: oldSession })).statusCode).toBe(401);
    expect(await collections(t.db).sessions.countDocuments({ accountId: ann._id })).toBe(1);

    const old = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password: PASSWORD } });
    expect(old.statusCode).toBe(401);
    await signIn(t, 'ann@example.com', NEW_PASSWORD);
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/reset/confirm', payload: { token, password: NEW_PASSWORD } })).statusCode).toBe(410);
  });

  it('stop working after 24 hours', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const made = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${ann._id}/reset-link`, cookie: admin.cookie });
    t.clock.advance(24 * 60 * 60_000 + 1);
    const res = await t.call({ method: 'POST', url: '/api/v1/auth/reset/check', payload: { token: tokenOf(made.json().link) } });
    expect(res.statusCode).toBe(410);
  });
});
