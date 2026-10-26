import type { ClientSession, ObjectId } from 'mongodb';
import type { AccountDoc, Collections } from '../db.js';
import { scrubAudit } from './audit.js';

// Shared by DELETE /me and DELETE /admin/accounts/:id, inside their transactions.

export function isActiveAdmin(account: Pick<AccountDoc, 'status' | 'roles'>): boolean {
  return account.status === 'active' && account.roles.includes('admin');
}

/** Active admins other than this account. The caller has taken lockAdmins in the same transaction. */
export function otherActiveAdmins(c: Collections, accountId: ObjectId, session: ClientSession): Promise<number> {
  return c.accounts.countDocuments({ _id: { $ne: accountId }, status: 'active', roles: 'admin' }, { session });
}

export interface RemoveOptions {
  /**
   * The feedback reports the account sent (BACKEND-PLAN.md §3.9): 'delete' when its owner deletes it, whether or not an
   * anonymous copy is kept, so the reports do not say which it chose; 'keep' (an admin deletes it) keeps them without
   * the author, as they are about the app.
   */
  reports: 'delete' | 'keep';
}

/**
 * Everything about the account goes: the account, its sessions, links and progress; audit entries keep the action but lose
 * its name and email (BACKEND-PLAN.md §8). Its feedback reports go or lose their author (`reports`), and the reports it
 * reviewed keep the review without the reviewer. Memberships join this list in phase 3.
 */
export async function removeAccount(
  c: Collections,
  accountId: ObjectId,
  { reports }: RemoveOptions,
  session: ClientSession,
): Promise<void> {
  await c.accounts.deleteOne({ _id: accountId }, { session });
  await c.sessions.deleteMany({ accountId }, { session });
  await c.tokens.deleteMany({ accountId }, { session });
  await c.progress.deleteOne({ _id: accountId }, { session });
  if (reports === 'delete') await c.feedback.deleteMany({ authorId: accountId }, { session });
  else await c.feedback.updateMany({ authorId: accountId }, { $set: { authorId: null } }, { session });
  await c.feedback.updateMany({ reviewerId: accountId }, { $set: { reviewerId: null } }, { session });
  await scrubAudit(c, accountId, session);
}
