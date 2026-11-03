import type { ClientSession } from 'mongodb';
import { BUILT_IN_ROLES, PERMISSIONS, isBuiltInRole, type Permission, type Role, type RoleInfo } from '../../../shared/api.js';
import type { Collections, RoleDoc } from '../db.js';
import { ApiError } from '../errors.js';

// Roles as data (BACKEND-PLAN.md §3.8, §4): the order lists show them in, finding the ones a request names, and the
// rule that nobody gives out more than they have.

/** Role ids in list order: the built-in ones first (as in BUILT_IN_ROLES), then the custom ones by id; each once. */
export function sortRoleIds(ids: Iterable<Role>): Role[] {
  const set = new Set(ids);
  const builtIn = BUILT_IN_ROLES.filter((r) => set.has(r));
  const custom = [...set].filter((r) => !isBuiltInRole(r)).sort();
  return [...builtIn, ...custom];
}

/** The stored roles with these ids. One that does not exist is a mistake in the request: 400 bad_request. */
export async function findRoles(c: Collections, ids: readonly Role[], session?: ClientSession): Promise<RoleDoc[]> {
  if (ids.length === 0) return [];
  const docs = await c.roles.find({ _id: { $in: [...ids] } }, { session }).toArray();
  const missing = ids.find((id) => !docs.some((d) => d._id === id));
  if (missing !== undefined) throw new ApiError('bad_request', `No role ${missing}`);
  return docs;
}

/** What a role lets someone do: admin always everything, whatever is stored. */
export function rolePermissions(doc: Pick<RoleDoc, '_id' | 'permissions'>): Permission[] {
  return doc._id === 'admin' ? [...PERMISSIONS] : doc.permissions;
}

/**
 * Nobody gives out more than they have: to grant or take away a role, or to put a permission into a role or take it
 * out, the admin must hold every permission involved. Else 403 forbidden, so a role with roles.grant or roles.manage
 * cannot be used to climb to more.
 */
export function assertHolds(held: readonly Permission[], needed: Iterable<Permission>): void {
  for (const p of needed) if (!held.includes(p)) throw new ApiError('forbidden', `This account does not have ${p}, so it cannot give it out`);
}

export function toRoleInfo(doc: RoleDoc, accounts: number): RoleInfo {
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description,
    permissions: rolePermissions(doc),
    builtIn: doc.builtIn,
    accounts,
  };
}
