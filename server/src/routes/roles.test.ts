import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS, type AccountDetail, type AuditListResponse, type Me, type Permission, type RoleInfo, type RoleListResponse } from '../../../shared/api.js';
import { collections } from '../db.js';
import { makeApp, seedAccount, signIn, signedInAdmin, startMongo, stopMongo, type Mongo, type TestApp } from '../test/helpers.js';

let mongo: Mongo;
beforeAll(async () => {
  mongo = await startMongo();
});
afterAll(async () => {
  await stopMongo(mongo);
});

const url = '/api/v1/admin/roles';
const create = (t: TestApp, cookie: string, payload: object) => t.call({ method: 'POST', url, cookie, payload });
const update = (t: TestApp, cookie: string, id: string, payload: object) => t.call({ method: 'PATCH', url: `${url}/${id}`, cookie, payload });
const remove = (t: TestApp, cookie: string, id: string) => t.call({ method: 'DELETE', url: `${url}/${id}`, cookie });
const list = async (t: TestApp, cookie: string) => (await t.call({ method: 'GET', url, cookie })).json<RoleListResponse>().roles;

/** Someone who may manage roles but is not an admin: a custom role with these permissions. */
async function manager(t: TestApp, permissions: Permission[]) {
  const now = new Date();
  await collections(t.db).roles.insertOne({ _id: 'manager', name: 'Manager', description: '', permissions, builtIn: false, createdAt: now, updatedAt: now });
  await seedAccount(t.db, { email: 'manager@example.com', roles: ['manager'] });
  return signIn(t, 'manager@example.com');
}

