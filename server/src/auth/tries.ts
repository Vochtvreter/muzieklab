import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import type { AccountDoc } from '../db.js';
import { ApiError } from '../errors.js';
import { addressKey, networkKey, networkOf, pairKey, passwordKeys } from './attempts.js';
import { verifyPassword, type HashLane } from './passwords.js';

/**
 * The hash queue's line for a request from `ip` (passwords.ts): its network's, with only that line's own places once
 * the network is past its free failures. Every hash a request makes goes through it, so no network can fill the queue.
 *
 * The try is clean when its address has made no other try within the window: no password, wrong or right, and no
 * wrong link token (attempts.ts `tries`). Then it may also use the places the line keeps for clean tries, so a few
 * addresses of a network cannot keep the rest of it out. A password try is counted while it runs (countedTry), hence
 * `<= 1`; so is the right current password before a new password's hash (`rightPassword`). (A link's new password
 * comes after a right link token, which is not noted, so one earlier try is let by there; a link works once.) An
 * address loses this with its first try, so a flood from it soon has none: a /60 has 16 addresses (/64s), a /56 256,
 * each clean once every 15 minutes. Wrong link tokens from other addresses cannot make it clean again sooner: they
 * have entries of their own (attempts.ts linkKeys).
 */
export function hashLane(ctx: AppContext, ip: string): HashLane {
  return {
    network: networkOf(ip),
    limited: ctx.attempts.over(networkKey(ip)),
    clean: ctx.attempts.tries(addressKey(ip)) <= 1,
  };
}

/**
 * After a right password: clears the pair's counter, as a good sign-in does (not the address's, network's or
 * email's), and notes the try for the address (attempts.ts `right`), which then is not clean for the rest of the
 * window. Otherwise right passwords to an account of one's own, sent from a few addresses, could keep the places of
 * the hash queue kept for clean tries.
 */
export function rightPassword(ctx: AppContext, email: string, ip: string): void {
  ctx.attempts.clear(pairKey(email, ip));
  ctx.attempts.right(addressKey(ip));
}

/**
 * One counted try for `keys` (attempts.ts): 429 with how long to wait when one of them must wait. Otherwise `check`
 * runs and gives what was right, or null when the try was wrong. A wrong try stays counted as a failure; a right one
 * is taken back. So is a try that throws (the hash queue is full, MongoDB is down): nothing was checked.
 */
export async function countedTry<T>(
  ctx: AppContext,
  keys: readonly string[],
  check: () => Promise<T | null>,
): Promise<T | null> {
  const wait = ctx.attempts.begin(keys);
  if (wait > 0) throw new ApiError('too_many_attempts', `Too many tries: wait ${wait} s`, wait);
  let result: T | null;
  try {
    result = await check();
  } catch (err) {
    ctx.attempts.forgive(keys);
    throw err;
  }
  if (result !== null) ctx.attempts.forgive(keys);
  return result;
}

/**
 * The signed-in account's current password, asked before changing the password or email or deleting the account.
 * Wrong tries count like wrong sign-ins (for the email from this address, the address, its network and the email), so
 * a borrowed session cannot be used to guess the password quickly. A right one is a right password (`rightPassword`).
 */
export async function confirmPassword(
  ctx: AppContext,
  request: FastifyRequest,
  account: AccountDoc,
  password: string,
): Promise<void> {
  const right = await countedTry(ctx, passwordKeys(account.email, request.ip), async () =>
    account.passwordHash !== null && (await verifyPassword(password, account.passwordHash, hashLane(ctx, request.ip)))
      ? true
      : null,
  );
  if (!right) throw new ApiError('wrong_password', 'The current password is not right');
  rightPassword(ctx, account.email, request.ip);
}
