import { Accidental, Barline, Formatter, GhostNote, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import { BOTTOM_LINE, letterOf, octaveOf, type Clef, type KeyId, type Step } from '../core/pitch';
import type { ScaleAlter } from '../core/scale';
import { paintSvg, type StaffPalette } from './staffDraw';

/**
 * right / wrong / right with a hint: the answered notes' colours (§3.5, as in the rhythm notation); ghost: a note being
 * written, in the cursor's slate until it is checked.
 */
export type PitchMark = 'right' | 'wrong' | 'hinted' | 'ghost';

export interface PitchNote {
  step: Step;
  /** The sign drawn next to the note (null: none, the key signature says it); ±2 only in scales (F𝄪, §3.7). */
  sign: ScaleAlter | null;
  /** Text under the note (Learn examples: "E", "G", …). */
  label?: string;
}

export interface DrawPitchOptions {
  clef: Clef;
  key: KeyId;
  /** null: an empty slot (a note still to hear or to write). */
  notes: (PitchNote | null)[];
  /** Bars to draw, one whole note each; empty bars keep a short page as wide as a full one. 0 = clef and key only. */
  slots: number;
  marks?: (PitchMark | undefined)[];
  cursor?: number | null;
  /**
   * Width in CSS px; the staff is drawn at `scale` × VexFlow's size (10 px per staff space), or smaller when its notes
   * need more room than that leaves them.
   */
  width: number;
  scale: number;
  /**
   * The notes to keep room for (default: `notes`): a staff whose notes come in one by one, or stay hidden until they
   * are answered, keeps one size. Without bar lines, the staff keeps room for each of them coming in, with the cursor
   * on the next one's place.
   */
  fitNotes?: (PitchNote | null)[];
  /** Staff spaces kept free above and below (room for ledger lines; stable height across notes). */
  room: number;
  /** Clef and key only, scaled to fit `width` (the Key screen's small staves). */
  fit?: boolean;
  /**
   * false: every note in one bar, no bar lines (a scale: each letter once, so no sign carries over). Empty slots keep
   * their room, and the cursor can sit on an empty slot (the next note's place).
   */
  barlines?: boolean;
  palette: StaffPalette;
}

const SPACE = 10;
const CURSOR_PAD = 6;
/** A whole note's head, for the cursor on an empty slot (VexFlow units). */
const NOTE_W = 16;
const LABEL_GAP = 18;
/** Half a label's width per letter: 12 px JetBrains Mono is 0.6 em a letter, centred under its note (VexFlow units). */
const LABEL_HALF = 3.6;
/** From a bar line to its stave's notes: VexFlow sets them 5 units in, and then adds its padding (below). */
const BAR_START = 5;
/** VexFlow's padding before a stave's notes, which a bar too narrow for it gives up (VexFlow units). */
const STAVE_PADDING = 12;
/** Room after each note in its bar (VexFlow units), so it does not touch the next bar line or the key signature. */
const NOTE_GAP = 3;
/** The least room between two notes side by side, as they draw (VexFlow units). */
const NOTE_CLEAR = 1;
/** VexFlow's room left of a sign, where nothing draws (its accidental.leftPadding; VexFlow units). */
const SIGN_PAD = 2;
const SIGN: Record<ScaleAlter, string> = { [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' };

const vfKey = (step: Step): string => `${letterOf(step).toLowerCase()}/${octaveOf(step)}`;

/**
 * The staff position at height `y` of a drawing (in its viewBox units, from the top), for writing a note by pointing at
 * the staff: the nearest line or space, counted from the bottom line `room` spaces + 4 below the top.
 */
export function stepAtY(clef: Clef, room: number, y: number): Step {
  const bottom = (room + 4) * SPACE;
  return BOTTOM_LINE[clef] + Math.round((bottom - y) / (SPACE / 2));
}

/** Width of the clef and key signature at the start of the staff (VexFlow units). */
function headWidth(clef: Clef, key: KeyId): number {
  const probe = new Stave(0, 0, 400);
  probe.addClef(clef);
  if (key !== 'C') probe.addKeySignature(key);
  return probe.getNoteStartX();
}

/** A whole note with its sign drawn next to it. */
function wholeNote(clef: Clef, n: PitchNote): StaveNote {
  const note = new StaveNote({ clef, keys: [vfKey(n.step)], duration: 'w' });
  if (n.sign !== null) note.addModifier(new Accidental(SIGN[n.sign]), 0);
  return note;
}

/** A note off the staff, drawn on ledger lines (from the first one below or above it). */
const offStaff = (clef: Clef, step: Step): boolean => step <= BOTTOM_LINE[clef] - 2 || step >= BOTTOM_LINE[clef] + 10;

/** A whole note in a voice of its own, formatted (not yet placed), so its room can be read. */
function soloVoice(note: StaveNote): { voice: Voice; formatter: Formatter } {
  const voice = new Voice({ num_beats: 4, beat_value: 4 }).setMode(Voice.Mode.SOFT);
  voice.addTickables([note]);
  const formatter = new Formatter().joinVoices([voice]);
  formatter.preCalculateMinTotalWidth([voice]);
  return { voice, formatter };
}

/**
 * Where a formatted whole note draws, from the left of its box (VexFlow's box starts at the room before its sign): from
 * its sign, or its head and the ledger lines that stick out on both sides of a note off the staff, to the end of its
 * head and ledger lines (VexFlow units). VexFlow's minimum width adds padding around it that draws nothing.
 */
function drawnSpan(clef: Clef, n: PitchNote, note: StaveNote): [number, number] {
  const ledger = offStaff(clef, n.step) ? StaveNote.LEDGER_LINE_OFFSET : 0;
  return [n.sign !== null ? SIGN_PAD : -ledger, note.getMetrics().modLeftPx + note.getGlyphWidth() + ledger];
}

/**
 * An empty slot of a bar-line-free staff. VexFlow gives a ghost note no width, so it gets the cursor's: the formatter
 * keeps room for the note to come, and the cursor on the last slot stays on the staff.
 */
function emptySlot(): GhostNote {
  const ghost = new GhostNote({ duration: 'w' });
  ghost.setWidth(NOTE_W + CURSOR_PAD);
  return ghost;
}

/** The stave of a staff without bar lines, or with the clef and key only: `w` units wide with the drawing's last unit. */
function openStave(o: DrawPitchOptions, w: number): Stave {
  const stave = new Stave(0, 0, w - 1, { space_above_staff_ln: o.room, space_below_staff_ln: o.room });
  stave.addClef(o.clef);
  if (o.key !== 'C') stave.addKeySignature(o.key);
  stave.setEndBarType(Barline.type.NONE);
  return stave;
}

/** Sets notes side by side on a stave without bar lines, as VexFlow formats them, without drawing them (null: an empty slot). */
function sideBySide(
  stave: Stave,
  slots: number,
  notes: (PitchNote | null)[],
  make: (n: PitchNote, i: number) => StaveNote,
): { voice: Voice; notes: { note: StaveNote; index: number }[]; ghosts: { ghost: GhostNote; index: number }[] } {
  const set: { note: StaveNote; index: number }[] = [];
  const ghosts: { ghost: GhostNote; index: number }[] = [];
  const tickables = Array.from({ length: slots }, (_, i) => {
    const n = notes[i];
    if (n) {
      const note = make(n, i);
      set.push({ note, index: i });
      return note;
    }
    const ghost = emptySlot();
    ghosts.push({ ghost, index: i });
    return ghost;
  });
  const voice = new Voice({ num_beats: 4 * slots, beat_value: 4 }).setMode(Voice.Mode.SOFT);
  voice.addTickables(tickables);
  new Formatter().joinVoices([voice]).format([voice], Math.max(10, stave.getNoteEndX() - stave.getNoteStartX() - 10));
  for (const t of tickables) t.setStave(stave);
  return { voice, notes: set, ghosts };
}

/**
 * Whether these notes fit a staff without bar lines `w` units wide as VexFlow sets them: each note clear of the one
 * before, its ledger lines too, and the notes, their labels and the cursor on an empty slot on the staff.
 */
function sideBySideFits(o: DrawPitchOptions, w: number, notes: (PitchNote | null)[], cursor: number | null): boolean {
  const end = w - 1;
  const { notes: set, ghosts } = sideBySide(openStave(o, w), o.slots, notes, (n) => wholeNote(o.clef, n));
  let before = -Infinity;
  for (const { note, index } of set) {
    const n = notes[index]!;
    const bb = note.getBoundingBox();
    const [from, to] = drawnSpan(o.clef, n, note);
    if (bb.getX() + from < before + NOTE_CLEAR || bb.getX() + to > end) return false;
    if (n.label && bb.getX() + bb.getW() / 2 + n.label.length * LABEL_HALF > w) return false;
    before = bb.getX() + to;
  }
  const empty = ghosts.find((g) => g.index === cursor);
  return !empty || empty.ghost.getAbsoluteX() + NOTE_W + CURSOR_PAD <= end;
}

/** Widths worked out for staves without bar lines, which draw again as each note comes in (a few at a time). */
const fitted = new Map<string, number>();

/**
 * The staff's width in VexFlow units: `width` at `scale`, or wider (drawn smaller) when its notes need more room than
 * that leaves them after the clef and key signature (`head`). VexFlow never sets a note in less room than it needs, so
 * on a staff too narrow the notes would run over their bar lines and off its end, where the drawing cuts them off.
 */
function staffWidth(o: DrawPitchOptions, head: number): number {
  const w = o.width / o.scale;
  if (o.slots === 0) return w;
  const fit = o.fitNotes ?? o.notes;
  if (o.barlines !== false) {
    // Equal bars, each with room for the widest note as it draws (its padding given up, below) and a gap after it. A
    // note's room depends only on its sign and on whether it has ledger lines.
    const kinds = new Map<string, PitchNote>([['', { step: BOTTOM_LINE[o.clef], sign: null }]]);
    for (const n of fit) if (n) kinds.set(`${n.sign} ${offStaff(o.clef, n.step)}`, n);
    const widest = Math.max(
      ...[...kinds.values()].map((n) => {
        const note = wholeNote(o.clef, n);
        soloVoice(note);
        const [from, to] = drawnSpan(o.clef, n, note);
        return to - from;
      }),
    );
    return Math.max(w, head + 2 + o.slots * (BAR_START + widest + NOTE_GAP));
  }
  // Each way the staff shows its notes: coming in one by one, with the cursor on the next one's place (fitNotes; the
  // fullest first), or as it shows them now.
  const pages = o.fitNotes
    ? Array.from({ length: o.slots + 1 }, (_, k) => ({ notes: fit.slice(0, o.slots - k), cursor: o.slots - k }))
    : [{ notes: o.notes, cursor: o.cursor ?? null }];
  const id = JSON.stringify([o.clef, o.key, o.slots, w, pages]);
  const known = fitted.get(id);
  if (known !== undefined) return known;
  const fits = (lw: number): boolean => pages.every((p) => sideBySideFits(o, lw, p.notes, p.cursor));
  let hi = w;
  if (!fits(w)) {
    // The narrowest wider staff that fits, to a unit.
    let lo = w;
    hi = w * 1.25;
    while (!fits(hi) && hi < w * 8) {
      lo = hi;
      hi *= 1.25;
    }
    while (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
  }
  if (fitted.size >= 64) fitted.clear();
  fitted.set(id, hi);
  return hi;
}

/**
 * Draws one staff with a clef, a key signature and one whole note per bar (§3.5: a bar line after each note, so a sign
 * never carries over). Every glyph gets an explicit colour from the palette; the cursor note gets a soft slate box.
 */
export function drawPitchStaff(host: HTMLElement, o: DrawPitchOptions): { width: number; height: number } {
  host.innerHTML = '';
  if (o.width <= 0) return { width: o.width, height: 0 };
  const head = headWidth(o.clef, o.key);
  const labels = o.notes.some((n) => n?.label);
  const staffH = (o.room * 2 + 4) * SPACE + (labels ? LABEL_GAP : 0);
  // Fitted staves share one scale: as wide as the widest signature (7 signs), so every key lines up at the same size.
  // The others keep their scale, or are drawn smaller when their notes need more room than it leaves them.
  const logicalW = o.fit ? Math.max(head, headWidth(o.clef, 'C#')) + 8 : staffWidth(o, head);
  const scale = o.fit || logicalW > o.width / o.scale ? o.width / logicalW : o.scale;
  const width = Math.floor(logicalW * scale);
  const height = Math.ceil(staffH * scale);

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  // The top line sits `room` spaces down; the whole drawing is in VexFlow units, scaled by the viewBox at the end.
  const opts = { space_above_staff_ln: o.room, space_below_staff_ln: o.room };
  const y = 0;
  const colourById = new Map<string, string>();
  /** The notes drawn, each with its bar on a staff with bar lines: where its cursor may reach, left to right. */
  const drawn: { note: StaveNote; index: number; bar?: [number, number] }[] = [];
  /** The cursor's place when it is an empty slot (x in VexFlow units), and its bar on a staff with bar lines. */
  let emptyCursor: { x: number; bar?: [number, number] } | null = null;

  const makeNote = (n: PitchNote, i: number): StaveNote => {
    const note = wholeNote(o.clef, n);
    const mark = o.marks?.[i];
    const colour =
      mark === 'right' ? o.palette.hit : mark === 'wrong' ? o.palette.miss : mark === 'hinted' ? o.palette.early : mark === 'ghost' ? o.palette.cursor : null;
    if (colour) {
      note.setStyle({ fillStyle: colour, strokeStyle: colour });
      colourById.set(note.getAttribute('id') as string, colour);
    }
    return note;
  };

  if (o.slots === 0) {
    openStave(o, logicalW).setContext(ctx).draw();
  } else if (o.barlines === false) {
    const stave = openStave(o, logicalW);
    stave.setContext(ctx).draw();
    const set = sideBySide(stave, o.slots, o.notes, makeNote);
    set.voice.draw(ctx, stave);
    drawn.push(...set.notes);
    const empty = set.ghosts.find((g) => g.index === o.cursor);
    if (empty) emptyCursor = { x: empty.ghost.getAbsoluteX() };
  } else {
    const slotW = (logicalW - head - 2) / o.slots;
    for (let i = 0; i < o.slots; i++) {
      const x = i === 0 ? 0 : head + slotW * i;
      const stave = new Stave(x, y, i === 0 ? head + slotW : slotW, opts);
      if (i === 0) {
        stave.addClef(o.clef);
        if (o.key !== 'C') stave.addKeySignature(o.key);
      } else {
        stave.setBegBarType(Barline.type.NONE);
      }
      stave.setContext(ctx).draw();
      // The cursor stays in its bar: from the key signature, or clear of the bar line (1 unit wide at x), to just before
      // the next bar line.
      const bar: [number, number] = [i === 0 ? head : x + 2, x + stave.getWidth() - 1];
      const n = o.notes[i];
      if (!n) {
        // An empty slot under the cursor (a note to hear or write) still shows where it is.
        if (i === o.cursor) emptyCursor = { x: (stave.getNoteStartX() + stave.getNoteEndX()) / 2 - NOTE_W / 2, bar };
        continue;
      }
      const note = makeNote(n, i);
      const { voice, formatter } = soloVoice(note);
      // VexFlow sets a note's box its padding after the bar's start. A bar too narrow for that moves the note back by as
      // much as it needs to stay clear of the next bar line, but not past the bar's start (in the first bar, a gap after
      // the key signature); a wider bar keeps VexFlow's place.
      const [from, to] = drawnSpan(o.clef, n, note);
      const over = stave.getNoteStartX() + STAVE_PADDING + to + NOTE_GAP - (x + stave.getWidth());
      if (over > 0) stave.setNoteStartX(stave.getNoteStartX() - Math.min(over, STAVE_PADDING + from - (i === 0 ? NOTE_GAP : 0)));
      formatter.format([voice], Math.max(10, stave.getNoteEndX() - stave.getNoteStartX() - 10));
      voice.draw(ctx, stave);
      drawn.push({ note, index: i, bar });
    }
  }

  const svg = host.querySelector('svg');
  if (!svg) return { width, height };
  paintSvg(svg, o.palette, colourById);
  const ns = 'http://www.w3.org/2000/svg';
  const topLine = o.room * SPACE;
  const bottomLine = topLine + 4 * SPACE;
  /** The cursor's soft slate box, kept inside its bar on a staff with bar lines. */
  const cursorRect = (x: number, top: number, w: number, h: number, bar?: [number, number]): void => {
    const left = bar ? Math.max(x, bar[0]) : x;
    const right = bar ? Math.min(x + w, bar[1]) : x + w;
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(left));
    r.setAttribute('y', String(top));
    r.setAttribute('width', String(right - left));
    r.setAttribute('height', String(h));
    r.setAttribute('rx', '7');
    r.setAttribute('fill', o.palette.cursor);
    r.setAttribute('fill-opacity', '0.18');
    r.setAttribute('stroke', 'none');
    svg.insertBefore(r, svg.firstChild);
  };
  if (emptyCursor) cursorRect(emptyCursor.x - CURSOR_PAD, topLine - CURSOR_PAD, NOTE_W + CURSOR_PAD * 2, bottomLine - topLine + CURSOR_PAD * 2, emptyCursor.bar);
  for (const { note, index, bar } of drawn) {
    const bb = note.getBoundingBox();
    const n = o.notes[index]!;
    if (index === o.cursor) {
      // VexFlow's box starts at the note's sign.
      const top = Math.min(bb.getY(), topLine) - CURSOR_PAD;
      cursorRect(bb.getX() - CURSOR_PAD, top, bb.getW() + CURSOR_PAD * 2, Math.max(bb.getY() + bb.getH(), bottomLine) - top + CURSOR_PAD, bar);
    }
    if (n.label) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String(bb.getX() + bb.getW() / 2));
      t.setAttribute('y', String(staffH - 4));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-family', 'JetBrains Mono, monospace');
      t.setAttribute('font-weight', '600');
      t.setAttribute('font-size', '12');
      t.setAttribute('fill', o.palette.cursor);
      t.textContent = n.label;
      svg.appendChild(t);
    }
  }

  svg.removeAttribute('style');
  svg.setAttribute('viewBox', `0 0 ${logicalW} ${staffH}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  return { width, height };
}
