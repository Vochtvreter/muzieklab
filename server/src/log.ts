import type { FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify';

// What the API logs (JSON lines to stdout, which systemd keeps in the journal). BACKEND-PLAN.md §8: no IP addresses
// are stored, so a request's line says what was asked and how it went, never who asked: its method, its route (the
// pattern, such as /api/v1/admin/accounts/:id, so no ids either), its status and how long it took. No address, no
// Host, no query string (an admin's search holds names and emails), no cookie and no body.

/** The route's pattern, or the path without its query string where no route matched. */
export function routeOf(request: Pick<FastifyRequest, 'url'> & { routeOptions?: { url?: string } }): string {
  return request.routeOptions?.url ?? request.url.split('?')[0];
}

/** The line app.ts logs when a request is done. */
export function requestLine(request: FastifyRequest, reply: FastifyReply) {
  return {
    method: request.method,
    url: routeOf(request),
    statusCode: reply.statusCode,
    responseTime: Math.round(reply.elapsedTime),
  };
}

/** The logger options main.ts gives buildApp. */
export function loggerOptions(level = 'info') {
  return {
    level,
    // Fastify's own request lines are off (app.ts); should a line ever hold a request or reply, it gets only this.
    serializers: {
      req: (request: FastifyRequest) => ({ method: request.method, url: routeOf(request) }),
      res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
    },
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  } satisfies FastifyServerOptions['logger'];
}
