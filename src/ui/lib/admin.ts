/**
 * Helpers for the admin screens (BACKEND-PLAN.md §4.3, §5.1, §5.3): the ready-made message an admin pastes into an
 * email or chat with a link, premium's last day between the date field and the API, and the one-line message the
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

/** yyyy-mm-dd of a Date in the device's own time zone. */
function dayOf(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Premium's last day, as the API keeps it (an ISO date-time; premium is on while it is in the future): the end of the
 * chosen day where the admin is, so the day itself still counts. '' (the field left empty) is null: no end.
 */
export function untilOfDay(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).toISOString();
}

/** The date field's value (yyyy-mm-dd) for premium's `until`: the day it falls on here, or '' for no end. */
export function dayOfUntil(until: string | null): string {
  if (!until) return '';
  const d = new Date(until);
  return Number.isNaN(d.getTime()) ? '' : dayOf(d);
}

/** Today, yyyy-mm-dd here: the earliest last day premium can have. */
export const today = (): string => dayOf(new Date());

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
