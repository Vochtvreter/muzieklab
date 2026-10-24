import type { FastifyContextConfig, RouteOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InviteCreated, LinkCreated, Me } from '../../../shared/api.js';
import { buildApp } from '../app.js';
import { DEFAULT_LIMITS, networkOf } from '../auth/attempts.js';
import { SERVER_LANE, hashing } from '../auth/passwords.js';
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

  it('never keeps a right password waiting for the failures of others in its network, a /48 or a /24', async () => {
    // Five addresses of one network (homes an ISP gave a /56 each in one /48, phones behind one carrier NAT) send
    // wrong passwords for 5 minutes, each again as soon as its own wait ends: past the network's 200 free failures.
    // A pupil elsewhere in that network signs in every 30 s.
    const t = await makeApp(mongo);
    for (let i = 0; i < 30; i++) await seedAccount(t.db, { email: `pupil${i}@example.com` });
    await seedAccount(t.db, { email: 'ann@example.com' });
    const from = (ip: string, email: string, password = 'wrong password!') =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password }, headers: { 'x-forwarded-for': ip } });
    const networks = [
      { others: [1, 2, 3, 4, 5].map((i) => `2001:db8:abcd:${i}00::1`), pupil: '2001:db8:abcd:ff00::1' },
      { others: [1, 2, 3, 4, 5].map((i) => `203.0.113.${i}`), pupil: '203.0.113.200' },
    ];
    const nextTry = new Map<string, number>();
    let n = 0;
    /** Wrong passwords from `ip`, one after the other, until it is told to wait: how many were checked. */
    const fail = async (ip: string) => {
      for (let failures = 0; ; failures++) {
        const res = await from(ip, `pupil${n++ % 30}@example.com`);
        if (res.statusCode === 429) {
          nextTry.set(ip, t.clock.ms + res.json().retryAfter * 1000);
          return failures;
        }
        expect(res.statusCode).toBe(401);
      }
    };
    const failures = networks.map(() => 0);
    const pupils: number[][] = networks.map(() => []);
    for (let second = 0; second < 5 * 60; second++) {
      // Both networks at once; the addresses of each at once too, as they are due.
      await Promise.all(
        networks.map(async ({ others }, i) => {
          const due = others.filter((ip) => (nextTry.get(ip) ?? 0) <= t.clock.ms);
          for (const count of await Promise.all(due.map(fail))) failures[i] += count;
        }),
      );
      if (second % 30 === 0) {
        for (const [i, { pupil }] of networks.entries()) {
          pupils[i].push((await from(pupil, 'ann@example.com', PASSWORD)).statusCode);
        }
      }
      t.clock.advance(1000);
    }
    for (const [i] of networks.entries()) {
      expect(failures[i]).toBeGreaterThan(250);
      expect(pupils[i]).toEqual(Array(10).fill(200));
    }
  }, 30_000);

  it('keeps a network past 200 failures to its own 2 places in the hash queue, and makes none of its members wait', async () => {
    // Someone with a /48 sends wrong passwords, each try for another email and from another /64: the pair, address
    // and email counters see one failure each. Every try is checked, but the network then loses the hash queue's
    // shared places, so it cannot fill the queue.
    const t = await makeApp(mongo);
    for (let i = 0; i < 10; i++) await seedAccount(t.db, { email: `pupil${i}@example.com` });
    const from = (ip: string, i: number, password = 'wrong password!') =>
      t.call({
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        payload: { email: `pupil${i % 10}@example.com`, password },
        headers: { 'x-forwarded-for': ip },
      });
    const inNetwork = (i: number) => `2001:db8:abcd:${i.toString(16)}::1`;
    // 200 tries, 20 at a time, then 100 more: all checked, none told to wait.
    for (let batch = 0; batch < 10; batch++) {
      const res = await Promise.all(Array.from({ length: 20 }, (_, j) => from(inNetwork(batch * 20 + j), batch * 20 + j)));
      expect(res.map((r) => r.statusCode)).toEqual(Array(20).fill(401));
    }
    for (let i = 200; i < 300; i++) expect((await from(inNetwork(i), i)).statusCode).toBe(401);
    // Three /64s of another network fail once each, so their next tries are not clean either (none get the places
    // kept for those: the test after next).
    const elsewhere = (i: number) => `2001:db8:abce:${i}::1`;
    for (const i of [0, 1, 2]) expect((await from(elsewhere(i), i)).statusCode).toBe(401);
    // While the hashes are busy, the network may have 2 tries waiting, not 3…
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const busy = Array.from({ length: 4 }, () => hashing.run(SERVER_LANE, () => held));
    try {
      const waiting = [from(inNetwork(0), 0), from(inNetwork(1), 1)];
      await vi.waitFor(() => expect(hashing.waitingIn(networkOf(inNetwork(0)), 'other')).toBe(2));
      const third = await from(inNetwork(2), 2);
      expect(third.statusCode).toBe(429);
      expect(third.json()).toMatchObject({ error: 'busy', retryAfter: 1 });
      // …while another network may use the shared places.
      waiting.push(...[0, 1, 2].map((i) => from(elsewhere(i), i + 3)));
      await vi.waitFor(() => expect(hashing.waitingIn(networkOf(elsewhere(0)), 'other')).toBe(3));
      release();
      expect((await Promise.all(waiting)).map((r) => r.statusCode)).toEqual(Array(5).fill(401));
    } finally {
      release();
      await Promise.all(busy);
    }
    // Any /64 of the network signs in at once with a right password.
    expect((await from('2001:db8:abcd:ffff::1', 2, PASSWORD)).statusCode).toBe(200);
  }, 30_000);

  it('keeps 4 places in its line for clean addresses: a /60 holding its /48’s 2 cannot keep a neighbour out', async () => {
    // Someone with a /60 (16 /64s) of an ISP's /48, which the ISP shares out to many homes, puts the /48 past its 200
    // free failures and keeps its 2 places in the hash queue full, sending again as soon as a try is turned away.
    const t = await makeApp(mongo);
    for (let i = 0; i < 30; i++) await seedAccount(t.db, { email: `attacker${i}@example.com` });
    for (let i = 0; i < 10; i++) await seedAccount(t.db, { email: `pupil${i}@example.com` });
    const from = (ip: string, email: string, password = 'wrong password!') =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password }, headers: { 'x-forwarded-for': ip } });
    const network = networkOf('2001:db8:abcd::1');
    let sent = 0;
    const attack = () => {
      const n = sent++;
      return from(`2001:db8:abcd:${(0x10 + (n % 16)).toString(16)}::1`, `attacker${n % 30}@example.com`);
    };
    // 13 wrong passwords from each /64: 192 at 16 at once, then the network is past its 200 and they go one by one.
    for (let batch = 0; batch < 12; batch++) {
      const res = await Promise.all(Array.from({ length: 16 }, attack));
      expect(res.map((r) => r.statusCode)).toEqual(Array(16).fill(401));
    }
    for (let i = 0; i < 16; i++) expect((await attack()).statusCode).toBe(401);
    /** Holds the 4 hashes and floods from the /60, until `stop`: each of 4 loops sends again once it has an answer. */
    async function hold() {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let holding = 0;
      const busy = Array.from({ length: 4 }, () =>
        hashing.run(SERVER_LANE, async () => {
          holding++;
          await held;
        }),
      );
      let flooding = true;
      const statuses: number[] = [];
      const flooders = Array.from({ length: 4 }, async () => {
        while (flooding) statuses.push((await attack()).statusCode);
      });
      await vi.waitFor(() => expect(holding).toBe(4));
      await vi.waitFor(() => expect(hashing.waitingIn(network, 'other')).toBe(2));
      await vi.waitFor(() => expect(statuses.filter((code) => code === 429).length).toBeGreaterThan(10));
      return {
        release,
        stop: async () => {
          flooding = false;
          release();
          await Promise.all([...busy, ...flooders]);
          // Turned away while the line's 2 were taken; checked when it was served.
          expect(statuses).toContain(429);
          expect(statuses).toContain(401);
        },
      };
    }

    const first = await hold();
    try {
      // A neighbour's /64, with no try in 15 minutes, gets one of the kept places…
      const ann = from('2001:db8:abcd:ff00::1', 'pupil0@example.com', PASSWORD);
      await vi.waitFor(() => expect(hashing.waitingIn(network, 'clean')).toBe(1));
      // …and so do 3 more, but not a fifth: 4 for one network.
      const others = [1, 2, 3].map((i) => from(`2001:db8:abcd:ff0${i}::1`, `pupil${i}@example.com`));
      await vi.waitFor(() => expect(hashing.waitingIn(network, 'clean')).toBe(4));
      const fifth = await from('2001:db8:abcd:ff04::1', 'pupil4@example.com', PASSWORD);
      expect(fifth.statusCode).toBe(429);
      expect(fifth.json()).toMatchObject({ error: 'busy', retryAfter: 1 });
      // The line's turn comes, and its clean tries go first.
      first.release();
      expect((await ann).statusCode).toBe(200);
      expect((await Promise.all(others)).map((r) => r.statusCode)).toEqual([401, 401, 401]);
    } finally {
      await first.stop();
    }

    // A right password counts as a try too: the neighbour's /64 is not clean again for 15 minutes, so right passwords
    // to an account of one's own cannot hold the kept places either. A /64 with no try still gets in.
    const second = await hold();
    try {
      const again = from('2001:db8:abcd:ff00::2', 'pupil0@example.com', PASSWORD).then((r) => r.statusCode);
      // Turned away at once, not given a kept place to wait in.
      expect(await Promise.race([again, new Promise((resolve) => setTimeout(resolve, 2000, 'waiting'))])).toBe(429);
      const bob = from('2001:db8:abcd:ff05::1', 'pupil5@example.com', PASSWORD);
      await vi.waitFor(() => expect(hashing.waitingIn(network, 'clean')).toBe(1));
      second.release();
      expect((await bob).statusCode).toBe(200);
    } finally {
      await second.stop();
    }
    t.clock.advance(15 * 60_000 + 1);
    expect((await from('2001:db8:abcd:ff00::2', 'pupil0@example.com', PASSWORD)).statusCode).toBe(200);
  }, 30_000);

  it('keeps an address that has tried out of the kept places, however many wrong link tokens come from elsewhere', async () => {
    // Wrong link tokens cost no hash, so someone can send far more of them, from far more /64s, than the counters keep
    // entries for. They have entries of their own: pushing those out cannot make an address that tried a password clean
    // again. Small caps here (100 entries), as 100,000 link checks would make a slow test.
    const caps = { maxKeys: 100 };
    const limits = { ...DEFAULT_LIMITS, address: { ...DEFAULT_LIMITS.address, ...caps }, link: { ...DEFAULT_LIMITS.link, ...caps } };
    const t = await makeApp(mongo, { limits });
    for (let i = 0; i < 3; i++) await seedAccount(t.db, { email: `pupil${i}@example.com` });
    const from = (ip: string, email: string, password = 'wrong password!') =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password }, headers: { 'x-forwarded-for': ip } });
    const check = (ip: string, token: string) =>
      t.call({ method: 'POST', url: '/api/v1/auth/reset/check', payload: { token }, headers: { 'x-forwarded-for': ip } });
    const used = '2001:db8:abcd:10::1';
    const tunnel = (i: number) => `2001:db8:f000:${i.toString(16)}::1`;
    // One wrong password, then wrong tokens from 150 /64s of a tunnel broker's /48: more than either counter keeps.
    expect((await from(used, 'pupil0@example.com')).statusCode).toBe(401);
    for (let i = 0; i < 150; i++) expect((await check(tunnel(i), `wrong-${i}`)).statusCode).toBe(410);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const busy = Array.from({ length: 4 }, () => hashing.run(SERVER_LANE, () => held));
    try {
      // The /64 that tried waits as any try; a neighbour's /64 with no try gets a kept place.
      const again = from(used, 'pupil0@example.com', PASSWORD);
      await vi.waitFor(() => expect(hashing.waitingIn(networkOf(used), 'other')).toBe(1));
      const neighbour = from('2001:db8:abcd:20::1', 'pupil1@example.com', PASSWORD);
      await vi.waitFor(() => expect(hashing.waitingIn(networkOf(used), 'clean')).toBe(1));
      // Only the link entries were pushed out: the first tunnel /64's wrong token is forgotten, so it is clean again.
      const first = from(tunnel(0), 'pupil2@example.com', PASSWORD);
      await vi.waitFor(() => expect(hashing.waitingIn(networkOf(tunnel(0)), 'clean')).toBe(1));
      release();
      expect((await Promise.all([again, neighbour, first])).map((r) => r.statusCode)).toEqual([200, 200, 200]);
    } finally {
      release();
      await Promise.all(busy);
    }
  });

  it('serves the networks in turn: 40 /48s keeping the hash queue full do not keep a right password out', async () => {
    const t = await makeApp(mongo);
    for (let i = 0; i < 40; i++) await seedAccount(t.db, { email: `pupil${i}@example.com` });
    await seedAccount(t.db, { email: 'ann@example.com' });
    const from = (ip: string, email: string, password = 'wrong password!') =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password }, headers: { 'x-forwarded-for': ip } });
    // 40 networks, more than the queue's 32 shared places, each sending wrong passwords from its /64s.
    const inNetwork = (n: number, k: number) => `2001:db8:${(0x100 + n).toString(16)}:${k}::1`;
    // Each of their /64s has failed once, so none of their tries is clean (those have places of their own).
    for (let k = 0; k < 3; k++) {
      const res = await Promise.all(Array.from({ length: 40 }, (_, n) => from(inNetwork(n, k), `pupil${n}@example.com`)));
      expect(res.map((r) => r.statusCode)).toEqual(Array(40).fill(401));
    }
    const run = hashing.run.bind(hashing);
    const started: string[] = [];
    const spied = vi.spyOn(hashing, 'run').mockImplementation((lane, fn) =>
      run(lane, () => {
        started.push(lane.network);
        return fn();
      }),
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const busy = Array.from({ length: 4 }, () => run(SERVER_LANE, () => held));
    try {
      const flood = Array.from({ length: 80 }, (_, i) => from(inNetwork(i % 40, Math.floor(i / 40)), `pupil${i % 40}@example.com`));
      await vi.waitFor(() => expect(hashing.waiting).toBe(80));
      // The queue is full for them: a third try from any of them is turned away at once…
      const more = await Promise.all(Array.from({ length: 40 }, (_, n) => from(inNetwork(n, 2), `pupil${n}@example.com`)));
      expect(more.map((r) => [r.statusCode, r.json().error, r.json().retryAfter])).toEqual(Array(40).fill([429, 'busy', 1]));
      // …but Ann's network, with none waiting, gets a place, and her turn comes after one try of each of them.
      const ann = from('198.51.100.7', 'ann@example.com', PASSWORD);
      await vi.waitFor(() => expect(hashing.waiting).toBe(81));
      release();
      expect((await ann).statusCode).toBe(200);
      expect(started.indexOf(networkOf('198.51.100.7'))).toBe(40);
      expect((await Promise.all(flood)).map((r) => r.statusCode)).toEqual(Array(80).fill(401));
    } finally {
      release();
      await Promise.all(busy);
      spied.mockRestore();
    }
  }, 30_000);

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

  it('answers 429 `busy` (retry after 1 s) when its network may not wait for a hash, and does not count that try', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const signInWith = (password: string) =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password } });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    // 4 hashes running and 32 waiting, all from this network (the test's requests come from 127.0.0.1), and the 4
    // places its line keeps for clean tries taken too.
    const lane = { network: networkOf('127.0.0.1'), limited: false, clean: false };
    const busy = Array.from({ length: 4 + 32 }, () => hashing.run(lane, () => held));
    busy.push(...Array.from({ length: 4 }, () => hashing.run({ ...lane, clean: true }, () => held)));
    const refused = await signInWith('wrong password!');
    expect(refused.statusCode).toBe(429);
    // `busy`, not too_many_attempts: whoever gets it may have tried only once.
    expect(refused.json()).toEqual({ error: 'busy', message: expect.any(String), retryAfter: 1 });
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

  it('counts wrong tokens against the address, apart from its sign-ins: 50 are free', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const created = await invite(t, admin.cookie);
    await seedAccount(t.db, { email: 'ann@example.com' });
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
    // Sign-ins from that address are not slowed: wrong tokens have a counter of their own, so they do not use up the
    // address's 50 free failures, which many people may share (a school's IPv4 address).
    const signInWith = (password: string) =>
      t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password } });
    for (let i = 0; i < 4; i++) expect((await signInWith('wrong password!')).statusCode).toBe(401);
    expect((await signInWith(PASSWORD)).statusCode).toBe(200);
  });

  it('counts wrong tokens against the address only: they never slow the rest of its network', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const created = await invite(t, admin.cookie);
    await seedAccount(t.db, { email: 'ann@example.com' });
    const check = (ip: string, token: string) =>
      t.call({ method: 'POST', url: '/api/v1/auth/invite/check', payload: { token }, headers: { 'x-forwarded-for': ip } });
    const signInFrom = (ip: string) =>
      t.call({
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        payload: { email: 'ann@example.com', password: PASSWORD },
        headers: { 'x-forwarded-for': ip },
      });
    const networks: [(i: number) => string, string][] = [
      [(i) => `203.0.113.${i}`, '203.0.113.200'],
      [(i) => `2001:db8:abcd:${i.toString(16)}00::1`, '2001:db8:abcd:ff00::1'],
    ];
    for (const [inNetwork, pupil] of networks) {
      // Five addresses send wrong tokens until each is kept waiting: 250 failures in the network.
      for (let i = 1; i <= 5; i++) {
        for (let k = 0; k < 50; k++) expect((await check(inNetwork(i), `wrong-${i}-${k}`)).statusCode).toBe(410);
        expect((await check(inNetwork(i), 'wrong')).statusCode).toBe(429);
      }
      // Another address of that network is not slowed, signing in or opening a link…
      expect((await signInFrom(pupil)).statusCode).toBe(200);
      expect((await check(pupil, tokenOf(created.link))).statusCode).toBe(200);
      // …and the network keeps the hash queue's shared places: 3 sign-ins at once all wait while the hashes are busy
      // (from addresses with a wrong token each, so not in the places kept for clean tries).
      for (const i of [6, 7, 8]) expect((await check(inNetwork(i), 'wrong')).statusCode).toBe(410);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const busy = Array.from({ length: 4 }, () => hashing.run(SERVER_LANE, () => held));
      try {
        const signIns = [6, 7, 8].map((i) => signInFrom(inNetwork(i)));
        await vi.waitFor(() => expect(hashing.waitingIn(networkOf(pupil), 'other')).toBe(3));
        release();
        expect((await Promise.all(signIns)).map((r) => r.statusCode)).toEqual([200, 200, 200]);
      } finally {
        release();
        await Promise.all(busy);
      }
    }
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
