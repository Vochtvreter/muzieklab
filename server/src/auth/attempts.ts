import { isIPv4, isIPv6 } from 'node:net';

// Too many tries (BACKEND-PLAN.md §5.2): sign-ins slow down rather than lock, since a hard lockout would let anyone
// lock someone else out. In memory, because the API is one process; a restart forgets, which only helps the person
// who was waiting.
//
// Three counters, and a try must pass all three:
// - the pair, an email from one address: 5 failures in 15 minutes are free. Only that address is slowed for that
//   email, so someone guessing slows themselves down, not the account's owner elsewhere.
// - the address alone, across emails: 50 failures in 15 minutes are free, so one school or office network, where many
//   people sign in from one address, is not slowed by a few mistyped passwords.
// - the email alone, from all addresses: 50 failures in 15 minutes are free, against guessing spread over many
//   addresses. Keeping someone's account waiting then takes dozens of tries every 15 minutes, not a handful.

/** How one counter slows tries down. */
export interface CounterLimits {
  /** Failures within `windowMs` before waits start. */
  freeFailures: number;
  windowMs: number;
  /** The first wait; each further failure doubles it, up to `maxWaitMs`. */
  firstWaitMs: number;
  maxWaitMs: number;
  /**
   * True: once the waits have started, they go on doubling until the key has been quiet for a whole window after its
   * last wait (the pair, which only slows whoever fails). False: only the failures of the last window count, so the
   * waits stop soon after the failures do (the counters many people share).
   */
  untilQuiet: boolean;
}

export type Counter = 'pair' | 'address' | 'email';

export type AttemptLimits = Record<Counter, CounterLimits> & {
  /** Entries kept at most; past this, the oldest go first (an attacker trying many emails cannot fill memory). */
  maxKeys: number;
};

const WAITS = { windowMs: 15 * 60_000, firstWaitMs: 2_000, maxWaitMs: 15 * 60_000 };

export const DEFAULT_LIMITS: AttemptLimits = {
  pair: { freeFailures: 5, ...WAITS, untilQuiet: true },
  address: { freeFailures: 50, ...WAITS, untilQuiet: false },
  email: { freeFailures: 50, ...WAITS, untilQuiet: false },
  maxKeys: 100_000,
};

interface Entry {
  /** Failures that count. */
  count: number;
  /** When they happened (ms), oldest first: those within the window (for a pair in its waits, only the last few). */
  times: number[];
  /** No try before this (ms). */
  waitUntil: number;
}

/**
 * Counts failed tries per key ("pair:203.0.113.7 ann@example.com", "address:203.0.113.7", "email:ann@example.com";
 * the part before the colon names the counter and so its limits). After a counter's free failures within the window,
 * every further try must wait: 2 s, then 4 s, 8 s… up to 15 minutes. Tries during a wait are refused without being
 * checked, so they neither count nor shorten or reset the wait.
 *
 * A try counts as a failure from the moment it starts (`begin`) until it turns out right (`forgive`): otherwise many
 * tries sent at once would all be checked before the first failure was counted.
 */
