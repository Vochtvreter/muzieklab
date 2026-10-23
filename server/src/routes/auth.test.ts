import type { FastifyContextConfig, RouteOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InviteCreated, LinkCreated, Me } from '../../../shared/api.js';
import { buildApp } from '../app.js';
import { hashing } from '../auth/passwords.js';
import { MAX_SESSIONS } from '../auth/sessions.js';
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

  it('slows an email from one address after 5 failures: the 6th try waits, even with the right password', async () => {
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
    // The good sign-in cleared the counter for this email from this address.
    for (let i = 0; i < 5; i++) expect((await signInWith('wrong password!')).statusCode).toBe(401);
  });

  it('lets the right password in from another address while one address is kept waiting, for hours', async () => {
    // Someone who knows Ann's email guesses each time their wait ends; Ann, elsewhere, is never kept waiting.
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com', roles: ['admin'] });
    const from = (ip: string, password: string) =>
      t.call({
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        payload: { email: 'ann@example.com', password },
        headers: { 'x-forwarded-for': ip },
      });
    const start = t.clock.ms;
    let guesses = 0;
    while (t.clock.ms < start + 3 * 60 * 60_000) {
      const guess = await from('203.0.113.7', 'wrong password!');
      if (guess.statusCode === 429) t.clock.advance(guess.json().retryAfter * 1000);
      else {
        expect(guess.statusCode).toBe(401);
        guesses++;
      }
      if (guesses % 3 === 0) expect((await from('198.51.100.1', PASSWORD)).statusCode).toBe(200);
    }
    expect(guesses).toBeGreaterThan(10);
    // The guesser's own address is still kept waiting.
    await from('203.0.113.7', 'wrong password!');
    expect((await from('203.0.113.7', PASSWORD)).statusCode).toBe(429);
    expect((await from('198.51.100.1', PASSWORD)).statusCode).toBe(200);
  });

  it('slows an address after 50 failures across emails, an IPv6 address by its /64', async () => {
    const t = await makeApp(mongo);
    for (let i = 0; i < 52; i++) await seedAccount(t.db, { email: `pupil${i}@example.com` });
    const from = (ip: string, i: number, password = 'wrong password!') =>
      t.call({
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        payload: { email: `pupil${i}@example.com`, password },
        headers: { 'x-forwarded-for': ip },
      });
    // 50 mistyped passwords on one school network are not enough to slow anyone there.
    for (let i = 0; i < 50; i++) expect((await from(`2001:db8:5c:1::${(i + 1).toString(16)}`, i)).statusCode).toBe(401);
    // The 51st try from that /64, from any of its addresses, waits, even with a right password…
    expect((await from('2001:db8:5c:1:ffff::1', 50, PASSWORD)).statusCode).toBe(429);
    // …another /64 does not, and a minute later the network may try again.
    expect((await from('2001:db8:5c:2::1', 50, PASSWORD)).statusCode).toBe(200);
    t.clock.advance(60_000);
    expect((await from('2001:db8:5c:1::1', 51, PASSWORD)).statusCode).toBe(200);
    // IPv4 written as IPv6 is the IPv4 address.
    expect((await from('::ffff:203.0.113.9', 0)).statusCode).toBe(401);
  });

  it('slows an email after 50 failures from any addresses, and not before', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const from = (i: number, password = 'wrong password!') =>
      t.call({
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        payload: { email: 'ann@example.com', password },
        headers: { 'x-forwarded-for': `198.51.100.${i}` },
      });
    for (let i = 1; i <= 50; i++) expect((await from(i)).statusCode).toBe(401);
    expect((await from(100, PASSWORD)).statusCode).toBe(429);
    t.clock.advance(2000);
    expect((await from(100, PASSWORD)).statusCode).toBe(200);
  });

  it('lets a class sign in at once from one address: 10 right passwords at the same moment all get in', async () => {
    const t = await makeApp(mongo);
    for (let i = 0; i < 10; i++) await seedAccount(t.db, { email: `pupil${i}@example.com` });
    const all = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        t.call({
          method: 'POST',
          url: '/api/v1/auth/sign-in',
          payload: { email: `pupil${i}@example.com`, password: PASSWORD },
          headers: { 'x-forwarded-for': '203.0.113.9' },
        }),
      ),
    );
    expect(all.map((r) => r.statusCode)).toEqual(Array(10).fill(200));
  });

  it('answers 429 (retry after 1 s) when 32 hashes wait already, and does not count that try', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const signInWith = (password: string) =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password } });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const busy = Array.from({ length: 4 + 32 }, () => hashing.run(() => held));
    const refused = await signInWith('wrong password!');
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: 'too_many_attempts', message: expect.any(String), retryAfter: 1 });
    expect(refused.headers['retry-after']).toBe('1');
    release();
    await Promise.all(busy);
    // Five failures are still free: the refused try was not one.
    for (let i = 0; i < 5; i++) expect((await signInWith('wrong password!')).statusCode).toBe(401);
    expect((await signInWith(PASSWORD)).statusCode).toBe(429);
  });

  it('refuses what is not an email address at once, without counting it', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    for (const email of Array.from({ length: 60 }, (_, i) => `${'x'.repeat(300)}${i}@example.com`).concat(['nobody', 'a@b'])) {
      const res = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password: 'wrong password!' } });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'invalid_credentials', message: 'Email or password is not right' });
    }
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password: PASSWORD } })).statusCode).toBe(200);
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

  it(`keeps at most ${MAX_SESSIONS} sessions an account, ending the ones used longest ago`, async () => {
    expect(MAX_SESSIONS).toBe(20);
    const t = await makeApp(mongo);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const cookies: string[] = [];
    for (let i = 0; i < 25; i++) {
      cookies.push(await signIn(t, 'ann@example.com'));
      t.clock.advance(1000);
    }
    const sessions = collections(t.db).sessions;
    expect(await sessions.countDocuments({ accountId: ann._id })).toBe(20);
    const me = async (cookie: string) => (await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode;
    for (const [i, cookie] of cookies.entries()) expect(await me(cookie), `session ${i}`).toBe(i < 5 ? 401 : 200);

    // By last use, not by age: the oldest session, used again an hour later, stays; the next oldest ends.
    t.clock.advance(60 * 60_000 + 1);
    expect(await me(cookies[5])).toBe(200);
    await signIn(t, 'ann@example.com');
    expect(await sessions.countDocuments({ accountId: ann._id })).toBe(20);
    expect(await me(cookies[5])).toBe(200);
    expect(await me(cookies[6])).toBe(401);
    // Another account's sessions are its own.
    await seedAccount(t.db, { email: 'bob@example.com' });
    await signIn(t, 'bob@example.com');
    expect(await sessions.countDocuments({ accountId: ann._id })).toBe(20);
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

    const detail = () => t.call({ method: 'GET', url: `/api/v1/admin/accounts/${created.account.id}`, cookie: admin.cookie });
    expect((await detail()).json().inviteExpiresAt).toBe(fresh.expiresAt);
    t.clock.advance(7 * DAY + 1);
    expect((await check(tokenOf(fresh.link))).statusCode).toBe(410);
    // An expired link is none at once ("None works now"), as it is once MongoDB's TTL monitor has deleted it.
    expect((await detail()).json().inviteExpiresAt).toBeNull();
  });

  it('accepting one ends the session the browser had, whoever it was for', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const created = await invite(t, admin.cookie);
    const token = tokenOf(created.link);
    const sessions = collections(t.db).sessions;
    // A refused try leaves it alone.
    const weak = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', cookie: admin.cookie, payload: { token, password: 'qwertyuiop' } });
    expect(weak.statusCode).toBe(422);
    expect(await sessions.countDocuments({ accountId: admin.account._id })).toBe(1);

    const accepted = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', cookie: admin.cookie, payload: { token, password: NEW_PASSWORD } });
    expect(accepted.statusCode).toBe(200);
    expect(await sessions.countDocuments({ accountId: admin.account._id })).toBe(0);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: admin.cookie })).statusCode).toBe(401);
    const me = await t.call({ method: 'GET', url: '/api/v1/me', cookie: sessionCookie(accepted) });
    expect(me.json<Me>().email).toBe('bob@example.com');
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

  it('counts wrong tokens against the address: 50 are free', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const created = await invite(t, admin.cookie);
    const kinds = ['invite/check', 'reset/check', 'invite/accept', 'reset/confirm'];
    for (let i = 0; i < 50; i++) {
      const kind = kinds[i % 4];
      const payload = kind.endsWith('check') ? { token: `wrong-${i}` } : { token: `wrong-${i}`, password: NEW_PASSWORD };
      const res = await t.call({ method: 'POST', url: `/api/v1/auth/${kind}`, payload });
      expect(res.statusCode, `try ${i}`).toBe(410);
    }
    // A right link from that address waits too; from another address it works.
    const check = (ip: string) =>
      t.call({ method: 'POST', url: '/api/v1/auth/invite/check', payload: { token: tokenOf(created.link) }, headers: { 'x-forwarded-for': ip } });
    const res = await t.call({ method: 'POST', url: '/api/v1/auth/reset/confirm', payload: { token: 'wrong', password: NEW_PASSWORD } });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: 'too_many_attempts', retryAfter: 2 });
    expect((await check('127.0.0.1')).statusCode).toBe(429);
    expect((await check('198.51.100.1')).statusCode).toBe(200);
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

  it('setting the new password ends the session the browser had, whoever it was for', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    await seedAccount(t.db, { email: 'bob@example.com' });
    const bob = await signIn(t, 'bob@example.com');
    const made = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${ann._id}/reset-link`, cookie: admin.cookie });
    const token = tokenOf(made.json<LinkCreated>().link);
    // Bob's browser opens Ann's link (a shared computer).
    const confirmed = await t.call({ method: 'POST', url: '/api/v1/auth/reset/confirm', cookie: bob, payload: { token, password: NEW_PASSWORD } });
    expect(confirmed.statusCode).toBe(200);
    const c = collections(t.db);
    const bobAccount = await c.accounts.findOne({ email: 'bob@example.com' });
    expect(await c.sessions.countDocuments({ accountId: bobAccount!._id })).toBe(0);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: sessionCookie(confirmed) })).json<Me>().email).toBe('ann@example.com');
  });

  it('stop working when the account signs out everywhere', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const made = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${ann._id}/reset-link`, cookie: admin.cookie });
    const token = tokenOf(made.json<LinkCreated>().link);
    const cookie = await signIn(t, 'ann@example.com');
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/reset/check', payload: { token } })).statusCode).toBe(200);
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/sign-out-everywhere', cookie })).statusCode).toBe(204);
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/reset/check', payload: { token } })).statusCode).toBe(410);
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
