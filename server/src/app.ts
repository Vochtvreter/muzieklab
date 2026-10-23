import cookie from '@fastify/cookie';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import type { Db } from 'mongodb';
import type { ApiErrorBody } from '../../shared/api.js';
import { AttemptLimiter } from './auth/attempts.js';
import { installGuard } from './auth/guard.js';
import { dummyHash } from './auth/passwords.js';
import type { AppContext } from './context.js';
import { collections } from './db.js';
import { ApiError } from './errors.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';

export interface AppOptions {
  db: Db;
  commit: string;
  logger?: FastifyServerOptions['logger'];
  /** False only for development over http (config.ts, COOKIE_SECURE). */
  cookieSecure?: boolean;
  /** The clock; tests pass their own to move time on. */
  now?: () => Date;
}

const PREFIX = '/api/v1';

export function buildApp({ db, commit, logger = false, cookieSecure = true, now = () => new Date() }: AppOptions) {
  const app = Fastify({
    logger,
    // Caddy, on the same server, is the only client; its X-Forwarded-For holds the visitor's address.
    trustProxy: '127.0.0.1',
    // The API only takes small JSON bodies.
    bodyLimit: 256 * 1024,
    ajv: {
      customOptions: {
        // Refuse rather than quietly fix: a field the route does not take, or a number where text belongs, is a
        // mistake in the app, and a 400 shows it. (Query strings are text, and their schemas say so.)
        removeAdditional: false,
        coerceTypes: false,
      },
    },
  });

  const ctx: AppContext = {
    db,
    c: collections(db),
    now,
    cookies: { secure: cookieSecure },
    attempts: new AttemptLimiter(() => now().getTime()),
  };
  // Old sign-in counters go, so memory does not grow with every address that ever mistyped a password.
  const sweep = setInterval(() => ctx.attempts.sweep(), 60_000);
  sweep.unref();
  app.addHook('onClose', async () => clearInterval(sweep));

  // Ready before the first sign-in to an unknown email, which would otherwise wait for it (and so be told apart).
  app.addHook('onReady', async () => {
    await dummyHash();
  });

  // Bodies are JSON only (Fastify also takes text/plain by default, which a form on another site can send).
  app.removeContentTypeParser('text/plain');
  app.register(cookie);
  installGuard(app, ctx);

  // Answers hold someone's own data, so no browser or proxy may keep a copy.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'not_found', message: `No route ${request.method} ${request.url}` } satisfies ApiErrorBody);
  });

  app.setErrorHandler((error: FastifyError | ApiError, request, reply) => {
    if (error instanceof ApiError) {
      if (error.retryAfter !== undefined) reply.header('Retry-After', String(error.retryAfter));
      return reply.code(error.statusCode).send(error.body());
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(500).send({ error: 'internal', message: 'Something went wrong' } satisfies ApiErrorBody);
    }
    // Fastify's own refusals: a body that fails the schema, is not JSON, or is too big.
    return reply.code(status).send({ error: 'bad_request', message: error.message } satisfies ApiErrorBody);
  });

  app.register(healthRoutes, { prefix: PREFIX, db, commit });
  app.register(authRoutes, { prefix: PREFIX, ctx });
  app.register(meRoutes, { prefix: PREFIX, ctx });
  app.register(adminRoutes, { prefix: PREFIX, ctx });
  return app;
}
