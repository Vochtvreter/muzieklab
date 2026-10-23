import { ObjectId, type ClientSession, type Collection, type Db } from 'mongodb';
import type { AccountLocale, AccountStatus, AuditAction, AuditEntry, Role } from '../../shared/api.js';

// The documents as stored (docs/BACKEND-PLAN.md §3). Ids are ObjectIds here and hex strings in the API.

export interface AccountDoc {
  _id: ObjectId;
  /** Trimmed and lower-cased; unique. */
  email: string;
  name: string;
  /** scrypt$N$r$p$salt$hash (auth/passwords.ts); null until the invite is accepted. */
  passwordHash: string | null;
  status: AccountStatus;
  roles: Role[];
  /** null: off. `{ until: null }`: on with no end. */
  premium: { until: Date | null } | null;
  locale: AccountLocale | null;
  passwordChangedAt: Date | null;
  lastSignInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One per signed-in device. Only the hash of the cookie's token is stored, so a copy of the database signs no one in. */
export interface SessionDoc {
  /** sha256 of the cookie token, hex. */
  _id: string;
  accountId: ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  /** 30 days after the last use; a TTL index deletes the session then. */
  expiresAt: Date;
  device: string;
}

export type LinkKind = 'invite' | 'reset';

/** Invite and new-password links (BACKEND-PLAN.md §5.1, §5.3). */
export interface TokenDoc {
  /** sha256 of the link's token, hex. */
  _id: string;
  kind: LinkKind;
  accountId: ObjectId;
  /** The admin who made the link, or null for the create-admin command. */
  createdBy: ObjectId | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface AuditDoc {
  _id: ObjectId;
  at: Date;
  actorId: ObjectId | null;
  action: AuditAction;
  targetId: ObjectId | null;
  details: AuditEntry['details'];
}

/**
 * One small document that every transaction which could remove an admin writes first. MongoDB transactions are
 * snapshots, so two of them that each demote a different admin would both still see the other admin and both commit
 * (write skew). Writing the same document makes the second one conflict and retry, and the retry sees the first one.
 */
export interface LockDoc {
  _id: 'admins';
  rev: number;
}

export interface Collections {
  accounts: Collection<AccountDoc>;
  sessions: Collection<SessionDoc>;
  tokens: Collection<TokenDoc>;
  audit: Collection<AuditDoc>;
  locks: Collection<LockDoc>;
}

export function collections(db: Db): Collections {
  return {
    accounts: db.collection<AccountDoc>('accounts'),
    sessions: db.collection<SessionDoc>('sessions'),
    tokens: db.collection<TokenDoc>('tokens'),
    audit: db.collection<AuditDoc>('audit'),
    locks: db.collection<LockDoc>('locks'),
  };
}

/** Audit entries are kept for two years (BACKEND-PLAN.md §3.5). */
export const AUDIT_KEEP_SECONDS = 2 * 365 * 24 * 60 * 60;

/**
 * Creates the indexes the API relies on: run at startup, before listening. Idempotent: an index that already exists
 * with the same options is left alone. The names are fixed so a later change of options is a deliberate migration.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  const c = collections(db);
  await Promise.all([
    c.accounts.createIndex({ email: 1 }, { unique: true, name: 'email_unique' }),
    c.accounts.createIndex({ createdAt: -1 }, { name: 'createdAt' }),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' }),
    c.sessions.createIndex({ accountId: 1 }, { name: 'accountId' }),
    c.tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' }),
    c.tokens.createIndex({ accountId: 1, kind: 1 }, { name: 'accountId_kind' }),
    c.audit.createIndex({ at: 1 }, { expireAfterSeconds: AUDIT_KEEP_SECONDS, name: 'at_ttl' }),
    c.audit.createIndex({ targetId: 1 }, { name: 'targetId' }),
    // The lock document exists before the first transaction needs it, so no transaction has to create a collection.
    c.locks.updateOne({ _id: 'admins' }, { $setOnInsert: { rev: 0 } }, { upsert: true }),
  ]);
}

/**
 * Runs `fn` in a transaction (MongoDB runs as a replica set, so it can). The driver retries `fn` on a transient error
 * such as a write conflict, so `fn` must only write through `session`, and return what the route needs.
 */
export async function inTransaction<T>(db: Db, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  return db.client.withSession((session) => session.withTransaction(() => fn(session)));
}

/** Takes the admin lock (LockDoc) inside a transaction. */
export async function lockAdmins(c: Collections, session: ClientSession): Promise<void> {
  await c.locks.updateOne({ _id: 'admins' }, { $inc: { rev: 1 } }, { upsert: true, session });
}

/** The ObjectId in a path parameter, or null when it is not one (the route then answers 404). */
export function parseId(id: string): ObjectId | null {
  return /^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : null;
}

/** MongoDB's duplicate key error, which the unique email index raises. */
export function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}
