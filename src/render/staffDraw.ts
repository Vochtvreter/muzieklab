import { Beam, Barline, Dot, Formatter, Renderer, Stave, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow/bravura';
import type { Meter, NotatedBar, NotatedSymbol, NoteValue } from '../core/types';

export type NoteMark = 'perfect' | 'great' | 'good' | 'miss' | 'pending';

export interface StaffPalette {
  ink: string;
  staff: string;
  hit: string; // perfect / great
  early: string; // good (early / late)
  miss: string;
  cursor: string;
}

export interface DrawStaffOptions {
  bars: NotatedBar[];
  meter: Meter;
  marks?: Record<number, NoteMark>;
  cursor?: number | null;
  /** Leave room above the first row for the cursor highlight (keeps the height stable during play). */
  cursorSpace: boolean;
  barsPerRow: number;
  width: number;
  palette: StaffPalette;
}

// Layout constants from the design's notation images (vf/render2.js).
const ROW_H = 86;
const TS_EXTRA = 34; // extra width of the first bar of every row (time signature room, keeps bar lines aligned)
const CURSOR_TOP = 8;
const CURSOR_PAD = 7;
const VF_STAFF_GRAY = '#999999';

const DURATION: Record<NoteValue, string> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', sixteenth: '16' };

function markColour(mark: NoteMark | undefined, p: StaffPalette): string | null {
  switch (mark) {
    case 'perfect':
    case 'great':
      return p.hit;
    case 'good':
      return p.early;
    case 'miss':
      return p.miss;
    default:
      return null;
  }
}

function makeNote(sym: NotatedSymbol): StaveNote {
  const rest = sym.kind === 'rest';
  const note = new StaveNote({
    keys: ['b/4'], // middle line: notes on the line, rests in their standard place
    duration: DURATION[sym.value] + (sym.dots ? 'd' : '') + (rest ? 'r' : ''),
    stem_direction: 1,
    auto_stem: false,
    align_center: !!sym.wholeBarRest,
  });
  if (sym.dots) Dot.buildAndAttach([note], { all: true });
  return note;
}

/** Groups items by a key, keeping first-seen order; items without a key are skipped. */
function groupBy<T>(items: T[], key: (t: T) => number | undefined): T[][] {
  const map = new Map<number, T[]>();
  for (const it of items) {
    const k = key(it);
    if (k === undefined) continue;
    const g = map.get(k);
    if (g) g.push(it);
    else map.set(k, [it]);
  }
  return [...map.values()];
}

/**
 * Draws the exercise into `host` (replacing its content) as a one-line staff with VexFlow's SVG backend.
 * Returns the drawn size. Every glyph gets an explicit fill from the palette (DESIGN.md §9 notation colour rule).
 */
export function drawStaff(host: HTMLElement, o: DrawStaffOptions): { width: number; height: number } {
  const { bars, meter, palette: pal, width } = o;
  host.innerHTML = '';
  if (bars.length === 0 || width <= 0) return { width, height: 0 };

  const per = Math.max(1, Math.min(o.barsPerRow, bars.length));
  const rows = Math.ceil(bars.length / per);
  const top = o.cursorSpace ? CURSOR_TOP : 0;
  const height = rows * ROW_H + top - 6;

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const barW = (width - TS_EXTRA - 2) / per;
  const colourById = new Map<string, string>(); // VexFlow note id -> mark colour
  let cursorNote: StaveNote | null = null;
  let tieFrom: { note: StaveNote; row: number } | null = null;
  let colourOnset = -1; // onset index whose colour tied continuations inherit
  const ties: StaveTie[] = [];

  bars.forEach((bar, i) => {
    const row = Math.floor(i / per);
    const col = i % per;
    const x = col === 0 ? 0 : TS_EXTRA + barW * col;
    const w = col === 0 ? barW + TS_EXTRA : barW;
    const stave = new Stave(x, top + row * ROW_H, w, { space_above_staff_ln: 2, space_below_staff_ln: 2 });
    stave.setConfigForLines([0, 1, 2, 3, 4].map((l) => ({ visible: l === 2 })));
    if (i === 0) stave.addTimeSignature(meter.id);
    if (i === bars.length - 1) stave.setEndBarType(Barline.type.END);
    stave.setContext(ctx).draw();

    const notes = bar.symbols.map((sym) => {
      const note = makeNote(sym);
      if (sym.kind === 'note') {
        if (sym.onsetIndex >= 0) colourOnset = sym.onsetIndex;
        const onset = sym.onsetIndex >= 0 ? sym.onsetIndex : tieFrom ? colourOnset : -1;
        const colour = onset >= 0 ? markColour(o.marks?.[onset], pal) : null;
        if (colour) {
          note.setStyle({ fillStyle: colour, strokeStyle: colour });
          colourById.set(note.getAttribute('id') as string, colour);
        }
        if (o.cursor != null && sym.onsetIndex === o.cursor) cursorNote = note;
        if (tieFrom) {
          if (tieFrom.row === row) {
            ties.push(new StaveTie({ first_note: tieFrom.note, last_note: note, first_indices: [0], last_indices: [0] }));
          } else {
            // A tie across a line break: one half at the end of the row, the other at the start of the next.
            ties.push(new StaveTie({ first_note: tieFrom.note, first_indices: [0] }));
            ties.push(new StaveTie({ last_note: note, last_indices: [0] }));
          }
        }
        tieFrom = sym.tieToNext ? { note, row } : null;
      } else {
        tieFrom = null;
      }
      return note;
    });

    // Tuplets change the notes' ticks, so they must exist before the voice is filled.
    const pairs = bar.symbols.map((sym, j) => ({ sym, note: notes[j] }));
    const beamable = (sym: NotatedSymbol) =>
      sym.kind === 'note' && sym.beamGroup !== undefined && (sym.value === 'eighth' || sym.value === 'sixteenth');
    const tuplets = groupBy(pairs, (p) => p.sym.tuplet?.id).map(
      (g) =>
        new Tuplet(
          g.map((p) => p.note),
          // A beamed triplet shows just the 3; otherwise a bracket.
          { num_notes: 3, notes_occupied: 2, ratioed: false, bracketed: !g.every((p) => beamable(p.sym)) },
        ),
    );
    const voice = new Voice({ num_beats: meter.beatsPerBar, beat_value: 4 }).setMode(Voice.Mode.SOFT);
    voice.addTickables(notes);
    // Beams are made before drawing so the beamed notes drop their flags.
    const beams = groupBy(pairs, (p) => p.sym.beamGroup)
      .map((g) => g.filter((p) => beamable(p.sym)))
      .filter((g) => g.length >= 2)
      .map((g) => new Beam(g.map((p) => p.note)));

    new Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 12);
    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());
  });
  ties.forEach((t) => t.setContext(ctx).draw());

  const svg = host.querySelector('svg');
  if (!svg) return { width, height };
  paintSvg(svg, pal, colourById);
  if (cursorNote) addCursor(svg, cursorNote, pal.cursor);

  svg.removeAttribute('style');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  return { width, height };
}

