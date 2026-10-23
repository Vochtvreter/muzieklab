import type { FastifyPluginAsync } from 'fastify';
import type { Db } from 'mongodb';

export interface Health {
  status: 'ok' | 'degraded';
  /** The commit of the running release: the deploy waits until it is the new one (deploy-site.yml). */
  commit: string;
  db: 'ok' | 'unreachable';
}

/** GET /api/v1/health: public. 200 when the API can reach MongoDB, 503 when it cannot. */
export const healthRoutes: FastifyPluginAsync<{ db: Db; commit: string }> = async (app, { db, commit }) => {
  app.get('/health', async (request, reply) => {
    let dbState: Health['db'] = 'ok';
    try {
      await db.command({ ping: 1 });
    } catch (err) {
      request.log.warn({ err }, 'MongoDB ping failed');
      dbState = 'unreachable';
    }
    const body: Health = { status: dbState === 'ok' ? 'ok' : 'degraded', commit, db: dbState };
    return reply.code(dbState === 'ok' ? 200 : 503).send(body);
  });
};
