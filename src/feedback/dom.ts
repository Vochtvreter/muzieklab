/** Reading the page for a feedback report: which element was marked, how to find it again, and the screen it was on. */
import type { FeedbackContext, FeedbackTarget, Rect } from '../../shared/feedback';
import { clip, withoutToken } from '../../shared/feedback';

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

/**
 * The element's text as it reads, its parts apart: textContent runs a chapter row's "1", "Pulse and meter" and "Beat,
 * tempo…" together. A part laid out on its own (a block, a flex item, a chip) gets a space either side, and a hidden
 * one adds nothing. As written, not as shown: innerText would give a heading its style puts in capitals as ACCOUNT.
 * Read up to `max` characters, the most a report keeps. A text area's text is what was typed in it, which a report
 * leaves out (markup).
 */
function readableText(el: Element, max = 300): string {
  const view = el.ownerDocument.defaultView;
  let text = '';
  const walk = (node: Node): void => {
    if (node instanceof Element && node.tagName === 'TEXTAREA') return;
    for (const child of node.childNodes) {
      if (text.length > max) return;
      if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
      else if (child instanceof Element) {
        const display = view?.getComputedStyle(child).display ?? 'inline';
        if (display === 'none') continue;
        const apart = child.tagName === 'BR' || (display !== 'inline' && display !== 'contents');
        if (apart) text += ' ';
        walk(child);
        if (apart) text += ' ';
      }
    }
  };
  walk(el);
  return text;
}

/** The text of what labels the element: the elements its aria-labelledby names, else a field's <label>s. */
function labelText(el: Element): string {
  const by = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => (id ? el.ownerDocument.getElementById(id) : null));
  const labels: Element[] = by.some(Boolean) ? by.filter((n): n is HTMLElement => n !== null) : [...((el as HTMLInputElement).labels ?? [])];
  return labels.map((l) => readableText(l)).join(' ');
}

/**
 * How a person would name the element: its role and accessible name (a field's is its label) or text, else its tag
 * and first class. `roleWord` says the role in the language shown; a report keeps it in English, as its issue is.
 */
export function describeElement(el: Element, roleWord: (role: string) => string = (role) => role): string {
  const role = el.getAttribute('role') ?? ROLE_OF[el.tagName.toUpperCase()];
  const name = el.getAttribute('aria-label') || labelText(el) || el.getAttribute('title') || el.getAttribute('alt') || readableText(el);
  const named = clip(name, 50);
  const cls = [...el.classList].find((c) => !PASSING.test(c));
  const tag = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  if (role && named) return `${roleWord(role)} “${named}”`;
  if (named) return `${tag} “${named}”`;
  return role ? `${roleWord(role)} (${tag})` : tag;
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

/** What the arrow keys step through while marking: controls, headings, text and pictures. */
const PARTS = 'a[href], button, input, select, textarea, summary, [role="button"], [role="switch"], [role="slider"], [tabindex]:not([tabindex="-1"]), h1, h2, h3, h4, p, img, svg, [role="img"]';
/**
 * A control or a picture: what is inside it (a button's icon or words, the staff a Path lesson's note is written on,
 * a staff's notes) is marked as part of it.
 */
const WHOLE = 'a[href], button, summary, label, [role="button"], [role="switch"], [role="slider"], svg, [role="img"]';

/**
 * The part a tap, a click or a drawn box's centre marks at a point: the control or picture the element there is in, the
 * outermost one, as the arrow keys pick it (markableParts), else that element. A tap on a tab's icon marks the tab, and
 * one on a word of a button the button, so the report names and lights what was meant.
 */
export function partAt(x: number, y: number, doc: Document = document): Element | null {
  let part = elementAt(x, y, doc);
  for (let up = part?.closest(WHOLE); up; up = up.parentElement?.closest(WHOLE)) part = up;
  return part;
}

/**
 * Whether the element can be seen: laid out, not visibility: hidden (Scales' Hear it so far and Start over wait so in
 * their place before the first note) and not see-through (opacity 0), nor a box around it. Both spellings of the
 * options, as browsers before 2024 know only the first. Without checkVisibility, opacity is not looked at.
 */
function shows(el: Element): boolean {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true, visibilityProperty: true, opacityProperty: true });
  }
  return el.getClientRects().length > 0 && el.ownerDocument.defaultView?.getComputedStyle(el).visibility === 'visible';
}

/**
 * The parts of the screen the keyboard can mark, in page order: not the tool's own, nor one hidden from sight or from a
 * screen reader, nor what is inside a control or a picture (a button's icon, a staff's notes).
 */
export function markableParts(doc: Document = document): Element[] {
  return [...doc.body.querySelectorAll(PARTS)].filter(
    (el) =>
      !el.closest(`[${TOOL_ATTR}], [aria-hidden="true"], .sr-only`) &&
      !el.parentElement?.closest(WHOLE) &&
      shows(el),
  );
}

