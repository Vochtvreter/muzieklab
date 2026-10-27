import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AccountDetail,
  AccountExport,
  AccountListResponse,
  AuditListResponse,
  ClosureListResponse,
  InviteCreated,
  LinkCreated,
  Me,
  Permission,
  Role,
} from '../../../shared/api.js';
import { PERMISSIONS } from '../../../shared/api.js';
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

const DAY = 24 * 60 * 60_000;
/**
 * A year ahead, for the tests that set the clock to a date: the sessions and links they make then end in the future,
 * so MongoDB's TTL monitor (which goes by the real time) leaves them alone however much later the tests run.
 */
const Y = new Date().getUTCFullYear() + 1;
const LEAP = [Y + 1, Y + 2, Y + 3, Y + 4].find((y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)!;

/** Gives editors more permissions for one test (in their stored role), to check each permission on its own. */
async function withEditorPermissions(t: TestApp, extra: Permission[], fn: () => Promise<void>) {
  const roles = collections(t.db).roles;
  const before = (await roles.findOne({ _id: 'editor' }))!.permissions;
  await roles.updateOne({ _id: 'editor' }, { $set: { permissions: [...before, ...extra] } });
  try {
    await fn();
  } finally {
    await roles.updateOne({ _id: 'editor' }, { $set: { permissions: before } });
  }
}

/** A custom role with every permission, as only such a role (or admin) may give out or take away admin. */
async function seedEverythingRole(t: TestApp, id = 'everything'): Promise<Role> {
  const now = new Date();
  await collections(t.db).roles.insertOne({ _id: id, name: 'Everything', description: '', permissions: [...PERMISSIONS], builtIn: false, createdAt: now, updatedAt: now });
  return id;
}

function patch(t: TestApp, cookie: string, id: string, payload: object) {
  return t.call({ method: 'PATCH', url: `/api/v1/admin/accounts/${id}`, cookie, payload });
}

describe('GET /admin/accounts', () => {
  it('lists accounts newest first, searching name or email and filtering by status', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const at = (days: number) => new Date(Date.now() - days * DAY);
    await seedAccount(t.db, { email: 'ann@school.example', name: 'Ann', createdAt: at(3) });
    await seedAccount(t.db, { email: 'bob@example.com', name: 'Bob (a.k.a. B+)', createdAt: at(2), status: 'blocked' });
    await seedAccount(t.db, { email: 'cy@example.com', name: 'Cy Anderson', createdAt: at(1), status: 'invited', password: null });
    const list = async (query: string) => {
      const res = await t.call({ method: 'GET', url: `/api/v1/admin/accounts${query}`, cookie: admin.cookie });
      expect(res.statusCode).toBe(200);
      return res.json<AccountListResponse>().accounts.map((a) => a.email);
    };
    expect(await list('')).toEqual(['admin@example.com', 'cy@example.com', 'bob@example.com', 'ann@school.example']);
    expect(await list('?q=AN')).toEqual(['cy@example.com', 'ann@school.example']);
    expect(await list('?q=school')).toEqual(['ann@school.example']);
    // Searched as text, not as a pattern.
    expect(await list('?q=b.b')).toEqual([]);
    expect(await list(`?q=${encodeURIComponent('.*')}`)).toEqual([]);
    expect(await list('?q=a.k.a.')).toEqual(['bob@example.com']);
    expect(await list(`?q=${encodeURIComponent('B+)')}`)).toEqual(['bob@example.com']);
    expect(await list('?status=blocked')).toEqual(['bob@example.com']);
    expect(await list('?q=an&status=invited')).toEqual(['cy@example.com']);
    const bad = await t.call({ method: 'GET', url: '/api/v1/admin/accounts?status=gone', cookie: admin.cookie });
    expect(bad.statusCode).toBe(400);

    const [first] = (await t.call({ method: 'GET', url: '/api/v1/admin/accounts?q=cy', cookie: admin.cookie })).json<AccountListResponse>().accounts;
    expect(first).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      email: 'cy@example.com',
      name: 'Cy Anderson',
      status: 'invited',
      roles: [],
      premium: { active: false, until: null },
      lastSignInAt: null,
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });
});

