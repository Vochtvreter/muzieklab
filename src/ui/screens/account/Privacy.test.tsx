// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../../i18n';
import { Privacy } from './Privacy';

// Phone width for useBreakpoint (the hook keeps one MediaQueryList per query).
window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? 390 >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

afterEach(() => {
  cleanup();
  setLocale('en');
});

const section = (name: string): string => screen.getByRole('region', { name }).textContent ?? '';

describe('Privacy', () => {
  it('says what a feedback report holds, how long it is kept, and what becomes of it when the account is deleted', () => {
    render(<Privacy />);
    expect(section('With an account')).toContain('the feedback reports you send from the app, if your account can send them');
    expect(section('With an account')).toContain('your settings, never your progress');
    expect(section('How long')).toContain('Feedback reports: until the team deletes them, or you delete your account.');
    expect(section('When you delete your account')).toContain(
      "The feedback reports you sent from the app are deleted with your account, whichever you choose. If an admin deletes your account, they're kept without your name.",
    );
  });

  it('reads in Dutch', () => {
    setLocale('nl');
    render(<Privacy />);
    expect(section('Hoe lang')).toContain('Feedbackmeldingen: tot het team ze verwijdert, of tot je je account verwijdert.');
    expect(section('Als je je account verwijdert')).toContain('worden met je account verwijderd, wat je ook kiest');
  });
});
