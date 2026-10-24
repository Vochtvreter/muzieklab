import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { loggerOptions } from './log.js';

let mongo: MongoMemoryServer;
let client: MongoClient;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri('muzieklab_test'));
});

afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});

describe('GET /api/v1/health', () => {
  it('is ok, with the commit, when MongoDB answers', async () => {
    const app = buildApp({ db: client.db(), commit: 'abc123' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', commit: 'abc123', db: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('answers 503 when MongoDB is unreachable', async () => {
    // Port 9 (discard) has nothing listening, so the ping fails once server selection gives up.
    const down = new MongoClient('mongodb://127.0.0.1:9/x', { serverSelectionTimeoutMS: 200 });
    const app = buildApp({ db: down.db(), commit: 'abc123' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', commit: 'abc123', db: 'unreachable' });
    await app.close();
    await down.close();
  });
});

describe('errors', () => {
  it('answers an unknown route with a JSON 404', async () => {
    const app = buildApp({ db: client.db(), commit: 'dev' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
    await app.close();
  });

  it('answers a failure inside a route with 500 internal, and no details', async () => {
    // Port 9 again: every query fails, so signing in throws from deep inside the driver.
    const down = new MongoClient('mongodb://127.0.0.1:9/x', { serverSelectionTimeoutMS: 200 });
    const app = buildApp({ db: down.db(), commit: 'dev' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      headers: { host: 'localhost', origin: 'http://localhost' },
      payload: { email: 'ann@example.com', password: 'whatever it is' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal', message: 'Something went wrong' });
    await app.close();
    await down.close();
  });
});

describe('the log', () => {
  it('has a line per request with its method, route, status and time, and nothing that tells who sent it', async () => {
    const lines: string[] = [];
    const stream = { write: (line: string) => void lines.push(line) };
    const app = buildApp({ db: client.db(), commit: 'abc123', logger: { ...loggerOptions('info'), stream } });
    // From a visitor behind Caddy, as on the server.
    const headers = { host: 'test.vivanova.app', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (iPhone)' };
    await app.inject({ method: 'GET', url: '/api/v1/admin/accounts?q=lies%40school.nl&status=active', headers });
    await app.inject({ method: 'GET', url: '/api/v1/admin/accounts/65f0c0ffee0123456789abcd?x=1', headers: { ...headers, cookie: '__Host-session=secret' } });
    await app.inject({ method: 'GET', url: '/api/v1/nope?email=lies%40school.nl', headers });
    await app.close();

    const logged = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    // Only these lines: Fastify's own (incoming request, request completed) are off.
    expect(logged.map((l) => l.msg)).toEqual(['request', 'request', 'request']);
    expect(logged.filter((l) => l.msg === 'request').map(({ method, url, statusCode, responseTime }) => ({ method, url, statusCode, responseTime }))).toEqual([
      { method: 'GET', url: '/api/v1/admin/accounts', statusCode: 401, responseTime: expect.any(Number) },
      { method: 'GET', url: '/api/v1/admin/accounts/:id', statusCode: 401, responseTime: expect.any(Number) },
      { method: 'GET', url: '/api/v1/nope', statusCode: 404, responseTime: expect.any(Number) },
    ]);
    const text = lines.join('');
    for (const secret of ['203.0.113.7', 'remoteAddress', 'test.vivanova.app', 'lies', 'school', '?', 'q=', '65f0c0ffee', 'secret', 'iPhone']) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it('turns a request or reply in a line into its method, route and status only', () => {
    const { req, res } = loggerOptions().serializers;
    const request = {
      method: 'GET',
      url: '/api/v1/admin/accounts?q=lies',
      ip: '203.0.113.7',
      headers: { host: 'test.vivanova.app', cookie: 'x' },
      routeOptions: { url: '/api/v1/admin/accounts' },
    };
    expect(req(request as never)).toEqual({ method: 'GET', url: '/api/v1/admin/accounts' });
    expect(req({ ...request, routeOptions: {} } as never)).toEqual({ method: 'GET', url: '/api/v1/admin/accounts' });
    expect(res({ statusCode: 401, headers: { 'set-cookie': 'x' } } as never)).toEqual({ statusCode: 401 });
  });
});

describe('loadConfig', () => {
  it('needs MONGODB_URI, and listens on 127.0.0.1:3000 with secure cookies by default', () => {
    expect(() => loadConfig({})).toThrow('MONGODB_URI');
    expect(loadConfig({ MONGODB_URI: 'mongodb://x' })).toEqual({
      host: '127.0.0.1',
      port: 3000,
      mongoUri: 'mongodb://x',
      cookieSecure: true,
    });
    expect(() => loadConfig({ MONGODB_URI: 'mongodb://x', PORT: 'abc' })).toThrow('PORT');
  });

  it('turns secure cookies off only for COOKIE_SECURE=false', () => {
    const secure = (value: string) => loadConfig({ MONGODB_URI: 'mongodb://x', COOKIE_SECURE: value }).cookieSecure;
    expect(secure('false')).toBe(false);
    expect(secure(' FALSE ')).toBe(false);
    expect(secure('true')).toBe(true);
    expect(secure('0')).toBe(true);
    expect(secure('')).toBe(true);
  });
});
