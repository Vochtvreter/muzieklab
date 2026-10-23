// Too many tries (BACKEND-PLAN.md §5.2): sign-ins slow down rather than lock, since a hard lockout would let anyone
// lock someone else out. In memory, because the API is one process; a restart forgets, which only helps the person
// who was waiting.

export interface AttemptLimits {
  /** Failures within `windowMs` before waits start. */
  freeFailures: number;
  windowMs: number;
  /** The first wait; each further failure doubles it, up to `maxWaitMs`. */
  firstWaitMs: number;
  maxWaitMs: number;
  /** Entries kept at most; past this, the oldest go first (an attacker trying many emails cannot fill memory). */
  maxKeys: number;
}

export const DEFAULT_LIMITS: AttemptLimits = {
  freeFailures: 5,
  windowMs: 15 * 60_000,
  firstWaitMs: 2_000,
  maxWaitMs: 15 * 60_000,
  maxKeys: 100_000,
};

interface Entry {
  /** Failures that count. */
  count: number;
  /** When the newest of them happened (ms), oldest first; only the last few are kept. */
  times: number[];
  /** No try before this (ms). */
  waitUntil: number;
}

/**
 * Counts failed tries per key ("email:ann@example.com", "ip:203.0.113.7"). After `freeFailures` failures within the
 * window, every further try must wait: 2 s, then 4 s, 8 s… up to 15 minutes. Tries during a wait are refused without
 * being checked, so they neither count nor shorten or reset the wait. Once the waits have started, they go on
 * doubling until the key has been quiet for a whole window after its last wait.
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
      let entry = this.entries.get(key);
      if (entry && this.expired(entry, now)) entry = undefined;
      entry ??= { count: 0, times: [], waitUntil: 0 };
      if (entry.count < this.limits.freeFailures) {
        // Before the waits start, only failures within the window count.
        entry.times = entry.times.filter((at) => at > now - this.limits.windowMs);
        entry.count = entry.times.length;
      }
      entry.count++;
      entry.times.push(now);
      if (entry.times.length > this.limits.freeFailures + 1) entry.times.shift();
      this.setWait(entry);
      // Re-inserting moves the key to the end, so the Map stays ordered by last failure for the trim below.
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    if (this.entries.size > this.limits.maxKeys) this.sweep();
    while (this.entries.size > this.limits.maxKeys) this.entries.delete(this.entries.keys().next().value!);
    return 0;
  }

  /** The try that `begin` counted was right after all: it no longer counts as a failure. */
  forgive(keys: readonly string[]): void {
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      entry.count--;
      entry.times.pop();
      if (entry.count <= 0) this.entries.delete(key);
      else this.setWait(entry);
    }
  }

  /** Forgets a key's failures: a good sign-in clears the email's counter (not the address's). */
  clear(key: string): void {
    this.entries.delete(key);
  }

  /** Drops the entries that no longer count. app.ts runs it every minute. */
  sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (this.expired(entry, now)) this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Before the waits: every failure is out of the window. After: quiet for a window since the last wait ended. */
  private expired(entry: Entry, now: number): boolean {
    if (entry.count < this.limits.freeFailures) {
      return (entry.times[entry.times.length - 1] ?? 0) <= now - this.limits.windowMs;
    }
    return now > entry.waitUntil + this.limits.windowMs;
  }

  /** The wait after the newest failure: none for the first `freeFailures`, then 2 s, doubling, up to the cap. */
  private setWait(entry: Entry): void {
    const over = entry.count - this.limits.freeFailures;
    const last = entry.times[entry.times.length - 1] ?? 0;
    entry.waitUntil =
      over < 0 ? 0 : last + Math.min(this.limits.firstWaitMs * 2 ** Math.min(over, 30), this.limits.maxWaitMs);
  }
}

export const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`;
export const ipKey = (ip: string) => `ip:${ip}`;
