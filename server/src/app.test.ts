import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

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
});

describe('loadConfig', () => {
  it('needs MONGODB_URI, and listens on 127.0.0.1:3000 by default', () => {
    expect(() => loadConfig({})).toThrow('MONGODB_URI');
    expect(loadConfig({ MONGODB_URI: 'mongodb://x' })).toEqual({ host: '127.0.0.1', port: 3000, mongoUri: 'mongodb://x' });
    expect(() => loadConfig({ MONGODB_URI: 'mongodb://x', PORT: 'abc' })).toThrow('PORT');
  });
});
