// Text fields are outlined with --field-line (tokens.css): WCAG 1.4.11 asks 3:1 for the edge that shows where a field
// is, against what is on both sides of it. Fields sit on cards (--paper) and on the page (--ground: the accounts
// search), and a read-only field is filled with --ground, so the line needs 3:1 against both, in light and in dark.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (name: string): string => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
const tokens = css('tokens.css');

/**
 * The declarations of the first block that starts with `selector {` (the token blocks have no nested braces), without
 * its comments, which name tokens too ("Green text uses --good-ink: …").
 */
function block(selector: string): Record<string, string> {
  const start = tokens.indexOf(selector + ' {');
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = tokens.slice(start, tokens.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//g, '');
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const light = block(':root');
const themes: [string, Record<string, string>][] = [
  ['light', light],
  ['dark (system)', { ...light, ...block(":root:not([data-theme='light'])") }],
  ['dark (chosen)', { ...light, ...block(":root[data-theme='dark']") }],
];

describe('text field borders', () => {
  for (const [name, t] of themes) {
    it(`${name}: --field-line is 3:1 or more against the card and the page`, () => {
      expect(t['--field-line']).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(t['--field-line'], t['--paper'])).toBeGreaterThanOrEqual(3);
      expect(contrast(t['--field-line'], t['--ground'])).toBeGreaterThanOrEqual(3);
    });
  }

  it('every text field (and the search and date fields, which are text fields) is outlined with it', () => {
    const rule = /\.tfield-input\s*\{([^}]*)\}/.exec(css('account.css'))?.[1] ?? '';
    expect(rule).toMatch(/border:\s*1\.5px solid var\(--field-line\)/);
  });
});

