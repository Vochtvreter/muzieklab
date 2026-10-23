import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { PASSWORD_MAX, PASSWORD_MIN, type ErrorCode } from '../../../shared/api.js';
import commonPasswordsText from './common-passwords-text.js';

// Passwords are hashed with scrypt from node:crypto (not argon2, as BACKEND-PLAN.md §1.1 first said: a native module
// cannot be bundled into the one-file dist/server.cjs). OWASP's scrypt option: N=2^15, r=8, p=3, which takes 32 MiB
// and about a quarter of a second per hash.

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** Node refuses scrypt above `maxmem`; 128 MiB leaves room above the 32 MiB these parameters need. */
const MAX_MEM = 128 * 1024 * 1024;
/** Hashes running at once: each takes 32 MiB and a libuv thread, and the service has 512 MB (MemoryMax). */
export const MAX_PARALLEL_HASHES = 4;

/** A tiny counting semaphore: callers past the limit wait their turn, first come first served. */
class Semaphore {
  private free: number;
  private readonly waiting: (() => void)[] = [];

  constructor(size: number) {
    this.free = size;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.free > 0) this.free--;
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try {
      return await fn();
    } finally {
      // Hand the slot straight to the next caller, or give it back.
      const next = this.waiting.shift();
      if (next) next();
      else this.free++;
    }
  }
}

const hashing = new Semaphore(MAX_PARALLEL_HASHES);

function derive(password: string, salt: Buffer, { N, r, p }: ScryptParams, keyLength: number): Promise<Buffer> {
  const options: ScryptOptions = { N, r, p, maxmem: MAX_MEM };
  return hashing.run(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(password.normalize('NFC'), salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
      }),
  );
}

/**
 * `scrypt$<N>$<r>$<p>$<salt>$<hash>` (base64): the parameters go with each hash, so they can change later and old
 * hashes still verify. Passwords are NFC-normalised first, so the same password typed on another keyboard matches.
 */
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params, KEY_LENGTH);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

interface ParsedHash extends ScryptParams {
  salt: Buffer;
  key: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  // Bounds so a damaged hash cannot make the server spend minutes or gigabytes on it.
  const ok = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  if (!ok(N, 2 ** 20) || (N & (N - 1)) !== 0 || N < 2 || !ok(r, 32) || !ok(p, 16)) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const key = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || key.length < 32) return null;
  return { N, r, p, salt, key };
}

/** True when `password` matches `stored`. A malformed hash is a mismatch, never an error. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  let key: Buffer;
  try {
    key = await derive(password, parsed.salt, parsed, parsed.key.length);
  } catch {
    return false;
  }
  return timingSafeEqual(key, parsed.key);
}

let dummy: Promise<string> | undefined;

/** Makes the dummy hash below once per process; app.ts starts it early, so the first unknown email is not slower. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('base64'));
  return dummy;
}

/**
 * Checks a password against a hash of nothing anyone knows, and is always false. Signing in to an email without an
 * account (or without a password yet) does this, so it takes as long as a real check and the time does not tell
 * whether the account exists.
 */
export async function verifyDummy(password: string): Promise<false> {
  await verifyPassword(password, await dummyHash());
  return false;
}

// --- rules (BACKEND-PLAN.md §5.5) ----------------------------------------------------------------------------------

/** NCSC's 100k most used passwords, only those of PASSWORD_MIN or more characters (shorter ones fail the length rule). */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  commonPasswordsText
    .split('\n')
    .slice(1) // the header line naming the source
    .filter((line) => line.length > 0),
);

/** Length in characters as people count them (code points), not UTF-16 units: an emoji is one. */
export function passwordLength(password: string): number {
  return [...password].length;
}

/**
 * Null when `password` may be used by the account with `email`, else the error code saying why not. No rules about
 * digits or symbols (NIST SP 800-63B): length, the common list, and not the email address.
 */
export function passwordProblem(
  password: string,
  email: string,
): Extract<ErrorCode, 'password_length' | 'password_common' | 'password_has_email'> | null {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) return 'password_length';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'password_common';
  const address = email.trim().toLowerCase();
  const local = address.split('@')[0] ?? '';
  // A short local part ("jo@…") would refuse too many good passwords, so it counts from 4 characters.
  if ((address && lower.includes(address)) || (passwordLength(local) >= 4 && lower.includes(local))) {
    return 'password_has_email';
  }
  return null;
}
