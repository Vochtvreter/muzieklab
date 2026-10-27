// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { boxFrom, describeElement, selectorFor, targetFor, TOOL_ATTR } from './dom';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('selectorFor', () => {
  it('walks up from the element, with lasting classes and the position among same-tag siblings', () => {
    document.body.innerHTML = `
      <main class="frame"><div class="frame-column">
        <p>One</p><p class="hint is-on m-in">Two</p>
        <button class="btn btn--accent start-btn">Start</button>
      </div></main>`;
    const p = document.querySelectorAll('p')[1];
    const sel = selectorFor(p);
    expect(sel).toBe('main.frame > div.frame-column > p.hint:nth-of-type(2)');
    expect(document.querySelector(sel)).toBe(p);
    const btn = document.querySelector('button')!;
    expect(document.querySelector(selectorFor(btn))).toBe(btn);
  });

  it('starts from the nearest id', () => {
    document.body.innerHTML = '<div id="root"><section><h2>Title</h2></section></div>';
    expect(selectorFor(document.querySelector('h2')!)).toBe('#root > section > h2');
  });
});

describe('describeElement', () => {
  it('names the element by its role and accessible name, else its text or tag', () => {
    document.body.innerHTML = `
      <button aria-label="Tap pad"><span>Tap</span></button>
      <h1 class="page-title">Settings</h1>
      <div class="card is-on"></div>
      <div role="img" aria-label="Counting beat 1"></div>`;
    const [btn, h1, div, img] = [...document.body.children];
    expect(describeElement(btn)).toBe('button “Tap pad”');
    expect(describeElement(h1)).toBe('heading “Settings”');
    expect(describeElement(div)).toBe('div.card');
    expect(describeElement(img)).toBe('img “Counting beat 1”');
  });
});

describe('targetFor', () => {
  it('records the element, or the drawn box with the element under it, without the tool’s own markup', () => {
    document.body.innerHTML = `<div class="card">Hello <span ${TOOL_ATTR}>tool</span><b title="${'t'.repeat(200)}">x</b></div>`;
    const card = document.querySelector('.card')!;
    const el = targetFor(card);
    expect(el.mode).toBe('element');
    expect(el.html).not.toContain('tool</span>');
    expect(el.html).toContain('…');
    expect(el.html.length).toBeLessThan(200);
    const area = targetFor(card, { x: 10, y: 20, width: 100, height: 50 });
    expect(area.mode).toBe('area');
    expect(area.rect).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });
});

describe('boxFrom', () => {
  it('makes a box from two corners dragged in any direction', () => {
    expect(boxFrom({ x: 50, y: 10 }, { x: 20, y: 40 })).toEqual({ x: 20, y: 10, width: 30, height: 30 });
  });
});
