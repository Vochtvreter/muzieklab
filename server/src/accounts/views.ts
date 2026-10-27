import {
  isBuiltInRole,
  type AccountDetail,
  type AccountExport,
  type AccountSummary,
  type AuditEntry,
  type Me,
  type OwnFeedback,
  type Permission,
  type Role,
  type SavedProgress,
} from '../../../shared/api.js';
import {
  withoutToken,
  type FeedbackContext,
  type FeedbackDetail,
  type FeedbackPerson,
  type FeedbackReport,
  type FeedbackSummary,
  type FeedbackTarget,
} from '../../../shared/feedback.js';
import type { AccountDoc, AuditDoc, Collections, FeedbackDoc, ProgressDoc } from '../db.js';
import { permissionsOf } from '../auth/policy.js';
import { premiumOf } from './premium.js';

// From stored documents to the bodies of shared/api.ts and shared/feedback.ts: ids as hex strings, dates as ISO
// strings.

export function toMe(
  account: AccountDoc,
  now: Date,
  permissions: Permission[],
  roleNames: Record<Role, string>,
  feedbackMode: boolean,
): Me {
  return { ...ownAccount(account, now), roleNames, permissions, feedbackMode };
}

/**
 * Me for this account: its permissions and its custom roles' names come from the stored roles, and whether feedback
 * mode is on from the app's settings.
 */
export async function meOf(c: Collections, account: AccountDoc, now: Date): Promise<Me> {
  const custom = account.roles.filter((r) => !isBuiltInRole(r));
  const [permissions, docs, settings] = await Promise.all([
    permissionsOf(c, account),
    custom.length ? c.roles.find({ _id: { $in: custom } }, { projection: { name: 1 } }).toArray() : [],
    c.settings.findOne({ _id: 'app' }, { projection: { feedbackMode: 1 } }),
  ]);
  return toMe(account, now, permissions, Object.fromEntries(docs.map((d) => [d._id, d.name])), settings?.feedbackMode === true);
}

function ownAccount(account: AccountDoc, now: Date): Omit<Me, 'permissions' | 'roleNames' | 'feedbackMode'> {
  return {
    id: account._id.toHexString(),
    email: account.email,
    name: account.name,
    locale: account.locale,
    roles: account.roles,
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
  return {
    ...ownAccount(account, now),
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

/** The account's saved progress, or the empty answer (rev 0) when it has none yet. */
export function toSavedProgress(doc: ProgressDoc | null): SavedProgress {
  if (!doc) return { rev: 0, data: null, resetAt: null, updatedAt: null };
  return {
    rev: doc.rev,
    data: { prefs: doc.prefs, progress: doc.progress },
    resetAt: doc.resetAt?.toISOString() ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// --- feedback reports (routes/feedback.ts) ---------------------------------------------------------------------------

/** The report as the app sent it, from the stored fields. */
/**
 * The report as stored, with no invite or new-password token in its route or address (withoutToken): POST /feedback
 * leaves it out, but a report kept before it did may still hold one.
 */
export function feedbackReport(doc: FeedbackDoc): FeedbackReport {
  const { context } = doc;
  return {
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    target: doc.target,
    context: { ...context, url: withoutToken(context.url), route: withoutToken(context.route) },
  };
}

/** What a list row needs of a stored report: GET /admin/feedback loads only these fields. */
export type FeedbackSummaryFields = Pick<FeedbackDoc, '_id' | 'kind' | 'title' | 'description' | 'status' | 'authorId' | 'createdAt'> & {
  target: Pick<FeedbackTarget, 'label' | 'mode'>;
  context: Pick<FeedbackContext, 'route'>;
};

/** `author` is looked up by the caller (null: the account is gone). */
export function toFeedbackSummary(doc: FeedbackSummaryFields, author: FeedbackPerson | null): FeedbackSummary {
  return {
    id: doc._id.toHexString(),
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    route: withoutToken(doc.context.route),
    label: doc.target.label,
    mode: doc.target.mode,
    status: doc.status,
    author,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toFeedbackDetail(doc: FeedbackDoc, author: FeedbackPerson | null, reviewer: FeedbackPerson | null): FeedbackDetail {
  return {
    ...toFeedbackSummary(doc, author),
    report: feedbackReport(doc),
    note: doc.note,
    reviewer,
    reviewedAt: doc.reviewedAt?.toISOString() ?? null,
  };
}

/** A report in its author's export: what it sent and its status, never the admin's note or who reviewed it. */
export function toOwnFeedback(doc: FeedbackDoc): OwnFeedback {
  return { id: doc._id.toHexString(), createdAt: doc.createdAt.toISOString(), status: doc.status, report: feedbackReport(doc) };
}
