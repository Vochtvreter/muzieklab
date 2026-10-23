import type { FastifyRequest } from 'fastify';

// Forged requests (BACKEND-PLAN.md §5.4): besides SameSite=Lax, every request that changes something must come from a
// page on this site. Browsers send Origin with every such request and a page cannot fake it; Caddy and the Vite dev
// proxy pass the Host header on unchanged, so the two must name the same host and port.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function needsOriginCheck(method: string): boolean {
  return !SAFE_METHODS.has(method);
}

function parseOrigin(origin: string | undefined): URL | null {
  if (!origin || origin === 'null') return null;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** True when the request's Origin header is this site: the same host and port as the Host header. */
export function sameOrigin(request: FastifyRequest): boolean {
  const origin = parseOrigin(request.headers.origin);
  const host = request.headers.host;
  if (!origin || !host) return false;
  try {
    // Read Host as a URL of the origin's scheme, so a default port written out (":443") compares equal to none.
    return new URL(`${origin.protocol}//${host}`).host === origin.host;
  } catch {
    return false;
  }
}

function isLocal(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

/**
 * The site's origin, for the links admins send (`<origin>/#/invite/<token>`): the app calls the API from the same
 * site, so it is the request's Origin when that is https (or http on localhost, for development). Otherwise it is
 * built from X-Forwarded-Proto (Caddy sets it; https when missing) and Host.
 */
export function siteOrigin(request: FastifyRequest): string {
  const origin = parseOrigin(request.headers.origin);
  if (origin && (origin.protocol === 'https:' || isLocal(origin))) return origin.origin;
  const forwarded = String(request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  const proto = forwarded === 'http' ? 'http' : 'https';
  return `${proto}://${request.headers.host ?? 'localhost'}`;
}

/**
 * The --url of the create-admin command as an origin: https, or http on localhost for development. Null otherwise.
 */
export function originFromUrl(value: string): string | null {
  const url = parseOrigin(value);
  if (!url || (url.protocol === 'http:' && !isLocal(url))) return null;
  return url.origin;
}
