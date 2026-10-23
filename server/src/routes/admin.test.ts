import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AccountDetail,
  AccountListResponse,
  AuditListResponse,
  InviteCreated,
  Me,
  Permission,
  Role,
} from '../../../shared/api.js';
import { ROLE_PERMISSIONS } from '../auth/policy.js';
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

/** Gives editors some admin permissions for one test, to check each permission on its own. */
async function withEditorPermissions(extra: Permission[], fn: () => Promise<void>) {
  const table = ROLE_PERMISSIONS as Record<Role, readonly Permission[]>;
  const before = table.editor;
  table.editor = [...before, ...extra];
  try {
    await fn();
  } finally {
    table.editor = before;
  }
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

  it('turns premium on with or without an end, and off', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    const me = async () => (await t.call({ method: 'GET', url: '/api/v1/me', cookie })).json<Me>().premium;
    const id = ann._id.toHexString();

    const until = new Date(t.clock.ms + 10 * DAY).toISOString();
    expect((await patch(t, admin.cookie, id, { premium: { active: true, until } })).json<AccountDetail>().premium).toEqual({ active: true, until });
    expect(await me()).toEqual({ active: true, until });
    t.clock.advance(11 * DAY);
    expect(await me()).toEqual({ active: false, until: null });

    await patch(t, admin.cookie, id, { premium: { active: true, until: null } });
    expect(await me()).toEqual({ active: true, until: null });
    await patch(t, admin.cookie, id, { premium: { active: false } });
    expect(await me()).toEqual({ active: false, until: null });
    expect((await collections(t.db).accounts.findOne({ _id: ann._id }))?.premium).toBeNull();

    for (const premium of [{ active: true }, { active: true, until: 'soon' }, { active: false, until: null }]) {
      const res = await patch(t, admin.cookie, id, { premium });
      expect(res.statusCode, JSON.stringify(premium)).toBe(400);
    }
    const audit = await collections(t.db).audit.find({ targetId: ann._id }).sort({ _id: 1 }).toArray();
    expect(audit.map((e) => [e.action, e.details])).toEqual([
      ['premium.grant', { until }],
      ['premium.grant', { until: null }],
      ['premium.revoke', {}],
    ]);
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
      [{ status: 'blocked' }, 'accounts.block'],
      [{ premium: { active: false } }, 'entitlements.grant'],
    ];
    // Without accounts.read, the route itself is closed.
    expect((await patch(t, cookie, target, { name: 'Ann' })).statusCode).toBe(403);
    for (const [payload, permission] of fields) {
      await withEditorPermissions(['accounts.read'], async () => {
        const res = await patch(t, cookie, target, payload);
        expect(res.statusCode, `${JSON.stringify(payload)} without ${permission}`).toBe(403);
      });
      await withEditorPermissions(['accounts.read', permission], async () => {
        const res = await patch(t, cookie, target, payload);
        expect(res.statusCode, `${JSON.stringify(payload)} with ${permission}`).toBe(200);
        // Two fields need both permissions.
        const both = await patch(t, cookie, target, { ...payload, ...(permission === 'roles.grant' ? { premium: { active: false } } : { roles: [] }) });
        expect(both.statusCode).toBe(403);
      });
    }
  });

  it('does not let an admin change their own roles or status', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    await seedAccount(t.db, { email: 'second@example.com', roles: ['admin'] });
    const id = admin.account._id.toHexString();
    for (const payload of [{ roles: ['admin', 'teacher'] }, { roles: [] }, { status: 'blocked' }]) {
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
    await seedAccount(t.db, { email: 'ed@example.com', roles: ['editor'] });
    const cookie = await signIn(t, 'ed@example.com');
    const id = only._id.toHexString();
    await withEditorPermissions(['accounts.read', 'roles.grant', 'accounts.block', 'accounts.delete'], async () => {
      for (const payload of [{ roles: [] }, { roles: ['teacher'] }, { status: 'blocked' }]) {
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
    });
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
  });

  it('deletes an account with its sessions', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const cookie = await signIn(t, 'ann@example.com');
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${ann._id}`, cookie: admin.cookie })).statusCode).toBe(204);
    expect((await t.call({ method: 'GET', url: '/api/v1/me', cookie })).statusCode).toBe(401);
    expect(await collections(t.db).sessions.countDocuments({ accountId: ann._id })).toBe(0);
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${ann._id}`, cookie: admin.cookie })).statusCode).toBe(404);
    // A teacher may not.
    await seedAccount(t.db, { email: 'teacher@example.com', roles: ['teacher'] });
    const teacher = await signIn(t, 'teacher@example.com');
    expect((await t.call({ method: 'DELETE', url: `/api/v1/admin/accounts/${admin.account._id}`, cookie: teacher })).statusCode).toBe(403);
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