describe('GET /admin/accounts/:id', () => {
  it('shows an account with its number of signed-in devices', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    await signIn(t, 'ann@example.com');
    await signIn(t, 'ann@example.com');
    const res = await t.call({ method: 'GET', url: `/api/v1/admin/accounts/${ann._id}`, cookie: admin.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json<AccountDetail>()).toMatchObject({ email: 'ann@example.com', sessions: 2, inviteExpiresAt: null, status: 'active' });
    for (const id of ['0123456789abcdef01234567', 'not-an-id']) {
      const missing = await t.call({ method: 'GET', url: `/api/v1/admin/accounts/${id}`, cookie: admin.cookie });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ error: 'not_found' });
    }
  });
});

describe('PATCH /admin/accounts/:id', () => {
  it('grants and revokes roles, and audits each', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com', roles: ['teacher'] });
    const res = await patch(t, admin.cookie, ann._id.toHexString(), { roles: ['editor', 'admin'] });
    expect(res.statusCode).toBe(200);
    expect(res.json<AccountDetail>().roles).toEqual(['admin', 'editor']);
    const audit = await collections(t.db).audit.find({ targetId: ann._id }).sort({ _id: 1 }).toArray();
    expect(audit.map((e) => [e.action, e.details, e.actorId?.toHexString()])).toEqual([
      ['role.grant', { roles: ['admin', 'editor'] }, admin.account._id.toHexString()],
      ['role.revoke', { roles: ['teacher'] }, admin.account._id.toHexString()],
    ]);
    // The same roles again change nothing and write nothing.
    await patch(t, admin.cookie, ann._id.toHexString(), { roles: ['admin', 'editor'] });
    expect(await collections(t.db).audit.countDocuments({ targetId: ann._id })).toBe(2);
    const bad = await patch(t, admin.cookie, ann._id.toHexString(), { roles: ['pope'] });
    expect(bad.statusCode).toBe(400);
  });

  it('gives or takes away one role in the roles the account has now, so a change made meanwhile stays', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com', roles: ['teacher'] });
    const id = ann._id.toHexString();
    const actions = async () => (await collections(t.db).audit.find({ targetId: ann._id }).sort({ _id: 1 }).toArray()).map((e) => [e.action, e.details]);
    // Teacher was given in another tab; this one only switches Editor on.
    const added = await patch(t, admin.cookie, id, { addRoles: ['editor'] });
    expect(added.statusCode).toBe(200);
    expect(added.json<AccountDetail>().roles).toEqual(['editor', 'teacher']);
    expect(await actions()).toEqual([['role.grant', { roles: ['editor'] }]]);
    const removed = await patch(t, admin.cookie, id, { removeRoles: ['teacher'] });
    expect(removed.json<AccountDetail>().roles).toEqual(['editor']);
    // A role it has already, or does not have, changes nothing and writes nothing.
    await patch(t, admin.cookie, id, { addRoles: ['editor'], removeRoles: ['teacher'] });
    expect(await actions()).toEqual([
      ['role.grant', { roles: ['editor'] }],
      ['role.revoke', { roles: ['teacher'] }],
    ]);
    // A whole list and a change to it at once, or one role in both, say nothing clear: refused.
    for (const payload of [{ roles: ['editor'], addRoles: ['teacher'] }, { addRoles: ['teacher'], removeRoles: ['teacher'] }, { addRoles: ['pope'] }]) {
      const res = await patch(t, admin.cookie, id, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect((await collections(t.db).accounts.findOne({ _id: ann._id }))?.roles).toEqual(['editor']);
  });

  it('blocks (signing the account out everywhere) and unblocks', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    const blocked = await patch(t, admin.cookie, ann._id.toHexString(), { status: 'blocked' });
    expect(blocked.json<AccountDetail>()).toMatchObject({ status: 'blocked', sessions: 0 });
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(401);
    const refused = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'ann@example.com', password: PASSWORD } });
    expect(refused.statusCode).toBe(401);

    const unblocked = await patch(t, admin.cookie, ann._id.toHexString(), { status: 'active' });
    expect(unblocked.json<AccountDetail>().status).toBe('active');
    await signIn(t, 'ann@example.com');
    const actions = await collections(t.db).audit.find({ targetId: ann._id }).sort({ _id: 1 }).map((e) => e.action).toArray();
    expect(actions).toEqual(['account.block', 'account.unblock']);
  });

  it('does not block, unblock or activate an invited account', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const cy = await seedAccount(t.db, { email: 'cy@example.com', status: 'invited', password: null });
    for (const status of ['active', 'blocked']) {
      const res = await patch(t, admin.cookie, cy._id.toHexString(), { status });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'wrong_status' });
    }
  });

  it('turns premium on through a last day or with no end, and off', async () => {
    const t = await makeApp(mongo);
    t.clock.ms = Date.UTC(Y, 9, 23, 18); // 23 October, 18:00 UTC
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    // Signed in afresh each time, as the clock jumps past the session token's hour.
    const me = async () => (await t.call({ method: 'GET', url: '/api/v1/me', cookie: await signIn(t, 'ann@example.com') })).json<Me>().premium;
    const id = ann._id.toHexString();

    const res = await patch(t, admin.cookie, id, { premium: { active: true, until: `${Y}-11-02` } });
    expect(res.json<AccountDetail>().premium).toEqual({ active: true, until: `${Y}-11-02` });
    expect((await collections(t.db).accounts.findOne({ _id: ann._id }))?.premium).toEqual({ until: `${Y}-11-02` });
    expect(await me()).toEqual({ active: true, until: `${Y}-11-02` });
    // On through that whole day anywhere: until the next day, 12:00 UTC (the day's end at UTC−12).
    t.clock.ms = Date.UTC(Y, 10, 3, 11, 59, 59, 999);
    expect(await me()).toEqual({ active: true, until: `${Y}-11-02` });
    t.clock.ms = Date.UTC(Y, 10, 3, 12);
    expect(await me()).toEqual({ active: false, until: null });
    const adminCookie = await signIn(t, 'admin@example.com');
    const list = await t.call({ method: 'GET', url: '/api/v1/admin/accounts?q=ann', cookie: adminCookie });
    expect(list.json<AccountListResponse>().accounts[0].premium).toEqual({ active: false, until: null });

    await patch(t, adminCookie, id, { premium: { active: true, until: null } });
    expect(await me()).toEqual({ active: true, until: null });
    await patch(t, adminCookie, id, { premium: { active: false } });
    expect(await me()).toEqual({ active: false, until: null });
    expect((await collections(t.db).accounts.findOne({ _id: ann._id }))?.premium).toBeNull();

    const audit = await collections(t.db).audit.find({ targetId: ann._id }).sort({ _id: 1 }).toArray();
    expect(audit.map((e) => [e.action, e.details])).toEqual([
      ['premium.grant', { until: `${Y}-11-02` }],
      ['premium.grant', { until: null }],
      ['premium.revoke', {}],
    ]);
  });

  it('takes a real date as the last day, and refuses one that is over everywhere', async () => {
    const t = await makeApp(mongo);
    t.clock.ms = Date.UTC(Y, 9, 23, 18); // 23 October, 18:00 UTC
    const admin = await signedInAdmin(t);
    const id = (await seedAccount(t.db, { email: 'ann@example.com' }))._id.toHexString();
    const premium = (until: unknown) => patch(t, admin.cookie, id, { premium: { active: true, until } });
    for (const until of ['soon', `${Y}-11-2`, `${Y}-11-02T00:00:00.000Z`, `${LEAP - 1}-02-29`, `${Y}-13-01`, `${Y}-04-31`, `${Y}-00-10`, 20261102]) {
      const res = await premium(until);
      expect(res.statusCode, String(until)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'bad_request' });
    }
    for (const body of [{ active: true }, { active: false, until: null }]) {
      expect((await patch(t, admin.cookie, id, { premium: body })).statusCode, JSON.stringify(body)).toBe(400);
    }
    // 22 October is over everywhere since 23 October 12:00 UTC; 23 October still goes on somewhere.
    expect((await premium(`${Y}-10-22`)).statusCode).toBe(400);
    expect((await premium(`${Y}-10-23`)).json<AccountDetail>().premium).toEqual({ active: true, until: `${Y}-10-23` });
    expect((await premium(`${LEAP}-02-29`)).json<AccountDetail>().premium).toEqual({ active: true, until: `${LEAP}-02-29` });
  });

  it('reads a last day saved as a moment (the first test-site release) as its UTC calendar day', async () => {
    const t = await makeApp(mongo);
    t.clock.ms = Date.UTC(Y, 9, 23, 18);
    const admin = await signedInAdmin(t);
    // 31 December picked in Amsterdam, as the first release stored it.
    const ann = await seedAccount(t.db, { email: 'ann@example.com', premium: { until: new Date(`${Y}-12-31T22:59:59.999Z`) } });
    const cookie = await signIn(t, 'ann@example.com');
    const detail = await t.call({ method: 'GET', url: `/api/v1/admin/accounts/${ann._id}`, cookie: admin.cookie });
    expect(detail.json<AccountDetail>().premium).toEqual({ active: true, until: `${Y}-12-31` });
    const exported = await t.call({ method: 'GET', url: '/api/v1/me/export', cookie });
    expect(exported.json<AccountExport>().account.premium).toEqual({ active: true, until: `${Y}-12-31` });
    // The same day again is no change; another day is stored as a date.
    await patch(t, admin.cookie, ann._id.toHexString(), { premium: { active: true, until: `${Y}-12-31` } });
    expect(await collections(t.db).audit.countDocuments({ action: 'premium.grant' })).toBe(0);
    await patch(t, admin.cookie, ann._id.toHexString(), { premium: { active: true, until: `${Y + 1}-01-31` } });
    expect((await collections(t.db).accounts.findOne({ _id: ann._id }))?.premium).toEqual({ until: `${Y + 1}-01-31` });
    t.clock.ms = Date.UTC(Y + 1, 1, 1, 11, 59);
    const later = await signIn(t, 'ann@example.com');
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: later })).json<Me>().premium).toEqual({ active: true, until: `${Y + 1}-01-31` });
    t.clock.ms = Date.UTC(Y + 1, 1, 1, 12);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: later })).json<Me>().premium).toEqual({ active: false, until: null });
  });

  it('corrects the name and email', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com', name: 'Ann' });
    await seedAccount(t.db, { email: 'taken@example.com' });
    const id = ann._id.toHexString();
    const res = await patch(t, admin.cookie, id, { name: 'Anne', email: 'ANNE@example.com' });
    expect(res.json<AccountDetail>()).toMatchObject({ name: 'Anne', email: 'anne@example.com' });
    expect((await patch(t, admin.cookie, id, { email: 'taken@example.com' })).json()).toMatchObject({ error: 'email_taken' });
    expect((await patch(t, admin.cookie, id, { email: 'nope' })).json()).toMatchObject({ error: 'email_invalid' });
    expect((await patch(t, admin.cookie, id, { name: '' })).statusCode).toBe(400);
    const entry = await collections(t.db).audit.findOne({ targetId: ann._id, action: 'account.update' });
    expect(entry?.details).toEqual({ fields: ['name', 'email'], name: 'Anne', email: 'anne@example.com', previousEmail: 'ann@example.com' });
  });

  it('makes the links for the old email stop working when it is corrected', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const check = async (kind: 'invite' | 'reset', link: LinkCreated) =>
      (await t.call({ method: 'POST', url: `/api/v1/auth/${kind}/check`, payload: { token: tokenOf(link.link) } })).statusCode;

    // An active account's new-password link.
    const ann = await seedAccount(t.db, { email: 'ann@exmaple.com' });
    const reset = (await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${ann._id}/reset-link`, cookie: admin.cookie })).json<LinkCreated>();
    expect(await check('reset', reset)).toBe(200);
    expect((await patch(t, admin.cookie, ann._id.toHexString(), { name: 'Ann B' })).statusCode).toBe(200);
    expect(await check('reset', reset)).toBe(200); // another field leaves it
    expect((await patch(t, admin.cookie, ann._id.toHexString(), { email: 'ann@example.com' })).statusCode).toBe(200);
    expect(await check('reset', reset)).toBe(410);

    // An invited account's invite: the admin makes a new one for the right address.
    const invited = await t.call({
      method: 'POST',
      url: '/api/v1/admin/invites',
      cookie: admin.cookie,
      payload: { email: 'jan@exmaple.nl', name: 'Jan', roles: ['admin'] },
    });
    const created = invited.json<InviteCreated>();
    expect(await check('invite', created)).toBe(200);
    const fixed = await patch(t, admin.cookie, created.account.id, { email: 'jan@example.nl' });
    expect(fixed.json<AccountDetail>()).toMatchObject({ email: 'jan@example.nl', status: 'invited', inviteExpiresAt: null });
    expect(await check('invite', created)).toBe(410);
    const relink = await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${created.account.id}/invite-link`, cookie: admin.cookie });
    expect(await check('invite', relink.json<LinkCreated>())).toBe(200);
  });

  it('needs every permission the fields need', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'admin@example.com', roles: ['admin'] }); // so the editor is never the last admin's problem
    await seedAccount(t.db, { email: 'ed@example.com', roles: ['editor'] });
    const target = (await seedAccount(t.db, { email: 'ann@example.com' }))._id.toHexString();
    const cookie = await signIn(t, 'ed@example.com');
    const fields: [object, Permission][] = [
      [{ name: 'Ann' }, 'accounts.invite'],
      [{ email: 'ann2@example.com' }, 'accounts.invite'],
      [{ roles: ['teacher'] }, 'roles.grant'],
      [{ addRoles: ['teacher'] }, 'roles.grant'],
      [{ removeRoles: ['teacher'] }, 'roles.grant'],
      [{ status: 'blocked' }, 'accounts.block'],
      [{ premium: { active: false } }, 'entitlements.grant'],
    ];
    // Without accounts.read, the route itself is closed.
    expect((await patch(t, cookie, target, { name: 'Ann' })).statusCode).toBe(403);
    for (const [payload, permission] of fields) {
      await withEditorPermissions(t, ['accounts.read'], async () => {
        const res = await patch(t, cookie, target, payload);
        expect(res.statusCode, `${JSON.stringify(payload)} without ${permission}`).toBe(403);
      });
      // Granting teacher also needs what teacher lets someone do (class.create): nobody gives out more than they have.
      await withEditorPermissions(t, ['accounts.read', permission, ...(permission === 'roles.grant' ? (['class.create'] as const) : [])], async () => {
        const res = await patch(t, cookie, target, payload);
        expect(res.statusCode, `${JSON.stringify(payload)} with ${permission}`).toBe(200);
        // Two fields need both permissions.
        const both = await patch(t, cookie, target, { ...payload, ...(permission === 'roles.grant' ? { premium: { active: false } } : { roles: [] }) });
        expect(both.statusCode).toBe(403);
      });
    }
  });

  it('a link, a name or an email for an account needs every permission it has: nobody climbs to more through them', async () => {
    const t = await makeApp(mongo);
    const boss = await seedAccount(t.db, { email: 'admin@example.com', roles: ['admin'] });
    const newBoss = await seedAccount(t.db, { email: 'new@example.com', roles: ['admin'], status: 'invited', password: null });
    const teacher = await seedAccount(t.db, { email: 'tess@example.com', roles: ['teacher'] });
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const ed = await seedAccount(t.db, { email: 'ed@example.com', roles: ['editor'] });
    const cookie = await signIn(t, 'ed@example.com');
    const link = (id: unknown, kind: 'invite' | 'reset') => t.call({ method: 'POST', url: `/api/v1/admin/accounts/${String(id)}/${kind}-link`, cookie });
    await withEditorPermissions(t, ['accounts.read', 'accounts.invite'], async () => {
      // A new-password link signs its holder in as the account, with all it may do; an invite link the same, once accepted.
      expect((await link(boss._id, 'reset')).statusCode).toBe(403);
      expect((await link(newBoss._id, 'invite')).statusCode).toBe(403);
      expect((await link(teacher._id, 'reset')).statusCode).toBe(403); // class.create, which the editor lacks
      // A new email locks the account's owner out (and ends its links); a name is how others know the account.
      for (const payload of [{ email: 'evil@example.com' }, { name: 'Not the admin' }]) {
        expect((await patch(t, cookie, boss._id.toHexString(), payload)).statusCode, JSON.stringify(payload)).toBe(403);
        expect((await patch(t, cookie, newBoss._id.toHexString(), payload)).statusCode, JSON.stringify(payload)).toBe(403);
      }
      expect(await collections(t.db).accounts.findOne({ _id: boss._id })).toMatchObject({ email: 'admin@example.com', name: 'Test person' });
      expect(await collections(t.db).tokens.countDocuments({ createdBy: ed._id })).toBe(0);
      // No more than the editor holds: as before.
      expect((await link(ann._id, 'reset')).statusCode).toBe(200);
      expect((await patch(t, cookie, ann._id.toHexString(), { name: 'Ann', email: 'ann2@example.com' })).statusCode).toBe(200);
      expect((await patch(t, cookie, ed._id.toHexString(), { name: 'Ed' })).statusCode).toBe(200);
    });
    // With what the teacher has too, its link is fine.
    await withEditorPermissions(t, ['accounts.read', 'accounts.invite', 'class.create'], async () => {
      expect((await link(teacher._id, 'reset')).statusCode).toBe(200);
    });
  });

  it('does not let an admin change their own roles or status', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    await seedAccount(t.db, { email: 'second@example.com', roles: ['admin'] });
    const id = admin.account._id.toHexString();
    for (const payload of [{ roles: ['admin', 'teacher'] }, { roles: [] }, { addRoles: ['teacher'] }, { removeRoles: ['admin'] }, { status: 'blocked' }]) {
      const res = await patch(t, admin.cookie, id, payload);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'own_account' });
    }
    // Sending what is already there is not a change; the own name is fine.
    expect((await patch(t, admin.cookie, id, { roles: ['admin'], status: 'active', name: 'Boss' })).statusCode).toBe(200);
    const self = await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${id}`, cookie: admin.cookie });
    expect(self.statusCode).toBe(409);
    expect(self.json()).toMatchObject({ error: 'own_account' });
  });

  it('never leaves no active admin: role, block and delete', async () => {
    const t = await makeApp(mongo);
    const only = await seedAccount(t.db, { email: 'admin@example.com', roles: ['admin'] });
    // Not an admin, but with every permission: may take admin away, so the guard rail is what stops it.
    await seedAccount(t.db, { email: 'ed@example.com', roles: [await seedEverythingRole(t)] });
    const cookie = await signIn(t, 'ed@example.com');
    const id = only._id.toHexString();
    {
      for (const payload of [{ roles: [] }, { roles: ['teacher'] }, { removeRoles: ['admin'] }, { status: 'blocked' }]) {
        const res = await patch(t, cookie, id, payload);
        expect(res.statusCode, JSON.stringify(payload)).toBe(409);
        expect(res.json()).toMatchObject({ error: 'last_admin' });
      }
      const del = await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${id}`, cookie });
      expect(del.statusCode).toBe(409);
      expect(del.json()).toMatchObject({ error: 'last_admin' });
      // An invited or blocked admin does not count as one.
      await seedAccount(t.db, { email: 'invited-admin@example.com', roles: ['admin'], status: 'invited', password: null });
      await seedAccount(t.db, { email: 'blocked-admin@example.com', roles: ['admin'], status: 'blocked' });
      expect((await patch(t, cookie, id, { roles: [] })).statusCode).toBe(409);
      // Adding roles is always fine.
      expect((await patch(t, cookie, id, { roles: ['admin', 'teacher'] })).statusCode).toBe(200);
    }
    expect((await collections(t.db).accounts.findOne({ _id: only._id }))?.roles).toEqual(['admin', 'teacher']);
  });

  it('lets two admins demote each other until one is left', async () => {
    const t = await makeApp(mongo);
    const a = await signedInAdmin(t, 'a@example.com');
    const b = await signedInAdmin(t, 'b@example.com');
    expect((await patch(t, a.cookie, b.account._id.toHexString(), { roles: [] })).statusCode).toBe(200);
    expect((await patch(t, b.cookie, a.account._id.toHexString(), { roles: [] })).statusCode).toBe(403);

    // At the same moment: the transactions take turns, so exactly one wins and one admin is left.
    await patch(t, a.cookie, b.account._id.toHexString(), { roles: ['admin'] });
    const both = await Promise.all([
      patch(t, a.cookie, b.account._id.toHexString(), { roles: [] }),
      patch(t, b.cookie, a.account._id.toHexString(), { roles: [] }),
    ]);
    const codes = both.map((r) => r.statusCode).sort();
    expect(codes[0]).toBe(200);
    expect([403, 409]).toContain(codes[1]);
    expect(await collections(t.db).accounts.countDocuments({ roles: 'admin', status: 'active' })).toBe(1);
  });
});

