import type { FastifyPluginAsync } from 'fastify';
import {
  LOCALES,
  type AccountExport,
  type ChangeEmailRequest,
  type ChangePasswordRequest,
  type DeleteMeRequest,
  type Me,
  type UpdateMeRequest,
} from '../../../shared/api.js';
import { writeAudit } from '../accounts/audit.js';
import { validFeedback, writeClosure } from '../accounts/closures.js';
import { isActiveAdmin, otherActiveAdmins, removeAccount } from '../accounts/remove.js';
import { normalizeEmail, validName } from '../accounts/validate.js';
import { toAuditEntry, toExportAccount, toMe, toSavedProgress } from '../accounts/views.js';
import { signedIn } from '../auth/guard.js';
import { hashPassword, passwordProblem } from '../auth/passwords.js';
import { clearSessionCookies } from '../auth/sessions.js';
import { confirmPassword, hashLane } from '../auth/tries.js';
import type { AppContext } from '../context.js';
import { inTransaction, isDuplicateKey, lockAdmins, type AccountDoc } from '../db.js';
import { ApiError } from '../errors.js';
import * as s from './schemas.js';

// The signed-in account's own account (BACKEND-PLAN.md §5.3, §8): every route needs only self.manage.

const SELF = { permission: 'self.manage' } as const;
const emailTaken = () => new ApiError('email_taken', 'Another account has this email');

