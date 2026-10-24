/**
 * What an account or admin screen shows when a request fails: every ClientErrorCode as a translated sentence
 * (apiError.<code> in the catalogs), and which field it belongs to, so a field's error sits under that field and the
 * rest go in the form's FormError.
 */
import { ERROR_CODES, PASSWORD_MAX, PASSWORD_MIN } from '../../../shared/api';
import { ApiError, asApiError, type ClientErrorCode } from '../../api/client';
import { t } from '../../i18n';

/** Every code a request can fail with: the contract's (busy included), plus `unavailable` (no answer). Each has an apiError message. */
export const CLIENT_ERROR_CODES: readonly ClientErrorCode[] = [...ERROR_CODES, 'unavailable'];

/** Up to this many seconds, a wait is said in seconds ("in 45 seconds"); above, in whole minutes, rounded up. */
const SECONDS_UP_TO = 90;

/**
 * The message for a failed request (an ApiError, or anything else thrown: `internal`). Too many tries says how long to
 * wait; `busy` (the server's line is full, nobody's tries counted) says only to try again in a moment.
 */
export function errorMessage(e: unknown): string {
  const err = asApiError(e);
  if (err.code === 'too_many_attempts' && err.retryAfter && err.retryAfter > 0) {
    const s = Math.ceil(err.retryAfter);
    return s <= SECONDS_UP_TO ? t('apiError.waitSeconds', { count: s }) : t('apiError.waitMinutes', { count: Math.ceil(s / 60) });
  }
  return t('apiError.' + err.code, { min: PASSWORD_MIN, max: PASSWORD_MAX });
}

/**
 * The field a code is about: `password` is a new password (its rules), `currentPassword` the one asked to confirm a
 * change, `email` an email typed in the form. Null: the message belongs to the whole form.
 */
export type ErrorField = 'email' | 'password' | 'currentPassword';

export function errorField(code: ClientErrorCode): ErrorField | null {
  switch (code) {
    case 'password_length':
    case 'password_common':
    case 'password_has_email':
      return 'password';
    case 'wrong_password':
      return 'currentPassword';
    case 'email_invalid':
    case 'email_taken':
      return 'email';
    default:
      return null;
  }
}

/** A failed submit, ready to show: the message, and the field it goes under (null: the FormError). */
export interface Failure {
  code: ClientErrorCode;
  field: ErrorField | null;
  message: string;
}

export function failureOf(e: unknown): Failure {
  const err = asApiError(e);
  return { code: err.code, field: errorField(err.code), message: errorMessage(err) };
}

/** The message for `field`, if the failure belongs to it. */
export const fieldError = (f: Failure | null, field: ErrorField): string | null => (f && f.field === field ? f.message : null);
/** The message for the whole form, if the failure belongs to no field. */
export const formError = (f: Failure | null): string | null => (f && !f.field ? f.message : null);

/**
 * A new password the server would refuse for its length (code points, as the server counts them), checked before the
 * request is sent: the failure to show, or null.
 */
export function passwordLengthFailure(password: string): Failure | null {
  const n = [...password].length;
  return n < PASSWORD_MIN || n > PASSWORD_MAX ? failureOf(new ApiError(422, 'password_length')) : null;
}
