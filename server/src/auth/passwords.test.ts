import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors.js';
import {
  COMMON_PASSWORDS,
  DEFAULT_PARAMS,
  HASH_QUEUE,
  MAX_PARALLEL_HASHES,
  SERVER_LANE,
  Semaphore,
  hashPassword,
  hashing,
  passwordProblem,
  verifyDummy,
  verifyPassword,
  type HashLane,
} from './passwords.js';

// Cheap parameters where only the round trip matters; the default ones where the test is about them.
const FAST = { N: 1024, r: 8, p: 1 };
const LANE = SERVER_LANE;
/** The line of one network. */
const lane = (network: string, limited = false, clean = false): HashLane => ({ network, limited, clean });

describe('hashPassword and verifyPassword', () => {
  it('stores the parameters with the hash, and the default ones are OWASP’s', async () => {
    const hash = await hashPassword('a long enough password', LANE);
    const [scheme, N, r, p, salt, key] = hash.split('$');
    expect(scheme).toBe('scrypt');
    expect({ N: Number(N), r: Number(r), p: Number(p) }).toEqual(DEFAULT_PARAMS);
    expect(DEFAULT_PARAMS).toEqual({ N: 32768, r: 8, p: 3 });
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
    expect(await verifyPassword('a long enough password', hash, LANE)).toBe(true);
  });

  it('refuses a wrong password, and salts every hash', async () => {
    const hash = await hashPassword('a long enough password', LANE, FAST);
    expect(await verifyPassword('a long enough passworD', hash, LANE)).toBe(false);
    expect(await verifyPassword('', hash, LANE)).toBe(false);
    expect(await hashPassword('a long enough password', LANE, FAST)).not.toBe(hash);
  });

  it('treats a tampered or malformed hash as a mismatch, not an error', async () => {
    const hash = await hashPassword('a long enough password', LANE, FAST);
    const parts = hash.split('$');
    const key = Buffer.from(parts[5], 'base64');
    key[0] ^= 1;
    const tampered = [...parts.slice(0, 5), key.toString('base64')].join('$');
    expect(await verifyPassword('a long enough password', tampered, LANE)).toBe(false);
    const otherSalt = [...parts.slice(0, 4), Buffer.alloc(16).toString('base64'), parts[5]].join('$');
    expect(await verifyPassword('a long enough password', otherSalt, LANE)).toBe(false);
    for (const bad of ['', 'scrypt$', 'argon2$1$2$3$x$y', hash.replace('$1024$', '$1000$'), hash.replace('$1024$', `$${2 ** 24}$`)]) {
      expect(await verifyPassword('a long enough password', bad, LANE)).toBe(false);
    }
  });

  it('matches the same password typed with composed or decomposed accents', async () => {
    const hash = await hashPassword('café au lait please', LANE, FAST);
    expect(await verifyPassword('café au lait please', hash, LANE)).toBe(true);
  });

  it('runs at most 4 hashes at once, the rest waiting their turn, and all 10 of 10 in parallel finish', async () => {
    expect(MAX_PARALLEL_HASHES).toBe(4);
    const started = Array.from({ length: 10 }, (_, i) => hashPassword(`password number ${i}`, LANE, FAST));
    expect([hashing.running, hashing.waiting]).toEqual([4, 6]);
    const hashes = await Promise.all(started);
    expect([hashing.running, hashing.waiting]).toEqual([0, 0]);
    const checks = await Promise.all(hashes.map((h, i) => verifyPassword(`password number ${i}`, h, LANE)));
    expect(checks).toEqual(Array(10).fill(true));
  });

  it('checks unknown accounts against a dummy hash, always false', async () => {
    expect(await verifyDummy('anything at all', LANE)).toBe(false);
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
  /** What a refused run threw. */
  const refusal = (run: Promise<unknown>) => run.then(() => 'ran', (err: unknown) => err);

  it('runs at most its size at once, and lets one line in first come, first served', async () => {
    const semaphore = new Semaphore(MAX_PARALLEL_HASHES, HASH_QUEUE);
    const gates = Array.from({ length: 10 }, gate);
    const order: number[] = [];
    let running = 0;
    let peak = 0;
    const tasks = gates.map((g, i) =>
      semaphore.run(LANE, async () => {
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

  it('serves the lines in turn: a network waits behind at most one try of every other network', async () => {
    const semaphore = new Semaphore(1);
    const held = gate();
    const holder = semaphore.run(LANE, () => held.done);
    const order: string[] = [];
    const tasks = [...'AAAAABBBC'].map((network, i) =>
      semaphore.run(lane(network), async () => {
        order.push(`${network}${i}`);
      }),
    );
    expect([semaphore.waitingIn('A'), semaphore.waitingIn('B'), semaphore.waitingIn('C')]).toEqual([5, 3, 1]);
    held.open();
    await Promise.all([holder, ...tasks]);
    // C, which came last with one try, is third; first come, first served would have made it last.
    expect(order).toEqual(['A0', 'B5', 'C8', 'A1', 'B6', 'A2', 'B7', 'A3', 'A4']);
  });

  it('lets any line wait while fewer than 32 wait in all, then each only 2, and none past 512', async () => {
    expect(HASH_QUEUE).toEqual({ shared: 32, perLine: 2, max: 512, perLineClean: 4, maxClean: 512 });
    const semaphore = new Semaphore(MAX_PARALLEL_HASHES, HASH_QUEUE);
    const g = gate();
    const run = (network: string) => semaphore.run(lane(network), () => g.done);
    const tasks = Array.from({ length: 4 + 32 }, () => run('A'));
    expect([semaphore.running, semaphore.waiting]).toEqual([4, 32]);
    // The queue is full for A, which has its 32…
    const refused = await refusal(run('A'));
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).body()).toEqual({ error: 'too_many_attempts', message: expect.any(String), retryAfter: 1 });
    // …but every other network may still have 2 waiting, and is served in turn.
    for (let i = 0; i < 240; i++) tasks.push(run(`n${i}`), run(`n${i}`));
    expect(await refusal(run('n0'))).toBeInstanceOf(ApiError);
    expect(semaphore.waiting).toBe(512);
    // Past 512 in all, not even a new network may wait.
    expect(await refusal(run('another'))).toBeInstanceOf(ApiError);
    g.open();
    await Promise.all(tasks);
    expect([semaphore.running, semaphore.waiting]).toEqual([0, 0]);
    expect(await semaphore.run(LANE, async () => 'ran')).toBe('ran');
  });

  it('keeps a limited line (its network is past its free failures) to its own 2 places', async () => {
    const semaphore = new Semaphore(MAX_PARALLEL_HASHES, HASH_QUEUE);
    const g = gate();
    const run = (network: string, limited: boolean) => semaphore.run(lane(network, limited), () => g.done);
    const tasks = Array.from({ length: 4 }, () => run('running', false));
    tasks.push(run('limited', true), run('limited', true));
    expect(await refusal(run('limited', true))).toBeInstanceOf(ApiError);
    // The shared places are for the other networks.
    tasks.push(run('other', false), run('other', false), run('other', false));
    expect([semaphore.waitingIn('limited'), semaphore.waitingIn('other')]).toEqual([2, 3]);
    g.open();
    await Promise.all(tasks);
  });

  it('keeps 4 places in each line for clean tries, whatever the rest of the network does, and serves those first', async () => {
    const semaphore = new Semaphore(MAX_PARALLEL_HASHES, HASH_QUEUE);
    const g = gate();
    const order: string[] = [];
    const run = (network: string, limited: boolean, clean: boolean, name: string) =>
      semaphore.run(lane(network, limited, clean), async () => {
        order.push(name);
        await g.done;
      });
    const tasks = Array.from({ length: 4 }, (_, i) => run('running', false, false, `running${i}`));
    // 32 others wait, so each line has only its 2; the network past its free failures holds them.
    for (let i = 0; i < 16; i++) tasks.push(run(`n${i}`, false, false, `n${i}a`), run(`n${i}`, false, false, `n${i}b`));
    tasks.push(run('T', true, false, 'flood1'), run('T', true, false, 'flood2'));
    expect(await refusal(run('T', true, false, 'flood3'))).toBeInstanceOf(ApiError);
    // Four clean tries of that network still get a place, ahead of its others…
    for (let i = 1; i <= 4; i++) tasks.push(run('T', true, true, `clean${i}`));
    expect([semaphore.waitingIn('T', 'clean'), semaphore.waitingIn('T', 'other'), semaphore.waitingIn('T')]).toEqual([4, 2, 6]);
    // …but not a fifth: then it waits as any other try, and the line's 2 are taken.
    expect(await refusal(run('T', true, true, 'clean5'))).toBeInstanceOf(ApiError);
    // Another network has its own 4.
    tasks.push(run('n0', false, true, 'n0clean'));
    expect(semaphore.waitingIn('n0', 'clean')).toBe(1);
    expect(semaphore.waiting).toBe(32 + 2 + 4 + 1);
    // T's turn comes after one try of each line before it, and it serves its clean tries first.
    g.open();
    await Promise.all(tasks);
    const ts = order.filter((name) => /^(clean|flood)/.test(name));
    expect(ts).toEqual(['clean1', 'clean2', 'clean3', 'clean4', 'flood1', 'flood2']);
    expect(order.indexOf('clean1')).toBe(4 + 16);
    expect(order.indexOf('n0clean')).toBe(4);
  });

  it('has at most maxClean in the kept places in all, then a clean try waits as any other', async () => {
    const semaphore = new Semaphore(1, { shared: 0, perLine: 1, max: 100, perLineClean: 2, maxClean: 3 });
    const g = gate();
    const run = (network: string, clean: boolean) => semaphore.run(lane(network, false, clean), () => g.done);
    const tasks = [run('busy', false), run('A', true), run('A', true), run('B', true)];
    expect(semaphore.waitingIn('B', 'clean')).toBe(1);
    // The kept places are full in all: B's second clean try takes B's one other place, and its third is refused.
    tasks.push(run('B', true));
    expect([semaphore.waitingIn('B', 'clean'), semaphore.waitingIn('B', 'other')]).toEqual([1, 1]);
    expect(await refusal(run('B', true))).toBeInstanceOf(ApiError);
    g.open();
    await Promise.all(tasks);
    expect([semaphore.running, semaphore.waiting]).toEqual([0, 0]);
  });

  it('is the one every hash goes through, and a full queue is an error, not a wrong password', async () => {
    const hash = await hashPassword('a long enough password', LANE, FAST);
    const g = gate();
    const held = Array.from({ length: 4 + 32 }, () => hashing.run(LANE, () => g.done));
    await expect(verifyPassword('a long enough password', hash, LANE)).rejects.toMatchObject({ code: 'too_many_attempts', retryAfter: 1 });
    await expect(hashPassword('a long enough password', LANE, FAST)).rejects.toMatchObject({ code: 'too_many_attempts' });
    // Another network's line still has its places.
    const elsewhere = verifyPassword('a long enough password', hash, lane('198.51.100.0/24'));
    expect(hashing.waitingIn('198.51.100.0/24')).toBe(1);
    g.open();
    await Promise.all(held);
    expect(await elsewhere).toBe(true);
    expect(await verifyPassword('a long enough password', hash, LANE)).toBe(true);
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
