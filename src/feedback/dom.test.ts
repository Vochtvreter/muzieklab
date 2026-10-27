// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIssue, type FeedbackReport } from '../../shared/feedback';
import { boxFrom, captureContext, describeElement, selectorFor, targetFor, TOOL_ATTR } from './dom';

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

  it('keeps the parts of its text apart, as it reads: a chapter row is not “1Pulse and meterBeat”', () => {
    // The row is a flex box, so each of its parts is laid out as a block; a hidden part reads as nothing.
    document.body.innerHTML = `<button class="chapter-row"><span style="display: block">1</span><span style="display: block"><b style="display: block">Pulse and
      meter</b><span style="display: block">Beat, <i>tempo</i></span></span><span style="display: none">Hidden</span><span style="display: inline-block">New</span></button>`;
    const row = document.querySelector('button')!;
    expect(describeElement(row)).toBe('button “1 Pulse and meter Beat, tempo New”');
    expect(targetFor(row).text).toBe('1 Pulse and meter Beat, tempo New');
    // As written: a heading shown in capitals keeps its own case.
    document.body.innerHTML = '<h2 style="text-transform: uppercase">Account</h2>';
    expect(describeElement(document.querySelector('h2')!)).toBe('heading “Account”');
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

  // jsdom has no layout: it keeps a scrollTop that is set, and reports the inline overflow and position.
  const PAGE = '<div class="shell-main" style="overflow-y: auto"><div class="page" style="overflow-y: auto"><div style="height: 2000px"></div>';
  const scrolled = (page: number, main: number): void => {
    document.querySelector('.page')!.scrollTop = page;
    document.querySelector('.shell-main')!.scrollTop = main;
  };

  it('records how far the page under the element is scrolled: the app scrolls in .page, not the window', () => {
    document.body.innerHTML = PAGE + '<p>Low</p></div></div>';
    const p = document.querySelector('p')!;
    expect(targetFor(p).scroll).toEqual({ x: 0, y: 0 });
    scrolled(757, 20);
    expect(targetFor(p).scroll).toEqual({ x: 0, y: 777 });
  });

  it('leaves out the scroll that does not move the element: the box a sticky part sticks in, all of it for a fixed one', () => {
    // A sticky side column (Settings on a wide screen) stays put while .page scrolls, but moves with .shell-main around
    // it; a list that scrolls inside it (Learn's side column) moves what is in it.
    document.body.innerHTML = PAGE + `<aside style="position: sticky; top: 0"><a>Sound</a>
      <div class="list" style="overflow-y: auto"><div style="height: 900px"></div><a>Last</a></div></aside>
      <div style="position: fixed"><b>Fixed</b><div class="sheet" style="overflow-y: auto"><i>In the sheet</i></div></div></div></div>`;
    scrolled(310, 20);
    document.querySelector('.list')!.scrollTop = 400;
    document.querySelector('.sheet')!.scrollTop = 30;
    const [sound, last] = document.querySelectorAll('a');
    expect(targetFor(sound).scroll).toEqual({ x: 0, y: 20 });
    expect(targetFor(document.querySelector('aside')!).scroll).toEqual({ x: 0, y: 20 });
    expect(targetFor(last).scroll).toEqual({ x: 0, y: 420 });
    expect(targetFor(document.querySelector('b')!).scroll).toEqual({ x: 0, y: 0 });
    expect(targetFor(document.querySelector('i')!).scroll).toEqual({ x: 0, y: 30 });
  });

  it('counts how far a sticky part moved with the page before it stuck: Setup’s side panel, under the screen header', () => {
    document.body.innerHTML = PAGE + '<aside style="position: sticky; top: 0"><button class="start-btn">Start</button></aside></div></div>';
    const page = document.querySelector<HTMLElement>('.page')!;
    // The panel starts 264 px down and sticks at 204 px: it moves with the first 60 px the page scrolls, then stays.
    const aside = document.querySelector('aside')!;
    aside.getBoundingClientRect = () => ({ x: 0, y: Math.max(264 - page.scrollTop, 204), width: 300, height: 80 }) as DOMRect;
    const start = document.querySelector('button')!;
    page.scrollTop = 354;
    expect(targetFor(start).scroll).toEqual({ x: 0, y: 60 });
    expect(page.scrollTop).toBe(354);
    page.scrollTop = 10;
    expect(targetFor(start).scroll).toEqual({ x: 0, y: 10 });
  });

  it('cuts long values in a copy outside the page, so a cut SVG path is never parsed (and logged) there', () => {
    document.body.innerHTML = `<svg><path d="${'M 1.5,2.5 L 3.5,4.5 '.repeat(20)}"/></svg>`;
    const set = vi.spyOn(Element.prototype, 'setAttribute');
    try {
      const html = targetFor(document.querySelector('svg')!).html;
      expect(html).toContain('…');
      expect(set).toHaveBeenCalled();
      expect(set.mock.contexts.some((n) => (n as Element).ownerDocument === document)).toBe(false);
    } finally {
      set.mockRestore();
    }
  });
});

describe('captureContext', () => {
  const token = 'Ab3_x-'.repeat(7) + 'Z';
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('leaves out an invite or new-password token: whoever has it can claim the account', () => {
    for (const kind of ['invite', 'reset']) {
      window.history.replaceState(null, '', `/#/${kind}/${token}`);
      const context = captureContext({ version: '0.19.1', route: `/${kind}/${token}`, themeSetting: 'system', locale: 'en', prefs: {} });
      expect(context.route).toBe(`/${kind}/:token`);
      expect(context.url).toBe(`${window.location.origin}/#/${kind}/:token`);
      const report: FeedbackReport = { kind: 'bug', title: '', description: 'x', context, target: targetFor(document.body) };
      const issue = buildIssue(report);
      expect(issue.title + issue.body).not.toContain(token);
    }
    window.history.replaceState(null, '', '/#/settings');
    expect(captureContext({ version: '0.19.1', route: '/settings', themeSetting: 'system', locale: 'en', prefs: {} })).toMatchObject({ route: '/settings', url: `${window.location.origin}/#/settings` });
  });
});

describe('boxFrom', () => {
  it('makes a box from two corners dragged in any direction', () => {
    expect(boxFrom({ x: 50, y: 10 }, { x: 20, y: 40 })).toEqual({ x: 20, y: 10, width: 30, height: 30 });
  });
});
