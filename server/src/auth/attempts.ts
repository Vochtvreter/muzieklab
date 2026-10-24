import { isIPv4, isIPv6 } from 'node:net';

// Too many tries (BACKEND-PLAN.md §5.2): sign-ins slow down rather than lock, since a hard lockout would let anyone
// lock someone else out. In memory, because the API is one process; a restart forgets, which only helps the person
// who was waiting.
//
// Four counters for a password try. It must pass the first three, and the fourth never refuses one:
// - the pair, an email from one address: 5 failures in 15 minutes are free. Only that address is slowed for that
//   email, so someone guessing slows themselves down, not the account's owner elsewhere.
// - the address alone, across emails: 50 failures in 15 minutes are free, so one school or office network, where many
//   people sign in from one address, is not slowed by a few mistyped passwords.
// - the email alone, from all addresses: 50 failures in 15 minutes are free, against guessing spread over many
//   addresses. Keeping someone's account waiting then takes dozens of tries every 15 minutes, not a handful.
// - the network, the IPv4 /24 or IPv6 /48 the address is in: it never makes a try wait. Many people can share one: an
//   ISP may give each home a /56 or a /60, so a /48 holds hundreds or thousands of homes, a mobile carrier gives each
//   phone a /64 out of a /48 that thousands share, and carrier NAT puts thousands of phones in one IPv4 /24. Making a
//   network wait would let one of them keep all the others out. Past its 200 free failures in 15 minutes it only gets
//   fewer places in the hash queue (`over`; passwords.ts serves the networks in turn), so its tries cannot fill it.
//
// A fifth, the link counter, is for wrong link tokens: per address, with the address's limits, but apart from its
// password tries (`linkKeys`).
//
// The hash queue also asks whether an address is clean (`tries`: no other try in the window, a password wrong or right,
// or a wrong link token), as it keeps a few places in each network's line for those: someone in a network past its
// free failures cannot keep the others in it out with failures from a few of its addresses, or with right passwords to
// an account of their own.
//
// Each counter keeps its own entries, with its own cap, and a flood of one kind can push out only its own kind's. Link
// checks cost no hash, so wrong tokens from many addresses can fill the link counter's entries within seconds. The
// address entries (which say who is clean), the pair's and the email's grow only from password tries, and only those
// that get a hash stay counted (a try refused as busy is taken back): about 16 a second, so a window holds far fewer
// than the cap. Only tens of thousands of tries in flight at the same moment could push some out, a flood that is met
// at the network edge, not here (BACKEND-PLAN.md §8, residual risk).

/** How one counter slows tries down. */
export interface CounterLimits {
  /** Failures within `windowMs` before waits start. */
  freeFailures: number;
  windowMs: number;
  /** The first wait; each further failure doubles it, up to `maxWaitMs` (0: this counter never makes a try wait). */
  firstWaitMs: number;
  maxWaitMs: number;
  /**
   * True: once the waits have started, they go on doubling until the key has been quiet for a whole window after its
   * last wait (the pair, which only slows whoever fails). False: only the failures of the last window count, so the
   * waits stop soon after the failures do (the counters many people share).
   */
  untilQuiet: boolean;
  /**
   * Entries this counter keeps at most; past this, its oldest go first (an attacker trying many emails or addresses
   * cannot fill memory). Only this counter's own entries: a flood of one kind cannot push out another kind's.
   */
  maxKeys: number;
}

export const COUNTERS = ['pair', 'address', 'network', 'email', 'link'] as const;
export type Counter = (typeof COUNTERS)[number];

export type AttemptLimits = Record<Counter, CounterLimits>;

const WAITS = { windowMs: 15 * 60_000, firstWaitMs: 2_000, maxWaitMs: 15 * 60_000 };

