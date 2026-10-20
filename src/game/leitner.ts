/**
 * Test yourself spaced repetition (DESIGN.md §3.6): a simple Leitner scheme per card. A card sits in a box; each box has
 * an interval in days. Right moves the card up a box (back in 4 days, then longer); wrong puts it back in the first box,
 * back tomorrow and first in the next round. A card with no state yet (just added to the deck) is due at once.
 */

export interface CardState {
  /** 1 … MAX_BOX. */
  box: number;
  /** The day the card is due again, yyyy-mm-dd. */
  due: string;
  /** The last answer was wrong: the card comes first in the next round. */
  missed: boolean;
}

/** Days until a card in each box is due again; box 1 is where a wrong answer sends it. */
export const INTERVALS = [1, 4, 8, 16, 32] as const;
export const MAX_BOX = INTERVALS.length;

/** yyyy-mm-dd shifted by whole days; UTC arithmetic so DST never skips or repeats a day. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A card without state counts as due: it joined the deck and has not been tested yet. */
export const isDue = (state: CardState | undefined, today: string): boolean => !state || state.due <= today;

/** The card's state after an answer, given on `today`. A new card starts in box 1, so a right answer takes it to box 2. */
export function review(state: CardState | undefined, right: boolean, today: string): CardState {
  const box = right ? Math.min(MAX_BOX, (state?.box ?? 1) + 1) : 1;
  return { box, due: addDays(today, INTERVALS[box - 1]), missed: !right };
}

/** Days until the card is back after this answer (for "Back in 4 days"). */
export const daysUntilBack = (state: CardState): number => INTERVALS[state.box - 1];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A stored card state, repaired; null when it is not usable. */
export function sanitizeCardState(raw: unknown): CardState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.due !== 'string' || !ISO_DATE.test(v.due)) return null;
  const box = typeof v.box === 'number' && Number.isFinite(v.box) ? Math.round(Math.min(MAX_BOX, Math.max(1, v.box))) : 1;
  return { box, due: v.due, missed: v.missed === true };
}
