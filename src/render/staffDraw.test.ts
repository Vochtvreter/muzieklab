// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEMO_44, DEMO_BARS_44, DEMO_LESSON } from './demoFixtures';
import { getMeter } from '../core/api';
import { plainSyllable } from './counting';
import { parseBars } from './notationText';
import { drawStaff, missMarkPath, type StaffPalette } from './staffDraw';

const DARK: StaffPalette = { ink: '#e8eeed', staff: '#5d6a6b', hit: '#4cc38a', early: '#f0b429', miss: '#ff6b6b', cursor: '#8fbfc1' };
const PALETTE = new Set(Object.values(DARK));

function draw(opts: Partial<Parameters<typeof drawStaff>[1]> = {}) {
  const host = document.createElement('div');
  const size = drawStaff(host, { bars: DEMO_BARS_44, meter: DEMO_44, barsPerRow: 2, width: 342, palette: DARK, cursorSpace: false, ...opts });
  return { host, size, svg: host.querySelector('svg')! };
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
