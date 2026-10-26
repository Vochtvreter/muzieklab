/**
 * Where focus goes when the control that had it is gone (a screen that was left, a sheet that closed) and nothing took
 * it over: left there, it falls to the page, a screen reader is not told where the player is, and the next Tab can run
 * past the screen's end and out of the page (on Play that pauses the exercise).
 */

/** Focus was lost with its element: it is on the page itself, or nowhere. */
export function focusLost(): boolean {
  const el = document.activeElement;
  return !el || el === document.body;
}

/**
 * Focus to the screen's heading (h1): a screen reader reads it, and Tab goes on from the top of the screen. It takes
 * focus from a script only (tabIndex -1, which shows no focus ring: base.css).
 */
export function focusHeading(): void {
  const h1 = document.querySelector<HTMLElement>('h1');
  if (!h1) return;
  if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1;
  h1.focus({ preventScroll: true });
}
