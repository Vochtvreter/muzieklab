import { PERMISSIONS, type AccountStatus, type Permission, type Role } from '../../../shared/api.js';

// Roles → permissions (BACKEND-PLAN.md §4.2), written once. Code checks permissions, never role names, so a role can
// change here without hunting through the routes. Class roles (teacher or pupil in one class) come with phase 3.

/** What every signed-in account may do, whatever its roles. */
export const EVERY_ACCOUNT: readonly Permission[] = ['self.manage', 'progress.own', 'class.join'];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  admin: PERMISSIONS,
  editor: ['content.edit', 'content.publish'],
  teacher: ['class.create'],
};

/** Everything an account with these roles may do, in the order of PERMISSIONS (so answers are stable). */
export function permissionsFor(roles: readonly Role[]): Permission[] {
  const granted = new Set<Permission>(EVERY_ACCOUNT);
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

/** May this account do this? Only an active account may do anything. */
export function can(account: { roles: readonly Role[]; status: AccountStatus }, permission: Permission): boolean {
  return account.status === 'active' && permissionsFor(account.roles).includes(permission);
}
