import type { ApiErrorBody, ErrorCode } from '../../shared/api.js';

/** HTTP status for each error code (shared/api.ts), so a route only names the code. */
const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  wrong_password: 401,
  forbidden: 403,
  bad_origin: 403,
  not_found: 404,
  email_taken: 409,
  last_admin: 409,
  own_account: 409,
  wrong_status: 409,
  rev_conflict: 409,
  role_exists: 409,
  built_in_role: 409,
  link_invalid: 410,
  password_length: 422,
  password_common: 422,
  password_has_email: 422,
  email_invalid: 422,
  too_many_attempts: 429,
  busy: 429,
  internal: 500,
};

/** An error the API answers with as it is: thrown anywhere in a route, turned into an ApiErrorBody by app.ts. */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    /** With too_many_attempts and busy: seconds until the next try (app.ts also sends it as Retry-After). */
    readonly retryAfter?: number,
    /** More fields for the body: `current` with rev_conflict. */
    readonly more: Pick<ApiErrorBody, 'current'> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = STATUS[code];
  }

  body(): ApiErrorBody {
    return this.retryAfter === undefined
      ? { error: this.code, message: this.message, ...this.more }
      : { error: this.code, message: this.message, retryAfter: this.retryAfter, ...this.more };
  }
}

export function statusFor(code: ErrorCode): number {
  return STATUS[code];
}
