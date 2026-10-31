import { afterEach, describe, expect, it } from 'vitest';
import { formatDay, setLocale } from '../../i18n';
import { PERMISSIONS, type Permission } from '../../../shared/api';
import { clearListNotice, dayOfUntil, holdsMore, linkMessage, peekListNotice, roleName, rolesText, setListNotice, sortRoles, today } from './admin';

afterEach(() => {
  setLocale('en');
  clearListNotice();
});

const LINK = 'https://vivanova.app/#/invite/q3Vb9JzR1kLx7Pm2Ws5Tn8Yc4Hd6Fg0Ae-Ui_Oj3Ks';
// Noon UTC: the same day in every time zone the tests may run in.
const UNTIL = '2026-10-30T12:00:00.000Z';

describe('linkMessage', () => {
  it('writes the invite message in the app language, with the link as it is', () => {
    const en = linkMessage('invite', 'Lies Bakker', LINK, UNTIL);
    expect(en).toMatch(/^Hi Lies Bakker, I've made you an account for Muzieklab\. Open this link to choose your password: /);
    expect(en).toContain(LINK + ' — it works until October 30, 2026 at ');
    setLocale('nl');
    const nl = linkMessage('invite', 'Lies Bakker', LINK, UNTIL);
    expect(nl).toMatch(/^Hoi Lies Bakker, ik heb een account voor je gemaakt bij Muzieklab\./);
    expect(nl).toContain(LINK + ' — hij werkt tot 30 oktober 2026 om ');
  });

  it('writes the new-password message', () => {
    expect(linkMessage('reset', 'Sam', LINK, UNTIL)).toMatch(
      new RegExp("^Hi Sam, here's a link to choose a new password for Muzieklab: " + LINK.replace(/[.?/#]/g, '\\$&') + ' — it works until October 30, 2026 at .+\\.$'),
    );
  });
});

describe("premium's last day", () => {
  it('is a calendar day: the field shows it as it is, with no time zone in between', () => {
    expect(dayOfUntil('2027-03-31')).toBe('2027-03-31');
    expect(dayOfUntil('2027-01-01')).toBe('2027-01-01');
  });

  it('an older date-time (saved before premium ended on a day) reads as its UTC day, as the API reads it', () => {
    expect(dayOfUntil('2027-03-31T21:59:59.999Z')).toBe('2027-03-31');
    expect(dayOfUntil('2027-01-31T00:00:00.000Z')).toBe('2027-01-31');
  });

  it('is an empty field for no end, or for something that is not a day', () => {
    expect(dayOfUntil(null)).toBe('');
    expect(dayOfUntil('not a date')).toBe('');
  });

  it('is shown as that day in the app language, the same in every time zone', () => {
    // Midnight UTC: a local Date would show December 31 west of UTC.
    expect(formatDay('2027-01-01')).toBe('January 1, 2027');
    setLocale('nl');
    expect(formatDay('2027-01-01')).toBe('1 januari 2027');
  });

  it('today is yyyy-mm-dd where the admin is, the earliest day the field takes', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 23:30 local on March 31 is still March 31 here, whatever day it is in UTC.
    expect(today(new Date(2027, 2, 31, 23, 30))).toBe('2027-03-31');
    expect(today(new Date(2027, 0, 1, 0, 30))).toBe('2027-01-01');
  });
});

describe('rolesText', () => {
  it('names the roles in a fixed order, in the app language', () => {
    expect(rolesText(['teacher', 'admin'])).toBe('Admin · Teacher');
    expect(rolesText([])).toBe('');
    setLocale('nl');
    expect(rolesText(['editor', 'admin'])).toBe('Beheerder · Redacteur');
  });

  it('names custom roles as admins named them, after the built-in ones, by name', () => {
    const names = { testers: 'Testers', 'a-guests': 'Guests' };
    expect(rolesText(['testers', 'teacher', 'a-guests'], names)).toBe('Teacher · Guests · Testers');
    // A custom role whose name is not known (yet) shows by its id.
    expect(roleName('testers')).toBe('testers');
    expect(roleName('testers', names)).toBe('Testers');
    expect(roleName('admin', names)).toBe('Admin');
  });
});

describe('sortRoles', () => {
  it('puts the built-in roles first, then the custom ones by id, each once, as the API stores them', () => {
    expect(sortRoles(['testers', 'teacher', 'admin', 'a-guests', 'teacher'])).toEqual(['admin', 'teacher', 'a-guests', 'testers']);
  });
});

describe('the list notice', () => {
  it('waits for the list, which clears it once shown', () => {
    expect(peekListNotice()).toBeNull();
    setListNotice("Piet Visser's account was deleted.");
    expect(peekListNotice()).toBe("Piet Visser's account was deleted.");
    clearListNotice();
    expect(peekListNotice()).toBeNull();
  });
});

describe('holdsMore', () => {
  const list = [
    { id: 'teacher', permissions: ['class.create'] as Permission[] },
    { id: 'support', permissions: ['accounts.read', 'accounts.invite'] as Permission[] },
  ];
  const support: Permission[] = ['self.manage', 'progress.own', 'class.join', 'accounts.read', 'accounts.invite'];

  it('is true for an account whose roles give a permission the admin lacks: an admin, a teacher', () => {
    expect(holdsMore(['admin'], list, support)).toBe(true);
    expect(holdsMore(['admin'], null, support)).toBe(true);
    expect(holdsMore(['teacher'], list, support)).toBe(true);
    expect(holdsMore(['support', 'teacher'], list, support)).toBe(true);
  });

  it('is false when the admin holds all of it, or for a role the list does not know (yet)', () => {
    expect(holdsMore([], list, support)).toBe(false);
    expect(holdsMore(['support'], list, support)).toBe(false);
    expect(holdsMore(['admin'], list, [...PERMISSIONS])).toBe(false);
    expect(holdsMore(['teacher'], null, support)).toBe(false);
    expect(holdsMore(['gone-role'], list, support)).toBe(false);
  });
});