export const meRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { c } = ctx;

  app.get('/me', { config: SELF }, async (request): Promise<Me> => toMe(signedIn(request).account, ctx.now()));

  app.patch<{ Body: UpdateMeRequest }>(
    '/me',
    { config: SELF, schema: { body: s.body({ name: s.name, locale: { enum: [...LOCALES, null] } }) } },
    async (request): Promise<Me> => {
      const { account } = signedIn(request);
      const set: Partial<AccountDoc> = {};
      if (request.body.name !== undefined) {
        const name = validName(request.body.name);
        if (name !== account.name) set.name = name;
      }
      if (request.body.locale !== undefined && request.body.locale !== account.locale) set.locale = request.body.locale;
      const now = ctx.now();
      if (Object.keys(set).length === 0) return toMe(account, now);
      const updated = await inTransaction(ctx.db, async (session) => {
        const doc = await c.accounts.findOneAndUpdate(
          { _id: account._id },
          { $set: { ...set, updatedAt: now } },
          { session, returnDocument: 'after' },
        );
        await writeAudit(
          c,
          now,
          { actorId: account._id, action: 'account.update', targetId: account._id, details: { fields: Object.keys(set) } },
          session,
        );
        return doc;
      });
      return toMe(updated ?? account, now);
    },
  );

  app.post<{ Body: ChangePasswordRequest }>(
    '/me/password',
    {
      config: SELF,
      schema: { body: s.body({ currentPassword: s.password, newPassword: s.password }, ['currentPassword', 'newPassword']) },
    },
    async (request, reply) => {
      const { account, session: current } = signedIn(request);
      const problem = passwordProblem(request.body.newPassword, account.email);
      if (problem) throw new ApiError(problem, 'This password cannot be used');
      await confirmPassword(ctx, request, account, request.body.currentPassword);
      const passwordHash = await hashPassword(request.body.newPassword, hashLane(ctx, request.ip));
      const now = ctx.now();
      await inTransaction(ctx.db, async (session) => {
        await c.accounts.updateOne(
          { _id: account._id },
          { $set: { passwordHash, passwordChangedAt: now, updatedAt: now } },
          { session },
        );
        // Every other device is signed out; this one stays. A new-password link stops working too.
        await c.sessions.deleteMany({ accountId: account._id, _id: { $ne: current._id } }, { session });
        await c.tokens.deleteMany({ accountId: account._id, kind: 'reset' }, { session });
        await writeAudit(c, now, { actorId: account._id, action: 'account.change_password', targetId: account._id }, session);
      });
      return reply.code(204).send();
    },
  );

  app.post<{ Body: ChangeEmailRequest }>(
    '/me/email',
    { config: SELF, schema: { body: s.body({ password: s.password, email: s.email }, ['password', 'email']) } },
    async (request): Promise<Me> => {
      const { account } = signedIn(request);
      const email = normalizeEmail(request.body.email);
      // The password first: whether an address is taken is only told to someone who knows it.
      await confirmPassword(ctx, request, account, request.body.password);
      const now = ctx.now();
      if (email === account.email) return toMe(account, now);
      if (await c.accounts.findOne({ email }, { projection: { _id: 1 } })) throw emailTaken();
      try {
        const updated = await inTransaction(ctx.db, async (session) => {
          const doc = await c.accounts.findOneAndUpdate(
            { _id: account._id },
            { $set: { email, updatedAt: now } },
            { session, returnDocument: 'after' },
          );
          // A new-password link made for the old address stops working.
          await c.tokens.deleteMany({ accountId: account._id, kind: 'reset' }, { session });
          await writeAudit(
            c,
            now,
            {
              actorId: account._id,
              action: 'account.change_email',
              targetId: account._id,
              details: { email, previousEmail: account.email },
            },
            session,
          );
          return doc;
        });
        return toMe(updated ?? account, now);
      } catch (err) {
        // Two accounts taking one address at the same moment: the unique index refuses the second.
        if (isDuplicateKey(err)) throw emailTaken();
        throw err;
      }
    },
  );

  app.get('/me/export', { config: SELF }, async (request, reply) => {
    const { account } = signedIn(request);
    const now = ctx.now();
    const [sessions, audit, progress] = await Promise.all([
      c.sessions.find({ accountId: account._id, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).toArray(),
      c.audit.find({ targetId: account._id }).sort({ _id: -1 }).toArray(),
      c.progress.findOne({ _id: account._id }),
    ]);
    const body: AccountExport = {
      exportedAt: now.toISOString(),
      account: toExportAccount(account, now),
      sessions: sessions.map((x) => ({
        device: x.device,
        createdAt: x.createdAt.toISOString(),
        lastSeenAt: x.lastSeenAt.toISOString(),
      })),
      audit: audit.map(toAuditEntry),
      progress: toSavedProgress(progress),
    };
    return reply.header('Content-Disposition', 'attachment; filename="muzieklab-account.json"').send(body);
  });

  app.delete<{ Body: DeleteMeRequest }>(
    '/me',
    {
      config: SELF,
      schema: { body: s.body({ password: s.password, removeData: { type: 'boolean' }, feedback: s.feedback }, ['password']) },
    },
    async (request, reply) => {
      const { account } = signedIn(request);
      const feedback = validFeedback(request.body.feedback);
      // Not sent: everything goes, as apps before 0.16.0 said it would.
      const removeData = request.body.removeData ?? true;
      await confirmPassword(ctx, request, account, request.body.password);
      const now = ctx.now();
      await inTransaction(ctx.db, async (session) => {
        await lockAdmins(c, session);
        const fresh = await c.accounts.findOne({ _id: account._id }, { session });
        if (!fresh) throw new ApiError('unauthenticated', 'Not signed in');
        if (isActiveAdmin(fresh) && (await otherActiveAdmins(c, fresh._id, session)) === 0) {
          throw new ApiError('last_admin', 'The last admin cannot delete their account: make another admin first');
        }
        // Before removeAccount: an archived account's progress is copied first. The audit entry does not say which
        // kind of Closure it left, so the two cannot be matched up (BACKEND-PLAN.md §3.7).
        await writeClosure(c, fresh, now, { kind: removeData ? 'removed' : 'archived', feedback }, session);
        await removeAccount(c, fresh._id, session);
        await writeAudit(c, now, { actorId: fresh._id, action: 'account.delete_self', targetId: fresh._id }, session);
      });
      clearSessionCookies(reply, ctx.cookies);
      return reply.code(204).send();
    },
  );
};
