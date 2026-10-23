import type { ClientSession, ObjectId } from 'mongodb';
import { INVITE_DAYS, RESET_HOURS, type LinkCreated } from '../../../shared/api.js';
import type { AccountDoc, Collections, LinkKind, TokenDoc } from '../db.js';
import { hashToken, newToken } from './sessions.js';

// Invite and new-password links (BACKEND-PLAN.md §5.1, §5.3). No email is sent: the admin copies the link and sends it
// by hand. It is shown once, since only its hash is stored, and a new link of a kind cancels the account's earlier one.

const LIFETIME_MS: Record<LinkKind, number> = {
  invite: INVITE_DAYS * 24 * 60 * 60_000,
  reset: RESET_HOURS * 60 * 60_000,
};

/** The status an account must have for its link of this kind to work. */
const STATUS_FOR: Record<LinkKind, AccountDoc['status']> = { invite: 'invited', reset: 'active' };

export async function createLink(
  c: Collections,
  opts: { kind: LinkKind; accountId: ObjectId; createdBy: ObjectId | null; now: Date; origin: string },
  session?: ClientSession,
): Promise<LinkCreated> {
  const token = newToken();
  const expiresAt = new Date(opts.now.getTime() + LIFETIME_MS[opts.kind]);
  await c.tokens.deleteMany({ accountId: opts.accountId, kind: opts.kind }, { session });
  await c.tokens.insertOne(
    {
      _id: hashToken(token),
      kind: opts.kind,
      accountId: opts.accountId,
      createdBy: opts.createdBy,
      createdAt: opts.now,
      expiresAt,
      usedAt: null,
    },
    { session },
  );
  // The token goes after the hash, so it never reaches a server log or a Referer header.
  return { link: `${opts.origin}/#/${opts.kind}/${token}`, expiresAt: expiresAt.toISOString() };
}

/**
 * The link's token and account while the link still works: known, unused, not expired, and the account still in the
 * status the link is for (an invite needs `invited`, a new password `active`). Null otherwise.
 */
export async function findLink(
  c: Collections,
  kind: LinkKind,
  token: string,
  now: Date,
  session?: ClientSession,
): Promise<{ token: TokenDoc; account: AccountDoc } | null> {
  const doc = await c.tokens.findOne(
    { _id: hashToken(token), kind, usedAt: null, expiresAt: { $gt: now } },
    { session },
  );
  if (!doc) return null;
  const account = await c.accounts.findOne({ _id: doc.accountId, status: STATUS_FOR[kind] }, { session });
  return account ? { token: doc, account } : null;
}

/**
 * When the account's newest invite link stops working, or null when none works: there is none, it was used, or it
 * has expired (at once, not only when MongoDB's TTL monitor deletes it about a minute later).
 */
export async function inviteExpiresAt(c: Collections, account: AccountDoc, now: Date): Promise<Date | null> {
  if (account.status !== 'invited') return null;
  const newest = await c.tokens.findOne(
    { accountId: account._id, kind: 'invite', usedAt: null, expiresAt: { $gt: now } },
    { sort: { createdAt: -1 } },
  );
  return newest?.expiresAt ?? null;
}
