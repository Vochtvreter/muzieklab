import type {
  AccountDetail,
  AccountExport,
  AccountSummary,
  AuditEntry,
  Me,
} from '../../../shared/api.js';
import type { AccountDoc, AuditDoc } from '../db.js';
import { permissionsFor } from '../auth/policy.js';
import { premiumOf } from './premium.js';

// From stored documents to the bodies of shared/api.ts: ids as hex strings, dates as ISO strings.

export function toMe(account: AccountDoc, now: Date): Me {
  return {
    id: account._id.toHexString(),
    email: account.email,
    name: account.name,
    locale: account.locale,
    roles: account.roles,
    permissions: permissionsFor(account.roles),
    premium: premiumOf(account, now),
    createdAt: account.createdAt.toISOString(),
  };
}

export function toSummary(account: AccountDoc, now: Date): AccountSummary {
  return {
    id: account._id.toHexString(),
    email: account.email,
    name: account.name,
    status: account.status,
    roles: account.roles,
    premium: premiumOf(account, now),
    lastSignInAt: account.lastSignInAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  };
}

export function toDetail(account: AccountDoc, now: Date, inviteExpiresAt: Date | null, sessions: number): AccountDetail {
  return { ...toSummary(account, now), inviteExpiresAt: inviteExpiresAt?.toISOString() ?? null, sessions };
}

export function toExportAccount(account: AccountDoc, now: Date): AccountExport['account'] {
  const { permissions: _permissions, ...me } = toMe(account, now);
  return {
    ...me,
    status: account.status,
    lastSignInAt: account.lastSignInAt?.toISOString() ?? null,
    passwordChangedAt: account.passwordChangedAt?.toISOString() ?? null,
  };
}

export function toAuditEntry(doc: AuditDoc): AuditEntry {
  return {
    id: doc._id.toHexString(),
    at: doc.at.toISOString(),
    actorId: doc.actorId?.toHexString() ?? null,
    action: doc.action,
    targetId: doc.targetId?.toHexString() ?? null,
    details: doc.details,
  };
}
