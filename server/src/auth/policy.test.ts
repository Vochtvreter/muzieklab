import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../../shared/api.js';
import { collections } from '../db.js';
import { freshDb, startMongo, stopMongo, type Mongo } from '../test/helpers.js';
import { BUILT_IN_DEFAULTS, can, permissionsFrom, permissionsOf, sortPermissions } from './policy.js';

// The table of BACKEND-PLAN.md §4.2 (global roles): what the built-in roles start with, and how stored roles add up.
describe('permissionsFrom', () => {
  it('gives every account its own account, progress and joining a class', () => {
    expect(permissionsFrom([], [])).toEqual(['self.manage', 'progress.own', 'class.join']);
  });

  it('gives admin everything, whatever is stored', () => {
    expect(permissionsFrom(['admin'], [{ _id: 'admin', permissions: [] }])).toEqual([...PERMISSIONS]);
  });

  it('adds up the roles an account has, in the order of PERMISSIONS', () => {
    const docs = [
      { _id: 'editor', permissions: BUILT_IN_DEFAULTS.editor.permissions },
      { _id: 'teacher', permissions: BUILT_IN_DEFAULTS.teacher.permissions },
      { _id: 'tester', permissions: ['feedback.give' as const] },
    ];
    expect(permissionsFrom(['editor'], docs)).toEqual(['self.manage', 'progress.own', 'class.join', 'content.edit', 'content.publish']);
    expect(permissionsFrom(['teacher', 'editor', 'tester'], docs)).toEqual([
      'self.manage',
      'progress.own',
      'class.join',
      'class.create',
      'content.edit',
      'content.publish',
      'feedback.give',
    ]);
    // A role the account has but that is not stored (deleted meanwhile) adds nothing.
    expect(permissionsFrom(['gone'], docs)).toEqual(['self.manage', 'progress.own', 'class.join']);
  });

  it('starts editor and teacher with no admin permission, and admin with all', () => {
    expect(BUILT_IN_DEFAULTS.admin.permissions).toEqual([...PERMISSIONS]);
    for (const role of ['editor', 'teacher'] as const) {
      for (const p of BUILT_IN_DEFAULTS[role].permissions) expect(p.startsWith('accounts.') || p.startsWith('roles.') || p.endsWith('.grant')).toBe(false);
    }
  });

  it('sorts permissions into the order of PERMISSIONS, each once', () => {
    expect(sortPermissions(['feedback.give', 'self.manage', 'feedback.give'])).toEqual(['self.manage', 'feedback.give']);
  });
});

describe('permissionsOf and can, from the stored roles', () => {
  let mongo: Mongo;
  beforeAll(async () => {
    mongo = await startMongo();
  });
  afterAll(async () => {
    await stopMongo(mongo);
  });

  it('reads the built-in roles stored at start, and what admins changed since', async () => {
    const db = await freshDb(mongo);
    const c = collections(db);
    expect(await permissionsOf(c, { roles: ['teacher'] })).toEqual(['self.manage', 'progress.own', 'class.join', 'class.create']);
    await c.roles.updateOne({ _id: 'teacher' }, { $set: { permissions: ['class.create', 'feedback.give'] } });
    expect(await can(c, { roles: ['teacher'], status: 'active' }, 'feedback.give')).toBe(true);
    expect(await can(c, { roles: ['editor'], status: 'active' }, 'feedback.give')).toBe(false);
  });

  it('allows nothing to an account that is not active', async () => {
    const c = collections(await freshDb(mongo));
    expect(await can(c, { roles: ['admin'], status: 'blocked' }, 'self.manage')).toBe(false);
    expect(await can(c, { roles: ['admin'], status: 'invited' }, 'accounts.read')).toBe(false);
    expect(await can(c, { roles: [], status: 'active' }, 'self.manage')).toBe(true);
  });

  it('keeps what admins gave a built-in role when the API starts again', async () => {
    const db = await freshDb(mongo);
    const c = collections(db);
    await c.roles.updateOne({ _id: 'editor' }, { $set: { permissions: ['content.edit'] } });
    const { ensureIndexes } = await import('../db.js');
    await ensureIndexes(db);
    expect((await c.roles.findOne({ _id: 'editor' }))?.permissions).toEqual(['content.edit']);
    expect(await c.roles.countDocuments()).toBe(3);
  });
});
