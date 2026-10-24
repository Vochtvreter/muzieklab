import type { FastifyPluginAsync } from 'fastify';
import type { ClientSession, Filter, ObjectId } from 'mongodb';
import {
  ACCOUNT_STATUSES,
  ROLES,
  type AccountDetail,
  type AccountListResponse,
  type AccountStatus,
  type AdminUpdateRequest,
  type AuditListResponse,
  type InviteCreated,
  type InviteRequest,
  type LinkCreated,
  type Permission,
  type Role,
} from '../../../shared/api.js';
import { writeAudit, type AuditInput } from '../accounts/audit.js';
import { isDay, lastDayOf, premiumEnd } from '../accounts/premium.js';
import { isActiveAdmin, otherActiveAdmins, removeAccount } from '../accounts/remove.js';
import { normalizeEmail, validName } from '../accounts/validate.js';
import { toAuditEntry, toDetail, toSummary } from '../accounts/views.js';
import { signedIn } from '../auth/guard.js';
import { createLink, inviteExpiresAt } from '../auth/links.js';
import { siteOrigin } from '../auth/origin.js';
import { can } from '../auth/policy.js';
import type { AppContext } from '../context.js';
import {
  inTransaction,
  isDuplicateKey,
  lockAdmins,
  parseId,
  type AccountDoc,
  type AuditDoc,
  type LinkKind,
} from '../db.js';
import { ApiError } from '../errors.js';
import * as s from './schemas.js';

// The admin screens (BACKEND-PLAN.md §5.1, §5.3, §7): accounts, invites, roles, status, premium, links, the audit log.

const LIST_MAX = 500;
const AUDIT_DEFAULT = 100;

const notFound = () => new ApiError('not_found', 'No such account');
const forbidden = () => new ApiError('forbidden', 'This account may not do this');
const emailTaken = () => new ApiError('email_taken', 'Another account has this email');

const roles = { type: 'array', items: { enum: ROLES }, uniqueItems: true, maxItems: ROLES.length } as const;

const premium = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      // The last day, YYYY-MM-DD (whether it is a real date, and not over yet, is checked in code).
      properties: { active: { const: true }, until: { type: ['string', 'null'], pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
      required: ['active', 'until'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { active: { const: false } },
      required: ['active'],
    },
  ],
} as const;

/** Regular-expression characters in `q` match themselves: an admin searches text, not patterns. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Roles in the order of ROLES, so the stored list (and the comparison below) does not depend on the order sent. */
function sortRoles(list: readonly Role[]): Role[] {
  return ROLES.filter((role) => list.includes(role));
}

/** Premium's last day as sent: null for no end, or a real date (YYYY-MM-DD) that is not over yet anywhere. */
function parseLastDay(until: string | null, now: Date): string | null {
  if (until === null) return null;
  if (!isDay(until)) throw new ApiError('bad_request', 'premium.until is not a date (YYYY-MM-DD)');
  if (premiumEnd(until) <= now.getTime()) throw new ApiError('bad_request', 'premium.until is a day that is over');
  return until;
}

/** The permissions a PATCH needs: each field its own (BACKEND-PLAN.md §4.2). */
function patchNeeds(body: AdminUpdateRequest): Permission[] {
  const needs: Permission[] = ['accounts.read'];
  if (body.name !== undefined || body.email !== undefined) needs.push('accounts.invite');
  if (body.roles !== undefined) needs.push('roles.grant');
  if (body.status !== undefined) needs.push('accounts.block');
  if (body.premium !== undefined) needs.push('entitlements.grant');
  return needs;
}

