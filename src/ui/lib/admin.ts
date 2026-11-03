/**
 * Helpers for the admin screens (BACKEND-PLAN.md §4.3, §5.1, §5.3): the ready-made message an admin pastes into an
 * email or chat with a link, premium's last day (a calendar day) in the date field, whether an account may do more than
 * the admin, and the one-line message the accounts list shows after an account was removed on the one-account screen.
 */
import { BUILT_IN_ROLES, isBuiltInRole, PERMISSIONS, type Permission, type Role, type RoleInfo } from '../../../shared/api';
import { formatDateTime, t } from '../../i18n';

/** Which link a message is for: an invite (7 days) or a new password (24 hours). */
export type LinkKind = 'invite' | 'reset';

/**
 * The message to send with a link, in the admin's app language: "Hi Lies Bakker, I've made you an account for Muzieklab.
 * Open this link to choose your password: https://… — it works until October 30, 2026 at 10:00 AM."
 */
export function linkMessage(kind: LinkKind, name: string, link: string, expiresAt: string): string {
  return t(kind === 'invite' ? 'admin.inviteMessage' : 'admin.resetMessage', { name, link, date: formatDateTime(expiresAt) });
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Today, yyyy-mm-dd where the admin is: the earliest last day premium can be given. */
export function today(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * The date field's value (yyyy-mm-dd) for premium's `until`, or '' for no end. The API keeps a calendar day
 * (shared/api.ts Premium), which is sent and shown as it is, with no time zone to shift it; an older date-time (kept
 * before premium ended on a day) counts as its UTC day, as the API reads it.
 */
export function dayOfUntil(until: string | null): string {
  if (!until) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(until)) return until;
  const d = new Date(until);
  return Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * A role's name: a built-in role's in the app's language, a custom role's as an admin named it (`names`, from GET
 * /admin/roles or Me.roleNames), else its id.
 */
export function roleName(id: Role, names: Readonly<Record<Role, string>> = {}): string {
  return isBuiltInRole(id) ? t('accountRole.' + id) : (names[id] ?? id);
}

/**
 * Whether an account with these roles may do something that `mine` (the signed-in account's permissions) does not.
 * Then only someone who holds all of it makes it a link or changes its name or email (BACKEND-PLAN.md §4.2), and the
 * API refuses the admin. Admin has every permission; another role has what the list (GET /admin/roles) says, and one it
 * does not hold, or no list yet, counts for nothing: the screen then offers what the API decides on.
 */
export function holdsMore(roles: readonly Role[], list: readonly Pick<RoleInfo, 'id' | 'permissions'>[] | null, mine: readonly Permission[]): boolean {
  const granted = (role: Role): readonly Permission[] => (role === 'admin' ? PERMISSIONS : (list?.find((r) => r.id === role)?.permissions ?? []));
  return roles.some((role) => granted(role).some((p) => !mine.includes(p)));
}

/** Role ids in the API's order: the built-in ones first, as in BUILT_IN_ROLES, then the custom ones by id; each once. */
export function sortRoles(roles: readonly Role[]): Role[] {
  const set = new Set(roles);
  return [...BUILT_IN_ROLES.filter((r) => set.has(r)), ...[...set].filter((r) => !isBuiltInRole(r)).sort()];
}

/** "Admin · Testers": the built-in roles first, in the contract's order, then the custom ones by name. */
export function rolesText(roles: readonly Role[], names: Readonly<Record<Role, string>> = {}): string {
  const builtIn = BUILT_IN_ROLES.filter((r) => roles.includes(r)).map((r) => roleName(r));
  const custom = roles.filter((r) => !isBuiltInRole(r)).map((r) => roleName(r, names)).sort((a, b) => a.localeCompare(b));
  const all = [...builtIn, ...custom];
  return all.length ? all.reduce((a, b) => t('common.join', { a, b })) : '';
}

/**
 * The one-line message the accounts list shows when the admin comes back to it after removing an account ("The invite
 * for Lies Bakker was cancelled."). Kept here, outside React: the one-account screen is gone by then.
 */
let notice: string | null = null;

export function setListNotice(message: string | null): void {
  notice = message;
}

/** The waiting message, if any. The list clears it once it has shown it (clearListNotice), so it shows once. */
export function peekListNotice(): string | null {
  return notice;
}

export function clearListNotice(): void {
  notice = null;
}
