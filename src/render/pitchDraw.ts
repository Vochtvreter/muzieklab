import { Accidental, Barline, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import { letterOf, octaveOf, type Alter, type Clef, type KeyId, type Step } from '../core/pitch';
import { paintSvg, type StaffPalette } from './staffDraw';

/** right / wrong / right with a hint: the answered notes' colours (§3.5, as in the rhythm notation). */
export type PitchMark = 'right' | 'wrong' | 'hinted';

export interface PitchNote {
  step: Step;
  /** The sign drawn next to the note (null: none, the key signature says it). */
  sign: Alter | null;
  /** Text under the note (Learn examples: "E", "G", …). */
  label?: string;
}

export interface DrawPitchOptions {
  clef: Clef;
  key: KeyId;
  notes: PitchNote[];
  /** Bars to draw, one whole note each; empty bars keep a short page as wide as a full one. 0 = clef and key only. */
  slots: number;
  marks?: (PitchMark | undefined)[];
  cursor?: number | null;
  /** Width in CSS px; the staff is drawn at `scale` × VexFlow's size (10 px per staff space). */
  width: number;
  scale: number;
  /** Staff spaces kept free above and below (room for ledger lines; stable height across notes). */
  room: number;
  /** Clef and key only, scaled to fit `width` (the Key screen's small staves). */
  fit?: boolean;
  palette: StaffPalette;
}

const SPACE = 10;
const CURSOR_PAD = 6;
const LABEL_GAP = 18;
const SIGN: Record<Alter, string> = { [-1]: 'b', 0: 'n', 1: '#' };

const vfKey = (step: Step): string => `${letterOf(step).toLowerCase()}/${octaveOf(step)}`;

/** Width of the clef and key signature at the start of the staff (VexFlow units). */
function headWidth(clef: Clef, key: KeyId): number {
  const probe = new Stave(0, 0, 400);
  probe.addClef(clef);
  if (key !== 'C') probe.addKeySignature(key);
  return probe.getNoteStartX();
}

/**
 * Draws one staff with a clef, a key signature and one whole note per bar (§3.5: a bar line after each note, so a sign
 * never carries over). Every glyph gets an explicit colour from the palette; the cursor note gets a soft slate box.
 */
export function drawPitchStaff(host: HTMLElement, o: DrawPitchOptions): { width: number; height: number } {
  host.innerHTML = '';
  if (o.width <= 0) return { width: o.width, height: 0 };
  const head = headWidth(o.clef, o.key);
  const labels = o.notes.some((n) => n.label);
  const staffH = (o.room * 2 + 4) * SPACE + (labels ? LABEL_GAP : 0);
  // Fitted staves share one scale: as wide as the widest signature (7 signs), so every key lines up at the same size.
  const logicalW = o.fit ? Math.max(head, headWidth(o.clef, 'C#')) + 8 : o.width / o.scale;
  const scale = o.fit ? o.width / logicalW : o.scale;
  const width = Math.floor(logicalW * scale);
  const height = Math.ceil(staffH * scale);

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  // The top line sits `room` spaces down; the whole drawing is in VexFlow units, scaled by the viewBox at the end.
  const opts = { space_above_staff_ln: o.room, space_below_staff_ln: o.room };
  const y = 0;
  const colourById = new Map<string, string>();
  const drawn: { note: StaveNote; index: number }[] = [];

  if (o.slots === 0) {
    const stave = new Stave(0, y, logicalW - 1, opts);
    stave.addClef(o.clef);
    if (o.key !== 'C') stave.addKeySignature(o.key);
    stave.setEndBarType(Barline.type.NONE);
    stave.setContext(ctx).draw();
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
      const n = o.notes[i];
      if (!n) continue;
      const note = new StaveNote({ clef: o.clef, keys: [vfKey(n.step)], duration: 'w' });
      if (n.sign !== null) note.addModifier(new Accidental(SIGN[n.sign]), 0);
      const mark = o.marks?.[i];
      const colour = mark === 'right' ? o.palette.hit : mark === 'wrong' ? o.palette.miss : mark === 'hinted' ? o.palette.early : null;
      if (colour) {
        note.setStyle({ fillStyle: colour, strokeStyle: colour });
        colourById.set(note.getAttribute('id') as string, colour);
      }
      const voice = new Voice({ num_beats: 4, beat_value: 4 }).setMode(Voice.Mode.SOFT);
      voice.addTickables([note]);
      new Formatter().joinVoices([voice]).format([voice], Math.max(10, stave.getNoteEndX() - stave.getNoteStartX() - 10));
      voice.draw(ctx, stave);
      drawn.push({ note, index: i });
    }
  }

  const svg = host.querySelector('svg');
  if (!svg) return { width, height };
  paintSvg(svg, o.palette, colourById);
  const ns = 'http://www.w3.org/2000/svg';
  const topLine = o.room * SPACE;
  const bottomLine = topLine + 4 * SPACE;
  for (const { note, index } of drawn) {
    const bb = note.getBoundingBox();
    const n = o.notes[index];
    if (index === o.cursor) {
      const signRoom = n.sign !== null ? 14 : 0;
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(bb.getX() - CURSOR_PAD - signRoom));
      r.setAttribute('y', String(Math.min(bb.getY(), topLine) - CURSOR_PAD));
      r.setAttribute('width', String(bb.getW() + CURSOR_PAD * 2 + signRoom));
      r.setAttribute('height', String(Math.max(bb.getY() + bb.getH(), bottomLine) - Math.min(bb.getY(), topLine) + CURSOR_PAD * 2));
      r.setAttribute('rx', '7');
      r.setAttribute('fill', o.palette.cursor);
      r.setAttribute('fill-opacity', '0.18');
      r.setAttribute('stroke', 'none');
      svg.insertBefore(r, svg.firstChild);
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
