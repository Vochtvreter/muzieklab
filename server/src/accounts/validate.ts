import { nameHasRefusedCharacters, nameShowsNothing } from '../../../shared/api.js';
import { ApiError } from '../errors.js';

// What the API accepts as an email address and a name. The schemas in the routes check the types; these check the
// content, and give the trimmed value to store.

const EMAIL_MAX = 254;
/** One @, something before it, a dot in the domain, no spaces. Deliverability is the admin's to check. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
/**
 * Control and format characters, and others that show nothing (a zero-width space pasted with the address, the blank
 * Braille pattern): no one could type the address to sign in, and it would look like another account's.
 */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]/u;

/** Whether a trimmed, lower-cased `email` is an address the API would store. */
export function isEmail(email: string): boolean {
  return email.length <= EMAIL_MAX && EMAIL.test(email) && !HIDDEN.test(email);
}

/** The email to store and look up: trimmed and lower-cased. Throws email_invalid when it is not an address. */
export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!isEmail(email)) throw new ApiError('email_invalid', 'Not an email address');
  return email;
}

const NAME_MAX = 80;

/**
 * A trimmed name of 1 to 80 characters (code points), at least one of which shows, and none of them a control or bidi
 * character (the rules in shared/api.ts, which the app's forms check too); else bad_request.
 */
export function validName(value: string): string {
  const name = value.trim();
  const length = [...name].length;
  if (length > NAME_MAX || nameShowsNothing(name) || nameHasRefusedCharacters(name)) {
    throw new ApiError('bad_request', `A name has 1 to ${NAME_MAX} characters`);
  }
  return name;
}
