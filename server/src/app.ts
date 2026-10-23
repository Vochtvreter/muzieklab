import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import type { Db } from 'mongodb';
import { healthRoutes } from './routes/health.js';

export interface AppOptions {
  db: Db;
  commit: string;
  logger?: FastifyServerOptions['logger'];
}

/** Every error the API sends: a stable code the app translates (BACKEND-PLAN.md §7), and a message for people reading logs. */
export interface ApiError {
  error: string;
  message: string;
}

export function buildApp({ db, commit, logger = false }: AppOptions) {
  const app = Fastify({
    logger,
    // Caddy, on the same server, is the only client; its X-Forwarded-For holds the visitor's address.
    trustProxy: '127.0.0.1',
    // The API only takes small JSON bodies.
    bodyLimit: 256 * 1024,
  });

  // Answers hold someone's own data, so no browser or proxy may keep a copy.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'not_found', message: `No route ${request.method} ${request.url}` } satisfies ApiError);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error({ err: error }, 'request failed');
    reply.code(status).send({
      error: status >= 500 ? 'internal' : (error.code ?? 'bad_request').toLowerCase(),
      message: status >= 500 ? 'Something went wrong' : error.message,
    } satisfies ApiError);
  });

  app.register(healthRoutes, { prefix: '/api/v1', db, commit });
  return app;
}