describe('DELETE /admin/accounts/:id', () => {
  it('cancels an invite: the account and its link go', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const invite = await t.call({
      method: 'POST',
      url: '/api/v1/admin/invites',
      cookie: admin.cookie,
      payload: { email: 'cy@example.com', name: 'Cy', roles: [] },
    });
    const { account, link } = invite.json<InviteCreated>();
    const res = await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${account.id}`, cookie: admin.cookie });
    expect(res.statusCode).toBe(204);
    expect((await t.call({ method: 'POST', url: '/api/v1/auth/invite/check', payload: { token: tokenOf(link) } })).statusCode).toBe(410);
    const c = collections(t.db);
    expect(await c.accounts.countDocuments({ email: 'cy@example.com' })).toBe(0);
    expect(await c.tokens.countDocuments()).toBe(0);
    const entries = await c.audit.find().sort({ _id: 1 }).toArray();
    expect(entries.map((e) => [e.action, e.details])).toEqual([
      ['account.invite', { deleted: true }],
      ['account.delete', { status: 'invited' }],
    ]);
    // An invite that was never used is not a deleted account.
    expect(await c.closures.countDocuments()).toBe(0);
  });

  it('with ?expect, deletes only an account in that status: an invite accepted meanwhile is not cancelled', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const invite = await t.call({
      method: 'POST',
      url: '/api/v1/admin/invites',
      cookie: admin.cookie,
      payload: { email: 'lies@example.com', name: 'Lies', roles: [] },
    });
    const { account, link } = invite.json<InviteCreated>();
    // Lies accepts while the admin's screen still shows her invite.
    const accepted = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { token: tokenOf(link), password: 'a melody in d minor' } });
    expect(accepted.statusCode).toBe(200);
    const del = (expect: string) =>
      t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${account.id}?expect=${expect}`, cookie: admin.cookie });
    for (const status of ['invited', 'blocked']) {
      const res = await del(status);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'wrong_status' });
    }
    const c = collections(t.db);
    expect(await c.accounts.countDocuments({ email: 'lies@example.com', status: 'active' })).toBe(1);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie: sessionCookie(accepted) })).statusCode).toBe(200);
    expect(await c.audit.countDocuments({ action: 'account.delete' })).toBe(0);
    expect((await del('gone')).statusCode).toBe(400);
    const other = await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${account.id}?status=invited`, cookie: admin.cookie });
    expect(other.statusCode).toBe(400);
    // The status it has: deleted.
    expect((await del('active')).statusCode).toBe(204);
    expect(await c.accounts.countDocuments({ email: 'lies@example.com' })).toBe(0);
    expect((await del('active')).statusCode).toBe(404);
  });

  it('deletes an account with its sessions', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${ann._id}`, cookie: admin.cookie })).statusCode).toBe(204);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(401);
    expect(await collections(t.db).sessions.countDocuments({ accountId: ann._id })).toBe(0);
    // Nothing of it is kept but that an admin deleted an account.
    expect(await collections(t.db).closures.find().project({ _id: 0, day: 0 }).toArray()).toEqual([{ kind: 'admin', feedback: null, archive: null }]);
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${ann._id}`, cookie: admin.cookie })).statusCode).toBe(404);
    // A teacher may not.
    await seedAccount(t.db, { email: 'teacher@example.com', roles: ['teacher'] });
    const teacher = await signIn(t, 'teacher@example.com');
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${admin.account._id}`, cookie: teacher })).statusCode).toBe(403);
  });
});

