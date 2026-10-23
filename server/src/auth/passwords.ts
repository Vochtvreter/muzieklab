import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { PASSWORD_MAX, PASSWORD_MIN, type ErrorCode } from '../../../shared/api.js';
import { ApiError } from '../errors.js';
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

/** Which line a hash waits in: the network its try comes from (tries.ts hashLane). */
export interface HashLane {
  /** The network (attempts.ts networkOf). Each network waits in its own line, and the lines take turns. */
  network: string;
  /** The network is past its free failures (attempts.ts `over`): it may use only its own places, not the shared. */
  limited: boolean;
  /**
   * The try's address has made no other try within the window (attempts.ts `tries`): it may also use the places its
   * line keeps for clean tries, whatever the rest of its network does.
   */
  clean: boolean;
}

/** The line of the hashes the server makes for itself (the dummy hash; the tests' accounts). */
export const SERVER_LANE: HashLane = { network: 'server', limited: false, clean: false };

/** How many may wait for a hash. Past these the server is too busy, and a try gets 429 with `retryAfter: 1`. */
export interface QueueLimits {
  /** Any line may add to the waiting while fewer than this many wait in all: a class signing in at once. */
  shared: number;
  /** Each line may always have this many waiting, however full the queue: a flood cannot keep another network out. */
  perLine: number;
  /**
   * Waiting at most, in all (in the places not kept for clean tries): a backstop for memory. Well above the networks
   * expected at once, since every network may have `perLine`; waiting tries are only promises (the memory goes to the
   * hashes running).
   */
  max: number;
  /**
   * On top of those, the places each line keeps for clean tries (HashLane.clean), its network limited or not and
   * however many of its others wait: someone in a network cannot keep the rest of it out by holding the line's
   * `perLine`. A clean try waits there while one is free, and is served before the line's others. `shared` and `max`
   * count only the others.
   */
  perLineClean: number;
  /** Waiting at most in the kept places, in all (a backstop as `max`); past that, a clean try waits as any other. */
  maxClean: number;
}

/**
 * The hash queue's limits. 32 shared places are about 2 s of work at 4 hashes a quarter second; with 2 places for
 * each network, filling the 512 takes 256 networks at once. Keeping a line's 4 kept places full takes an address with
 * no other try in 15 minutes for every try served; filling all 512 takes 128 networks, and leaves each its 2.
 */
export const HASH_QUEUE: QueueLimits = { shared: 32, perLine: 2, max: 512, perLineClean: 4, maxClean: 512 };

const busy = () => new ApiError('too_many_attempts', 'The server is busy: try again in a second', 1);

/** A line's waiting tries, in the places kept for clean ones and in the others, each first come, first served. */
interface Line {
  clean: (() => void)[];
  other: (() => void)[];
}

/** Which of a line's places a try waits in. */
export type Places = keyof Line;

/**
 * A counting semaphore that is fair between lines (networks): callers past `size` wait in their line, and the lines
 * take turns, first come first served within a line, clean tries first. A free slot goes to the line whose turn it
 * is, and that line then goes to the back. So a network with one try waiting waits behind at most one try of every
 * other network, however many those have. A try that may not wait (`limits`) is refused with too_many_attempts
 * instead.
 */
export class Semaphore {
  private free: number;
  /** The lines with someone waiting, in the order of their next turn. */
  private readonly lines = new Map<string, Line>();
  /** Waiting in all, in each kind of place. */
  private readonly queued: Record<Places, number> = { clean: 0, other: 0 };

  constructor(
    private readonly size: number,
    private readonly limits: QueueLimits = { shared: Infinity, perLine: Infinity, max: Infinity, perLineClean: 0, maxClean: 0 },
  ) {
    this.free = size;
  }

  /** Callers running now. */
  get running(): number {
    return this.size - this.free;
  }

  /** Callers waiting for their turn, in all lines. */
  get waiting(): number {
    return this.queued.clean + this.queued.other;
  }

