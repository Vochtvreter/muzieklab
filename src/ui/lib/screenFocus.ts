/**
 * Where focus goes when the control that had it is gone (a screen that was left, a sheet that closed) and nothing took
 * it over: left there, it falls to the page, a screen reader is not told where the player is, and the next Tab can run
 * past the screen's end and out of the page (on Play that pauses the exercise).
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { forgetTab } from './focusModality';

/**
 * Focus was lost with its element: it is on the page itself, or nowhere, or on a control that was just disabled
 * (Chromium moves it from there to the page a moment later, in a task of its own).
 */
export function focusLost(): boolean {
  const el = document.activeElement;
  return !el || el === document.body || el.matches(':disabled');
}

/**
 * The screen's heading (h1), made able to take focus from a script (tabIndex -1, which shows no focus ring: base.css).
 */
export function screenHeading(): HTMLElement | null {
  const h1 = document.querySelector<HTMLElement>('h1');
  if (h1 && !h1.hasAttribute('tabindex')) h1.tabIndex = -1;
  return h1;
}

/** Focus to the screen's heading: a screen reader reads it, and Tab goes on from the top of the screen. */
export function focusHeading(): void {
  screenHeading()?.focus({ preventScroll: true });
}

/**
 * A step of an exercise that disables or removes the control it was taken with (Hint once used, Next note until the
 * next answer, the staff written on once it is checked): call what this returns in the step, and once the step is
 * drawn the focus goes on to the first control that `to` names (selectors, in order) that is there and enabled. Only
 * when the focus was on a control as the step came and is lost now: a step taken with it elsewhere moves nothing (it
 * stays on the page after a click in Safari, which does not focus the button clicked). The control it goes to takes
 * Space and Enter only after a Tab of its own (focusModality.ts): a second Enter on Next note does not answer with the
 * name button it went to.
 */
export function useFocusHandOff(to: () => string[]): () => void {
  const held = useRef(false);
  const where = useRef(to);
  where.current = to;
  useEffect(() => {
    if (!held.current) return;
    held.current = false;
    if (!focusLost()) return;
    for (const selector of where.current()) {
      const el = [...document.querySelectorAll<HTMLElement>(selector)].find((x) => !x.matches(':disabled'));
      if (!el) continue;
      el.focus({ preventScroll: true });
      forgetTab();
      return;
    }
  });
  return useCallback(() => {
    held.current = !focusLost();
  }, []);
}

/** What can take the focus, for finding a control again. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * A control as it reads, to find it again in another layout: its tag, role and text, without the computer key desktop
 * shows on it (Next note ↵), or its label when it has no text (an icon, a piano key).
 */
function controlName(el: Element): string {
  const text = el.cloneNode(true) as Element;
  for (const kbd of text.querySelectorAll('kbd')) kbd.remove();
  return [el.tagName, el.getAttribute('role'), text.textContent?.trim() || el.getAttribute('aria-label')].join('|');
}

/** A control's kind: its tag and classes (a name button, a piano's white key). */
const kind = (el: Element): string => el.tagName + ' ' + (el.getAttribute('class') ?? '');
/** The controls of its kind side by side with `el`, itself included: the name buttons, a piano's white keys. */
const row = (el: Element): Element[] => [...(el.parentElement?.children ?? [el])].filter((x) => kind(x) === kind(el));

/**
 * A screen in another layout (a tablet turned from portrait to landscape, which is desktop's; a window made wider or
 * narrower) is drawn in another tree, and the control that had the focus went with the old one: the focus goes to the
 * same control in the new layout, by its name, or by its place in the one row of as many controls of its kind (a name
 * button shows its computer key instead of its do re mi name on desktop), else to the screen's heading. The player got
 * there with Tab, so Space and Enter stay that control's.
 */
export function useFocusAcrossLayouts(layout: string): void {
  const last = useRef<Element | null>(null);
  useEffect(() => {
    const onFocus = (e: FocusEvent): void => {
      if (e.target instanceof Element) last.current = e.target;
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);
  const shown = useRef(layout);
  useLayoutEffect(() => {
    if (shown.current === layout) return;
    shown.current = layout;
    const was = last.current;
    if (!was || was.isConnected || !focusLost()) return;
    // The control that went keeps what it showed last, and the row it was in. Its row in the new layout is the one row
    // of its kind as long as that.
    const name = controlName(was);
    const all = [...document.querySelectorAll(FOCUSABLE)];
    const named = all.filter((el) => controlName(el) === name);
    const before = row(was);
    const rows = all.filter((el) => kind(el) === kind(was) && row(el)[0] === el).map(row).filter((r) => r.length === before.length);
    const placed = rows.length === 1 ? [rows[0][before.indexOf(was)]] : [];
    // One that is off, or that the new layout hides, takes no focus.
    for (const el of [...named, ...placed, screenHeading()]) {
      if (!(el instanceof HTMLElement) || el.matches(':disabled')) continue;
      el.focus({ preventScroll: true });
      if (document.activeElement === el) return;
    }
  }, [layout]);
}