describe('GET /admin/closures', () => {
  it('lists deleted accounts, newest day first, to those who may read accounts', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const deleteSelf = async (email: string, payload: object) => {
      await seedAccount(t.db, { email, createdAt: new Date(Date.UTC(2026, 0, 15)) });
      const cookie = await signIn(t, email);
      expect((await t.call({ method: 'DELETE', url: '/api/v1/me', cookie, payload: { password: PASSWORD, ...payload } })).statusCode).toBe(204);
    };
    await deleteSelf('ann@example.com', { removeData: false, feedback: 'Not for me' });
    t.clock.advance(DAY);
    await deleteSelf('bob@example.com', { removeData: true });
    t.clock.advance(DAY);
    // A day later: the admin's session token (an hour) has ended.
    const cookie = await signIn(t, admin.account.email);
    const cy = await seedAccount(t.db, { email: 'cy@example.com' });
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${cy._id}`, cookie })).statusCode).toBe(204);

    const res = await t.call({ method: 'GET', url: '/api/v1/admin/closures', cookie });
    expect(res.statusCode).toBe(200);
    const { closures } = res.json<ClosureListResponse>();
    const day = (n: number) => new Date(t.clock.ms - n * DAY).toISOString().slice(0, 10);
    expect(closures).toEqual([
      { id: expect.stringMatching(/^[0-9a-f]{32}$/), day: day(0), kind: 'admin', feedback: null, archive: null },
      { id: expect.any(String), day: day(1), kind: 'removed', feedback: null, archive: null },
      { id: expect.any(String), day: day(2), kind: 'archived', feedback: 'Not for me', archive: { joined: '2026-01', data: null } },
    ]);
    expect(res.body).not.toMatch(/ann|bob|cy@/);

    await seedAccount(t.db, { email: 'teacher@example.com', roles: ['teacher'] });
    const teacher = await signIn(t, 'teacher@example.com');
    expect((await t.call({ method: 'GET', url: '/api/v1/admin/closures', cookie: teacher })).statusCode).toBe(403);
    expect((await t.call({ method: 'GET', url: '/api/v1/admin/closures' })).statusCode).toBe(401);
  });

  it('shows at most 500, the newest, and says how many there are; the file asks for all of them', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const start = Date.UTC(2026, 9, 27);
    await collections(t.db).closures.insertMany(
      Array.from({ length: 501 }, (_, i) => ({
        _id: i.toString(16).padStart(32, '0'),
        day: new Date(start - i * DAY),
        kind: 'removed' as const,
        feedback: null,
        archive: null,
      })),
    );
    const list = (query = '') => t.call({ method: 'GET', url: '/api/v1/admin/closures' + query, cookie: admin.cookie });
    const shown = (await list()).json<ClosureListResponse>();
    expect(shown.closures).toHaveLength(500);
    expect(shown.total).toBe(501);
    expect(shown.closures[0].day).toBe('2026-10-27');
    const all = (await list('?all=true')).json<ClosureListResponse>();
    expect(all.closures).toHaveLength(501);
    expect(all.total).toBe(501);
    expect(all.closures.at(-1)?.day).toBe(new Date(start - 500 * DAY).toISOString().slice(0, 10));
    expect((await list('?all=yes')).statusCode).toBe(400);
  });
});

describe('GET /admin/audit', () => {
  it('lists entries newest first, in pages, with no secrets in them', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const invite = await t.call({
      method: 'POST',
      url: '/api/v1/admin/invites',
      cookie: admin.cookie,
      payload: { email: 'cy@example.com', name: 'Cy', roles: ['teacher'] },
    });
    const { account, link } = invite.json<InviteCreated>();
    const accepted = await t.call({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { token: tokenOf(link), password: 'a melody in d minor' } });
    const cy = sessionCookie(accepted)!;
    await t.call({ method: 'POST', url: '/api/v1/me/password', cookie: cy, payload: { currentPassword: 'a melody in d minor', newPassword: 'another tune entirely' } });
    await t.call({ method: 'POST', url: `/api/v1/admin/accounts/${account.id}/reset-link`, cookie: admin.cookie });
    await patch(t, admin.cookie, account.id, { premium: { active: true, until: null } });

    const all = await t.call({ method: 'GET', url: '/api/v1/admin/audit', cookie: admin.cookie });
    expect(all.statusCode).toBe(200);
    const entries = all.json<AuditListResponse>().entries;
    expect(entries.map((e) => e.action)).toEqual([
      'premium.grant',
      'account.reset_link',
      'account.change_password',
      'account.accept_invite',
      'account.invite',
    ]);
    expect(entries[4]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      at: expect.any(String),
      actorId: admin.account._id.toHexString(),
      action: 'account.invite',
      targetId: account.id,
      details: { email: 'cy@example.com', name: 'Cy', roles: ['teacher'] },
    });
    const text = all.body;
    expect(text).not.toContain(tokenOf(link));
    expect(text).not.toMatch(/scrypt|melody|another tune/);

    const page1 = (await t.call({ method: 'GET', url: '/api/v1/admin/audit?limit=2', cookie: admin.cookie })).json<AuditListResponse>().entries;
    expect(page1.map((e) => e.action)).toEqual(['premium.grant', 'account.reset_link']);
    const page2 = (
      await t.call({ method: 'GET', url: `/api/v1/admin/audit?limit=2&before=${page1[1].id}`, cookie: admin.cookie })
    ).json<AuditListResponse>().entries;
    expect(page2.map((e) => e.action)).toEqual(['account.change_password', 'account.accept_invite']);
    for (const query of ['limit=0', 'limit=abc', 'before=xyz', 'other=1']) {
      expect((await t.call({ method: 'GET', url: `/api/v1/admin/audit?${query}`, cookie: admin.cookie })).statusCode).toBe(400);
    }
    expect((await t.call({ method: 'GET', url: '/api/v1/admin/audit', cookie: cy })).statusCode).toBe(403);
  });
});
