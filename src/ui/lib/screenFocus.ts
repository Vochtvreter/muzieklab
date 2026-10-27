/**
 * Where focus goes when the control that had it is gone (a screen that was left, a sheet that closed) and nothing took
 * it over: left there, it falls to the page, a screen reader is not told where the player is, and the next Tab can run
 * past the screen's end and out of the page (on Play that pauses the exercise).
 */
import { useCallback, useEffect, useRef } from 'react';
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
