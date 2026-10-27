import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ClientSession, ObjectId } from 'mongodb';
import type { Collections, SessionDoc } from '../db.js';
import { deviceName } from './device.js';

// Sessions (BACKEND-PLAN.md §5.4): two random tokens in two cookies, and only their hashes in the database. The
// session token goes with every request and works for an hour. The refresh token goes only to /api/v1/auth and keeps
// the session going: POST /auth/refresh swaps it for a new pair (rotation), so a refresh token works once, and one that
// comes back after it was swapped was copied, which ends the session. One that comes back within REFRESH_RACE_MS gets
// the same new pair again: the answer with it may never have reached the browser.

/** A session lasts this long after its last refresh, so someone back from the summer holidays is still signed in. */
export const SESSION_DAYS = 90;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60_000;
/** The session token works this long; then the app swaps the refresh token for a new pair. */
export const ACCESS_MINUTES = 60;
const ACCESS_MS = ACCESS_MINUTES * 60_000;
/**
 * A refresh token swapped less than this ago is a race, not a copy: two tabs refreshing at once with the same cookie,
 * or a refresh whose answer never arrived (the page was reloaded meanwhile, or the connection dropped), so the browser
 * still has the old token and no session token. Either way it gets the same new pair again (pairFrom).
 */
export const REFRESH_RACE_MS = 60_000;
/** Refresh tokens used before that a session remembers, to know one that comes back. */
export const RETIRED_KEPT = 50;
/** Sessions an account has at most: a new one past this ends the one used longest ago. */
export const MAX_SESSIONS = 20;
/** The refresh cookie is sent only to the sign-in routes, not with every request. */
export const REFRESH_PATH = '/api/v1/auth';

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

/**
 * `__Secure-refresh` over HTTPS: Secure, and with no Domain, so only this host gets it. Not `__Host-`, which allows
 * only Path=/; this one has REFRESH_PATH. Over plain http (development), `refresh`.
 */
export function refreshCookieName({ secure }: CookieSettings): string {
  return secure ? '__Secure-refresh' : 'refresh';
}

function cookieOptions({ secure }: CookieSettings, path: string, maxAgeSeconds: number): CookieSerializeOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path, maxAge: maxAgeSeconds };
}

export interface SessionTokens {
  access: string;
  refresh: string;
}

export function setSessionCookies(reply: FastifyReply, settings: CookieSettings, tokens: SessionTokens): void {
  reply.setCookie(cookieName(settings), tokens.access, cookieOptions(settings, '/', ACCESS_MS / 1000));
  reply.setCookie(refreshCookieName(settings), tokens.refresh, cookieOptions(settings, REFRESH_PATH, SESSION_MS / 1000));
}

export function clearSessionCookies(reply: FastifyReply, settings: CookieSettings): void {
  const gone = (path: string) => ({ ...cookieOptions(settings, path, 0), expires: new Date(0) });
  reply.setCookie(cookieName(settings), '', gone('/'));
  reply.setCookie(refreshCookieName(settings), '', gone(REFRESH_PATH));
}

// Tokens are 43 base64url characters; anything else cannot be one of ours, so skip the lookup.
const asToken = (value: string | undefined) => (value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined);

export function sessionToken(request: FastifyRequest, settings: CookieSettings): string | undefined {
  return asToken(request.cookies[cookieName(settings)]);
}

export function refreshToken(request: FastifyRequest, settings: CookieSettings): string | undefined {
  return asToken(request.cookies[refreshCookieName(settings)]);
}

/** A new pair of tokens (random unless given), and what the session stores for them. */
function newPair(now: Date, tokens: SessionTokens = { access: newToken(), refresh: newToken() }) {
  const fields = {
    accessHash: hashToken(tokens.access),
    accessExpiresAt: new Date(now.getTime() + ACCESS_MS),
    refreshHash: hashToken(tokens.refresh),
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MS),
  };
  return { tokens, fields };
}

/**
 * The pair a refresh swaps `refresh` for: derived from it and a random salt the session keeps (refreshSalt), so the
 * same token can get the same pair again during a race (REFRESH_RACE_MS). The old token alone does not give the new
 * pair, as the salt is only in the database; nor does the database, which has only the old token's hash.
 */
function pairFrom(refresh: string, salt: string): SessionTokens {
  const derive = (use: string) => createHmac('sha256', refresh).update(`${use}:${salt}`).digest('base64url');
  return { access: derive('access'), refresh: derive('refresh') };
}

