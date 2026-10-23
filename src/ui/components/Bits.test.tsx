// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DIAMOND } from '../../core/api';
import { StarsMark } from './Bits';

afterEach(cleanup);

/** The star glyphs drawn for a result, and how many of them are diamond blue. */
function drawn(stars: number): { glyphs: number; filled: number; diamond: number } {
  const { container } = render(<StarsMark stars={stars} />);
  const text = container.textContent ?? '';
  const out = { glyphs: [...text].filter((c) => c === '★' || c === '☆').length, filled: [...text].filter((c) => c === '★').length, diamond: container.querySelectorAll('.diamond-star').length };
  cleanup();
  return out;
}

describe('StarsMark', () => {
  it('draws three slots for 0–3 stars, four stars for the 4th and four diamond stars for the diamond', () => {
    expect(drawn(0)).toEqual({ glyphs: 3, filled: 0, diamond: 0 });
    expect(drawn(2)).toEqual({ glyphs: 3, filled: 2, diamond: 0 });
    expect(drawn(3)).toEqual({ glyphs: 3, filled: 3, diamond: 0 });
    expect(drawn(4)).toEqual({ glyphs: 4, filled: 4, diamond: 0 });
    expect(drawn(DIAMOND)).toEqual({ glyphs: 4, filled: 4, diamond: 4 });
  });

  it('never draws fewer filled stars for a better result', () => {
    for (let s = 1; s <= DIAMOND; s++) expect(drawn(s).filled).toBeGreaterThanOrEqual(drawn(s - 1).filled);
  });
});
