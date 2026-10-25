import { MongoClient, ObjectId, type Db } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import type { Role } from '../../../shared/api.js';
import { buildApp } from '../app.js';
import type { AttemptLimits } from '../auth/attempts.js';
import { SERVER_LANE, hashPassword } from '../auth/passwords.js';
import { collections, ensureIndexes, type AccountDoc } from '../db.js';

// Shared by the route tests: one MongoDB replica set per test file (transactions need one), a fresh database per
// test, a clock the test moves, and requests that look like the app's own.

export const HOST = 'test.vivanova.app';
export const ORIGIN = `https://${HOST}`;
export const COOKIE = '__Host-session';
export const REFRESH_COOKIE = '__Secure-refresh';
export const PASSWORD = 'correct horse battery';

export interface Mongo {
  replSet: MongoMemoryReplSet;
  client: MongoClient;
}

export async function startMongo(): Promise<Mongo> {
  // One member is enough for transactions; the version is package.json's config.mongodbMemoryServer.
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = new MongoClient(replSet.getUri());
  await client.connect();
  return { replSet, client };
}

export async function stopMongo(mongo: Mongo | undefined): Promise<void> {
  await mongo?.client.close();
  await mongo?.replSet.stop();
}

let dbCount = 0;

export async function freshDb(mongo: Mongo): Promise<Db> {
  const db = mongo.client.db(`test_${process.pid}_${++dbCount}`);
  await ensureIndexes(db);
  return db;
}

/** A clock that only moves when the test says so. */
export class TestClock {
  constructor(public ms = Date.now()) {}
  readonly now = () => new Date(this.ms);
  advance(ms: number): void {
    this.ms += ms;
  }
}

export interface TestApp {
  app: ReturnType<typeof buildApp>;
  db: Db;
  clock: TestClock;
  /** A request as the app sends it: the site's Host and Origin, JSON, and the session and refresh cookies given. */
  call: (options: InjectOptions & { cookie?: string; refresh?: string }) => Promise<LightMyRequestResponse>;
}

export async function makeApp(
  mongo: Mongo,
  opts: { cookieSecure?: boolean; limits?: AttemptLimits } = {},
): Promise<TestApp> {
  const db = await freshDb(mongo);
  const clock = new TestClock();
  const app = buildApp({ db, commit: 'test', now: clock.now, cookieSecure: opts.cookieSecure, limits: opts.limits });
  await app.ready();
  const [cookieName, refreshName] = opts.cookieSecure === false ? ['session', 'refresh'] : [COOKIE, REFRESH_COOKIE];
  const call: TestApp['call'] = ({ cookie, refresh, headers, ...options }) => {
    const cookies = [cookie && `${cookieName}=${cookie}`, refresh && `${refreshName}=${refresh}`].filter(Boolean);
    return app.inject({
      ...options,
      headers: {
        host: HOST,
        ...(options.method && options.method !== 'GET' && options.method !== 'HEAD' ? { origin: ORIGIN } : {}),
        ...(cookies.length > 0 ? { cookie: cookies.join('; ') } : {}),
        ...headers,
      },
    });
  };
  return { app, db, clock, call };
}

/**
 * Seeds an account directly in the database. Its password hash uses cheap scrypt parameters, so the many sign-ins
 * in the tests stay fast; verifying reads the parameters from the hash, as it does for a hash made with older ones.
 */
export async function seedAccount(
  db: Db,
  fields: Partial<Omit<AccountDoc, 'passwordHash'>> & { email: string; password?: string | null; roles?: Role[] },
): Promise<AccountDoc> {
  const { password = PASSWORD, ...rest } = fields;
  const now = new Date();
  const doc: AccountDoc = {
    _id: new ObjectId(),
    name: 'Test person',
    status: 'active',
    roles: [],
    premium: null,
    locale: null,
    passwordChangedAt: null,
    lastSignInAt: null,
    createdAt: now,
    updatedAt: now,
    ...rest,
    passwordHash: password === null ? null : await hashPassword(password, SERVER_LANE, { N: 1024, r: 8, p: 1 }),
  };
  await collections(db).accounts.insertOne(doc);
  return doc;
}

/** The session cookie's value from a response, or undefined. */
export function sessionCookie(res: LightMyRequestResponse, name = COOKIE): string | undefined {
  const cookie = res.cookies.find((c) => c.name === name);
  return cookie && cookie.value !== '' ? cookie.value : undefined;
}

/** Signs in and returns the session cookie's value. */
export async function signIn(t: TestApp, email: string, password = PASSWORD, cookieName = COOKIE): Promise<string> {
  return (await signInPair(t, email, password, cookieName)).cookie;
}

/** Signs in and returns both cookies' values: the session token, and the refresh token. */
export async function signInPair(
  t: TestApp,
  email: string,
  password = PASSWORD,
  cookieName = COOKIE,
  refreshName = REFRESH_COOKIE,
): Promise<{ cookie: string; refresh: string }> {
  const res = await t.call({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`);
  const cookie = sessionCookie(res, cookieName);
  const refresh = sessionCookie(res, refreshName);
  if (!cookie || !refresh) throw new Error('sign-in did not set both cookies');
  return { cookie, refresh };
}

/** An admin, signed in. */
export async function signedInAdmin(t: TestApp, email = 'admin@example.com') {
  const account = await seedAccount(t.db, { email, name: 'Admin', roles: ['admin'] });
  return { account, cookie: await signIn(t, email) };
}

/** The token at the end of a link (…/#/invite/<token>). */
export function tokenOf(link: string): string {
  return link.slice(link.lastIndexOf('/') + 1);
}
