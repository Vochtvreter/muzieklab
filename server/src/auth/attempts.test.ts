import { describe, expect, it } from 'vitest';
import {
  AttemptLimiter,
  DEFAULT_LIMITS,
  addressKey,
  addressOf,
  emailKey,
  pairKey,
  passwordKeys,
  type AttemptLimits,
} from './attempts.js';

const MINUTE = 60_000;
const PAIR = pairKey('ann@example.com', '203.0.113.7');
const ADDRESS = addressKey('203.0.113.7');
const EMAIL = emailKey('ann@example.com');

function limiter(limits?: AttemptLimits) {
  const clock = { ms: 1_000_000 };
  return { clock, limiter: new AttemptLimiter(() => clock.ms, limits) };
}

function failTimes(l: AttemptLimiter, keys: string[], n: number) {
  for (let i = 0; i < n; i++) expect(l.begin(keys)).toBe(0);
}

describe('the limits', () => {
  it('are 5 free failures for an email from one address, and 50 for an address or an email alone', () => {
    expect(DEFAULT_LIMITS.pair).toEqual({ freeFailures: 5, windowMs: 15 * MINUTE, firstWaitMs: 2000, maxWaitMs: 15 * MINUTE, untilQuiet: true });
    for (const counter of ['address', 'email'] as const) {
      expect(DEFAULT_LIMITS[counter]).toEqual({ freeFailures: 50, windowMs: 15 * MINUTE, firstWaitMs: 2000, maxWaitMs: 15 * MINUTE, untilQuiet: false });
    }
    expect(passwordKeys(' Ann@Example.com ', '203.0.113.7')).toEqual([PAIR, ADDRESS, EMAIL]);
  });
});

describe('addressOf', () => {
  it('keeps IPv4, cuts IPv6 to its /64, and reads IPv4 written as IPv6 as IPv4', () => {
    expect(addressOf('203.0.113.7')).toBe('203.0.113.7');
    expect(addressOf('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(addressOf('2001:0DB8:0001:0002::1')).toBe('2001:db8:1:2::/64');
    expect(addressOf('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressOf('::1')).toBe('0:0:0:0::/64');
    expect(addressOf('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(addressOf('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(addressOf('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(addressOf('64:ff9b::203.0.113.7')).toBe('64:ff9b:0:0::/64');
    // Two addresses in one /64 are one address to the counters; the next /64 is another.
    expect(addressKey('2001:db8:1:2::a')).toBe(addressKey('2001:db8:1:2:ffff::b'));
    expect(addressKey('2001:db8:1:3::a')).not.toBe(addressKey('2001:db8:1:2::a'));
  });
});

describe('an email from one address (the pair)', () => {
  it('lets 5 failures through, then waits 2 s, doubling up to 15 minutes', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, [PAIR], 5);
    expect(l.begin([PAIR])).toBe(2);
    clock.ms += 2000;
    expect(l.begin([PAIR])).toBe(0); // the 6th failure
    expect(l.retryAfter([PAIR])).toBe(4);
    clock.ms += 4000;
    expect(l.begin([PAIR])).toBe(0);
    expect(l.retryAfter([PAIR])).toBe(8);
    for (let i = 0; i < 12; i++) {
      clock.ms += l.retryAfter([PAIR]) * 1000;
      expect(l.begin([PAIR])).toBe(0);
    }
    expect(l.retryAfter([PAIR])).toBe(15 * 60);
  });

  it('does not count, extend or reset the wait for tries during it', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, [PAIR], 5);
    clock.ms += 1000;
    expect(l.begin([PAIR])).toBe(1);
    expect(l.begin([PAIR])).toBe(1);
    clock.ms += 1000;
    expect(l.begin([PAIR])).toBe(0);
    expect(l.retryAfter([PAIR])).toBe(4); // the 6th failure, not the 8th
  });

  it('takes back a try that was right, and clear forgets a key', () => {
    const { limiter: l } = limiter();
    failTimes(l, [PAIR, ADDRESS], 4);
    expect(l.begin([PAIR, ADDRESS])).toBe(0); // the 5th try counts as a failure while it runs…
    expect(l.retryAfter([PAIR])).toBe(2);
    l.forgive([PAIR, ADDRESS]); // …and was right
    expect(l.retryAfter([PAIR, ADDRESS])).toBe(0);
    l.clear(PAIR);
    failTimes(l, [PAIR], 5);
    expect(l.retryAfter([PAIR])).toBe(2);
    expect(l.retryAfter([ADDRESS])).toBe(0); // the address still has its 4, of 50 free
  });

  it('counts failures within 15 minutes only', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, [PAIR], 4);
    clock.ms += 15 * MINUTE + 1;
    failTimes(l, [PAIR], 4);
    expect(l.retryAfter([PAIR])).toBe(0);
  });

  it('counts tries sent at once before any of them ends', () => {
    const { limiter: l } = limiter();
    const started = Array.from({ length: 10 }, () => l.begin([PAIR]));
    expect(started.filter((wait) => wait === 0)).toHaveLength(5);
  });

  it('keeps doubling until the key has been quiet for 15 minutes after its wait', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, [PAIR], 5);
    expect(l.retryAfter([PAIR])).toBe(2);
    clock.ms += 2000;
    expect(l.begin([PAIR])).toBe(0);
    expect(l.retryAfter([PAIR])).toBe(4);
    clock.ms += 4000 + 15 * MINUTE + 1;
    expect(l.begin([PAIR])).toBe(0); // a fresh start: the first of 5 free failures
    expect(l.retryAfter([PAIR])).toBe(0);
  });
});

