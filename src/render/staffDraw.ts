import { Beam, Barline, Dot, Formatter, GhostNote, Renderer, Stave, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow/bravura';
import type { Meter, NotatedBar, NotatedSymbol, NoteValue } from '../core/types';
import { countBar, countText, type CountMark } from './counting';

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
  /** The time signature as drawn, when not the meter's numbers: 'C' for common time. */
  timeSig?: string;
  /** Counting under the notes (Learn): the word for each count, and the colour of held and silent counts. */
  counts?: { text(mark: CountMark): string; held: string };
  /**
   * Size of the notation (default 1). Below 1 the bars are laid out wider and the drawing is shown at `width`, so the
   * notes are smaller and the rows lower while the bars still fill the width (Play on a short phone).
   */
  scale?: number;
}

// Layout constants from the design's notation images (vf/render2.js).
const ROW_H = 86;
const TS_EXTRA = 34; // extra width of the first bar of every row (time signature room, keeps bar lines aligned)
const CURSOR_TOP = 8;
const CURSOR_PAD = 7;
const VF_STAFF_GRAY = '#999999';
const COUNT_H = 18; // extra row height for the counts under the notes
const COUNT_Y = 36; // baseline of the counts below the staff line
const COUNT_TOP = 12;
const COUNT_GAP = 24; // least room between a held count and the counts beside it
const MISS_DY = 17; // a missed note's × sits this far below its head: clear of ties and the cursor, inside the row

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
/** Where a note is drawn, in the svg's coordinates. */
export interface NoteBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawnStaff {
  width: number;
  height: number;
  /** Each onset's note box, so the play cursor can move without drawing the staff again (placeCursor). */
  onsets: Map<number, NoteBox>;
}

