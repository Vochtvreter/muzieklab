/**
 * Helpers for the admin screens (BACKEND-PLAN.md §4.3, §5.1, §5.3): the ready-made message an admin pastes into an
 * email or chat with a link, premium's last day (a calendar day) in the date field, and the one-line message the
 * accounts list shows after an account was removed on the one-account screen.
 */
import { ROLES, type Role } from '../../../shared/api';
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

/** Roles in the contract's order, for a list of switches or "Admin · Teacher". */
export function rolesText(roles: readonly Role[]): string {
  const names = ROLES.filter((r) => roles.includes(r)).map((r) => t('accountRole.' + r));
  return names.length ? names.reduce((a, b) => t('common.join', { a, b })) : '';
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