describe('an address or an email alone', () => {
  it('lets 50 failures through, then waits 2 s, doubling', () => {
    for (const key of [ADDRESS, EMAIL]) {
      const { clock, limiter: l } = limiter();
      failTimes(l, [key], 50);
      expect(l.begin([key])).toBe(2);
      clock.ms += 2000;
      expect(l.begin([key])).toBe(0);
      expect(l.retryAfter([key])).toBe(4);
    }
  });

  it('lets 10 tries at once through, and 50 in all', () => {
    const { limiter: l } = limiter();
    const keys = (i: number) => [pairKey(`pupil${i}@example.com`, '203.0.113.7'), ADDRESS, emailKey(`pupil${i}@example.com`)];
    const started = Array.from({ length: 60 }, (_, i) => l.begin(keys(i)));
    expect(started.slice(0, 50).every((wait) => wait === 0)).toBe(true);
    expect(started.slice(50).every((wait) => wait === 2)).toBe(true);
  });

  it('stops waiting once the failures are 15 minutes old, though tries go on at the end of every wait', () => {
    // Someone keeping an email waiting with a wrong guess each time the wait ends. Past the first 50 that is a handful
    // of tries, but once the 50 are out of the window, the email is free again: keeping it waiting takes dozens of
    // failures every 15 minutes. A pair, which slows only whoever fails, goes on waiting.
    const keepTrying = (l: AttemptLimiter, clock: { ms: number }, key: string, until: number) => {
      let tries = 0;
      while (clock.ms <= until) {
        clock.ms += l.retryAfter([key]) * 1000;
        expect(l.begin([key])).toBe(0);
        tries++;
      }
      return tries;
    };
    const email = limiter();
    const start = email.clock.ms;
    failTimes(email.limiter, [EMAIL], 50);
    expect(keepTrying(email.limiter, email.clock, EMAIL, start + 15 * MINUTE)).toBeLessThan(12);
    expect(email.limiter.retryAfter([EMAIL])).toBe(0);
    email.clock.ms += 15 * MINUTE + 1;
    failTimes(email.limiter, [EMAIL], 49);
    expect(email.limiter.retryAfter([EMAIL])).toBe(0);

    const pair = limiter();
    failTimes(pair.limiter, [PAIR], 5);
    keepTrying(pair.limiter, pair.clock, PAIR, start + 15 * MINUTE);
    expect(pair.limiter.retryAfter([PAIR])).toBeGreaterThan(5 * 60);
  });
});

describe('the store', () => {
  it('sweeps old entries, and never keeps more than maxKeys, dropping the oldest', () => {
    const counter = { freeFailures: 5, windowMs: 1000, firstWaitMs: 100, maxWaitMs: 1000, untilQuiet: true };
    const { clock, limiter: l } = limiter({ pair: counter, address: { ...counter, untilQuiet: false }, email: counter, maxKeys: 3 });
    for (const key of ['pair:a', 'address:b', 'email:c', 'pair:d', 'address:e']) l.begin([key]);
    expect(l.size).toBe(3);
    expect(l.retryAfter(['email:c', 'pair:d', 'address:e'])).toBe(0);
    clock.ms += 2000;
    l.sweep();
    expect(l.size).toBe(0);
  });

  it('refuses a key that names no counter', () => {
    const { limiter: l } = limiter();
    expect(() => l.begin(['ip:203.0.113.7'])).toThrow('No counter');
  });
});