export function drawStaff(host: HTMLElement, o: DrawStaffOptions): DrawnStaff {
  const { bars, meter, palette: pal, width } = o;
  const onsets = new Map<number, NoteBox>();
  host.innerHTML = '';
  if (bars.length === 0 || width <= 0) return { width, height: 0, onsets };

  const per = Math.max(1, Math.min(o.barsPerRow, bars.length));
  const rows = Math.ceil(bars.length / per);
  // Learn staves (with counts) keep room above for a triplet's 3.
  const top = o.cursorSpace ? CURSOR_TOP : o.counts ? COUNT_TOP : 0;
  const rowH = ROW_H + (o.counts ? COUNT_H : 0);
  // Drawn in the svg's own units (`layoutW` × `height`), shown `scale` times that size.
  const scale = o.scale ?? 1;
  const layoutW = width / scale;
  const height = rows * rowH + top - 6;

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(layoutW, height);
  const ctx = renderer.getContext();

  const barW = (layoutW - TS_EXTRA - 2) / per;
  const colourById = new Map<string, string>(); // VexFlow note id -> mark colour
  let cursorNote: StaveNote | null = null;
  const onsetNotes: [number, StaveNote][] = [];
  let tieFrom: { note: StaveNote; row: number } | null = null;
  let colourOnset = -1; // onset index whose colour tied continuations inherit
  const ties: StaveTie[] = [];
  const counts: { x: number; y: number; text: string; held: boolean }[] = [];
  const missed: StaveNote[] = []; // the note that starts each missed onset (a tied continuation gets no second ×)

  bars.forEach((bar, i) => {
    const row = Math.floor(i / per);
    const col = i % per;
    const x = col === 0 ? 0 : TS_EXTRA + barW * col;
    const w = col === 0 ? barW + TS_EXTRA : barW;
    const stave = new Stave(x, top + row * rowH, w, { space_above_staff_ln: 2, space_below_staff_ln: 2 });
    stave.setConfigForLines([0, 1, 2, 3, 4].map((l) => ({ visible: l === 2 })));
    if (i === 0) stave.addTimeSignature(o.timeSig ?? meter.id);
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
        if (sym.onsetIndex >= 0) onsetNotes.push([sym.onsetIndex, note]);
        if (sym.onsetIndex >= 0 && o.marks?.[sym.onsetIndex] === 'miss') missed.push(note);
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
    // With counts, an invisible sixteenth closes the bar, so the last note leaves room for its held counts.
    const close = o.counts ? new GhostNote({ duration: '16' }) : null;
    if (close) voice.addTickables([close]);
    // Beams are made before drawing so the beamed notes drop their flags.
    const beams = groupBy(pairs, (p) => p.sym.beamGroup)
      .map((g) => g.filter((p) => beamable(p.sym)))
      .filter((g) => g.length >= 2)
      .map((g) => new Beam(g.map((p) => p.note)));

    new Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 12);
    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());
    if (o.counts) counts.push(...placeCounts(bar, meter, notes, stave.getX() + stave.getWidth() - 14, stave, o.counts.text));
  });
  ties.forEach((t) => t.setContext(ctx).draw());

  for (const [i, note] of onsetNotes) onsets.set(i, boxOf(note));
  const shownH = Math.round(height * scale);
  const svg = host.querySelector('svg');
  if (!svg) return { width, height: shownH, onsets };
  paintSvg(svg, pal, colourById);
  if (missed.length) addMissMarks(svg, missed.map((n) => ({ x: centreX(n), y: n.getYs()[0] })), pal.miss);
  if (cursorNote) placeCursor(host, boxOf(cursorNote), pal.cursor);
  if (o.counts) addCounts(svg, counts, pal.ink, o.counts.held);

  svg.removeAttribute('style');
  svg.setAttribute('viewBox', `0 0 ${layoutW} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(shownH));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  return { width, height: shownH, onsets };
}

/**
 * Gives every element an explicit fill and stroke from the palette. VexFlow writes black (or nothing, which
 * also renders black) for unstyled glyphs; those become ink, or the mark colour of the note they belong to.
 */
export function paintSvg(svg: SVGSVGElement, pal: StaffPalette, colourById: Map<string, string>): void {
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

/** Centre of a note head or rest. */
const centreX = (note: StaveNote): number => (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;

/**
 * Where each count of a bar goes: under the symbol it starts on, or, for a count inside a symbol (a held beat, the
 * beats of a whole-bar rest), as far along towards the next symbol, or the end of the bar, as it is in time.
 */
function placeCounts(bar: NotatedBar, meter: Meter, notes: StaveNote[], end: number, stave: Stave, text: (m: CountMark) => string) {
  const y = stave.getYForLine(2) + COUNT_Y;
  const syms = bar.symbols;
  const marks = countBar(meter, syms);
  const texts = countText(marks, text);
  const xs = marks.map((m) => {
    const s = syms[m.symbol];
    const x0 = s.wholeBarRest ? stave.getNoteStartX() + 14 : centreX(notes[m.symbol]);
    const x1 = m.symbol + 1 < syms.length ? centreX(notes[m.symbol + 1]) : end;
    return s.start === m.tick && !s.wholeBarRest ? x0 : x0 + ((x1 - x0) * (m.tick - s.start)) / s.duration;
  });
  // VexFlow spacing is not proportional to time: keep a held count clear of its neighbours, between them.
  marks.forEach((m, i) => {
    if (!m.held || i === 0) return;
    const lo = xs[i - 1];
    const hi = i + 1 < xs.length ? xs[i + 1] : end;
    const gap = Math.min(COUNT_GAP, (hi - lo) / 2);
    xs[i] = Math.max(lo + gap, Math.min(xs[i], hi - gap));
  });
  return marks.map((m, i) => ({ x: xs[i], y, held: m.held, text: texts[i] }));
}

function addCounts(svg: SVGSVGElement, counts: { x: number; y: number; text: string; held: boolean }[], ink: string, held: string): void {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'staff-counts');
  g.setAttribute('stroke', 'none');
  for (const c of counts) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', c.x.toFixed(1));
    el.setAttribute('y', c.y.toFixed(1));
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('fill', c.held ? held : ink);
    el.textContent = c.text;
    g.appendChild(el);
  }
  svg.appendChild(g);
}

/**
 * The × under a missed note's head (colour plus shape, DESIGN.md §9), drawn like the lane's miss marks (LengthLane):
 * 8 px across. Below the head because the stems go up: above are the beams, tuplet numbers and the play cursor.
 */
export function missMarkPath(head: { x: number; y: number }): string {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const y = head.y + MISS_DY;
  return `M${r(head.x - 4)} ${r(y - 4)}l8 8M${r(head.x + 4)} ${r(y - 4)}l-8 8`;
}

function addMissMarks(svg: SVGSVGElement, heads: { x: number; y: number }[], colour: string): void {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'staff-miss');
  g.setAttribute('fill', 'none');
  g.setAttribute('stroke', colour);
  g.setAttribute('stroke-width', '2');
  g.setAttribute('stroke-linecap', 'round');
  for (const h of heads) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', missMarkPath(h));
    g.appendChild(p);
  }
  svg.appendChild(g);
}

function boxOf(note: StaveNote): NoteBox {
  const bb = note.getBoundingBox();
  return { x: bb.getX(), y: bb.getY(), w: bb.getW(), h: bb.getH() };
}

/**
 * The play cursor: a soft slate box behind the note (the svg's first child, so it never covers notation). Moving it
 * only swaps this box, so the staff is not drawn again for every note. A null box removes it.
 */
export function placeCursor(host: HTMLElement, box: NoteBox | null, colour: string): void {
  const svg = host.querySelector('svg');
  if (!svg) return;
  svg.querySelector('rect[data-cursor]')?.remove();
  if (!box) return;
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('data-cursor', '');
  r.setAttribute('x', String(box.x - CURSOR_PAD));
  r.setAttribute('y', String(box.y - CURSOR_PAD));
  r.setAttribute('width', String(box.w + CURSOR_PAD * 2));
  r.setAttribute('height', String(box.h + CURSOR_PAD * 2));
  r.setAttribute('rx', '8');
  r.setAttribute('fill', colour);
  r.setAttribute('fill-opacity', '0.22');
  r.setAttribute('stroke', 'none');
  svg.insertBefore(r, svg.firstChild);
}
