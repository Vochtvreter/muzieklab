import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors.js';
import {
  COMMON_PASSWORDS,
  DEFAULT_PARAMS,
  MAX_PARALLEL_HASHES,
  MAX_WAITING_HASHES,
  Semaphore,
  hashPassword,
  hashing,
  passwordProblem,
  verifyDummy,
  verifyPassword,
} from './passwords.js';

// Cheap parameters where only the round trip matters; the default ones where the test is about them.
const FAST = { N: 1024, r: 8, p: 1 };

describe('hashPassword and verifyPassword', () => {
  it('stores the parameters with the hash, and the default ones are OWASP’s', async () => {
    const hash = await hashPassword('a long enough password');
    const [scheme, N, r, p, salt, key] = hash.split('$');
    expect(scheme).toBe('scrypt');
    expect({ N: Number(N), r: Number(r), p: Number(p) }).toEqual(DEFAULT_PARAMS);
    expect(DEFAULT_PARAMS).toEqual({ N: 32768, r: 8, p: 3 });
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
    expect(await verifyPassword('a long enough password', hash)).toBe(true);
  });

  it('refuses a wrong password, and salts every hash', async () => {
    const hash = await hashPassword('a long enough password', FAST);
    expect(await verifyPassword('a long enough passworD', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
    expect(await hashPassword('a long enough password', FAST)).not.toBe(hash);
  });

  it('treats a tampered or malformed hash as a mismatch, not an error', async () => {
    const hash = await hashPassword('a long enough password', FAST);
    const parts = hash.split('$');
    const key = Buffer.from(parts[5], 'base64');
    key[0] ^= 1;
    const tampered = [...parts.slice(0, 5), key.toString('base64')].join('$');
    expect(await verifyPassword('a long enough password', tampered)).toBe(false);
    const otherSalt = [...parts.slice(0, 4), Buffer.alloc(16).toString('base64'), parts[5]].join('$');
    expect(await verifyPassword('a long enough password', otherSalt)).toBe(false);
    for (const bad of ['', 'scrypt$', 'argon2$1$2$3$x$y', hash.replace('$1024$', '$1000$'), hash.replace('$1024$', `$${2 ** 24}$`)]) {
      expect(await verifyPassword('a long enough password', bad)).toBe(false);
    }
  });

  it('matches the same password typed with composed or decomposed accents', async () => {
    const hash = await hashPassword('café au lait please', FAST);
    expect(await verifyPassword('café au lait please', hash)).toBe(true);
  });

  it('runs at most 4 hashes at once, the rest waiting their turn, and all 10 of 10 in parallel finish', async () => {
    expect(MAX_PARALLEL_HASHES).toBe(4);
    const started = Array.from({ length: 10 }, (_, i) => hashPassword(`password number ${i}`, FAST));
    expect([hashing.running, hashing.waiting]).toEqual([4, 6]);
    const hashes = await Promise.all(started);
    expect([hashing.running, hashing.waiting]).toEqual([0, 0]);
    const checks = await Promise.all(hashes.map((h, i) => verifyPassword(`password number ${i}`, h)));
    expect(checks).toEqual(Array(10).fill(true));
  });

  it('checks unknown accounts against a dummy hash, always false', async () => {
    expect(await verifyDummy('anything at all')).toBe(false);
  });
});

describe('Semaphore', () => {
  /** A task that runs until the test lets it end. */
  function gate() {
    let open!: () => void;
    const done = new Promise<void>((resolve) => (open = resolve));
    return { done, open };
  }
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('runs at most its size at once, and lets the others in first come, first served', async () => {
    const semaphore = new Semaphore(MAX_PARALLEL_HASHES, MAX_WAITING_HASHES);
    const gates = Array.from({ length: 10 }, gate);
    const order: number[] = [];
    let running = 0;
    let peak = 0;
    const tasks = gates.map((g, i) =>
      semaphore.run(async () => {
        order.push(i);
        peak = Math.max(peak, ++running);
        await g.done;
        running--;
        return i;
      }),
    );
    await tick();
    expect(order).toEqual([0, 1, 2, 3]);
    expect([semaphore.running, semaphore.waiting]).toEqual([4, 6]);
    for (const [i, g] of gates.entries()) {
      g.open();
      await tick();
      expect(order).toEqual([...Array(Math.min(10, i + 5)).keys()]);
      expect(running).toBeLessThanOrEqual(4);
    }
    expect(await Promise.all(tasks)).toEqual([...Array(10).keys()]);
    expect(peak).toBe(4);
    expect([semaphore.running, semaphore.waiting]).toEqual([0, 0]);
  });

  it('refuses with too_many_attempts (retry after 1 s) when 32 are waiting already', async () => {
    expect(MAX_WAITING_HASHES).toBe(32);
    const semaphore = new Semaphore(MAX_PARALLEL_HASHES, MAX_WAITING_HASHES);
    const g = gate();
    const tasks = Array.from({ length: 4 + 32 }, () => semaphore.run(() => g.done));
    expect([semaphore.running, semaphore.waiting]).toEqual([4, 32]);
    const refused = await semaphore.run(async () => 'ran').catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).body()).toEqual({ error: 'too_many_attempts', message: expect.any(String), retryAfter: 1 });
    g.open();
    await Promise.all(tasks);
    expect(await semaphore.run(async () => 'ran')).toBe('ran');
  });

  it('is the one every hash goes through, and a full queue is an error, not a wrong password', async () => {
    const hash = await hashPassword('a long enough password', FAST);
    const g = gate();
    const held = Array.from({ length: 4 + 32 }, () => hashing.run(() => g.done));
    await expect(verifyPassword('a long enough password', hash)).rejects.toMatchObject({ code: 'too_many_attempts', retryAfter: 1 });
    await expect(hashPassword('a long enough password', FAST)).rejects.toMatchObject({ code: 'too_many_attempts' });
    g.open();
    await Promise.all(held);
    expect(await verifyPassword('a long enough password', hash)).toBe(true);
  });
});

