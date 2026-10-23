/** Reading the page for a feedback report: which element was marked, how to find it again, and the screen it was on. */
import type { FeedbackContext, FeedbackTarget, Rect } from './report';
import { clip } from './report';

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
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(`[${TOOL_ATTR}]`).forEach((n) => n.remove());
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of [...n.attributes]) if (a.value.length > 120) n.setAttribute(a.name, a.value.slice(0, 117) + '…');
  }
  const html = copy.outerHTML.replace(/\s+/g, ' ');
  return html.length > max ? html.slice(0, max - 1) + '…' : html;
}

const toRect = (r: DOMRect | Rect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });

/** The target for a marked element, or for a drawn box with the element under its centre. */
export function targetFor(el: Element, area?: Rect, win: Window = window): FeedbackTarget {
  return {
    mode: area ? 'area' : 'element',
    selector: selectorFor(el),
    label: describeElement(el),
    text: clip(el.textContent ?? '', 300),
    html: markup(el),
    rect: toRect(area ?? el.getBoundingClientRect()),
    scroll: { x: Math.round(win.scrollX), y: Math.round(win.scrollY) },
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
