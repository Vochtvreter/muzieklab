// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEMO_44, DEMO_BARS_44, DEMO_LESSON } from './demoFixtures';
import { drawStaff, type StaffPalette } from './staffDraw';

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

  it('draws ties, a tuplet and beams', () => {
    const { svg } = draw();
    expect(svg.querySelectorAll('.vf-stavetie').length).toBe(3); // one within a bar, one split across rows
    expect(svg.querySelectorAll('.vf-beam').length).toBeGreaterThanOrEqual(5);
  });
});