describe('passwordProblem', () => {
  const email = 'annabel@example.com';

  it('counts length in characters (code points), 10 to 128', () => {
    expect(passwordProblem('a'.repeat(9), email)).toBe('password_length');
    expect(passwordProblem('zq'.repeat(5), email)).toBeNull();
    expect(passwordProblem('x'.repeat(128), email)).toBeNull();
    expect(passwordProblem('x'.repeat(129), email)).toBe('password_length');
    // Nine emoji are 18 UTF-16 units but nine characters: too short. Ten are fine.
    expect(passwordProblem('🎵'.repeat(9), email)).toBe('password_length');
    expect(passwordProblem('🎵'.repeat(10), email)).toBeNull();
  });

  it('refuses common passwords, whatever the case', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(9000);
    expect(COMMON_PASSWORDS.has('qwertyuiop')).toBe(true);
    expect(passwordProblem('qwertyuiop', email)).toBe('password_common');
    expect(passwordProblem('QwertyUIOP', email)).toBe('password_common');
    expect(passwordProblem('password1234', email)).toBe('password_common');
    expect(passwordProblem('a tune I hum to myself', email)).toBeNull();
  });

  it('refuses the email, or the part before the @ from 4 characters', () => {
    expect(passwordProblem('my annabel@example.com', email)).toBe('password_has_email');
    expect(passwordProblem('xxAnnabelxx', email)).toBe('password_has_email');
    // Exactly 4 characters before the @ counts…
    expect(passwordProblem('the anna song!', 'anna@example.com')).toBe('password_has_email');
    // …3 do not, but the whole address still does.
    expect(passwordProblem('the ann song!', 'ann@example.com')).toBeNull();
    expect(passwordProblem('ann@example.com!', 'ann@example.com')).toBe('password_has_email');
  });
});
