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
