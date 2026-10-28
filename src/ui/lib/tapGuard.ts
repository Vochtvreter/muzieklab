/**
 * A double tap on a Start button, or on anything else that changes the screen: the first tap starts the exercise (or
 * opens Round done, a setup) and the screen changes at once, so the second one lands on what the new screen has at
 * that spot (Skip to results, an answer, a piano key, New round, the setup's Start) and presses it. A touch tap that
 * comes down within FOLLOW_UP_MS of the tap that started is dropped before it reaches the app, and so are the later
 * clicks of a mouse double click that started. Those go by the click count, not the time: the browser counts up in the
 * click's `detail` (2 after 1) for as long as the system takes the clicks for one double click (its double-click time,
 * 500 ms on Windows and longer if set so), and starts again at 1 after that. Their press is refused too, so it does
 * not take the focus from the new screen's heading or select a word. A click of its own right after Start (detail 1)
 * is meant, as in the e2e tests, and the keyboard is left alone; so is the tap pad, which plays on pointerdown: a tap
 * there is only a tap.
 */
const FOLLOW_UP_MS = 450;

/**
 * A tap's click comes within this long of its pointerdown. A touch further back did not make the click being handled:
 * it ended without one (a long press), and the click is from a key or a screen reader.
 */
const CLICK_MS = 1000;

/**
 * When the tap or click that started came down, and when the pointer behind the next click and behind the click being
 * handled did (-Infinity: a key). Event time stamps, so a page still busy drawing the new screen, which handles both
 * taps late, measures the time between them and not when it got to them. `downTouch`: that pointer was a finger.
 * `startedCount`: the click count of the click that started, until a click that is not a later one of it (0: a key's
 * click, or none); `clickCount`: the one of the click being handled.
 */
let startedAt = -Infinity;
let startedCount = 0;
let downAt = -Infinity;
let downTouch = false;
let clickAt = -Infinity;
let clickCount = 0;

/** A press or click of a mouse (or a pen) that is a later one of the double click that started. */
const sameDoubleClick = (e: MouseEvent): boolean => !downTouch && startedCount > 0 && e.detail > startedCount;

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => {
    downAt = e.timeStamp;
    downTouch = e.pointerType === 'touch';
  }, true);
  // A touch that turned into a scroll: no click comes of it.
  window.addEventListener('pointercancel', () => {
    downAt = -Infinity;
  }, true);
  // The press of a click that will be dropped: it neither moves the focus to what is under the pointer nor selects.
  window.addEventListener('mousedown', (e) => {
    if (sameDoubleClick(e)) e.preventDefault();
  }, true);
  // On the window and in the capture phase, so the click is stopped before React's listener on the root sees it.
  window.addEventListener('click', (e) => {
    clickAt = e.timeStamp - downAt < CLICK_MS ? downAt : -Infinity;
    clickCount = e.detail;
    // A later click of the double click that started, or a tap too soon after the tap that did; a key's click has no
    // pointer behind it (clickAt -Infinity) and counts 0. Any other click ends that double click.
    const later = sameDoubleClick(e);
    if (!later) startedCount = 0;
    const tap = downTouch && clickAt > startedAt && clickAt - startedAt < FOLLOW_UP_MS;
    downAt = -Infinity;
    downTouch = false;
    if (later || tap) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}

/**
 * An exercise starts or resumes, a sheet over it closes (inside the tap that does it), or a new screen opens (App.tsx,
 * on every screen change): a second tap of the same double tap, or a later click of the same double click, does
 * nothing. A screen change that no tap made (a run that ends, Back) counts from the last tap.
 */
export function guardFollowUpTap(): void {
  startedAt = Number.isFinite(clickAt) ? clickAt : performance.now();
  startedCount = clickCount;
}
