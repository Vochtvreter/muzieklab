import { useLayoutEffect, useRef } from 'react';
import type { Meter, NotatedBar } from '../core/types';
import type { CountMark } from './counting';
import { drawStaff, type NoteMark } from './staffDraw';
import { readToken, useElementWidth, useThemeVersion } from './theme';

export type { NoteMark };

export interface StaffProps {
  bars: NotatedBar[];
  meter: Meter;
  /** Colour per onset index (judgement so far). */
  marks?: Record<number, NoteMark>;
  /** Onset index under the cursor (highlighted), or null. */
  cursor?: number | null;
  /** Bars per system: 2 on phones, 4 on wide screens. */
  barsPerRow: number;
  /** Accessible description, e.g. "quarter, quarter, half". */
  label: string;
  /** Counting under the notes (Learn): the word for each count. */
  countText?: (mark: CountMark) => string;
  /** The time signature as drawn, when not the meter's numbers: 'C' for common time. */
  timeSig?: string;
}

/** VexFlow staff (one-line percussion staff), coloured from the theme tokens (§3.1, §9 notation colour rule). */
export function Staff(props: StaffProps): JSX.Element {
  const { bars, meter, marks, cursor, barsPerRow, label, countText, timeSig } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(hostRef);
  const themeVersion = useThemeVersion();

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el || width <= 0) return;
    drawStaff(el, {
      bars,
      meter,
      marks,
      cursor,
      // A staff that can show a cursor (cursor prop given, even null) keeps room for it, so it never jumps.
      cursorSpace: cursor !== undefined,
      barsPerRow,
      width,
      timeSig,
      counts: countText && { text: countText, held: readToken(el, 'muted') },
      palette: {
        ink: readToken(el, 'ink'),
        staff: readToken(el, 'staff'),
        hit: readToken(el, 'hit'),
        early: readToken(el, 'early'),
        miss: readToken(el, 'miss'),
        cursor: readToken(el, 'slate'),
      },
    });
  }, [bars, meter, marks, cursor, barsPerRow, width, themeVersion, countText, timeSig]);

  return <div ref={hostRef} role="img" aria-label={label} style={{ width: '100%', minWidth: 0 }} />;
}
