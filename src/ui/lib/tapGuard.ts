/**
 * A double tap on a Start button: the first tap starts the exercise and the screen changes at once, so the second one
 * lands on what the new screen has at that spot (Skip to results, an answer, a piano key) and presses it. A touch tap
 * that comes down within FOLLOW_UP_MS of the tap that started is dropped before it reaches the app. The mouse and the
 * keyboard are left alone (a mouse click right after Start is meant, as in the e2e tests), and so is the tap pad, which
 * plays on pointerdown: a tap there is only a tap.
 */
const FOLLOW_UP_MS = 450;

/**
 * A tap's click comes within this long of its pointerdown. A touch further back did not make the click being handled:
 * it ended without one (a long press), and the click is from a key or a screen reader.
 */
const CLICK_MS = 1000;

/**
 * When the tap that started came down, and when the touch behind the next click and behind the click being handled
 * did (-Infinity: a mouse, a pen or a key). Event time stamps, so a page still busy drawing the new screen, which
 * handles both taps late, measures the time between them and not when it got to them.
 */
let startedAt = -Infinity;
let downAt = -Infinity;
let clickAt = -Infinity;

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => {
    downAt = e.pointerType === 'touch' ? e.timeStamp : -Infinity;
  }, true);
  // A touch that turned into a scroll: no click comes of it.
  window.addEventListener('pointercancel', () => {
    downAt = -Infinity;
  }, true);
  // On the window and in the capture phase, so the click is stopped before React's listener on the root sees it.
  window.addEventListener('click', (e) => {
    clickAt = e.timeStamp - downAt < CLICK_MS ? downAt : -Infinity;
    downAt = -Infinity;
    if (clickAt > startedAt && clickAt - startedAt < FOLLOW_UP_MS) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}

/**
 * An exercise starts or resumes, or a sheet over it closes (inside the tap that does it): a second tap of the same
 * double tap does nothing.
 */
export function guardFollowUpTap(): void {
  startedAt = Number.isFinite(clickAt) ? clickAt : performance.now();
}
