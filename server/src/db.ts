import { ObjectId, type ClientSession, type Collection, type Db } from 'mongodb';
import {
  BUILT_IN_ROLES,
  type AccountLocale,
  type AccountStatus,
  type AuditAction,
  type AuditEntry,
  type ClosureKind,
  type Permission,
  type Role,
  type SyncedData,
} from '../../shared/api.js';
import { BUILT_IN_DEFAULTS } from './auth/policy.js';

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
  /**
   * null: off. `{ until: null }`: on with no end. `{ until: 'YYYY-MM-DD' }`: on through that last day
   * (accounts/premium.ts). Accounts saved by the first test-site release hold a Date, read as its UTC calendar day.
   */
  premium: { until: string | Date | null } | null;
  locale: AccountLocale | null;
  passwordChangedAt: Date | null;
  lastSignInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A role and its permissions (BACKEND-PLAN.md §3.8, §4). The built-in ones are stored when the API starts (ensureIndexes)
 * and keep what admins give them from then on; admin's stored permissions are not read, as admin has them all.
 */
export interface RoleDoc {
  /** 'admin', 'editor', 'teacher', or a custom role's id (ROLE_ID_PATTERN); accounts.roles holds these. */
  _id: Role;
  name: string;
  description: string;
  /** In the order of PERMISSIONS. */
  permissions: Permission[];
  builtIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One per signed-in device (BACKEND-PLAN.md §3.2, §5.4). Only the hashes of the cookies' tokens are stored, so a copy
 * of the database signs no one in.
 */
export interface SessionDoc {
  /** A random id, hex: names the session, as the tokens change on every refresh. */
  _id: string;
  accountId: ObjectId;
  /** sha256 of the session cookie's token, hex. */
  accessHash: string;
  /** The session token works until then: an hour after the last refresh. */
  accessExpiresAt: Date;
  /** sha256 of the refresh cookie's token, hex. */
  refreshHash: string;
  /** Hashes of the refresh tokens swapped before, oldest first (at most 50): one that comes back was copied. */
  retired: string[];
  /** The last refresh, or null before the first. */
  refreshedAt: Date | null;
  /**
   * Random, new at each refresh (absent before the first): that refresh's pair was derived from the token it swapped
   * and this, so the same token gets the same pair again in a race (auth/sessions.ts, REFRESH_RACE_MS).
   */
  refreshSalt?: string;
  createdAt: Date;
  /** Sign-in or the last refresh. */
  lastSeenAt: Date;
  /** 90 days after lastSeenAt; a TTL index deletes the session then. */
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
 * The progress and prefs saved on an account (BACKEND-PLAN.md §3.3, §6): one per account, under the account's _id.
 * `prefs` and `progress` are the app's documents as it sent them (routes/progress.ts checks their size and keys).
 */
export interface ProgressDoc {
  _id: ObjectId;
  schema: 1;
  prefs: Record<string, unknown>;
  progress: Record<string, unknown>;
  /** Goes up by one on every save, so a device that saves from an older copy is told (409 rev_conflict). */
  rev: number;
  /** The last DELETE /progress, or null. */
  resetAt: Date | null;
  updatedAt: Date;
}

/**
 * A deleted account (BACKEND-PLAN.md §3.7): what the admin screen Deleted accounts shows. It holds nothing that says
 * whose it was: no name, email or account id, and no ObjectId, whose first bytes are the second it was made and would
 * match it to the deletion's audit entry. `day` is midnight UTC of the day it was deleted, for the same reason.
 */
export interface ClosureDoc {
  /** 16 random bytes, hex. */
  _id: string;
  day: Date;
  kind: ClosureKind;
  feedback: string | null;
  /** archived only: the month the account was made (YYYY-MM), and its saved progress and prefs (null: none saved). */
  archive: { joined: string; data: SyncedData | null } | null;
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
  roles: Collection<RoleDoc>;
  sessions: Collection<SessionDoc>;
  tokens: Collection<TokenDoc>;
  audit: Collection<AuditDoc>;
  locks: Collection<LockDoc>;
  progress: Collection<ProgressDoc>;
  closures: Collection<ClosureDoc>;
}

export function collections(db: Db): Collections {
  return {
    accounts: db.collection<AccountDoc>('accounts'),
    roles: db.collection<RoleDoc>('roles'),
    sessions: db.collection<SessionDoc>('sessions'),
    tokens: db.collection<TokenDoc>('tokens'),
    audit: db.collection<AuditDoc>('audit'),
    locks: db.collection<LockDoc>('locks'),
    progress: db.collection<ProgressDoc>('progress'),
    closures: db.collection<ClosureDoc>('closures'),
  };
}

/** Audit entries are kept for two years (BACKEND-PLAN.md §3.5), and so are deleted accounts' closures (§3.7). */
export const AUDIT_KEEP_SECONDS = 2 * 365 * 24 * 60 * 60;
export const CLOSURE_KEEP_SECONDS = AUDIT_KEEP_SECONDS;

/**
 * Creates the indexes the API relies on: run at startup, before listening. Idempotent: an index that already exists
 * with the same options is left alone. The names are fixed so a later change of options is a deliberate migration.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  const c = collections(db);
  const now = new Date();
  await Promise.all([
    c.accounts.createIndex({ email: 1 }, { unique: true, name: 'email_unique' }),
    c.accounts.createIndex({ createdAt: -1 }, { name: 'createdAt' }),
    // Who has a role: GET /admin/roles counts them, and deleting a custom role takes it from them.
    c.accounts.createIndex({ roles: 1 }, { name: 'roles' }),
    // The built-in roles exist before the first request. One that exists keeps the permissions admins gave it.
    ...BUILT_IN_ROLES.map((id) =>
      c.roles.updateOne(
        { _id: id },
        { $setOnInsert: { ...BUILT_IN_DEFAULTS[id], builtIn: true, createdAt: now, updatedAt: now } },
        { upsert: true },
      ),
    ),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' }),
    c.sessions.createIndex({ accountId: 1 }, { name: 'accountId' }),
    c.sessions.createIndex({ accessHash: 1 }, { name: 'accessHash' }),
    c.sessions.createIndex({ refreshHash: 1 }, { name: 'refreshHash' }),
    c.sessions.createIndex({ retired: 1 }, { name: 'retired' }),
    // Sessions from before refresh tokens (app 0.14.0) have neither hash, so no cookie can use them any more.
    c.sessions.deleteMany({ refreshHash: { $exists: false } }),
    c.tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' }),
    c.tokens.createIndex({ accountId: 1, kind: 1 }, { name: 'accountId_kind' }),
    c.audit.createIndex({ at: 1 }, { expireAfterSeconds: AUDIT_KEEP_SECONDS, name: 'at_ttl' }),
    c.audit.createIndex({ targetId: 1 }, { name: 'targetId' }),
    // Also the list's order (newest day first).
    c.closures.createIndex({ day: 1 }, { expireAfterSeconds: CLOSURE_KEEP_SECONDS, name: 'day_ttl' }),
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
