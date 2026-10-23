import { describe, expect, it } from 'vitest';
import { AttemptLimiter } from './attempts.js';

function limiter() {
  const clock = { ms: 1_000_000 };
  return { clock, limiter: new AttemptLimiter(() => clock.ms) };
}

function failTimes(l: AttemptLimiter, keys: string[], n: number) {
  for (let i = 0; i < n; i++) expect(l.begin(keys)).toBe(0);
}

describe('AttemptLimiter', () => {
  it('lets 5 failures through, then waits 2 s, doubling up to 15 minutes', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, ['k'], 5);
    expect(l.begin(['k'])).toBe(2);
    clock.ms += 2000;
    expect(l.begin(['k'])).toBe(0); // the 6th failure
    expect(l.retryAfter(['k'])).toBe(4);
    clock.ms += 4000;
    expect(l.begin(['k'])).toBe(0);
    expect(l.retryAfter(['k'])).toBe(8);
    for (let i = 0; i < 12; i++) {
      clock.ms += l.retryAfter(['k']) * 1000;
      expect(l.begin(['k'])).toBe(0);
    }
    expect(l.retryAfter(['k'])).toBe(15 * 60);
  });

  it('does not count, extend or reset the wait for tries during it', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, ['k'], 5);
    clock.ms += 1000;
    expect(l.begin(['k'])).toBe(1);
    expect(l.begin(['k'])).toBe(1);
    clock.ms += 1000;
    expect(l.begin(['k'])).toBe(0);
    expect(l.retryAfter(['k'])).toBe(4); // the 6th failure, not the 8th
  });

  it('takes back a try that was right, and clear forgets a key', () => {
    const { limiter: l } = limiter();
    failTimes(l, ['email', 'ip'], 4);
    expect(l.begin(['email', 'ip'])).toBe(0); // the 5th try counts as a failure while it runs…
    expect(l.retryAfter(['ip'])).toBe(2);
    l.forgive(['email', 'ip']); // …and was right
    expect(l.retryAfter(['email', 'ip'])).toBe(0);
    l.clear('email');
    failTimes(l, ['email'], 5);
    expect(l.retryAfter(['email'])).toBe(2);
    expect(l.retryAfter(['ip'])).toBe(0); // the ip still has its 4
    expect(l.begin(['ip'])).toBe(0);
    expect(l.retryAfter(['ip'])).toBe(2);
  });

  it('counts failures within 15 minutes only', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, ['k'], 4);
    clock.ms += 15 * 60_000 + 1;
    failTimes(l, ['k'], 4);
    expect(l.retryAfter(['k'])).toBe(0);
  });

  it('counts tries sent at once before any of them ends', () => {
    const { limiter: l } = limiter();
    const started = Array.from({ length: 10 }, () => l.begin(['k']));
    expect(started.filter((wait) => wait === 0)).toHaveLength(5);
  });

  it('sweeps old entries, and never keeps more than maxKeys', () => {
    const clock = { ms: 0 };
    const l = new AttemptLimiter(() => clock.ms, {
      freeFailures: 5,
      windowMs: 1000,
      firstWaitMs: 100,
      maxWaitMs: 1000,
      maxKeys: 3,
    });
    for (const key of ['a', 'b', 'c', 'd', 'e']) l.begin([key]);
    expect(l.size).toBe(3);
    clock.ms += 2000;
    l.sweep();
    expect(l.size).toBe(0);
  });
});

describe('AttemptLimiter after the waits started', () => {
  it('keeps doubling until the key has been quiet for 15 minutes after its wait', () => {
    const { clock, limiter: l } = limiter();
    failTimes(l, ['k'], 5);
    expect(l.retryAfter(['k'])).toBe(2);
    clock.ms += 2000;
    expect(l.begin(['k'])).toBe(0);
    expect(l.retryAfter(['k'])).toBe(4);
    clock.ms += 4000 + 15 * 60_000 + 1;
    expect(l.begin(['k'])).toBe(0); // a fresh start: the first of 5 free failures
    expect(l.retryAfter(['k'])).toBe(0);
  });
});