  /** Callers waiting in one line: in its kept places for clean tries, its others, or (no `places`) both. */
  waitingIn(line: string, places?: Places): number {
    const waiting = this.lines.get(line);
    if (!waiting) return 0;
    return places ? waiting[places].length : waiting.clean.length + waiting.other.length;
  }

  async run<T>(lane: HashLane, fn: () => Promise<T>): Promise<T> {
    if (this.free > 0) this.free--;
    else {
      const places = this.placesFor(lane);
      if (!places) throw busy();
      await new Promise<void>((resolve) => {
        let line = this.lines.get(lane.network);
        if (!line) this.lines.set(lane.network, (line = { clean: [], other: [] }));
        line[places].push(resolve);
        this.queued[places]++;
      });
    }
    try {
      return await fn();
    } finally {
      this.next();
    }
  }

  /** Where a try may wait: a clean one in its line's kept places while one is free, else as any try; or nowhere. */
  private placesFor({ network, limited, clean }: HashLane): Places | null {
    const { shared, perLine, max, perLineClean, maxClean } = this.limits;
    if (clean && this.waitingIn(network, 'clean') < perLineClean && this.queued.clean < maxClean) return 'clean';
    if (this.queued.other >= max) return null;
    return this.waitingIn(network, 'other') < perLine || (!limited && this.queued.other < shared) ? 'other' : null;
  }

  /** Hands the slot straight to the line whose turn it is (its first clean try, if any), which goes to the back. */
  private next(): void {
    const first = this.lines.entries().next();
    if (first.done) {
      this.free++;
      return;
    }
    const [network, line] = first.value;
    const places: Places = line.clean.length > 0 ? 'clean' : 'other';
    const resolve = line[places].shift()!;
    this.queued[places]--;
    this.lines.delete(network);
    if (line.clean.length + line.other.length > 0) this.lines.set(network, line);
    resolve();
  }
}

/** The one queue every hash goes through (exported for the tests). */
export const hashing = new Semaphore(MAX_PARALLEL_HASHES, HASH_QUEUE);

function derive(
  password: string,
  salt: Buffer,
  { N, r, p }: ScryptParams,
  keyLength: number,
  lane: HashLane,
): Promise<Buffer> {
  const options: ScryptOptions = { N, r, p, maxmem: MAX_MEM };
  return hashing.run(
    lane,
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(password.normalize('NFC'), salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
      }),
  );
}

/**
 * `scrypt$<N>$<r>$<p>$<salt>$<hash>` (base64): the parameters go with each hash, so they can change later and old
 * hashes still verify. Passwords are NFC-normalised first, so the same password typed on another keyboard matches.
 * The hash waits in `lane`'s line of the hash queue.
 */
export async function hashPassword(
  password: string,
  lane: HashLane,
  params: ScryptParams = DEFAULT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params, KEY_LENGTH, lane);
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

/**
 * True when `password` matches `stored`, checked in `lane`'s line of the hash queue. A malformed hash is a mismatch,
 * never an error; a full hash queue is the error it is (429), not a wrong password.
 */
export async function verifyPassword(password: string, stored: string, lane: HashLane): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  let key: Buffer;
  try {
    key = await derive(password, parsed.salt, parsed, parsed.key.length, lane);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    return false;
  }
  return timingSafeEqual(key, parsed.key);
}

let dummy: Promise<string> | undefined;

/** Makes the dummy hash below once per process; app.ts starts it early, so the first unknown email is not slower. */
export function dummyHash(): Promise<string> {
  // A refusal (the hash queue was full) is not kept: the next call tries again.
  dummy ??= hashPassword(randomBytes(32).toString('base64'), SERVER_LANE).catch((err: unknown) => {
    dummy = undefined;
    throw err;
  });
  return dummy;
}

/**
 * Checks a password against a hash of nothing anyone knows, and is always false. Signing in to an email without an
 * account (or without a password yet) does this, so it takes as long as a real check and the time does not tell
 * whether the account exists.
 */
export async function verifyDummy(password: string, lane: HashLane): Promise<false> {
  await verifyPassword(password, await dummyHash(), lane);
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
