/** Reading the page for a feedback report: which element was marked, how to find it again, and the screen it was on. */
import type { FeedbackContext, FeedbackTarget, Rect } from '../../shared/feedback';
import { clip } from '../../shared/feedback';

/** The feedback tool's own elements carry this attribute; marking never picks them. */
export const TOOL_ATTR = 'data-feedback-ui';

/** Classes that only say how an element looks right now (motion, state), so they make a poor selector. */
const PASSING = /^(m-|is-|tone-)/;

const esc = (s: string): string => s.replace(/[^\w-]/g, (c) => '\\' + c);

/**
 * A CSS selector for the element, from the nearest id (or <body>) down: tag, up to two lasting classes, and
 * :nth-of-type where siblings share the tag. At most six steps, so it stays readable; the box in the report backs it up.
 */
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName !== 'BODY' && node.tagName !== 'HTML' && parts.length < 6) {
    if (node.id) {
      parts.unshift('#' + esc(node.id));
      break;
    }
    let part = node.tagName.toLowerCase();
    const cls = [...node.classList].filter((c) => !PASSING.test(c)).slice(0, 2);
    if (cls.length) part += '.' + cls.map(esc).join('.');
    const parent: Element | null = node.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === node!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

const ROLE_OF: Record<string, string> = {
  A: 'link',
  BUTTON: 'button',
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  H4: 'heading',
  IMG: 'image',
  INPUT: 'field',
  NAV: 'navigation',
  P: 'text',
  SELECT: 'list',
  SVG: 'drawing',
  TEXTAREA: 'field',
};

/** How a person would name the element: its role and accessible name or text, else its tag and first class. */
export function describeElement(el: Element): string {
  const role = el.getAttribute('role') ?? ROLE_OF[el.tagName.toUpperCase()];
  const name = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.getAttribute('alt') ?? el.textContent ?? '';
  const named = clip(name, 50);
  const cls = [...el.classList].find((c) => !PASSING.test(c));
  const tag = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  if (role && named) return `${role} “${named}”`;
  if (named) return `${tag} “${named}”`;
  return role ? `${role} (${tag})` : tag;
}

/** The topmost page element at a point, looking through the feedback tool's own layer. */
export function elementAt(x: number, y: number, doc: Document = document): Element | null {
  for (const el of doc.elementsFromPoint(x, y)) {
    if (el.closest(`[${TOOL_ATTR}]`)) continue;
    if (el === doc.documentElement || el === doc.body) return null;
    return el;
  }
  return null;
}

/** Markup with the tool's own elements and long attribute values left out, cut to `max` characters. */
function markup(el: Element, max = 1500): string {
  // The copy is made in a document of its own, which renders nothing: a cut value (an SVG <path d> cut mid-number) set
  // on a copy in the page's document is parsed there, and the browser logs it as an error.
  const copy = el.ownerDocument.implementation.createHTMLDocument('').importNode(el, true);
  copy.querySelectorAll(`[${TOOL_ATTR}]`).forEach((n) => n.remove());
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of [...n.attributes]) if (a.value.length > 120) n.setAttribute(a.name, a.value.slice(0, 117) + '…');
  }
  const html = copy.outerHTML.replace(/\s+/g, ' ');
  return html.length > max ? html.slice(0, max - 1) + '…' : html;
}

const toRect = (r: DOMRect | Rect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });

/** A box its content scrolls in (overflow auto, scroll or hidden); visible and clip leave that to a box further out. */
const scrollsIn = (s: CSSStyleDeclaration): boolean => [s.overflowX, s.overflowY].some((o) => o === 'auto' || o === 'scroll' || o === 'hidden');

/**
 * How far the page under the element is scrolled: the window's offset plus that of every box around the element that
 * scrolls. The app's screens scroll inside .page (or .shell-main), never the window, so the window alone always says
 * 0, 0. Scroll that does not move the element is left out, so the box plus the offset stays the spot on the page
 * scrolled to its top: a sticky part (Settings' side column, Setup's Start) stays put while the box it sticks in
 * scrolls, and a fixed one while anything around it does.
 */
function scrollOf(el: Element, win: Window): { x: number; y: number } {
  const { body, documentElement } = win.document;
  let x = 0;
  let y = 0;
  // Set by a sticky box: the next box around it that scrolls is the one it sticks in.
  let stuck = false;
  for (let n: Element | null = el; n && n !== body && n !== documentElement; n = n.parentElement) {
    const style = win.getComputedStyle(n);
    if (n !== el && scrollsIn(style)) {
      if (!stuck) {
        x += n.scrollLeft;
        y += n.scrollTop;
      }
      stuck = false;
    }
    if (style.position === 'fixed') return { x: Math.round(x), y: Math.round(y) };
    if (style.position === 'sticky') stuck = true;
  }
  if (!stuck) {
    x += win.scrollX;
    y += win.scrollY;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/** The target for a marked element, or for a drawn box with the element under its centre. */
export function targetFor(el: Element, area?: Rect, win: Window = window): FeedbackTarget {
  return {
    mode: area ? 'area' : 'element',
    selector: selectorFor(el),
    label: describeElement(el),
    text: clip(el.textContent ?? '', 300),
    html: markup(el),
    rect: toRect(area ?? el.getBoundingClientRect()),
    scroll: scrollOf(el, win),
  };
}

/** The screen the report was made on. */
export function captureContext(o: { version: string; route: string; themeSetting: string; locale: string; prefs: unknown }, win: Window = window): FeedbackContext {
  const mq = (q: string): boolean => win.matchMedia?.(q).matches ?? false;
  const width = win.innerWidth;
  const height = win.innerHeight;
  const forced = win.document.documentElement.getAttribute('data-theme');
  const dark = forced ? forced === 'dark' : mq('(prefers-color-scheme: dark)');
  return {
    version: o.version,
    url: win.location.href,
    route: o.route,
    viewport: { width, height, dpr: win.devicePixelRatio || 1 },
    breakpoint: width >= 1100 ? 'desktop' : width >= 700 ? 'tablet' : 'phone',
    orientation: width > height ? 'landscape' : 'portrait',
    pointer: mq('(pointer: coarse)') ? 'coarse' : 'fine',
    theme: { setting: o.themeSetting, shown: dark ? 'dark' : 'light' },
    locale: o.locale,
    userAgent: win.navigator.userAgent,
    at: new Date().toISOString(),
    prefs: o.prefs,
  };
}

/** The box from two corners of a drag, in any direction. */
export function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
