import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import type { AccountDoc } from '../db.js';
import { ApiError } from '../errors.js';
import { emailKey, ipKey } from './attempts.js';
import { verifyPassword } from './passwords.js';

/** Starts a counted try for `keys` (attempts.ts), or answers 429 with how long to wait. */
export function beginAttempt(ctx: AppContext, keys: readonly string[]): void {
  const wait = ctx.attempts.begin(keys);
  if (wait > 0) throw new ApiError('too_many_attempts', `Too many tries: wait ${wait} s`, wait);
}

/**
 * The signed-in account's current password, asked before changing the password or email or deleting the account.
 * Wrong tries count like wrong sign-ins (for the email and the address), so a borrowed session cannot be used to
 * guess the password quickly. A right one clears the email's counter, as a good sign-in does.
 */
export async function confirmPassword(
  ctx: AppContext,
  request: FastifyRequest,
  account: AccountDoc,
  password: string,
): Promise<void> {
  const keys = [emailKey(account.email), ipKey(request.ip)];
  beginAttempt(ctx, keys);
  const ok = account.passwordHash !== null && (await verifyPassword(password, account.passwordHash));
  if (!ok) throw new ApiError('wrong_password', 'The current password is not right');
  ctx.attempts.forgive(keys);
  ctx.attempts.clear(keys[0]);
}
