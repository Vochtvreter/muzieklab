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

/**
 * Everything about the account goes: the account, its sessions, links and progress; audit entries keep the action but lose
 * its name and email (BACKEND-PLAN.md §8). Memberships join this list in phase 3.
 */
export async function removeAccount(c: Collections, accountId: ObjectId, session: ClientSession): Promise<void> {
  await c.accounts.deleteOne({ _id: accountId }, { session });
  await c.sessions.deleteMany({ accountId }, { session });
  await c.tokens.deleteMany({ accountId }, { session });
  await c.progress.deleteOne({ _id: accountId }, { session });
  await scrubAudit(c, accountId, session);
}