export class AttemptLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => number,
    private readonly limits: AttemptLimits = DEFAULT_LIMITS,
  ) {}

  /** Seconds before `keys` may try again: 0 when they may try now. The longest wait of the keys counts. */
  retryAfter(keys: readonly string[]): number {
    const now = this.now();
    let wait = 0;
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (entry && entry.waitUntil > now) wait = Math.max(wait, entry.waitUntil - now);
    }
    return Math.ceil(wait / 1000);
  }

  /**
   * Starts a try for `keys`. Returns the seconds to wait when one of them must wait (nothing is counted then);
   * otherwise 0, and the try counts as a failure for each key until `forgive` takes it back.
   */
  begin(keys: readonly string[]): number {
    const wait = this.retryAfter(keys);
    if (wait > 0) return wait;
    const now = this.now();
    for (const key of keys) {
      const limits = this.limitsOf(key);
      let entry = this.entries.get(key);
      if (entry && this.expired(entry, limits, now)) entry = undefined;
      entry ??= { count: 0, times: [], waitUntil: 0 };
      this.dropOld(entry, limits, now);
      entry.count++;
      entry.times.push(now);
      if (limits.untilQuiet && entry.times.length > limits.freeFailures + 1) entry.times.shift();
      this.setWait(entry, limits);
      // Re-inserting moves the key to the end, so the Map stays ordered by last failure for the trim below.
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    // The oldest go first. No sweep here: the one app.ts runs every minute is enough, and running one over a full
    // Map on every try would cost each try that whole walk.
    while (this.entries.size > this.limits.maxKeys) this.entries.delete(this.entries.keys().next().value!);
    return 0;
  }

  /** The try that `begin` counted was right after all, or was never checked: it no longer counts as a failure. */
  forgive(keys: readonly string[]): void {
    const now = this.now();
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      const limits = this.limitsOf(key);
      entry.count--;
      entry.times.pop();
      this.dropOld(entry, limits, now);
      if (entry.count <= 0) this.entries.delete(key);
      else this.setWait(entry, limits);
    }
  }

  /** Forgets a key's failures: a good sign-in clears its pair's counter (not the address's or the email's). */
  clear(key: string): void {
    this.entries.delete(key);
  }

  /** Drops the entries that no longer count. app.ts runs it every minute. */
  sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (this.expired(entry, this.limitsOf(key), now)) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  private limitsOf(key: string): CounterLimits {
    const counter = key.slice(0, key.indexOf(':'));
    if (counter !== 'pair' && counter !== 'address' && counter !== 'email') throw new Error(`No counter for ${key}`);
    return this.limits[counter];
  }

  /** Only failures within the window count: always for a shared counter, and for a pair until its waits start. */
  private dropOld(entry: Entry, limits: CounterLimits, now: number): void {
    if (limits.untilQuiet && entry.count >= limits.freeFailures) return;
    entry.times = entry.times.filter((at) => at > now - limits.windowMs);
    entry.count = entry.times.length;
  }

  /**
   * Whether the entry no longer counts: its wait is over and its failures are out of the window, or, for a pair whose
   * waits started, it has been quiet for a window since the last wait ended.
   */
  private expired(entry: Entry, limits: CounterLimits, now: number): boolean {
    if (limits.untilQuiet && entry.count >= limits.freeFailures) return now > entry.waitUntil + limits.windowMs;
    return entry.waitUntil <= now && (entry.times[entry.times.length - 1] ?? 0) <= now - limits.windowMs;
  }

  /** The wait after the newest failure: none for the first `freeFailures`, then 2 s, doubling, up to the cap. */
  private setWait(entry: Entry, limits: CounterLimits): void {
    const over = entry.count - limits.freeFailures;
    const last = entry.times[entry.times.length - 1] ?? 0;
    entry.waitUntil = over < 0 ? 0 : last + Math.min(limits.firstWaitMs * 2 ** Math.min(over, 30), limits.maxWaitMs);
  }
}

/** The eight 16-bit groups of an IPv6 address (net.isIPv6 has checked it), with an IPv4 tail as the last two. */
function ipv6Groups(ip: string): number[] {
  let text = ip;
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const before = head ? head.split(':') : [];
  const after = tail ? tail.split(':') : [];
  const zeros = tail === undefined ? 0 : 8 - before.length - after.length;
  return [...before, ...Array<string>(zeros).fill('0'), ...after].map((group) => parseInt(group, 16));
}

/**
 * Where a try comes from, as the address counter sees it: an IPv4 address as it is, and an IPv6 one cut to its /64.
 * One home, phone or server is given a whole /64 (2^64 addresses), so counting each IPv6 address apart would count
 * nothing. An IPv4 address written as IPv6 (::ffff:203.0.113.7) is that IPv4 address.
 */
export function addressOf(ip: string): string {
  const bare = ip.split('%')[0]; // without a zone (fe80::1%eth0)
  if (isIPv4(bare)) return bare;
  // Not an address at all cannot come from Caddy; kept short all the same.
  if (!isIPv6(bare)) return ip.slice(0, 64);
  const groups = ipv6Groups(bare);
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

const lower = (email: string) => email.trim().toLowerCase();

export const pairKey = (email: string, ip: string) => `pair:${addressOf(ip)} ${lower(email)}`;
export const addressKey = (ip: string) => `address:${addressOf(ip)}`;
export const emailKey = (email: string) => `email:${lower(email)}`;

/** The three counters a password try goes through: the pair first, then the address, then the email. */
export function passwordKeys(email: string, ip: string): string[] {
  return [pairKey(email, ip), addressKey(ip), emailKey(email)];
}