// The status pills (account.css: an account's status, how a deleted account went, where a feedback report stands) are
// small bold text on a soft fill: 4.5:1 or more (WCAG 1.4.3), in light and in dark.
describe('status pills', () => {
  const pills = [...css('account.css').matchAll(/\.status-pill\.is-([\w-]+)\s*\{\s*background:\s*var\((--[\w-]+)\);\s*color:\s*var\((--[\w-]+)\);/g)].map((m) => ({
    name: m[1],
    fill: m[2],
    ink: m[3],
  }));

  it('finds every pill, the feedback statuses too', () => {
    expect(pills.map((p) => p.name)).toEqual(expect.arrayContaining(['invited', 'active', 'blocked', 'new', 'accepted', 'declined']));
  });

  for (const [name, t] of themes) {
    it(`${name}: each pill's words are 4.5:1 or more against its fill`, () => {
      for (const p of pills) expect(contrast(t[p.ink], t[p.fill]), p.name).toBeGreaterThanOrEqual(4.5);
    });
  }
});

/**
 * A declaration of a rule in a stylesheet, the last one that sets it for exactly this selector (alone or in a list),
 * outside @media blocks.
 */
function declared(sheet: string, selector: string, prop: string): string | undefined {
  const flat = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  let value: string | undefined;
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').some((s) => s.trim() === selector)) continue;
    const d = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+);`).exec(m[2]);
    if (d) value = d[1].trim();
  }
  return value;
}
/** The token a declaration names (`var(--good)`), or a colour written out, which does not follow the theme. */
const tokenOf = (value: string | undefined): string => /^var\((--[\w-]+)\)$/.exec(value ?? '')?.[1] ?? `not a token: ${value}`;
/** Text drawn at `alpha` over `fill`, as one colour. */
function blend(ink: string, fill: string, alpha: number): string {
  const ch = (hex: string, i: number): number => parseInt(hex.slice(i, i + 2), 16);
  return '#' + [1, 3, 5].map((i) => Math.round(alpha * ch(ink, i) + (1 - alpha) * ch(fill, i)).toString(16).padStart(2, '0')).join('');
}

// Read notes' answer marks (notes.css): a black piano key turns green or red, and its label (C♯ D♭, 11 px bold) must
// still read, 4.5:1 or more. Its fill is --good or --miss, which turn light in dark, so the label is --on-fill, the ink
// for filled accents. (In light, white on --good is the 4.3:1 tokens.css notes.)
describe('the marked black piano keys', () => {
  const notes = css('notes.css');
  for (const mark of ['right', 'wrong']) {
    const fill = tokenOf(declared(notes, `.piano-black.is-${mark}`, 'background'));
    const ink = tokenOf(declared(notes, `.piano-black.is-${mark}`, 'color'));
    for (const [name, t] of themes.slice(1)) {
      it(`${name}: the label on the ${mark} key is 4.5:1 or more against its fill`, () => {
        expect(fill).toMatch(/^--[\w-]+$/);
        expect(ink, 'the label follows the theme').toMatch(/^--[\w-]+$/);
        expect(contrast(t[ink], t[fill])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

// The small letter (or do re mi) under a Read notes name button (.name-sub, 11 px) is drawn faded. On a button marked
// right or wrong it is in the mark's ink on the mark's soft fill, and must still be 4.5:1 or more, as it is unmarked.
describe('the small name under a name button', () => {
  const notes = css('notes.css');
  const faded = Number(declared(notes, '.name-sub', 'opacity') ?? 1);
  const marks = [
    { name: 'unmarked', selector: '.name-sub', ink: tokenOf(declared(notes, '.name-btn', 'color')), fill: tokenOf(declared(notes, '.name-btn', 'background')) },
    { name: 'right', selector: '.name-btn.is-right .name-sub', ink: tokenOf(declared(notes, '.name-btn.is-right', 'color')), fill: tokenOf(declared(notes, '.name-btn.is-right', 'background')) },
    { name: 'wrong', selector: '.name-btn.is-wrong .name-sub', ink: tokenOf(declared(notes, '.name-btn.is-wrong', 'color')), fill: tokenOf(declared(notes, '.name-btn.is-wrong', 'background')) },
  ];
  for (const [name, t] of themes) {
    it(`${name}: 4.5:1 or more on an unmarked, a right and a wrong button`, () => {
      for (const m of marks) {
        const alpha = Number(declared(notes, m.selector, 'opacity') ?? faded);
        expect(contrast(blend(t[m.ink], t[m.fill], alpha), t[m.fill]), m.name).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

// Scales' degree row (scales.css): the W and H between the boxes (11–12 px bold), still to come, passed (W) and passed
// in gold (H, and the step and a half), are the step pattern the setup's Show the steps promises, and the degree
// number in each box (9.5–10.5 px bold) is drawn in the box's ink. Both must read, 4.5:1 or more: the steps on the
// phone's page (--ground) and in the tablet and desktop cards (--paper), each number on its box's fill. A W passed and
// one still to come must also tell apart, 1.5:1 or more between them (gold sets a passed H apart by its hue).
describe('the scale degree row', () => {
  const scales = css('scales.css');
  const steps = ['.degree-step', '.degree-step.is-known', '.degree-step.is-H', '.degree-step.is-WH'].map((selector) => ({ selector, ink: tokenOf(declared(scales, selector, 'color')) }));
  const faded = Number(declared(scales, '.degree-n', 'opacity') ?? 1);
  const boxes = ['.degree', '.degree.is-done', '.degree.is-current'].map((selector) => ({
    selector,
    ink: tokenOf(declared(scales, selector, 'color')),
    fill: tokenOf(declared(scales, selector, 'background')),
  }));
  for (const [name, t] of themes) {
    it(`${name}: the steps are 4.5:1 or more on the page and on a card`, () => {
      for (const s of steps) {
        expect(contrast(t[s.ink], t['--ground']), s.selector + ' on the page').toBeGreaterThanOrEqual(4.5);
        expect(contrast(t[s.ink], t['--paper']), s.selector + ' on a card').toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name}: a step passed and one still to come tell apart`, () => {
      expect(contrast(t[steps[1].ink], t[steps[0].ink]), '.degree-step.is-known against .degree-step').toBeGreaterThanOrEqual(1.5);
    });
    it(`${name}: the degree numbers are 4.5:1 or more on each box`, () => {
      for (const b of boxes) expect(contrast(blend(t[b.ink], t[b.fill], faded), t[b.fill]), b.selector).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// The total beside a score ("2 / 3" over Read notes' staff on a phone and a tablet, as on the desktop's Correct card;
// "1 / 1" on Scales' Round done; the "0 →" before a new count on its circle card) is text the player reads, 20–46 px:
// 4.5:1 or more on the page and on a card, in light and dark. --faint (2.7:1 on the page in light) is too pale.
describe('the total beside a score', () => {
  const totals = [
    { selector: '.tone-muted', ink: tokenOf(declared(css('app.css'), '.tone-muted', 'color')) },
    { selector: '.sdone-of', ink: tokenOf(declared(css('scales.css'), '.sdone-of', 'color')) },
  ];
  for (const [name, t] of themes) {
    it(`${name}: 4.5:1 or more on the page and on a card`, () => {
      for (const x of totals) {
        expect(x.ink, x.selector).toMatch(/^--[\w-]+$/);
        expect(contrast(t[x.ink], t['--ground']), x.selector + ' on the page').toBeGreaterThanOrEqual(4.5);
        expect(contrast(t[x.ink], t['--paper']), x.selector + ' on a card').toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
