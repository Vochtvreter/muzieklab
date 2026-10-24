// JSON schemas for the request bodies of shared/api.ts. Fastify checks them before a handler runs (a mismatch is 400
// bad_request); the handlers then check the content (validate.ts, passwords.ts). Unknown fields are refused, so a
// typo in the app shows up as an error instead of being ignored.

/** Long enough for any real password: the length rule (422 password_length) is checked in code, with a clear code. */
export const password = { type: 'string', maxLength: 4096 } as const;
/** Longer than any address, so a long one gets email_invalid (422) from the code rather than a 400. */
export const email = { type: 'string', maxLength: 1000 } as const;
export const name = { type: 'string', maxLength: 1000 } as const;
export const token = { type: 'string', minLength: 1, maxLength: 200 } as const;

export function body<P extends Record<string, object>>(properties: P, required: (keyof P & string)[] = []) {
  return { type: 'object', additionalProperties: false, properties, required } as const;
}

export const idParams = {
  type: 'object',
  properties: { id: { type: 'string', maxLength: 64 } },
  required: ['id'],
} as const;