export const DEFAULT_LIMITS: AttemptLimits = {
  pair: { freeFailures: 5, ...WAITS, untilQuiet: true, maxKeys: 100_000 },
  address: { freeFailures: 50, ...WAITS, untilQuiet: false, maxKeys: 100_000 },
  // Never waits: past its free failures the network only gets fewer places in the hash queue (`over`). Fewer entries:
  // each may hold the times of hundreds of failures, and filling 10,000 takes 10,000 networks.
  network: { freeFailures: 200, ...WAITS, firstWaitMs: 0, maxWaitMs: 0, untilQuiet: false, maxKeys: 10_000 },
  email: { freeFailures: 50, ...WAITS, untilQuiet: false, maxKeys: 100_000 },
  // Wrong link tokens, per address: the address's limits, in entries of their own.
  link: { freeFailures: 50, ...WAITS, untilQuiet: false, maxKeys: 100_000 },
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
 * Counts failed tries per key ("pair:203.0.113.7 ann@example.com", "address:203.0.113.7", "network:203.0.113.0/24",
 * "email:ann@example.com", "link:203.0.113.7"; the part before the colon names the counter and so its limits and its
 * entries). After a counter's free failures within the window, every further try must wait: 2 s, then 4 s, 8 s… up to
 * 15 minutes (not the network's, which never waits). Tries during a wait are refused without being checked, so they
 * neither count nor shorten or reset the wait.
 *
 * A try counts as a failure from the moment it starts (`begin`) until it turns out right (`forgive`): otherwise many
 * tries sent at once would all be checked before the first failure was counted.
 */
export class AttemptLimiter {
  /** One Map per counter, each in order of last failure (oldest first) for its own trim. */
  private readonly entries: Record<Counter, Map<string, Entry>> = {
    pair: new Map(),
    address: new Map(),
    network: new Map(),
    email: new Map(),
    link: new Map(),
  };
  /**
   * The right passwords per key (`right`), when they were within its counter's window, oldest first; the Map in order
   * of last right password for the trim. Apart from `entries`: they never make a try wait, and only `tries` asks.
   */
  private readonly rights = new Map<string, number[]>();

  constructor(
    private readonly now: () => number,
    private readonly limits: AttemptLimits = DEFAULT_LIMITS,
  ) {}

  /** Seconds before `keys` may try again: 0 when they may try now. The longest wait of the keys counts. */
  retryAfter(keys: readonly string[]): number {
    const now = this.now();
    let wait = 0;
    for (const key of keys) {
      const entry = this.mapOf(key).get(key);
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
      const counter = counterOf(key);
      const limits = this.limits[counter];
      const map = this.entries[counter];
      let entry = map.get(key);
      if (entry && this.expired(entry, limits, now)) entry = undefined;
      entry ??= { count: 0, times: [], waitUntil: 0 };
      this.dropOld(entry, limits, now);
      entry.count++;
      entry.times.push(now);
      if (limits.untilQuiet && entry.times.length > limits.freeFailures + 1) entry.times.shift();
      this.setWait(entry, limits);
      // Re-inserting moves the key to the end, so the Map stays ordered by last failure for the trim below.
      map.delete(key);
      map.set(key, entry);
      // The counter's oldest go first, never another counter's. No sweep here: the one app.ts runs every minute is
      // enough, and running one over a full Map on every try would cost each try that whole walk.
      while (map.size > limits.maxKeys) map.delete(map.keys().next().value!);
    }
    return 0;
  }

  /** The try that `begin` counted was right after all, or was never checked: it no longer counts as a failure. */
  forgive(keys: readonly string[]): void {
    const now = this.now();
    for (const key of keys) {
      const counter = counterOf(key);
      const map = this.entries[counter];
      const entry = map.get(key);
      if (!entry) continue;
      const limits = this.limits[counter];
      entry.count--;
      entry.times.pop();
      this.dropOld(entry, limits, now);
      if (entry.count <= 0) map.delete(key);
      else this.setWait(entry, limits);
    }
  }

  /**
   * Whether `key` is past its free failures: more than `freeFailures` within the window, counting the tries still
   * running. For the counters that count only the last window (the network's: the hash queue asks it).
   */
  over(key: string): boolean {
    const { freeFailures } = this.limits[counterOf(key)];
    return this.countFailures(key, freeFailures + 1) > freeFailures;
  }

  /**
   * The failures of `key` within the window, counting the tries still running. For the counters that count only the
   * last window (the address's: the hash queue asks, through `tries`, whether it is clean).
   */
  failures(key: string): number {
    return this.countFailures(key, Infinity);
  }

  /**
   * Notes a right password from `key` (an address, after its try was taken back with `forgive`). It never makes a try
   * wait, and it does not clear the counter: it only counts in `tries`.
   */
  right(key: string): void {
    const now = this.now();
    const since = now - this.limits[counterOf(key)].windowMs;
    const times = (this.rights.get(key) ?? []).filter((at) => at > since);
    times.push(now);
    this.rights.delete(key);
    this.rights.set(key, times);
    while (this.rights.size > this.limits[counterOf(key)].maxKeys) this.rights.delete(this.rights.keys().next().value!);
  }

  /**
   * The tries of `key` (an address) within the window: its `failures` (password tries, with those still running), the
   * right passwords `right` noted, and the wrong link tokens from that address (its link counter's failures). The hash
   * queue keeps places for the tries of an address with no other (tries.ts hashLane). The link entries are apart, so
   * a flood of wrong tokens pushing them out can only forget those, never an address's password tries.
   */
  tries(key: string): number {
    const counter = counterOf(key);
    const since = this.now() - this.limits[counter].windowMs;
    let rights = 0;
    for (const at of this.rights.get(key) ?? []) if (at > since) rights++;
    // The same address on the link counter ("address:203.0.113.7" → "link:203.0.113.7").
    const links = counter === 'address' ? this.failures(`link:${key.slice(key.indexOf(':') + 1)}`) : 0;
    return this.failures(key) + rights + links;
  }

  /** Forgets a key's failures: a good sign-in clears its pair's counter (not the address's, network's or email's). */
  clear(key: string): void {
    this.mapOf(key).delete(key);
  }

  /** Drops the entries and right passwords that no longer count. app.ts runs it every minute. */
  sweep(): void {
    const now = this.now();
    for (const counter of COUNTERS) {
      const map = this.entries[counter];
      for (const [key, entry] of map) {
        if (this.expired(entry, this.limits[counter], now)) map.delete(key);
      }
    }
    for (const [key, times] of this.rights) {
      if (times[times.length - 1] <= now - this.limits[counterOf(key)].windowMs) this.rights.delete(key);
    }
  }

  /** Entries kept: those of one counter, or of all of them (with no counter, also the keys with right passwords). */
  size(counter?: Counter): number {
    if (counter) return this.entries[counter].size;
    return COUNTERS.reduce((sum, each) => sum + this.entries[each].size, this.rights.size);
  }

  private mapOf(key: string): Map<string, Entry> {
    return this.entries[counterOf(key)];
  }

  /** The failures of `key` within the window, newest first, counted up to `upTo` (a network may hold hundreds). */
  private countFailures(key: string, upTo: number): number {
    const counter = counterOf(key);
    const entry = this.entries[counter].get(key);
    if (!entry) return 0;
    const since = this.now() - this.limits[counter].windowMs;
    let count = 0;
    for (let i = entry.times.length - 1; i >= 0 && entry.times[i] > since && count < upTo; i--) count++;
    return count;
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
    const wait = Math.min(limits.firstWaitMs * 2 ** Math.min(over, 30), limits.maxWaitMs);
    entry.waitUntil = over < 0 || wait <= 0 ? 0 : last + wait;
  }
}

/** The counter a key belongs to: the part before its first colon. */
function counterOf(key: string): Counter {
  const counter = key.slice(0, key.indexOf(':'));
  if (!(COUNTERS as readonly string[]).includes(counter)) throw new Error(`No counter for ${key}`);
  return counter as Counter;
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

type Parsed = { v4: number[] } | { v6: number[] } | { other: string };

/** An address as its four IPv4 bytes or eight IPv6 groups; IPv4 written as IPv6 (::ffff:203.0.113.7) is IPv4. */
function parse(ip: string): Parsed {
  const bare = ip.split('%')[0]; // without a zone (fe80::1%eth0)
  if (isIPv4(bare)) return { v4: bare.split('.').map(Number) };
  // Not an address at all cannot come from Caddy; kept short all the same.
  if (!isIPv6(bare)) return { other: ip.slice(0, 64) };
  const groups = ipv6Groups(bare);
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return { v4: [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff] };
  }
  return { v6: groups };
}

const hex = (groups: number[]) => groups.map((g) => g.toString(16)).join(':');

/**
 * Where a try comes from, as the address counter sees it: an IPv4 address as it is, and an IPv6 one cut to its /64.
 * One home, phone or server is given a whole /64 (2^64 addresses), so counting each IPv6 address apart would count
 * nothing. An IPv4 address written as IPv6 (::ffff:203.0.113.7) is that IPv4 address.
 */
export function addressOf(ip: string): string {
  const parsed = parse(ip);
  if ('v4' in parsed) return parsed.v4.join('.');
  if ('v6' in parsed) return `${hex(parsed.v6.slice(0, 4))}::/64`;
  return parsed.other;
}

/**
 * The network a try comes from, for the network counter and the hash queue's lines: the /24 of an IPv4 address, the
 * /48 of an IPv6 one. Not one person's: a /48 (65,536 /64s) may be one home's, or hundreds of homes' that their ISP
 * gave a /56 or /60 each, or thousands of phones', and a /24 may be a carrier's NAT for thousands of phones. Someone
 * can also get a /48 of their own for free (a tunnel broker), so it is the unit the hash queue shares out, while
 * nobody in it is ever made to wait for the others' failures.
 */
export function networkOf(ip: string): string {
  const parsed = parse(ip);
  if ('v4' in parsed) return `${parsed.v4.slice(0, 3).join('.')}.0/24`;
  if ('v6' in parsed) return `${hex(parsed.v6.slice(0, 3))}::/48`;
  return parsed.other;
}

const lower = (email: string) => email.trim().toLowerCase();

export const pairKey = (email: string, ip: string) => `pair:${addressOf(ip)} ${lower(email)}`;
export const addressKey = (ip: string) => `address:${addressOf(ip)}`;
export const networkKey = (ip: string) => `network:${networkOf(ip)}`;
export const emailKey = (email: string) => `email:${lower(email)}`;
export const linkKey = (ip: string) => `link:${addressOf(ip)}`;

/**
 * The counters a link try goes through: the link counter only, per address as the address counter but apart from it.
 * There is no email to count against, and not the network: a wrong token costs no hash, and links (256 bits) cannot be
 * guessed, so counting it there would only let one address slow the sign-ins of everyone it shares its network with.
 * Not the address counter either: wrong tokens cost no hash, so a flood of them from many addresses would push out the
 * address entries that say who is clean (`tries`, which still counts them through the link counter).
 */
export function linkKeys(ip: string): string[] {
  return [linkKey(ip)];
}

/** The four counters a password try goes through: the pair, the address, its network (never waits), then the email. */
export function passwordKeys(email: string, ip: string): string[] {
  return [pairKey(email, ip), addressKey(ip), networkKey(ip), emailKey(email)];
}
