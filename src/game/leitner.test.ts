import { describe, expect, it } from 'vitest';
import { addDays, daysUntilBack, isDue, MAX_BOX, review, sanitizeCardState } from './leitner';

describe('Leitner boxes (Test yourself)', () => {
  it('a new card is due; right takes it to box 2, back in 4 days, then longer', () => {
    expect(isDue(undefined, '2026-10-20')).toBe(true);
    const a = review(undefined, true, '2026-10-20');
    expect(a).toEqual({ box: 2, due: '2026-10-24', missed: false });
    expect(daysUntilBack(a)).toBe(4);
    expect(isDue(a, '2026-10-23')).toBe(false);
    expect(isDue(a, '2026-10-24')).toBe(true);
    const b = review(a, true, '2026-10-24');
    expect(b).toEqual({ box: 3, due: '2026-11-01', missed: false });
  });

  it('wrong puts a card back in box 1, back tomorrow and marked missed', () => {
    const top = { box: MAX_BOX, due: '2026-10-01', missed: false };
    expect(review(top, false, '2026-10-20')).toEqual({ box: 1, due: '2026-10-21', missed: true });
    expect(review(top, true, '2026-10-20').box).toBe(MAX_BOX);
  });

  it('counts days across months and DST', () => {
    expect(addDays('2026-10-30', 4)).toBe('2026-11-03');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
  });

  it('repairs stored states and drops unusable ones', () => {
    expect(sanitizeCardState({ box: 9, due: '2026-10-20', missed: 1 })).toEqual({ box: MAX_BOX, due: '2026-10-20', missed: false });
    expect(sanitizeCardState({ box: 2 })).toBeNull();
    expect(sanitizeCardState('x')).toBeNull();
  });
});
