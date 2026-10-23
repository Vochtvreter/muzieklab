import type { FastifyPluginAsync } from 'fastify';
import type {
  InviteAcceptRequest,
  LinkCheckRequest,
  LinkCheckResponse,
  Me,
  ResetConfirmRequest,
  SignInRequest,
} from '../../../shared/api.js';
import { writeAudit } from '../accounts/audit.js';
import { isEmail, validName } from '../accounts/validate.js';
import { toMe } from '../accounts/views.js';
import { linkKeys, pairKey, passwordKeys } from '../auth/attempts.js';
import { signedIn } from '../auth/guard.js';
import { findLink } from '../auth/links.js';
import { hashPassword, passwordProblem, verifyDummy, verifyPassword } from '../auth/passwords.js';
import { clearSessionCookie, replaceSession } from '../auth/sessions.js';
import { countedTry, hashLane, rightPassword } from '../auth/tries.js';
import type { AppContext } from '../context.js';
import { inTransaction, type AccountDoc, type LinkKind } from '../db.js';
import { ApiError } from '../errors.js';
import * as s from './schemas.js';

// Signing in and out, and the invite and new-password links (BACKEND-PLAN.md §5).

const linkInvalid = () => new ApiError('link_invalid', 'This link is unknown, used, cancelled or expired');
const invalidCredentials = () => new ApiError('invalid_credentials', 'Email or password is not right');

export const authRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { c } = ctx;

  app.post<{ Body: SignInRequest }>(
    '/auth/sign-in',
    { config: { public: true }, schema: { body: s.body({ email: s.email, password: s.password }, ['email', 'password']) } },
    async (request, reply): Promise<Me> => {
      const email = request.body.email.trim().toLowerCase();
      // What is not an address has no account: refused at once, uncounted and unhashed, so made-up addresses cost
      // nothing and cannot fill the counters with long keys. (That it is not an address tells nothing about accounts.)
      if (!isEmail(email)) throw invalidCredentials();
      const account = await countedTry(ctx, passwordKeys(email, request.ip), async () => {
        const found = await c.accounts.findOne({ email });
        const lane = hashLane(ctx, request.ip);
        // Without an account (or a password yet), check against a dummy hash, so the time taken tells nothing.
        const ok = found?.passwordHash
          ? await verifyPassword(request.body.password, found.passwordHash, lane)
          : await verifyDummy(request.body.password, lane);
        // Blocked and invited accounts get the same answer as a wrong password.
        return found && ok && found.status === 'active' ? found : null;
      });
      if (!account) throw invalidCredentials();
      rightPassword(ctx, email, request.ip);

      const now = ctx.now();
      const updated = await c.accounts.findOneAndUpdate(
        { _id: account._id },
        { $set: { lastSignInAt: now } },
        { returnDocument: 'after' },
      );
      // Signing in always makes a new token: the session this browser had, if any, ends.
      await replaceSession(c, request, reply, ctx.cookies, account._id, now);
      return toMe(updated ?? account, now);
    },
  );

  app.post('/auth/sign-out', { config: { permission: 'self.manage' } }, async (request, reply) => {
    await c.sessions.deleteOne({ _id: signedIn(request).session._id });
    clearSessionCookie(reply, ctx.cookies);
    return reply.code(204).send();
  });

  app.post('/auth/sign-out-everywhere', { config: { permission: 'self.manage' } }, async (request, reply) => {
    const accountId = signedIn(request).account._id;
    // Someone who fears another has their account does this, so a new-password link stops working too.
    await inTransaction(ctx.db, async (session) => {
      await c.tokens.deleteMany({ accountId, kind: 'reset' }, { session });
      await c.sessions.deleteMany({ accountId }, { session });
    });
    clearSessionCookie(reply, ctx.cookies);
    return reply.code(204).send();
  });

  /**
   * The link's account while the link works. Wrong tokens count as failed tries for the address only (attempts.ts
   * linkKeys): not for an email, as there is none, and not for the network, which others share.
   */
  async function checkedLink(kind: LinkKind, token: string, ip: string) {
    const found = await countedTry(ctx, linkKeys(ip), () => findLink(c, kind, token, ctx.now()));
    if (!found) throw linkInvalid();
    return found;
  }

  for (const kind of ['invite', 'reset'] as const) {
    app.post<{ Body: LinkCheckRequest }>(
      `/auth/${kind}/check`,
      { config: { public: true }, schema: { body: s.body({ token: s.token }, ['token']) } },
      async (request): Promise<LinkCheckResponse> => {
        const { token, account } = await checkedLink(kind, request.body.token, request.ip);
        return { email: account.email, name: account.name, expiresAt: token.expiresAt.toISOString() };
      },
    );
  }

  /**
   * Uses a link to set the account's password: the link is marked used and the account's other links of that kind
   * go, all in one transaction, so two tabs using one link cannot both succeed. Returns the account as it is now.
   */
  async function useLink(
    kind: LinkKind,
    token: string,
    password: string,
    ip: string,
    extra: Partial<AccountDoc>,
  ): Promise<AccountDoc> {
    const found = await checkedLink(kind, token, ip);
    const problem = passwordProblem(password, found.account.email);
    if (problem) throw new ApiError(problem, 'This password cannot be used');
    const passwordHash = await hashPassword(password, hashLane(ctx, ip));
    const now = ctx.now();
    const accountId = found.account._id;
    return inTransaction(ctx.db, async (session) => {
      const claimed = await c.tokens.findOneAndUpdate(
        { _id: found.token._id, usedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { session },
      );
      if (!claimed) throw linkInvalid();
      const updated = await c.accounts.findOneAndUpdate(
        { _id: accountId, status: found.account.status },
        {
          $set: {
            passwordHash,
            passwordChangedAt: now,
            lastSignInAt: now,
            updatedAt: now,
            ...extra,
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw linkInvalid();
      await c.tokens.deleteMany({ accountId, kind, _id: { $ne: claimed._id } }, { session });
      if (kind === 'reset') await c.sessions.deleteMany({ accountId }, { session });
      await writeAudit(
        c,
        now,
        {
          actorId: accountId,
          action: kind === 'invite' ? 'account.accept_invite' : 'account.reset_password',
          targetId: accountId,
        },
        session,
      );
      return updated;
    });
  }

  app.post<{ Body: InviteAcceptRequest }>(
    '/auth/invite/accept',
    {
      config: { public: true },
      schema: { body: s.body({ token: s.token, password: s.password, name: s.name }, ['token', 'password']) },
    },
    async (request, reply): Promise<Me> => {
      const name = request.body.name === undefined ? undefined : validName(request.body.name);
      const account = await useLink('invite', request.body.token, request.body.password, request.ip, {
        status: 'active',
        ...(name === undefined ? {} : { name }),
      });
      const now = ctx.now();
      await replaceSession(c, request, reply, ctx.cookies, account._id, now);
      return toMe(account, now);
    },
  );

  app.post<{ Body: ResetConfirmRequest }>(
    '/auth/reset/confirm',
    { config: { public: true }, schema: { body: s.body({ token: s.token, password: s.password }, ['token', 'password']) } },
    async (request, reply): Promise<Me> => {
      // Every session of the account ended in the transaction; this device gets a new one.
      const account = await useLink('reset', request.body.token, request.body.password, request.ip, {});
      // As after a good sign-in, this address may try this email again at once.
      ctx.attempts.clear(pairKey(account.email, request.ip));
      const now = ctx.now();
      await replaceSession(c, request, reply, ctx.cookies, account._id, now);
      return toMe(account, now);
    },
  );
};
