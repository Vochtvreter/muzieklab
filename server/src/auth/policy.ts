import type { ClientSession, ObjectId } from 'mongodb';
import { PERMISSIONS, type AccountStatus, type BuiltInRole, type Permission, type Role } from '../../../shared/api.js';
import type { Collections, RoleDoc } from '../db.js';
import { ApiError } from '../errors.js';

// Roles → permissions (BACKEND-PLAN.md §4.2). Code checks permissions, never role names. Which permissions a role has
// is data, in the `roles` collection: admins change it (routes/roles.ts), except for admin, which always has them all.
// Class roles (teacher or pupil in one class) come with phase 3.

/** What every signed-in account may do, whatever its roles. */
export const EVERY_ACCOUNT: readonly Permission[] = ['self.manage', 'progress.own', 'class.join'];

/**
 * What the built-in roles start with, stored when the API first starts (db.ts ensureIndexes). From then on the stored
 * role is what counts, so a permission added to the code later goes to admin only, until an admin gives it to others.
 */
export const BUILT_IN_DEFAULTS: Readonly<Record<BuiltInRole, { name: string; description: string; permissions: Permission[] }>> = {
  admin: { name: 'Admin', description: 'Everything: accounts, roles and every tool.', permissions: [...PERMISSIONS] },
  editor: { name: 'Editor', description: 'Edit and publish learning content.', permissions: ['content.edit', 'content.publish'] },
  teacher: { name: 'Teacher', description: 'Create classes.', permissions: ['class.create'] },
};

/** These permissions in the order of PERMISSIONS, each once (so answers and stored lists are stable). */
export function sortPermissions(list: Iterable<Permission>): Permission[] {
  const set = new Set(list);
  return PERMISSIONS.filter((p) => set.has(p));
}

/**
 * Everything an account with these roles may do: every account's permissions, plus each role's. `docs` are the stored
 * roles; an id without one (a role deleted meanwhile) adds nothing. Admin has every permission, whatever is stored.
 */
export function permissionsFrom(roles: readonly Role[], docs: readonly Pick<RoleDoc, '_id' | 'permissions'>[]): Permission[] {
  if (roles.includes('admin')) return [...PERMISSIONS];
  const granted = new Set<Permission>(EVERY_ACCOUNT);
  for (const doc of docs) if (roles.includes(doc._id)) for (const p of doc.permissions) granted.add(p);
  return sortPermissions(granted);
}

/** The account's permissions, from its stored roles. Inside a transaction, pass its session. */
export async function permissionsOf(c: Collections, account: { roles: readonly Role[] }, session?: ClientSession): Promise<Permission[]> {
  const { roles } = account;
  if (roles.length === 0 || roles.includes('admin')) return permissionsFrom(roles, []);
  const docs = await c.roles.find({ _id: { $in: [...roles] } }, { session, projection: { permissions: 1 } }).toArray();
  return permissionsFrom(roles, docs);
}

/** May this account do this? Only an active account may do anything. */
export async function can(
  c: Collections,
  account: { roles: readonly Role[]; status: AccountStatus },
  permission: Permission,
  session?: ClientSession,
): Promise<boolean> {
  return account.status === 'active' && (await permissionsOf(c, account, session)).includes(permission);
}

/** Does it have all of these? One look-up for all of them. */
export async function canAll(
  c: Collections,
  account: { roles: readonly Role[]; status: AccountStatus },
  permissions: readonly Permission[],
  session?: ClientSession,
): Promise<boolean> {
  if (account.status !== 'active') return false;
  const held = await permissionsOf(c, account, session);
  return permissions.every((p) => held.includes(p));
}

/**
 * Inside a transaction: the actor still has these permissions, and what it holds. The guard checked them when the
 * request came in, but another admin may have changed this account or its roles since, and the guard rails must see the
 * state they commit on. Else 403 forbidden.
 */
export async function stillHeld(
  c: Collections,
  actorId: ObjectId,
  needs: readonly Permission[],
  session: ClientSession,
): Promise<Permission[]> {
  const actor = await c.accounts.findOne({ _id: actorId }, { session });
  const held = actor && actor.status === 'active' ? await permissionsOf(c, actor, session) : [];
  if (!needs.every((p) => held.includes(p))) throw new ApiError('forbidden', 'This account may not do this');
  return held;
}