/**
 * Gives every element an explicit fill and stroke from the palette. VexFlow writes black (or nothing, which
 * also renders black) for unstyled glyphs; those become ink, or the mark colour of the note they belong to.
 */
function paintSvg(svg: SVGSVGElement, pal: StaffPalette, colourById: Map<string, string>): void {
  const own = new Set([...colourById.values()].map((c) => c.toLowerCase()));
  const colourOf = (el: Element): string => {
    const g = el.closest('g.vf-stavenote');
    const id = g?.id.replace(/^vf-/, '');
    return (id && colourById.get(id)) || pal.ink;
  };
  // Paths without a fill or stroke (stems, ties) inherit these, so nothing falls back to black.
  svg.setAttribute('fill', pal.ink);
  svg.setAttribute('stroke', pal.ink);
  svg.querySelectorAll('*').forEach((el) => {
    const fill = (el.getAttribute('fill') ?? '').toLowerCase();
    if (fill !== 'none' && !own.has(fill)) el.setAttribute('fill', colourOf(el));
    const stroke = (el.getAttribute('stroke') ?? '').toLowerCase();
    if (stroke && stroke !== 'none' && !own.has(stroke)) {
      el.setAttribute('stroke', stroke === VF_STAFF_GRAY ? pal.staff : colourOf(el));
    }
  });
}

function addCursor(svg: SVGSVGElement, note: StaveNote, colour: string): void {
  const bb = note.getBoundingBox();
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('x', String(bb.getX() - CURSOR_PAD));
  r.setAttribute('y', String(bb.getY() - CURSOR_PAD));
  r.setAttribute('width', String(bb.getW() + CURSOR_PAD * 2));
  r.setAttribute('height', String(bb.getH() + CURSOR_PAD * 2));
  r.setAttribute('rx', '8');
  r.setAttribute('fill', colour);
  r.setAttribute('fill-opacity', '0.22');
  r.setAttribute('stroke', 'none');
  svg.insertBefore(r, svg.firstChild);
}
