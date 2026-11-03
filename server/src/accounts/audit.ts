import { ObjectId, type ClientSession } from 'mongodb';
import type { AuditAction, AuditEntry } from '../../../shared/api.js';
import type { Collections } from '../db.js';

// The audit log (BACKEND-PLAN.md §3.5): every admin change and every change to an account. Details never hold a
// password or a token; the ones that name the account (below) are scrubbed when it is deleted.

/** Detail keys that hold the account's email or name. */
const NAMING_KEYS = ['email', 'name', 'previousEmail', 'previousName'] as const;

export interface AuditInput {
  actorId: ObjectId | null;
  action: AuditAction;
  targetId: ObjectId | null;
  details?: AuditEntry['details'];
}

export async function writeAudit(
  c: Collections,
  now: Date,
  entries: AuditInput | AuditInput[],
  session?: ClientSession,
): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  await c.audit.insertMany(
    list.map((e) => ({
      _id: new ObjectId(),
      at: now,
      actorId: e.actorId,
      action: e.action,
      targetId: e.targetId,
      details: e.details ?? {},
    })),
    { session },
  );
}

/**
 * When an account is deleted, entries about it keep the action but lose its name and email (BACKEND-PLAN.md §8):
 * the details of every entry that named it become `{ deleted: true }`.
 */
export async function scrubAudit(c: Collections, accountId: ObjectId, session?: ClientSession): Promise<void> {
  await c.audit.updateMany(
    { targetId: accountId, $or: NAMING_KEYS.map((key) => ({ [`details.${key}`]: { $exists: true } })) },
    { $set: { details: { deleted: true } } },
    { session },
  );
}
