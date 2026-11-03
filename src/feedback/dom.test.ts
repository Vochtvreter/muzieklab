// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIssue, type FeedbackReport } from '../../shared/feedback';
import { boxFrom, captureContext, describeElement, markableParts, partAt, selectorFor, targetFor, TOOL_ATTR } from './dom';

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

  it('names a field by its label, not its class', () => {
    document.body.innerHTML = `
      <label for="pw">New password</label><input id="pw" class="tfield-input" type="password">
      <span id="cap">Message to send</span><textarea class="tfield-input" aria-labelledby="cap"></textarea>`;
    expect(describeElement(document.querySelector('input')!)).toBe('field “New password”');
    expect(describeElement(document.querySelector('textarea')!)).toBe('field “Message to send”');
  });

  it('says the role in the language shown when asked to; the report keeps it in English', () => {
    document.body.innerHTML = '<button aria-label="Tap pad"><span>Tap</span></button>';
    const btn = document.querySelector('button')!;
    const dutch = (role: string): string => ({ button: 'knop' })[role] ?? role;
    expect(describeElement(btn, dutch)).toBe('knop “Tap pad”');
    expect(targetFor(btn).label).toBe('button “Tap pad”');
  });
});

describe('partAt', () => {
  afterEach(() => {
    // jsdom has none of its own: each test stands one in.
    delete (document as Partial<Document>).elementsFromPoint;
  });

  it('marks the control or picture a tap lands in, as the keyboard picks it: not its icon or a word in it', () => {
    document.body.innerHTML = `
      <nav><a href="#/"><span class="nav-pill"><svg><path d="M0 0"/></svg></span>Home</a></nav>
      <button class="clef-btn"><span class="clef-text" style="display: block"><b style="display: block">Bass</b><span style="display: block">F clef</span></span></button>
      <div class="card"><svg class="staff"><g><path d="M1 1"/></g></svg><p>Below</p></div>
      <div role="slider" tabindex="0" aria-label="Where mi goes"><div aria-hidden="true"><svg class="staff"><path d="M2 2"/></svg></div></div>`;
    const at = (el: Element): string => {
      const up: Element[] = [];
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) up.push(n);
      document.elementsFromPoint = () => [...up, document.body, document.documentElement];
      return describeElement(partAt(0, 0)!);
    };
    expect(at(document.querySelector('a path')!)).toBe('link “Home”');
    expect(at(document.querySelector('b')!)).toBe('button “Bass F clef”');
    expect(at(document.querySelector('.card .staff path')!)).toBe('drawing (svg.staff)');
    // A custom control around a picture: the slider, as the keyboard picks it, not the staff it draws.
    expect(at(document.querySelector('[role="slider"] path')!)).toBe('slider “Where mi goes”');
    // Outside any control or picture, the element itself.
    expect(at(document.querySelector('p')!)).toBe('text “Below”');
  });

  it('marks the field a tap on its label is for, named by that label, as the keyboard picks it', () => {
    document.body.innerHTML = `
      <div class="tfield"><label for="pw" class="tfield-label">New password</label><input id="pw" type="password"></div>
      <div><label for="language"><b>Language</b></label><select id="language"><option>English</option></select></div>
      <div><label for="gone">Gone</label><input id="gone" style="visibility: hidden"></div>`;
    const at = (el: Element): string => {
      const up: Element[] = [];
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) up.push(n);
      document.elementsFromPoint = () => [...up, document.body, document.documentElement];
      return describeElement(partAt(0, 0)!);
    };
    // jsdom lays nothing out and has no checkVisibility: every element gets a box.
    const rects = vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList);
    try {
      expect(at(document.querySelector('label[for="pw"]')!)).toBe('field “New password”');
      expect(at(document.querySelector('label[for="language"] b')!)).toBe('list “Language”');
      // A field that is not shown: its label, which is what can be seen there.
      expect(at(document.querySelector('label[for="gone"]')!)).toBe('label “Gone”');
    } finally {
      rects.mockRestore();
    }
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

  it('leaves out what was typed in a field: React keeps it in the value attribute, a password too', () => {
    document.body.innerHTML = `<form class="card-pad">
      <input type="email" name="username" hidden value="me@example.com">
      <label for="cur">Current password</label><input id="cur" type="password" value="pw-secret-1">
      <label for="new">New password</label><input id="new" type="text" value="pw-secret-2">
      <label for="why">Why?</label><textarea id="why">typed-reason</textarea>
      <button>Change password</button></form>`;
    const form = document.querySelector('form')!;
    for (const el of [form, ...form.querySelectorAll('input, textarea')]) {
      const tg = targetFor(el);
      expect(JSON.stringify(tg)).not.toMatch(/pw-secret|me@example\.com|typed-reason/);
    }
    expect(targetFor(form).html).toContain('Change password');
    expect(targetFor(document.getElementById('new')!).label).toBe('field “New password”');
    // Only in the report's copy: the page keeps what was typed.
    expect(document.getElementById('cur')!.getAttribute('value')).toBe('pw-secret-1');
    expect(document.querySelector('textarea')!.value).toBe('typed-reason');
  });

  it('leaves out an invite or new-password token in the marked part’s name, text and markup, also where it is cut', () => {
    const token = 'Ab3_x-'.repeat(7) + 'Z';
    const link = (kind: string): string => `https://test.vivanova.app/#/${kind}/${token}`;
    document.body.innerHTML = `<div class="link-result">
      <p title="${link('reset')}">Hi Ann, here's a link to choose a new password: ${link('reset')} — it works until Friday.</p>
      <a href="#/invite/${token}">Open ${link('invite')}</a>
      <p class="long">${'x'.repeat(240)} ${link('invite')}</p></div>`;
    const context = captureContext({ version: '0.19.1', route: '/admin/invite', themeSetting: 'system', locale: 'en', prefs: {} });
    for (const el of [document.querySelector('.link-result')!, ...document.querySelectorAll('p, a')]) {
      const tg = targetFor(el);
      const issue = buildIssue({ kind: 'bug', title: '', description: 'x', target: tg, context });
      // Not a part of it either: a cut keeps the start of the token.
      for (const part of [JSON.stringify(tg), issue.title + issue.body]) expect(part).not.toContain(token.slice(0, 12));
    }
    expect(targetFor(document.querySelector('p')!).text).toContain('#/reset/:token — it works until Friday.');
    expect(targetFor(document.querySelector('a')!).html).toContain('href="#/invite/:token"');
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

describe('markableParts', () => {
  const page = `
    <main>
      <h1>C major</h1>
      <div class="splay-tools">
        <button style="visibility: hidden">Hear it so far</button>
        <button>Start over</button>
      </div>
      <div style="opacity: 0"><button>Next scale</button></div>
      <button><svg></svg>Skip to summary</button>
      <div role="slider" tabindex="0" aria-label="Where mi goes"><svg><text>mi</text></svg></div>
    </main>
    <div ${TOOL_ATTR}><button>Cancel</button></div>`;
  const names = (): (string | null)[] => markableParts().map((el) => el.textContent);

  it('leaves out a part waiting hidden in its place (visibility: hidden), the tool’s own, and what is inside a control', () => {
    document.body.innerHTML = page;
    // jsdom lays nothing out and has no checkVisibility: every element gets a box.
    const rects = vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList);
    try {
      // The slider, not the staff it draws: a tap on the staff marks the slider too (partAt).
      expect(names()).toEqual(['C major', 'Start over', 'Next scale', 'Skip to summary', 'mi']);
    } finally {
      rects.mockRestore();
    }
  });

  it('asks a browser’s checkVisibility to look at visibility and opacity too, not only at display', () => {
    document.body.innerHTML = page;
    const proto = Element.prototype as Element & { checkVisibility?: (o?: CheckVisibilityOptions) => boolean };
    const had = proto.checkVisibility;
    // As a browser answers: a box with visibility: hidden or opacity 0, or one inside it, only when asked to look.
    proto.checkVisibility = function (this: Element, o?: CheckVisibilityOptions): boolean {
      for (let n: Element | null = this; n; n = n.parentElement) {
        if (o?.visibilityProperty && (n as HTMLElement).style.visibility === 'hidden') return false;
        if (o?.opacityProperty && (n as HTMLElement).style.opacity === '0') return false;
      }
      return true;
    };
    try {
      expect(names()).toEqual(['C major', 'Start over', 'Skip to summary', 'mi']);
    } finally {
      proto.checkVisibility = had;
    }
  });
});

describe('boxFrom', () => {
  it('makes a box from two corners dragged in any direction', () => {
    expect(boxFrom({ x: 50, y: 10 }, { x: 20, y: 40 })).toEqual({ x: 20, y: 10, width: 30, height: 30 });
  });
});
