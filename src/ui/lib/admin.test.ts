import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { clearListNotice, dayOfUntil, linkMessage, peekListNotice, rolesText, setListNotice, today, untilOfDay } from './admin';

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
  it('is the end of the chosen day here, and reads back as that day', () => {
    const until = untilOfDay('2027-03-31')!;
    const d = new Date(until);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2027, 3, 31, 23, 59]);
    expect(dayOfUntil(until)).toBe('2027-03-31');
  });

  it('is null for an empty field (no end), and an empty field for no end', () => {
    expect(untilOfDay('')).toBeNull();
    expect(dayOfUntil(null)).toBe('');
    expect(dayOfUntil('not a date')).toBe('');
  });

  it('today is yyyy-mm-dd, the earliest day the field takes', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(untilOfDay(today())!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('rolesText', () => {
  it('names the roles in a fixed order, in the app language', () => {
    expect(rolesText(['teacher', 'admin'])).toBe('Admin · Teacher');
    expect(rolesText([])).toBe('');
    setLocale('nl');
    expect(rolesText(['editor', 'admin'])).toBe('Beheerder · Redacteur');
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