export const adminRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { c } = ctx;

  async function detail(account: AccountDoc): Promise<AccountDetail> {
    const now = ctx.now();
    const [expires, sessions] = await Promise.all([
      inviteExpiresAt(c, account, now),
      c.sessions.countDocuments({ accountId: account._id, expiresAt: { $gt: now } }),
    ]);
    return toDetail(account, now, expires, sessions);
  }

  async function findAccount(id: string): Promise<AccountDoc> {
    const _id = parseId(id);
    const account = _id && (await c.accounts.findOne({ _id }));
    if (!account) throw notFound();
    return account;
  }

  /**
   * Inside a transaction: the actor still has these permissions. The guard checked them when the request came in,
   * but another admin may have changed this account since, and the guard rails must see the state they commit on.
   */
  async function actorStillCan(actorId: ObjectId, needs: readonly Permission[], session: ClientSession) {
    const actor = await c.accounts.findOne({ _id: actorId }, { session });
    if (!actor || !needs.every((p) => can(actor, p))) throw forbidden();
  }

  app.get<{ Querystring: { q?: string; status?: AccountStatus } }>(
    '/admin/accounts',
    {
      config: { permission: 'accounts.read' },
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { q: { type: 'string', maxLength: 200 }, status: { enum: ACCOUNT_STATUSES } },
        },
      },
    },
    async (request): Promise<AccountListResponse> => {
      const filter: Filter<AccountDoc> = {};
      const q = request.query.q?.trim();
      if (q) {
        const pattern = new RegExp(escapeRegex(q), 'i');
        filter.$or = [{ name: pattern }, { email: pattern }];
      }
      if (request.query.status) filter.status = request.query.status;
      const accounts = await c.accounts.find(filter).sort({ createdAt: -1, _id: -1 }).limit(LIST_MAX).toArray();
      const now = ctx.now();
      return { accounts: accounts.map((a) => toSummary(a, now)) };
    },
  );

  app.post<{ Body: InviteRequest }>(
    '/admin/invites',
    {
      config: { permission: 'accounts.invite' },
      schema: { body: s.body({ email: s.email, name: s.name, roles }, ['email', 'name', 'roles']) },
    },
    async (request): Promise<InviteCreated> => {
      const actor = signedIn(request).account;
      const email = normalizeEmail(request.body.email);
      const name = validName(request.body.name);
      const accountRoles = sortRoles(request.body.roles);
      // Inviting with a role grants it.
      const needs: Permission[] = accountRoles.length > 0 ? ['accounts.invite', 'roles.grant'] : ['accounts.invite'];
      if (!needs.every((p) => can(actor, p))) throw forbidden();
      // Any status: an invited or blocked account keeps its address until it is deleted.
      if (await c.accounts.findOne({ email }, { projection: { _id: 1 } })) throw emailTaken();
      const now = ctx.now();
      const origin = siteOrigin(request);
      try {
        const { account, link } = await inTransaction(ctx.db, async (session) => {
          await actorStillCan(actor._id, needs, session);
          const doc: Omit<AccountDoc, '_id'> = {
            email,
            name,
            passwordHash: null,
            status: 'invited',
            roles: accountRoles,
            premium: null,
            locale: null,
            passwordChangedAt: null,
            lastSignInAt: null,
            createdAt: now,
            updatedAt: now,
          };
          const { insertedId } = await c.accounts.insertOne(doc as AccountDoc, { session });
          const created = await createLink(
            c,
            { kind: 'invite', accountId: insertedId, createdBy: actor._id, now, origin },
            session,
          );
          await writeAudit(
            c,
            now,
            { actorId: actor._id, action: 'account.invite', targetId: insertedId, details: { email, name, roles: accountRoles } },
            session,
          );
          return { account: { ...doc, _id: insertedId }, link: created };
        });
        return { ...link, account: toDetail(account, now, new Date(link.expiresAt), 0) };
      } catch (err) {
        if (isDuplicateKey(err)) throw emailTaken();
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/admin/accounts/:id',
    { config: { permission: 'accounts.read' }, schema: { params: s.idParams } },
    async (request): Promise<AccountDetail> => detail(await findAccount(request.params.id)),
  );

  app.patch<{ Params: { id: string }; Body: AdminUpdateRequest }>(
    '/admin/accounts/:id',
    {
      config: { permission: 'accounts.read' },
      schema: {
        params: s.idParams,
        body: s.body({ name: s.name, email: s.email, roles, status: { enum: ['active', 'blocked'] }, premium }),
      },
    },
    async (request): Promise<AccountDetail> => {
      const actor = signedIn(request).account;
      const body = request.body;
      const needs = patchNeeds(body);
      if (!needs.every((p) => can(actor, p))) throw forbidden();
      const targetId = parseId(request.params.id);
      if (!targetId) throw notFound();
      const name = body.name === undefined ? undefined : validName(body.name);
      const email = body.email === undefined ? undefined : normalizeEmail(body.email);
      const now = ctx.now();
      const newPremium =
        body.premium === undefined
          ? undefined
          : body.premium.active
            ? { until: parseLastDay(body.premium.until, now) }
            : null;

      try {
        const updated = await inTransaction(ctx.db, async (session) => {
          await lockAdmins(c, session);
          await actorStillCan(actor._id, needs, session);
          const target = await c.accounts.findOne({ _id: targetId }, { session });
          if (!target) throw notFound();
          const self = target._id.equals(actor._id);
          const set: Partial<AccountDoc> = {};
          const audit: Omit<AuditInput, 'actorId' | 'targetId'>[] = [];

          if (body.roles !== undefined) {
            const next = sortRoles(body.roles);
            const added = next.filter((r) => !target.roles.includes(r));
            const removed = target.roles.filter((r) => !next.includes(r));
            if (added.length > 0 || removed.length > 0) {
              if (self) throw new ApiError('own_account', 'Another admin must change your roles');
              set.roles = next;
              if (added.length > 0) audit.push({ action: 'role.grant', details: { roles: added } });
              if (removed.length > 0) audit.push({ action: 'role.revoke', details: { roles: removed } });
            }
          }

          if (body.status !== undefined && body.status !== target.status) {
            if (self) throw new ApiError('own_account', 'Another admin must block or unblock you');
            // An invited account becomes active only by accepting; to stop an invite, delete it.
            if (target.status === 'invited') throw new ApiError('wrong_status', 'An invited account cannot be blocked or unblocked');
            set.status = body.status;
            audit.push({ action: body.status === 'blocked' ? 'account.block' : 'account.unblock' });
          }

          if (isActiveAdmin(target) && !isActiveAdmin({ ...target, ...set })) {
            if ((await otherActiveAdmins(c, target._id, session)) === 0) {
              throw new ApiError('last_admin', 'This would leave no active admin');
            }
          }

          const fields: string[] = [];
          const changed: Record<string, string> = {};
          if (name !== undefined && name !== target.name) {
            set.name = name;
            fields.push('name');
            changed.name = name;
          }
          if (email !== undefined && email !== target.email) {
            if (await c.accounts.findOne({ email }, { session, projection: { _id: 1 } })) throw emailTaken();
            set.email = email;
            fields.push('email');
            changed.email = email;
            changed.previousEmail = target.email;
          }
          if (fields.length > 0) audit.push({ action: 'account.update', details: { fields, ...changed } });

          if (newPremium !== undefined) {
            const before = target.premium;
            const same =
              (before === null && newPremium === null) ||
              (before !== null && newPremium !== null && lastDayOf(before.until) === newPremium.until);
            if (!same) {
              set.premium = newPremium;
              audit.push(
                newPremium
                  ? { action: 'premium.grant', details: { until: newPremium.until } }
                  : { action: 'premium.revoke' },
              );
            }
          }

          if (Object.keys(set).length === 0) return target;
          const doc = await c.accounts.findOneAndUpdate(
            { _id: target._id },
            { $set: { ...set, updatedAt: now } },
            { session, returnDocument: 'after' },
          );
          // A blocked account is signed out everywhere at once.
          if (set.status === 'blocked') await c.sessions.deleteMany({ accountId: target._id }, { session });
          // A link sent to the old address stops working: a new-password link, and an invited account's invite (the
          // admin makes a new one for the corrected address).
          if (set.email !== undefined) {
            const kinds: LinkKind[] = target.status === 'invited' ? ['reset', 'invite'] : ['reset'];
            await c.tokens.deleteMany({ accountId: target._id, kind: { $in: kinds } }, { session });
          }
          await writeAudit(
            c,
            now,
            audit.map((e) => ({ ...e, actorId: actor._id, targetId: target._id })),
            session,
          );
          return doc ?? target;
        });
        return detail(updated);
      } catch (err) {
        if (isDuplicateKey(err)) throw emailTaken();
        throw err;
      }
    },
  );

  for (const [kind, status] of [
    ['invite', 'invited'],
    ['reset', 'active'],
  ] as const) {
    app.post<{ Params: { id: string } }>(
      `/admin/accounts/:id/${kind}-link`,
      // A new-password link lets whoever holds it into the account, like an invite does: the same permission.
      { config: { permission: 'accounts.invite' }, schema: { params: s.idParams } },
      async (request): Promise<LinkCreated> => {
        const actor = signedIn(request).account;
        const targetId = parseId(request.params.id);
        if (!targetId) throw notFound();
        const now = ctx.now();
        const origin = siteOrigin(request);
        return inTransaction(ctx.db, async (session) => {
          const target = await c.accounts.findOne({ _id: targetId }, { session });
          if (!target) throw notFound();
          if (target.status !== status) {
            throw new ApiError(
              'wrong_status',
              kind === 'invite' ? 'Only an invited account gets an invite link' : 'Only an active account gets a new-password link',
            );
          }
          const link = await createLink(c, { kind, accountId: target._id, createdBy: actor._id, now, origin }, session);
          await writeAudit(
            c,
            now,
            {
              actorId: actor._id,
              action: kind === 'invite' ? 'account.invite_link' : 'account.reset_link',
              targetId: target._id,
              details: { expiresAt: link.expiresAt },
            },
            session,
          );
          return link;
        });
      },
    );
  }

  app.delete<{ Params: { id: string }; Querystring: { expect?: AccountStatus } }>(
    '/admin/accounts/:id',
    {
      config: { permission: 'accounts.delete' },
      schema: {
        params: s.idParams,
        querystring: { type: 'object', additionalProperties: false, properties: { expect: { enum: ACCOUNT_STATUSES } } },
      },
    },
    async (request, reply) => {
      const actor = signedIn(request).account;
      const targetId = parseId(request.params.id);
      if (!targetId) throw notFound();
      if (targetId.equals(actor._id)) {
        throw new ApiError('own_account', 'Delete your own account from the Account screen');
      }
      const now = ctx.now();
      await inTransaction(ctx.db, async (session) => {
        await lockAdmins(c, session);
        await actorStillCan(actor._id, ['accounts.delete'], session);
        const target = await c.accounts.findOne({ _id: targetId }, { session });
        if (!target) throw notFound();
        // "Cancel invite" expects an invited account: one whose invite was accepted meanwhile stays.
        const expected = request.query.expect;
        if (expected !== undefined && target.status !== expected) {
          throw new ApiError('wrong_status', `The account is ${target.status}, not ${expected}`);
        }
        if (isActiveAdmin(target) && (await otherActiveAdmins(c, target._id, session)) === 0) {
          throw new ApiError('last_admin', 'This would leave no active admin');
        }
        await removeAccount(c, target._id, session);
        // Cancelling an invite and deleting an account are one action; the status tells them apart.
        await writeAudit(
          c,
          now,
          { actorId: actor._id, action: 'account.delete', targetId: target._id, details: { status: target.status } },
          session,
        );
      });
      return reply.code(204).send();
    },
  );

  app.get<{ Querystring: { limit?: string; before?: string } }>(
    '/admin/audit',
    {
      config: { permission: 'audit.read' },
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'string', pattern: '^[1-9][0-9]{0,5}$' },
            before: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          },
        },
      },
    },
    async (request): Promise<AuditListResponse> => {
      const limit = Math.min(Number(request.query.limit ?? AUDIT_DEFAULT), LIST_MAX);
      const before = request.query.before === undefined ? null : parseId(request.query.before);
      // Newest first by _id, which grows with time; `before` is the id of the last entry of the previous page.
      const filter: Filter<AuditDoc> = before ? { _id: { $lt: before } } : {};
      const entries = await c.audit.find(filter).sort({ _id: -1 }).limit(limit).toArray();
      return { entries: entries.map(toAuditEntry) };
    },
  );
};
