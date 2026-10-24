import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PERMISSIONS, type Permission } from '../../../shared/api.js';
import type { AppContext } from '../context.js';
import type { AccountDoc, SessionDoc } from '../db.js';
import { ApiError } from '../errors.js';
import { needsOriginCheck, sameOrigin } from './origin.js';
import { can } from './policy.js';
import { findSession, sessionToken, setSessionCookie } from './sessions.js';

// Deny by default (BACKEND-PLAN.md §4.4): every route says in its `config` who may call it, either `{ public: true }`
// or `{ permission }` (signed in, with that permission). A route that says neither does not start.

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Anyone may call it, signed in or not. */
    public?: true;
    /** Only a signed-in account with this permission. */
    permission?: Permission;
  }
  interface FastifyRequest {
    /** The signed-in account and its session, on routes with a `permission`. */
    auth: Auth | null;
  }
}

export interface Auth {
  account: AccountDoc;
  session: SessionDoc;
}

/** Adds the checks to the root instance, before any route is registered. */
export function installGuard(app: FastifyInstance, ctx: AppContext): void {
  app.decorateRequest('auth', null);

  app.addHook('onRoute', (route) => {
    const config = route.config ?? {};
    const isPublic = config.public === true;
    const permission = config.permission;
    if (isPublic === (permission !== undefined)) {
      throw new Error(`${route.method} ${route.url}: config needs exactly one of { public: true } or { permission }`);
    }
    if (permission !== undefined && !PERMISSIONS.includes(permission)) {
      throw new Error(`${route.method} ${route.url}: unknown permission ${permission}`);
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    // Unknown routes answer 404 whoever asks.
    if (request.is404) return;
    if (needsOriginCheck(request.method) && !sameOrigin(request)) {
      throw new ApiError('bad_origin', 'This request must come from a page on this site');
    }
    const { permission } = request.routeOptions.config;
    if (permission === undefined) return; // public (onRoute made sure)
    const auth = await authenticate(ctx, request, reply);
    if (!auth) throw new ApiError('unauthenticated', 'Not signed in');
    if (!can(auth.account, permission)) throw new ApiError('forbidden', 'This account may not do this');
    request.auth = auth;
  });
}

/** The signed-in account for the request's session cookie, or null. Sends the cookie again when the session moves on. */
export async function authenticate(ctx: AppContext, request: FastifyRequest, reply: FastifyReply): Promise<Auth | null> {
  const token = sessionToken(request, ctx.cookies);
  if (!token) return null;
  const found = await findSession(ctx.c, token, ctx.now());
  if (!found) return null;
  const account = await ctx.c.accounts.findOne({ _id: found.session.accountId, status: 'active' });
  if (!account) return null;
  if (found.refreshed) setSessionCookie(reply, ctx.cookies, token);
  return { account, session: found.session };
}

/** The signed-in account on a route with a permission (the guard has checked it). */
export function signedIn(request: FastifyRequest): Auth {
  if (!request.auth) throw new ApiError('unauthenticated', 'Not signed in');
  return request.auth;
}
