import type { Premium } from '../../../shared/api.js';
import type { AccountDoc } from '../db.js';

// Premium (BACKEND-PLAN.md §4.3, shared/api.ts Premium): on with no end, or through a last day. The last day is a
// calendar date (YYYY-MM-DD), not a moment, so it reads the same in every time zone, and it counts as on through that
// whole day anywhere in the world: until the day after it, 12:00 UTC (when the day ends at UTC−12).

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parts(day: string): [number, number, number] | null {
  const match = DAY.exec(day);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = m === 2 && leap ? 29 : DAYS_IN_MONTH[m - 1];
  return m >= 1 && m <= 12 && d >= 1 && d <= days ? [y, m, d] : null;
}

/** Whether `day` is a real calendar date written YYYY-MM-DD (2026-02-30 is not). */
export function isDay(day: string): boolean {
  return parts(day) !== null;
}

/** When premium through `day` goes off (ms): the day after it, 12:00 UTC. 0 (long over) for what is not a date. */
export function premiumEnd(day: string): number {
  const date = parts(day);
  if (!date) return 0;
  const [y, m, d] = date;
  const end = new Date(Date.UTC(2000, 0, 1, 12));
  end.setUTCFullYear(y, m - 1, d + 1); // setUTCFullYear, since Date.UTC reads years 0–99 as 1900–1999
  return end.getTime();
}

/**
 * The stored last day as YYYY-MM-DD, or null for no end. Accounts saved before premium ended on a calendar day (the
 * first test-site release) hold a Date there: it reads as its UTC calendar day.
 */
export function lastDayOf(until: string | Date | null): string | null {
  if (until === null) return null;
  return until instanceof Date ? until.toISOString().slice(0, 10) : until;
}

/** Premium is on while it is set and has no end, or its last day is not over yet anywhere. */
export function premiumOf(account: AccountDoc, now: Date): Premium {
  const premium = account.premium;
  if (!premium) return { active: false, until: null };
  const day = lastDayOf(premium.until);
  if (day === null) return { active: true, until: null };
  return now.getTime() < premiumEnd(day) ? { active: true, until: day } : { active: false, until: null };
}
