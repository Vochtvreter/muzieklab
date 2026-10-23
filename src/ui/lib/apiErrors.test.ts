import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import { hasMessage, setLocale, t } from '../../i18n';
import { CLIENT_ERROR_CODES, errorField, errorMessage, failureOf, fieldError, formError, passwordLengthFailure } from './apiErrors';

afterEach(() => setLocale('en'));

describe('API error messages', () => {
  for (const locale of ['en', 'nl']) {
    it(`${locale}: every error code, and unavailable, has its own message`, () => {
      setLocale(locale);
      const seen = new Set<string>();
      for (const code of CLIENT_ERROR_CODES) {
        expect(hasMessage('apiError.' + code), code).toBe(true);
        const text = errorMessage(new ApiError(400, code));
        expect(text, code).not.toContain('apiError.');
        expect(text, code).not.toMatch(/[{}]/);
        seen.add(text);
      }
      expect(seen.size).toBe(CLIENT_ERROR_CODES.length);
    });
  }

  it('includes unavailable and every code of the contract', () => {
    expect(CLIENT_ERROR_CODES).toContain('unavailable');
    expect(CLIENT_ERROR_CODES).toContain('too_many_attempts');
    expect(CLIENT_ERROR_CODES).toContain('link_invalid');
  });

  it('says the same for a wrong email and a wrong password', () => {
    expect(errorMessage(new ApiError(401, 'invalid_credentials'))).toBe('Email or password is not right.');
  });

  it('says how long to wait after too many tries, in seconds or minutes', () => {
    const wait = (s?: number): string => errorMessage(new ApiError(429, 'too_many_attempts', '', s));
    expect(wait(1)).toBe('Too many tries. Try again in 1 second.');
    expect(wait(45)).toBe('Too many tries. Try again in 45 seconds.');
    expect(wait(90)).toBe('Too many tries. Try again in 90 seconds.');
    expect(wait(120)).toBe('Too many tries. Try again in 2 minutes.');
    expect(wait(121)).toBe('Too many tries. Try again in 3 minutes.');
    expect(wait(900)).toBe('Too many tries. Try again in 15 minutes.');
    expect(wait()).toBe(t('apiError.too_many_attempts'));
    setLocale('nl');
    expect(wait(120)).toBe('Te veel pogingen. Probeer het over 2 minuten opnieuw.');
    expect(wait(1)).toBe('Te veel pogingen. Probeer het over 1 seconde opnieuw.');
  });

  it('names the password rules with their numbers', () => {
    expect(errorMessage(new ApiError(422, 'password_length'))).toBe('Use 10 to 128 characters.');
  });

  it('treats anything thrown that is not an ApiError as internal', () => {
    expect(errorMessage(new Error('boom'))).toBe(t('apiError.internal'));
  });
});

describe('which field an error belongs to', () => {
  it('puts password, email and wrong-password errors under their field, and the rest on the form', () => {
    expect(errorField('password_common')).toBe('password');
    expect(errorField('password_length')).toBe('password');
    expect(errorField('password_has_email')).toBe('password');
    expect(errorField('wrong_password')).toBe('currentPassword');
    expect(errorField('email_invalid')).toBe('email');
    expect(errorField('email_taken')).toBe('email');
    expect(errorField('invalid_credentials')).toBeNull();
    expect(errorField('unavailable')).toBeNull();
  });

  it('splits a failure into a field error or a form error', () => {
    const f = failureOf(new ApiError(422, 'password_common'));
    expect(fieldError(f, 'password')).toBe(f.message);
    expect(fieldError(f, 'email')).toBeNull();
    expect(formError(f)).toBeNull();
    const g = failureOf(new ApiError(0, 'unavailable'));
    expect(formError(g)).toBe("Can't reach Muzieklab right now. Check your connection and try again.");
    expect(fieldError(g, 'password')).toBeNull();
    expect(formError(null)).toBeNull();
  });

  it('checks a new password’s length in code points before sending it', () => {
    expect(passwordLengthFailure('a'.repeat(9))?.code).toBe('password_length');
    expect(passwordLengthFailure('a'.repeat(10))).toBeNull();
    // Ten emoji are 20 UTF-16 units but 10 characters: long enough. 129 are too many.
    expect(passwordLengthFailure('🎵'.repeat(10))).toBeNull();
    expect(passwordLengthFailure('🎵'.repeat(9) + 'a')).toBeNull();
    expect(passwordLengthFailure('🎵'.repeat(129))?.field).toBe('password');
  });
});