describe('GET /admin/roles', () => {
  it('lists the built-in roles first, with their permissions and how many accounts have each, then custom ones by name', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    await seedAccount(t.db, { email: 'ed@example.com', roles: ['editor', 'teacher'] });
    expect((await create(t, admin.cookie, { id: 'zz-testers', name: 'Testers', permissions: ['feedback.give'] })).statusCode).toBe(200);
    expect((await create(t, admin.cookie, { id: 'aa-later', name: 'Very late', permissions: [] })).statusCode).toBe(200);
    const roles = await list(t, admin.cookie);
    expect(roles.map((r) => [r.id, r.builtIn, r.accounts])).toEqual([
      ['admin', true, 1],
      ['editor', true, 1],
      ['teacher', true, 1],
      ['zz-testers', false, 0],
      ['aa-later', false, 0],
    ]);
    expect(roles[0].permissions).toEqual([...PERMISSIONS]);
    expect(roles[1]).toMatchObject({ name: 'Editor', permissions: ['content.edit', 'content.publish'] });
  });

  it('needs accounts.read', async () => {
    const t = await makeApp(mongo);
    await seedAccount(t.db, { email: 'ed@example.com', roles: ['editor'] });
    const res = await t.call({ method: 'GET', url, cookie: await signIn(t, 'ed@example.com') });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /admin/roles', () => {
  it('makes a role, which gives its permissions to the accounts that get it', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const res = await create(t, admin.cookie, { id: 'testers', name: ' Testers ', description: 'Send feedback from the app.', permissions: ['feedback.give'] });
    expect(res.statusCode).toBe(200);
    expect(res.json<RoleInfo>()).toEqual({
      id: 'testers',
      name: 'Testers',
      description: 'Send feedback from the app.',
      permissions: ['feedback.give'],
      builtIn: false,
      accounts: 0,
    });
    const ann = await seedAccount(t.db, { email: 'ann@example.com' });
    const patch = await t.call({ method: 'PATCH', url: `/api/v1/admin/accounts/${ann._id.toHexString()}`, cookie: admin.cookie, payload: { roles: ['testers'] } });
    expect(patch.json<AccountDetail>().roles).toEqual(['testers']);
    const me = (await t.call({ method: 'GET', url: '/api/v1/me', cookie: await signIn(t, 'ann@example.com') })).json<Me>();
    expect(me.permissions).toContain('feedback.give');
    expect(me.roleNames).toEqual({ testers: 'Testers' });
    const audit = (await t.call({ method: 'GET', url: '/api/v1/admin/audit', cookie: admin.cookie })).json<AuditListResponse>();
    expect(audit.entries.find((e) => e.action === 'role.create')?.details).toEqual({ role: 'testers', name: 'Testers', permissions: ['feedback.give'] });
  });

  it('refuses a taken id, a built-in one, a bad id and an unknown permission', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    expect((await create(t, admin.cookie, { id: 'testers', name: 'T', permissions: [] })).statusCode).toBe(200);
    for (const id of ['testers', 'editor']) {
      const res = await create(t, admin.cookie, { id, name: 'Again', permissions: [] });
      expect(res.statusCode, id).toBe(409);
      expect(res.json()).toMatchObject({ error: 'role_exists' });
    }
    for (const payload of [
      { id: 'Testers', name: 'T', permissions: [] },
      { id: 'x', name: 'T', permissions: [] },
      { id: 'ok-id', name: 'T', permissions: ['everything'] },
      { id: 'ok-id', name: '', permissions: [] },
    ]) {
      expect((await create(t, admin.cookie, payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it('lets nobody give out more than they have', async () => {
    const t = await makeApp(mongo);
    const cookie = await manager(t, ['roles.manage', 'feedback.give']);
    expect((await create(t, cookie, { id: 'testers', name: 'Testers', permissions: ['feedback.give'] })).statusCode).toBe(200);
    const res = await create(t, cookie, { id: 'climbers', name: 'Climbers', permissions: ['accounts.delete'] });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'forbidden' });
  });
});

describe('PATCH /admin/roles/:id', () => {
  it("changes a role's permissions for everyone who has it, at once", async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    await seedAccount(t.db, { email: 'ted@example.com', roles: ['teacher'] });
    const ted = await signIn(t, 'ted@example.com');
    const send = () => t.call({ method: 'POST', url: '/api/v1/feedback', cookie: ted, payload: {} });
    expect((await send()).statusCode).toBe(403);
    const res = await update(t, admin.cookie, 'teacher', { permissions: ['feedback.give', 'class.create'] });
    expect(res.json<RoleInfo>()).toMatchObject({ id: 'teacher', permissions: ['class.create', 'feedback.give'], accounts: 1 });
    // Past the guard now: the empty body is what fails.
    expect((await send()).statusCode).toBe(400);
    const audit = (await t.call({ method: 'GET', url: '/api/v1/admin/audit', cookie: admin.cookie })).json<AuditListResponse>();
    expect(audit.entries[0]).toMatchObject({ action: 'role.update', details: { role: 'teacher', added: ['feedback.give'] } });
  });

  it("renames a custom role, but keeps a built-in role's name and admin's permissions", async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    await create(t, admin.cookie, { id: 'testers', name: 'Testers', permissions: [] });
    expect((await update(t, admin.cookie, 'testers', { name: 'Beta testers', description: 'Try new things.' })).json<RoleInfo>()).toMatchObject({
      name: 'Beta testers',
      description: 'Try new things.',
    });
    for (const [id, payload] of [
      ['editor', { name: 'Writer' }],
      ['admin', { permissions: ['self.manage'] }],
    ] as const) {
      const res = await update(t, admin.cookie, id, payload);
      expect(res.statusCode, id).toBe(409);
      expect(res.json()).toMatchObject({ error: 'built_in_role' });
    }
    // Sending what is there is no change.
    expect((await update(t, admin.cookie, 'admin', { permissions: [...PERMISSIONS] })).statusCode).toBe(200);
    expect((await update(t, admin.cookie, 'nope', { name: 'X' })).statusCode).toBe(404);
  });

  it('adds or takes away only permissions the admin has', async () => {
    const t = await makeApp(mongo);
    const cookie = await manager(t, ['roles.manage', 'content.edit', 'class.create']);
    // Taking away content.publish, which the manager lacks.
    expect((await update(t, cookie, 'editor', { permissions: ['content.edit'] })).statusCode).toBe(403);
    // Adding feedback.give, which the manager lacks.
    expect((await update(t, cookie, 'teacher', { permissions: ['class.create', 'feedback.give'] })).statusCode).toBe(403);
    // What it has, it may move: content.edit into teacher, and out of editor.
    expect((await update(t, cookie, 'teacher', { permissions: ['class.create', 'content.edit'] })).statusCode).toBe(200);
    expect((await update(t, cookie, 'editor', { permissions: ['content.publish'] })).statusCode).toBe(200);
  });
});

describe('DELETE /admin/roles/:id', () => {
  it('deletes a custom role and takes it from every account, but never a built-in one', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    await create(t, admin.cookie, { id: 'testers', name: 'Testers', permissions: ['feedback.give'] });
    const ann = await seedAccount(t.db, { email: 'ann@example.com', roles: ['teacher', 'testers'] });
    expect((await remove(t, admin.cookie, 'testers')).statusCode).toBe(204);
    expect((await collections(t.db).accounts.findOne({ _id: ann._id }))?.roles).toEqual(['teacher']);
    expect((await list(t, admin.cookie)).map((r) => r.id)).toEqual(['admin', 'editor', 'teacher']);
    for (const id of ['admin', 'teacher']) {
      const res = await remove(t, admin.cookie, id);
      expect(res.statusCode, id).toBe(409);
      expect(res.json()).toMatchObject({ error: 'built_in_role' });
    }
    expect((await remove(t, admin.cookie, 'testers')).statusCode).toBe(404);
  });

  it('needs roles.grant as well while accounts have the role', async () => {
    const t = await makeApp(mongo);
    const cookie = await manager(t, ['roles.manage', 'feedback.give']);
    const now = new Date();
    await collections(t.db).roles.insertOne({ _id: 'testers', name: 'T', description: '', permissions: ['feedback.give'], builtIn: false, createdAt: now, updatedAt: now });
    await seedAccount(t.db, { email: 'ann@example.com', roles: ['testers'] });
    expect((await remove(t, cookie, 'testers')).statusCode).toBe(403);
    await collections(t.db).accounts.updateMany({}, { $pull: { roles: 'testers' } });
    expect((await remove(t, cookie, 'testers')).statusCode).toBe(204);
  });
});