/**
 * Markup with the tool's own elements, what was typed in a field, a link's token and long attribute values left out,
 * cut to `max` characters. React keeps what is typed in a field in its value attribute (a text area's in its text), a
 * password too, so the copy drops it.
 */
function markup(el: Element, max = 1500): string {
  // The copy is made in a document of its own, which renders nothing: a cut value (an SVG <path d> cut mid-number) set
  // on a copy in the page's document is parsed there, and the browser logs it as an error.
  const copy = el.ownerDocument.implementation.createHTMLDocument('').importNode(el, true);
  copy.querySelectorAll(`[${TOOL_ATTR}]`).forEach((n) => n.remove());
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    if (n.tagName === 'INPUT') n.removeAttribute('value');
    else if (n.tagName === 'TEXTAREA') n.textContent = '';
    for (const a of [...n.attributes]) if (a.value.length > 120) n.setAttribute(a.name, a.value.slice(0, 117) + '…');
  }
  // A token cut with its value still has its start, which the route before it finds.
  const html = withoutToken(copy.outerHTML).replace(/\s+/g, ' ');
  return html.length > max ? html.slice(0, max - 1) + '…' : html;
}

const toRect = (r: DOMRect | Rect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });

/** A box its content scrolls in (overflow auto, scroll or hidden); visible and clip leave that to a box further out. */
const scrollsIn = (s: CSSStyleDeclaration): boolean => [s.overflowX, s.overflowY].some((o) => o === 'auto' || o === 'scroll' || o === 'hidden');

/**
 * How far the page under the element is scrolled: the window's offset plus that of every box around the element that
 * scrolls. The app's screens scroll inside .page (or .shell-main), never the window, so the window alone always says
 * 0, 0. Scroll that does not move the element is left out, so the box plus the offset stays the spot on the page
 * scrolled to its top: a fixed part stays put while anything around it scrolls, and a sticky one (Settings' side
 * column, Setup's Start) moves only as far as it went before it stuck.
 */
function scrollOf(el: Element, win: Window): { x: number; y: number } {
  const { body, documentElement } = win.document;
  let x = 0;
  let y = 0;
  // Set by a sticky box: the next box around it that scrolls is the one it sticks in.
  let stuck: Element | null = null;
  for (let n: Element | null = el; n && n !== body && n !== documentElement; n = n.parentElement) {
    const style = win.getComputedStyle(n);
    if (n !== el && scrollsIn(style)) {
      const moved = stuck ? movedWith(stuck, n) : { x: n.scrollLeft, y: n.scrollTop };
      x += moved.x;
      y += moved.y;
      stuck = null;
    }
    if (style.position === 'fixed') return { x: Math.round(x), y: Math.round(y) };
    if (style.position === 'sticky') stuck = n;
  }
  // A sticky part with no box around it that scrolls sticks in the window, whose scroll is left out (the app's window
  // never scrolls).
  if (!stuck) {
    x += win.scrollX;
    y += win.scrollY;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * How far a sticky part went along as the box it sticks in scrolled: all the way until it reached its inset (Setup's
 * side panel starts under the screen's header and sticks at the top), none when it was there from the start, the whole
 * scroll when its box is too short for it to stick. Measured with the box scrolled to its top and back again at once,
 * in the same task, so nothing is drawn in between.
 */
function movedWith(part: Element, box: Element): { x: number; y: number } {
  const { scrollLeft, scrollTop } = box;
  if (!scrollLeft && !scrollTop) return { x: 0, y: 0 };
  const now = part.getBoundingClientRect();
  box.scrollLeft = 0;
  box.scrollTop = 0;
  const top = part.getBoundingClientRect();
  box.scrollLeft = scrollLeft;
  box.scrollTop = scrollTop;
  return { x: top.x - now.x, y: top.y - now.y };
}

/**
 * The target for a marked element, or for a drawn box with the element under its centre; without a link's token
 * (withoutToken), which an admin's link card shows, nor what was typed in a field (markup).
 */
export function targetFor(el: Element, area?: Rect, win: Window = window): FeedbackTarget {
  return {
    mode: area ? 'area' : 'element',
    selector: selectorFor(el),
    label: withoutToken(describeElement(el)),
    text: clip(withoutToken(readableText(el)), 300),
    html: markup(el),
    rect: toRect(area ?? el.getBoundingClientRect()),
    scroll: scrollOf(el, win),
  };
}

/** The screen the report was made on; an invite or new-password screen without its link's token. */
export function captureContext(o: { version: string; route: string; themeSetting: string; locale: string; prefs: unknown }, win: Window = window): FeedbackContext {
  const mq = (q: string): boolean => win.matchMedia?.(q).matches ?? false;
  const width = win.innerWidth;
  const height = win.innerHeight;
  const forced = win.document.documentElement.getAttribute('data-theme');
  const dark = forced ? forced === 'dark' : mq('(prefers-color-scheme: dark)');
  return {
    version: o.version,
    url: withoutToken(win.location.href),
    route: withoutToken(o.route),
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
