import { useLayoutEffect, useRef } from 'react';
import type { Clef, KeyId } from '../core/pitch';
import { drawPitchStaff, type PitchMark, type PitchNote } from './pitchDraw';
import { readToken, useElementWidth, useThemeVersion } from './theme';

export type { PitchMark, PitchNote };

export interface PitchStaffProps {
  clef: Clef;
  keyId: KeyId;
  /** null: an empty slot (a note still to hear or to write). */
  notes: (PitchNote | null)[];
  /** Bars per staff (default: one per note). 0 draws the clef and key signature only, fitted to the width. */
  slots?: number;
  marks?: (PitchMark | undefined)[];
  cursor?: number | null;
  /** Size of the staff: 1 = VexFlow's 10 px per space; smaller when the notes need more room than the width leaves. */
  scale?: number;
  /** The notes to keep room for (default: `notes`), so the staff keeps one size while its notes come in or stay hidden. */
  fitNotes?: (PitchNote | null)[];
  /** Staff spaces of room above and below for ledger lines (default 3), or more where a clef, sign or cursor reaches. */
  room?: number;
  /** false: all notes in one bar without bar lines (a scale), and the cursor may sit on an empty slot. */
  barlines?: boolean;
  /** Accessible description; omit for a decorative staff (its text is given next to it). */
  label?: string;
  className?: string;
}

const NO_NOTES: (PitchNote | null)[] = [];

/** A five-line staff in treble or bass clef with a key signature and whole notes (Read notes, Scales, Learn chapters 8–11). */
export function PitchStaff(props: PitchStaffProps): JSX.Element {
  const { clef, keyId, slots = props.notes.length, marks, cursor, scale = 1, fitNotes, room = 3, barlines = true, label, className } = props;
  // A key-signature staff passes notes={[]}, a new array every render: one shared empty list keeps VexFlow from drawing
  // it again each time its parent renders.
  const notes = props.notes.length ? props.notes : NO_NOTES;
  const hostRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(hostRef);
  const themeVersion = useThemeVersion();

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el || width <= 0) return;
    drawPitchStaff(el, {
      clef,
      key: keyId,
      notes,
      slots,
      marks,
      cursor,
      width,
      scale,
      fitNotes,
      room,
      fit: slots === 0,
      barlines,
      palette: {
        ink: readToken(el, 'ink'),
        staff: readToken(el, 'staff'),
        hit: readToken(el, 'hit'),
        early: readToken(el, 'early'),
        miss: readToken(el, 'miss'),
        cursor: readToken(el, 'slate'),
      },
    });
  }, [clef, keyId, notes, slots, marks, cursor, width, scale, fitNotes, room, barlines, themeVersion]);

  return (
    <div ref={hostRef} className={'pitch-staff' + (className ? ' ' + className : '')} role={label ? 'img' : undefined} aria-label={label}
      aria-hidden={label ? undefined : true} />
  );
}