describe('granting roles', () => {
  it('refuses an unknown role, and a role whose permissions the admin lacks', async () => {
    const t = await makeApp(mongo);
    const admin = await signedInAdmin(t);
    const ann = (await seedAccount(t.db, { email: 'ann@example.com' }))._id.toHexString();
    const unknown = await t.call({ method: 'PATCH', url: `/api/v1/admin/accounts/${ann}`, cookie: admin.cookie, payload: { roles: ['ghosts'] } });
    expect(unknown.statusCode).toBe(400);
    const invite = await t.call({ method: 'POST', url: '/api/v1/admin/invites', cookie: admin.cookie, payload: { email: 'x@example.com', name: 'X', roles: ['ghosts'] } });
    expect(invite.statusCode).toBe(400);

    // A role manager with roles.grant but not every admin permission cannot make someone an admin.
    const cookie = await manager(t, ['accounts.read', 'accounts.invite', 'roles.grant', 'class.create']);
    const up = await t.call({ method: 'PATCH', url: `/api/v1/admin/accounts/${ann}`, cookie, payload: { roles: ['admin'] } });
    expect(up.statusCode).toBe(403);
    const ok = await t.call({ method: 'PATCH', url: `/api/v1/admin/accounts/${ann}`, cookie, payload: { roles: ['teacher'] } });
    expect(ok.statusCode).toBe(200);
    const inv = await t.call({ method: 'POST', url: '/api/v1/admin/invites', cookie, payload: { email: 'y@example.com', name: 'Y', roles: ['admin'] } });
    expect(inv.statusCode).toBe(403);
  });
});
