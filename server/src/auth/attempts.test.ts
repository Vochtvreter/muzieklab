import { describe, expect, it } from 'vitest';
import {
  AttemptLimiter,
  DEFAULT_LIMITS,
  addressKey,
  addressOf,
  emailKey,
  linkKey,
  linkKeys,
  networkKey,
  networkOf,
  pairKey,
  passwordKeys,
  type AttemptLimits,
  type CounterLimits,
} from './attempts.js';

const MINUTE = 60_000;
const PAIR = pairKey('ann@example.com', '203.0.113.7');
const ADDRESS = addressKey('203.0.113.7');
const NETWORK = networkKey('203.0.113.7');
const EMAIL = emailKey('ann@example.com');
const LINK = linkKey('203.0.113.7');

function limiter(limits?: AttemptLimits) {
  const clock = { ms: 1_000_000 };
  return { clock, limiter: new AttemptLimiter(() => clock.ms, limits) };
}

function failTimes(l: AttemptLimiter, keys: string[], n: number) {
  for (let i = 0; i < n; i++) expect(l.begin(keys)).toBe(0);
}

describe('the limits', () => {
  it('are 5 free failures for an email from one address, 50 for an address, an email or wrong links, 200 for a network', () => {
    const waits = { windowMs: 15 * MINUTE, firstWaitMs: 2000, maxWaitMs: 15 * MINUTE };
    expect(DEFAULT_LIMITS).toEqual({
      pair: { freeFailures: 5, ...waits, untilQuiet: true, maxKeys: 100_000 },
      address: { freeFailures: 50, ...waits, untilQuiet: false, maxKeys: 100_000 },
      // The network never waits.
      network: { freeFailures: 200, windowMs: 15 * MINUTE, firstWaitMs: 0, maxWaitMs: 0, untilQuiet: false, maxKeys: 10_000 },
      email: { freeFailures: 50, ...waits, untilQuiet: false, maxKeys: 100_000 },
      // Wrong link tokens: the address's limits, in entries of their own.
      link: { freeFailures: 50, ...waits, untilQuiet: false, maxKeys: 100_000 },
    });
    expect(passwordKeys(' Ann@Example.com ', '203.0.113.7')).toEqual([PAIR, ADDRESS, NETWORK, EMAIL]);
    // A wrong link token counts for its address only, on the link counter.
    expect(linkKeys('203.0.113.7')).toEqual([LINK]);
    expect(LINK).toBe('link:203.0.113.7');
    expect(linkKey('2001:db8:1:2::a')).toBe('link:2001:db8:1:2::/64');
    expect(NETWORK).toBe('network:203.0.113.0/24');
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

describe('networkOf', () => {
  it('cuts IPv4 to its /24 and IPv6 to its /48, IPv4 written as IPv6 too', () => {
    expect(networkOf('203.0.113.7')).toBe('203.0.113.0/24');
    expect(networkOf('::ffff:203.0.113.7')).toBe('203.0.113.0/24');
    expect(networkOf('2001:db8:abcd:12:aaaa::1')).toBe('2001:db8:abcd::/48');
    expect(networkOf('2001:0DB8:ABCD:ffff::1')).toBe('2001:db8:abcd::/48');
    expect(networkOf('2001:db8::1')).toBe('2001:db8:0::/48');
    expect(networkOf('fe80::1%eth0')).toBe('fe80:0:0::/48');
    // Every /64 of a /48 is one network; the next /48 is another, and so is the next /24.
    expect(networkKey('2001:db8:abcd:1::1')).toBe(networkKey('2001:db8:abcd:ffff::1'));
    expect(networkKey('2001:db8:abce::1')).not.toBe(networkKey('2001:db8:abcd::1'));
    expect(networkKey('203.0.113.255')).toBe(networkKey('203.0.113.1'));
    expect(networkKey('203.0.114.1')).not.toBe(networkKey('203.0.113.1'));
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
  it('lets 50 failures through, then waits 2 s, doubling (wrong link tokens from an address too)', () => {
    for (const key of [ADDRESS, EMAIL, LINK]) {
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

describe('a network alone', () => {
  it('never makes a try wait, and is over its free failures from the 201st in 15 minutes, counting tries running', () => {
    const { clock, limiter: l } = limiter();
    const network = networkKey('2001:db8:abcd::1');
    // Each try from its own /64 of one /48, for a made-up email: the pair, address and email counters see one each.
    const keys = (i: number) => passwordKeys(`u${i}@example.com`, `2001:db8:abcd:${i.toString(16)}::1`);
    for (let i = 0; i < 200; i++) expect(l.begin(keys(i))).toBe(0);
    expect(l.over(network)).toBe(false);
    expect(l.begin(keys(200))).toBe(0); // the 201st, running
    expect(l.over(network)).toBe(true);
    expect(l.retryAfter([network])).toBe(0);
    l.forgive(keys(200)); // it was right
    expect(l.over(network)).toBe(false);
    for (let i = 300; i < 1300; i++) expect(l.begin(keys(i))).toBe(0);
    expect(l.retryAfter([network])).toBe(0);
    expect(l.over(network)).toBe(true);
    // Another /48 is not over; this one is no longer once its failures are 15 minutes old.
    expect(l.over(networkKey('2001:db8:abce::1'))).toBe(false);
    clock.ms += 15 * MINUTE;
    expect(l.over(network)).toBe(false);
  });

  it('counts the IPv4 addresses of one /24 together, and wrong link tokens not at all', () => {
    const { limiter: l } = limiter();
    for (let i = 0; i < 250; i++) l.begin(linkKeys(`203.0.113.${i}`));
    expect(l.over(NETWORK)).toBe(false);
    expect(l.size('network')).toBe(0);
    for (let i = 0; i < 201; i++) expect(l.begin(passwordKeys(`u${i}@example.com`, `203.0.113.${i % 250}`))).toBe(0);
    expect(l.over(networkKey('203.0.113.250'))).toBe(true);
    expect(l.over(networkKey('203.0.114.1'))).toBe(false);
  });
});

describe('the tries of an address, for the hash queue', () => {
  it('counts its failures within the window, the tries running too, and none taken back', () => {
    const { clock, limiter: l } = limiter();
    expect(l.failures(ADDRESS)).toBe(0);
    l.begin(passwordKeys('ann@example.com', '203.0.113.7'));
    expect(l.failures(ADDRESS)).toBe(1); // running
    l.begin(passwordKeys('bob@example.com', '203.0.113.7'));
    l.forgive(passwordKeys('bob@example.com', '203.0.113.7')); // right
    expect([l.failures(ADDRESS), l.tries(ADDRESS)]).toEqual([1, 1]);
    for (let i = 0; i < 60; i++) l.begin(linkKeys('203.0.113.7'));
    // Wrong link tokens count as tries too, up to the link counter's 50 (the tries after those wait, uncounted), but
    // on a counter of their own: the address's failures, which slow its sign-ins, are still the one password.
    expect([l.failures(ADDRESS), l.failures(LINK), l.tries(ADDRESS)]).toEqual([1, 50, 51]);
    expect(l.retryAfter(passwordKeys('cem@example.com', '203.0.113.7'))).toBe(0);
    expect(l.tries(addressKey('203.0.113.8'))).toBe(0);
    clock.ms += 15 * MINUTE;
    expect([l.failures(ADDRESS), l.tries(ADDRESS)]).toEqual([0, 0]);
  });

  it('counts right passwords too, without making anyone wait, for 15 minutes', () => {
    const { clock, limiter: l } = limiter();
    const keys = passwordKeys('ann@example.com', '203.0.113.7');
    // A right password: counted while it runs, then taken back, and noted.
    l.begin(keys);
    expect(l.tries(ADDRESS)).toBe(1);
    l.forgive(keys);
    l.right(ADDRESS);
    expect([l.failures(ADDRESS), l.tries(ADDRESS)]).toEqual([0, 1]);
    for (let i = 0; i < 100; i++) l.right(ADDRESS);
    expect(l.tries(ADDRESS)).toBe(101);
    expect(l.retryAfter(keys)).toBe(0);
    expect(l.begin(keys)).toBe(0);
    expect(l.tries(ADDRESS)).toBe(102);
    expect(l.tries(addressKey('203.0.113.8'))).toBe(0);
    clock.ms += 10 * MINUTE;
    l.right(ADDRESS);
    clock.ms += 5 * MINUTE;
    // The first ones and the failure are out of the window, the last right password is not; then it goes too.
    expect(l.tries(ADDRESS)).toBe(1);
    l.sweep();
    expect(l.size()).toBe(1);
    clock.ms += 10 * MINUTE;
    expect(l.tries(ADDRESS)).toBe(0);
    l.sweep();
    expect(l.size()).toBe(0);
  });

  it('keeps the right passwords of at most maxKeys addresses, dropping the oldest', () => {
    const { limiter: l } = limiter({ ...DEFAULT_LIMITS, address: { ...DEFAULT_LIMITS.address, maxKeys: 2 } });
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) l.right(addressKey(ip));
    expect(['203.0.113.1', '203.0.113.2', '203.0.113.3'].map((ip) => l.tries(addressKey(ip)))).toEqual([0, 1, 1]);
  });
});

describe('the store', () => {
  const small = (maxKeys: number): AttemptLimits => {
    const counter: CounterLimits = { freeFailures: 5, windowMs: 1000, firstWaitMs: 100, maxWaitMs: 1000, untilQuiet: true, maxKeys };
    const shared = { ...counter, untilQuiet: false };
    return { pair: counter, address: shared, network: shared, email: counter, link: shared };
  };

  it('sweeps old entries, and keeps at most maxKeys of each counter, dropping its oldest', () => {
    const { clock, limiter: l } = limiter(small(2));
    for (const key of ['pair:a', 'address:b', 'network:x', 'email:c', 'link:b', 'pair:d', 'address:e', 'pair:f', 'address:g']) {
      l.begin([key]);
    }
    expect([l.size('pair'), l.size('address'), l.size('network'), l.size('email'), l.size('link')]).toEqual([2, 2, 1, 1, 1]);
    expect(l.size()).toBe(7);
    clock.ms += 2000;
    l.sweep();
    expect(l.size()).toBe(0);
  });

  it('keeps the entries of password tries however many wrong link tokens come (link checks cost no hash)', () => {
    // The real caps: wrong tokens from more /64s than the link counter keeps take under a second here, and not much
    // longer against the API, as they cost no hash.
    const { limiter: l } = limiter();
    for (let i = 0; i < 50; i++) l.begin(passwordKeys('victim@example.com', `2001:db8:${i.toString(16)}::1`));
    for (let i = 0; i < 5; i++) l.begin([pairKey('victim@example.com', '198.51.100.7')]);
    const waiting = [emailKey('victim@example.com'), pairKey('victim@example.com', '198.51.100.7')];
    expect(waiting.map((key) => l.retryAfter([key]))).toEqual([2, 2]);
    // One wrong password from a /64 of an ISP's /48: it is not clean for 15 minutes.
    const used = addressKey('2001:db8:abcd:10::1');
    l.begin(passwordKeys('pupil@example.com', '2001:db8:abcd:10::1'));
    expect(l.tries(used)).toBe(1);
    // Two tunnel-broker /48s hold 131,072 /64s.
    const tunnel = (i: number) => `2001:db8:${(0xf000 + (i >> 16)).toString(16)}:${(i & 0xffff).toString(16)}::1`;
    for (let i = 0; i < DEFAULT_LIMITS.link.maxKeys + 1000; i++) l.begin(linkKeys(tunnel(i)));
    // Only link entries were pushed out: the address is still not clean, and the email and pair still wait.
    expect(l.size('link')).toBe(DEFAULT_LIMITS.link.maxKeys);
    expect(l.size('address')).toBe(51);
    expect(l.tries(used)).toBe(1);
    expect(waiting.map((key) => l.retryAfter([key]))).toEqual([2, 2]);
  });

  it('refuses a key that names no counter', () => {
    const { limiter: l } = limiter();
    expect(() => l.begin(['ip:203.0.113.7'])).toThrow('No counter');
  });
});
