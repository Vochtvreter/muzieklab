import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import type { AccountDoc } from '../db.js';
import { ApiError } from '../errors.js';
import { pairKey, passwordKeys } from './attempts.js';
import { verifyPassword } from './passwords.js';

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
 * Wrong tries count like wrong sign-ins (for the email from this address, the address and the email), so a borrowed
 * session cannot be used to guess the password quickly. A right one clears the pair's counter, as a good sign-in does.
 */
export async function confirmPassword(
  ctx: AppContext,
  request: FastifyRequest,
  account: AccountDoc,
  password: string,
): Promise<void> {
  const right = await countedTry(ctx, passwordKeys(account.email, request.ip), async () =>
    account.passwordHash !== null && (await verifyPassword(password, account.passwordHash)) ? true : null,
  );
  if (!right) throw new ApiError('wrong_password', 'The current password is not right');
  ctx.attempts.clear(pairKey(account.email, request.ip));
}