/**
 * Signs an account in on this device: a new session, its cookies, and the device's name from the User-Agent. An
 * account keeps at most MAX_SESSIONS: past that, the ones used longest ago (lastSeenAt) end, so a loop of sign-ins
 * cannot fill the database. The new one always stays. Returns the session's id.
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
  const { tokens, fields } = newPair(now);
  const doc: SessionDoc = {
    _id: randomBytes(16).toString('hex'),
    accountId,
    ...fields,
    retired: [],
    refreshedAt: null,
    createdAt: now,
    device: deviceName(userAgent).slice(0, 100),
  };
  await c.sessions.insertOne(doc, { session });
  const over = await c.sessions
    .find({ accountId, _id: { $ne: doc._id } }, { session, projection: { _id: 1 } })
    .sort({ lastSeenAt: -1, createdAt: -1 })
    .skip(MAX_SESSIONS - 1)
    .toArray();
  if (over.length > 0) await c.sessions.deleteMany({ _id: { $in: over.map((s) => s._id) } }, { session });
  setSessionCookies(reply, settings, tokens);
  return doc._id;
}

/**
 * Signs an account in on this device in place of the session the browser had, if any: that one ends first, whoever's
 * it was and whether or not it still works, so no session is left behind that no device holds any more. Either cookie
 * names it: the session token may have run out while the refresh token still works. For sign-in, accepting an invite
 * and setting a new password, all under REFRESH_PATH.
 */
export async function replaceSession(
  c: Collections,
  request: FastifyRequest,
  reply: FastifyReply,
  settings: CookieSettings,
  accountId: ObjectId,
  now: Date,
): Promise<string> {
  const access = sessionToken(request, settings);
  const refresh = refreshToken(request, settings);
  const previous = [
    ...(access ? [{ accessHash: hashToken(access) }] : []),
    ...(refresh ? [{ refreshHash: hashToken(refresh) }] : []),
  ];
  if (previous.length > 0) await c.sessions.deleteMany({ $or: previous });
  return createSession(c, reply, settings, accountId, now, request.headers['user-agent']);
}

/**
 * The live session for a session token, or null. A session token that ran out, or was swapped by a refresh, counts as
 * missing; so does an expired session, even before the TTL index deletes it (MongoDB removes expired documents only
 * about once a minute). Using the session token moves nothing: only a refresh does.
 */
export async function findSession(c: Collections, token: string, now: Date): Promise<SessionDoc | null> {
  return c.sessions.findOne({ accessHash: hashToken(token), accessExpiresAt: { $gt: now }, expiresAt: { $gt: now } });
}

export type Refresh =
  /** Swapped: the new pair goes in the cookies. The session lasts SESSION_DAYS from now. */
  | { outcome: 'rotated'; session: SessionDoc; tokens: SessionTokens }
  /** Swapped moments ago (REFRESH_RACE_MS): the same pair as then goes in the cookies, as that answer may be lost. */
  | { outcome: 'raced'; session: SessionDoc; tokens: SessionTokens }
  /** A refresh token swapped longer ago came back: it was copied. The session is ended, for whoever holds it. */
  | { outcome: 'reused'; session: SessionDoc }
  /** No live session has this token, now or before. */
  | { outcome: 'none' };

/**
 * Swaps a refresh token for a new pair. The swap is one update that matches the current token only, so of two
 * requests with one token, one swaps and the other finds it retired (a race, or a copy). The caller checks the
 * account before it sets the cookies.
 */
export async function refreshSession(c: Collections, token: string, now: Date): Promise<Refresh> {
  const hash = hashToken(token);
  const refreshSalt = newToken();
  const { tokens, fields } = newPair(now, pairFrom(token, refreshSalt));
  const rotated = await c.sessions.findOneAndUpdate(
    { refreshHash: hash, expiresAt: { $gt: now } },
    { $set: { ...fields, refreshedAt: now, refreshSalt }, $push: { retired: { $each: [hash], $slice: -RETIRED_KEPT } } },
    { returnDocument: 'after' },
  );
  if (rotated) return { outcome: 'rotated', session: rotated, tokens };

  const old = await c.sessions.findOne({ retired: hash, expiresAt: { $gt: now } });
  if (!old) return { outcome: 'none' };
  // The token the last swap took, moments ago: that swap's pair is still the session's, and made again from its salt.
  const justSwapped = old.retired.at(-1) === hash && old.refreshedAt !== null
    && now.getTime() - old.refreshedAt.getTime() < REFRESH_RACE_MS;
  if (justSwapped && old.refreshSalt) {
    return { outcome: 'raced', session: old, tokens: pairFrom(token, old.refreshSalt) };
  }
  await c.sessions.deleteOne({ _id: old._id });
  return { outcome: 'reused', session: old };
}
