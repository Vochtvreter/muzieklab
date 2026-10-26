// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEMO_44, DEMO_BARS_44, DEMO_LESSON } from './demoFixtures';
import { getMeter } from '../core/api';
import { plainSyllable, type CountMark } from './counting';
import { parseBars } from './notationText';
import { drawStaff, missMarkPath, type StaffPalette } from './staffDraw';

const DARK: StaffPalette = { ink: '#e8eeed', staff: '#5d6a6b', hit: '#4cc38a', early: '#f0b429', miss: '#ff6b6b', cursor: '#8fbfc1' };
const PALETTE = new Set(Object.values(DARK));

function draw(opts: Partial<Parameters<typeof drawStaff>[1]> = {}) {
  const host = document.createElement('div');
  const size = drawStaff(host, { bars: DEMO_BARS_44, meter: DEMO_44, barsPerRow: 2, width: 342, palette: DARK, cursorSpace: false, ...opts });
  return { host, size, svg: host.querySelector('svg')! };
}

/** The numbers of a path, as [x, y] points (VexFlow writes M, L, C and Q commands: every number pairs up). */
const points = (p: Element): number[][] => {
  const n = (p.getAttribute('d')!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return n.flatMap((v, i) => (i % 2 ? [] : [[v, n[i + 1]]]));
};

/** The highest point drawn (the svg cuts off anything above 0). */
const topOf = (svg: SVGSVGElement): number =>
  Math.min(...[...svg.querySelectorAll('path')].flatMap((p) => points(p).map(([, y]) => y)), ...[...svg.querySelectorAll('rect')].map((r) => Number(r.getAttribute('y'))));

/** The final barline's thick bar (3 wide; a plain bar line is one thin bar). */
const finalBarlines = (svg: SVGSVGElement): number => [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('width') === '3').length;

/** Counts side by side whose words (13 px mono, 7.8 per letter) overlap, as "a/b". */
function touching(svg: SVGSVGElement): string[] {
  const counts = [...svg.querySelectorAll('.staff-counts text')].map((t) => ({ x: Number(t.getAttribute('x')), y: t.getAttribute('y'), text: t.textContent! }));
  return counts.flatMap((c, i) => {
    const a = counts[i - 1];
    return a && a.y === c.y && c.x - a.x < ((a.text.length + c.text.length) * 7.8) / 2 ? [`${a.text}/${c.text}`] : [];
  });
}

describe('drawStaff', () => {
  it('gives every glyph a fill and stroke from the palette (no black in dark mode)', () => {
    const { svg } = draw();
    expect(svg).toBeTruthy();
    for (const el of svg.querySelectorAll('*')) {
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (v && v !== 'none') expect(PALETTE.has(v), `${el.tagName} ${attr}=${v}`).toBe(true);
      }
    }
    expect(svg.getAttribute('fill')).toBe(DARK.ink);
    expect(svg.getAttribute('stroke')).toBe(DARK.ink);
  });

  it('sizes rows like the design boards', () => {
    expect(draw({ bars: DEMO_LESSON, cursorSpace: true }).size.height).toBe(174);
    expect(draw({ bars: DEMO_LESSON }).size.height).toBe(166);
    expect(draw({ bars: DEMO_LESSON, barsPerRow: 4, width: 1040, cursorSpace: true }).size.height).toBe(88);
  });

  it('draws smaller at a scale below 1, still filling the width (Play on a short phone)', () => {
    const { svg, size } = draw({ bars: DEMO_LESSON, cursorSpace: true, scale: 0.8, marks: { 5: 'miss' }, cursor: 2 });
    expect(size.height).toBe(139); // 174 × 0.8
    expect(svg.getAttribute('width')).toBe('342');
    expect(svg.getAttribute('height')).toBe('139');
    // Laid out 342 / 0.8 = 427.5 wide in the svg's own units, so the bars still span the whole width.
    expect(svg.getAttribute('viewBox')).toBe('0 0 427.5 174');
    // The cursor and the × are placed in those units too.
    const cursor = svg.querySelector('rect[data-cursor]')!;
    expect(Number(cursor.getAttribute('x'))).toBeGreaterThan(0);
    expect(svg.querySelectorAll('.staff-miss path')).toHaveLength(1);
    expect(draw({ bars: DEMO_LESSON, cursorSpace: true }).svg.getAttribute('viewBox')).toBe('0 0 342 174');
  });

  it('colours marked notes and draws the cursor behind the current note', () => {
    const { svg } = draw({ bars: DEMO_LESSON, marks: { 0: 'perfect', 1: 'good', 5: 'miss' }, cursor: 2, cursorSpace: true });
    const notes = [...svg.querySelectorAll('g.vf-stavenote')];
    expect(notes[0].getAttribute('fill')).toBe(DARK.hit);
    expect(notes[1].getAttribute('fill')).toBe(DARK.early);
    expect(notes[5].getAttribute('fill')).toBe(DARK.miss);
    expect(notes[2].getAttribute('fill')).toBe(DARK.ink);
    const first = svg.firstElementChild!;
    expect(first.tagName).toBe('rect');
    expect(first.getAttribute('fill')).toBe(DARK.cursor);
  });

  it('marks a missed note with a × under its head, like the lane (colour plus shape)', () => {
    expect(missMarkPath({ x: 100, y: 40 })).toBe('M96 53l8 8M104 53l-8 8');
    const { svg, size } = draw({ bars: DEMO_LESSON, marks: { 0: 'perfect', 1: 'good', 5: 'miss', 9: 'miss' }, cursor: 2, cursorSpace: true });
    const g = svg.querySelector('g.staff-miss')!;
    expect(g.getAttribute('stroke')).toBe(DARK.miss);
    expect(g.getAttribute('fill')).toBe('none');
    const starts = [...g.querySelectorAll('path')].map((p) => p.getAttribute('d')!.match(/^M([\d.]+) ([\d.]+)/)!.slice(1).map(Number));
    expect(starts).toHaveLength(2);
    // Under the note it belongs to: within its width, just below its head (the bottom of a stems-up note's box).
    [5, 9].forEach((onset, i) => {
      const box = size.onsets.get(onset)!;
      const [x, y] = starts[i];
      expect(x + 4).toBeGreaterThan(box.x);
      expect(x + 4).toBeLessThan(box.x + box.w);
      expect(y).toBeGreaterThan(box.y + box.h);
      expect(y + 8).toBeLessThan(size.height);
    });
    expect(draw({ bars: DEMO_LESSON, marks: { 0: 'good' } }).svg.querySelector('.staff-miss')).toBeNull();
  });

  it('gives a missed tied note one ×, on the note it starts on', () => {
    const { svg } = draw({ marks: { 10: 'miss' } }); // bar 3: q q~ q q
    expect(svg.querySelectorAll('.staff-miss path')).toHaveLength(1);
    expect([...svg.querySelectorAll('g.vf-stavenote')].filter((n) => n.getAttribute('fill') === DARK.miss)).toHaveLength(2);
  });

  it('draws ties, a tuplet and beams', () => {
    const { svg } = draw();
    expect(svg.querySelectorAll('.vf-stavetie').length).toBe(3); // one within a bar, one split across rows
    expect(svg.querySelectorAll('.vf-beam').length).toBeGreaterThanOrEqual(5);
  });

  it("keeps a triplet's 3 inside the drawing: Results and the Setup preview, and Play's windows", () => {
    const meter = getMeter('2/4');
    const triplet = parseBars(meter, ['[8t 8t 8t] q', 'q [8 8]']);
    // A staff without a cursor gets the room only when its first row has a triplet, so the others keep the board heights.
    expect(draw({ bars: parseBars(meter, ['[8 8] q']), meter, barsPerRow: 1, width: 310 }).size.height).toBe(80);
    expect(topOf(draw({ bars: triplet, meter, barsPerRow: 1, width: 310 }).svg)).toBeGreaterThanOrEqual(0);
    expect(topOf(draw({ bars: triplet, meter, barsPerRow: 2, width: 720 }).svg)).toBeGreaterThanOrEqual(0);
    // Play: above the cursor's room too, and on a window without a triplet of an exercise with one, so the height stays.
    const play = draw({ bars: triplet, meter, barsPerRow: 1, width: 342, cursorSpace: true, tupletSpace: true });
    expect(topOf(play.svg)).toBeGreaterThanOrEqual(0);
    expect(draw({ bars: parseBars(meter, ['q q', 'h']), meter, barsPerRow: 1, width: 342, cursorSpace: true, tupletSpace: true }).size.height).toBe(play.size.height);
    expect(draw({ bars: DEMO_LESSON, cursorSpace: true }).size.height).toBe(174);
  });

  it('ends with the final barline only where the piece ends, not after a window of Play', () => {
    const piece = draw({ bars: DEMO_LESSON }).svg;
    expect(finalBarlines(piece)).toBe(1);
    expect(finalBarlines(draw({ bars: DEMO_LESSON, cursorSpace: true, end: true }).svg)).toBe(1);
    const window = draw({ bars: DEMO_LESSON, cursorSpace: true, end: false }).svg;
    expect(finalBarlines(window)).toBe(0);
    // A plain bar line still closes its last bar: the final barline's thin bar without the thick one.
    expect(window.querySelectorAll('rect[width="1"]')).toHaveLength(piece.querySelectorAll('rect[width="1"]').length);
  });

  it('draws a Learn staff smaller when its counts or notes do not fit: a 320 px phone (248 px staff), Dutch at 375 px', () => {
    const dutch = (m: CountMark): string => (m.part === 'and' ? 'en' : plainSyllable(m));
    const meter = getMeter('4/4');
    const examples = [['h. q', 'q. 8 h'], ['[8t 8t 8t] q [8t 8t 8t] q'], ['hr q q', 'q qr qr q'], ['q q q q~', 'q q h'], ['[8. 16] [8. 16] q q']];
    for (const [text, width] of [[plainSyllable, 248], [dutch, 248], [dutch, 303], [dutch, 318]] as const) {
      for (const src of examples) {
        const { svg } = draw({ bars: parseBars(meter, src), meter, barsPerRow: 2, width, counts: { text, held: DARK.staff }, shrinkToFit: true });
        expect(touching(svg), `${src.join(' | ')} at ${width}`).toEqual([]);
      }
    }
    // Where they fit, nothing changes: English at 390 px (318) is drawn as on the boards.
    for (const src of examples) {
      const { svg } = draw({ bars: parseBars(meter, src), meter, barsPerRow: 2, width: 318, counts: { text: plainSyllable, held: DARK.staff }, shrinkToFit: true });
      expect(svg.getAttribute('viewBox'), src.join(' | ')).toMatch(/^0 0 318 /);
    }
    // A held count shares the room by how wide its neighbours' words are, so the staff is drawn only a little smaller:
    // Dutch 5.2 at 390 px ("(2)" next to "en"), and 3.2's "(2)(3)" on a 320 px phone.
    const scaleOf = (src: string[], text: (m: CountMark) => string, width: number): number => {
      const { svg } = draw({ bars: parseBars(meter, src), meter, barsPerRow: 2, width, counts: { text, held: DARK.staff }, shrinkToFit: true });
      return width / Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    };
    expect(scaleOf(['h. q', 'q. 8 h'], dutch, 318)).toBeGreaterThan(0.95);
    expect(scaleOf(['hr q q', 'q qr qr q'], plainSyllable, 248)).toBeGreaterThan(0.9);
    // The note tree's bar of sixteenths (notes and rests): the last one ends before the final bar line.
    for (const src of [Array(4).fill('[16 16 16 16]').join(' '), Array(16).fill('16r').join(' ')]) {
      const { svg } = draw({ bars: parseBars(meter, [src]), meter, barsPerRow: 1, width: 248, shrinkToFit: true });
      const notes = svg.querySelectorAll('g.vf-stavenote');
      const right = Math.max(...[...notes[notes.length - 1].querySelectorAll('path')].flatMap((p) => points(p).map(([x]) => x)));
      const bar = Math.max(...[...svg.querySelectorAll('rect[width="1"]')].map((r) => Number(r.getAttribute('x'))));
      expect(right, src.slice(0, 3)).toBeLessThan(bar);
    }
  });

  it('writes the counts under the notes, held and silent ones grey, in a taller row', () => {
    const meter = getMeter('4/4');
    const bars = parseBars(meter, ['q. 8 h', 'qr [8 8] h']);
    const plain = draw({ bars, meter });
    const counted = draw({ bars, meter, counts: { text: plainSyllable, held: DARK.staff } });
    expect(counted.size.height).toBeGreaterThan(plain.size.height);
    const texts = [...counted.svg.querySelectorAll('.staff-counts text')];
    expect(texts.map((t) => t.textContent)).toEqual(['1', '(2)', '&', '3', '(4)', '(1)', '2', '&', '3', '(4)']);
    expect(texts.map((t) => t.getAttribute('fill'))).toEqual([DARK.ink, DARK.staff, DARK.ink, DARK.ink, DARK.staff, DARK.staff, DARK.ink, DARK.ink, DARK.ink, DARK.staff]);
    const xs = texts.slice(0, 5).map((t) => Number(t.getAttribute('x')));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});
