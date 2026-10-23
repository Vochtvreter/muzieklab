import { createHash, randomBytes } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ClientSession, ObjectId } from 'mongodb';
import type { Collections, SessionDoc } from '../db.js';
import { deviceName } from './device.js';

// Sessions (BACKEND-PLAN.md §5.4): a random token in a cookie, and only its hash in the database.

/** A session lasts this long after its last use, so someone who practises weekly stays signed in. */
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60_000;
/** lastSeenAt (and the end) move at most this often, so a busy session writes at most once an hour. */
const REFRESH_MS = 60 * 60_000;
/** Sessions an account has at most: a new one past this ends the one used longest ago. */
export const MAX_SESSIONS = 20;

/** 32 random bytes, base64url: what goes in a cookie or a link. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores in place of a token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CookieSettings {
  /** False only for development over http (config.ts, COOKIE_SECURE). */
  secure: boolean;
}

/**
 * `__Host-session` over HTTPS: the browser then insists on Secure, Path=/ and no Domain, so no other site or subdomain
 * can set or read it. Over plain http (development) the `__Host-` prefix is not allowed, hence `session`.
 */
export function cookieName({ secure }: CookieSettings): string {
  return secure ? '__Host-session' : 'session';
}

function cookieOptions({ secure }: CookieSettings, maxAgeSeconds: number): CookieSerializeOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: maxAgeSeconds };
}

export function setSessionCookie(reply: FastifyReply, settings: CookieSettings, token: string): void {
  reply.setCookie(cookieName(settings), token, cookieOptions(settings, SESSION_MS / 1000));
}

export function clearSessionCookie(reply: FastifyReply, settings: CookieSettings): void {
  reply.setCookie(cookieName(settings), '', { ...cookieOptions(settings, 0), expires: new Date(0) });
}

export function sessionToken(request: FastifyRequest, settings: CookieSettings): string | undefined {
  const token = request.cookies[cookieName(settings)];
  // Tokens are 43 base64url characters; anything else cannot be one of ours, so skip the lookup.
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

/**
 * Signs an account in on this device: a new session, its cookie, and the device's name from the User-Agent. An account
 * keeps at most MAX_SESSIONS: past that, the ones used longest ago (lastSeenAt) end, so a loop of sign-ins cannot fill
 * the database. The new one always stays.
 */
export async function createSession(
  c: Collections,
  reply: FastifyReply,
  settings: CookieSettings,
  accountId: ObjectId,
  now: Date,
  userAgent: string | undefined,
  session?: ClientSession,
): Promise<string> {
  const token = newToken();
  const doc: SessionDoc = {
    _id: hashToken(token),
    accountId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MS),
    device: deviceName(userAgent).slice(0, 100),
  };
  await c.sessions.insertOne(doc, { session });
  const over = await c.sessions
    .find({ accountId, _id: { $ne: doc._id } }, { session, projection: { _id: 1 } })
    .sort({ lastSeenAt: -1, createdAt: -1 })
    .skip(MAX_SESSIONS - 1)
    .toArray();
  if (over.length > 0) await c.sessions.deleteMany({ _id: { $in: over.map((s) => s._id) } }, { session });
  setSessionCookie(reply, settings, token);
  return doc._id;
}

/**
 * Signs an account in on this device in place of the session the browser had, if any: that one ends first, whoever's
 * it was and whether or not it still works, so no session is left behind that no device holds any more. For sign-in,
 * accepting an invite and setting a new password.
 */
export async function replaceSession(
  c: Collections,
  request: FastifyRequest,
  reply: FastifyReply,
  settings: CookieSettings,
  accountId: ObjectId,
  now: Date,
): Promise<string> {
  const previous = sessionToken(request, settings);
  if (previous) await c.sessions.deleteOne({ _id: hashToken(previous) });
  return createSession(c, reply, settings, accountId, now, request.headers['user-agent']);
}

/**
 * The live session for a cookie token, or null. An expired session counts as missing even before the TTL index
 * deletes it (MongoDB removes expired documents only about once a minute). When the session was last seen over an
 * hour ago, it is moved on: lastSeenAt is now, and it ends 30 days from now; `refreshed` says so, and the caller sends
 * the cookie again so the browser keeps it as long.
 */
export async function findSession(
  c: Collections,
  token: string,
  now: Date,
): Promise<{ session: SessionDoc; refreshed: boolean } | null> {
  const session = await c.sessions.findOne({ _id: hashToken(token), expiresAt: { $gt: now } });
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() <= REFRESH_MS) return { session, refreshed: false };
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  await c.sessions.updateOne({ _id: session._id }, { $set: { lastSeenAt: now, expiresAt } });
  return { session: { ...session, lastSeenAt: now, expiresAt }, refreshed: true };
}
