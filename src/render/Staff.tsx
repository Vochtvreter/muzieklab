import { useLayoutEffect, useRef } from 'react';
import type { Meter, NotatedBar } from '../core/types';
import type { CountMark } from './counting';
import { drawStaff, placeCursor, type NoteBox, type NoteMark } from './staffDraw';
import { readToken, useElementWidth, useThemeVersion } from './theme';

export type { NoteMark };

export interface StaffProps {
  bars: NotatedBar[];
  meter: Meter;
  /** Colour per onset index (judgement so far); a miss also gets a × under the note. */
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
  /** Size of the notation, 1 by default; Play draws it smaller on a short phone (the bars still fill the width). */
  scale?: number;
  /** Drawn smaller when the notes or counts do not fit the width (Learn on a narrow phone, busy bars on Play). */
  shrinkToFit?: boolean;
  /** With shrinkToFit, the windows Play shows in turn: drawn at the size the busiest needs, it keeps one height. */
  fitWindows?: NotatedBar[][];
  /** The bars end the piece, with the final barline (default); false for Play's window of a longer exercise. */
  end?: boolean;
  /** Room for a triplet's 3 when the first row has none: Play's moving window and the Setup preview keep one height. */
  tupletSpace?: boolean;
}

/** VexFlow staff (one-line percussion staff), coloured from the theme tokens (§3.1, §9 notation colour rule). */
export function Staff(props: StaffProps): JSX.Element {
  const { bars, meter, marks, cursor, barsPerRow, label, countText, timeSig, scale, shrinkToFit, fitWindows, end, tupletSpace } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(hostRef);
  const themeVersion = useThemeVersion();
  // The drawn staff's note boxes and cursor colour: the cursor moves on its own, without drawing the staff again.
  const drawn = useRef<{ onsets: Map<number, NoteBox>; colour: string } | null>(null);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el || width <= 0) return;
    const colour = readToken(el, 'slate');
    const { onsets } = drawStaff(el, {
      bars,
      meter,
      marks,
      cursor: cursorRef.current,
      // A staff that can show a cursor (cursor prop given, even null) keeps room for it, so it never jumps.
      cursorSpace: cursor !== undefined,
      tupletSpace,
      end,
      barsPerRow,
      width,
      scale,
      shrinkToFit,
      fitWindows,
      timeSig,
      counts: countText && { text: countText, held: readToken(el, 'muted') },
      palette: {
        ink: readToken(el, 'ink'),
        staff: readToken(el, 'staff'),
        hit: readToken(el, 'hit'),
        early: readToken(el, 'early'),
        miss: readToken(el, 'miss'),
        cursor: colour,
      },
    });
    drawn.current = { onsets, colour };
    // cursor is left out on purpose (the effect below moves it); `cursor !== undefined` only sets the room above.
  }, [bars, meter, marks, cursor === undefined, barsPerRow, width, scale, shrinkToFit, fitWindows, end, tupletSpace, themeVersion, countText, timeSig]);

  // Play moves the cursor once per note: swap the highlight box instead of drawing VexFlow again.
  useLayoutEffect(() => {
    const el = hostRef.current;
    const d = drawn.current;
    if (!el || !d) return;
    placeCursor(el, cursor == null ? null : (d.onsets.get(cursor) ?? null), d.colour);
  }, [cursor]);

  return <div ref={hostRef} role="img" aria-label={label} style={{ width: '100%', minWidth: 0 }} />;
}
