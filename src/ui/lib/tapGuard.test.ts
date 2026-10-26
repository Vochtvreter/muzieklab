// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardFollowUpTap } from './tapGuard';

/** When the page gets to the events (handlers run late on a page that is busy drawing). */
let now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => now);

/** An event on `el` stamped `at` ms (its event time stamp). jsdom has no PointerEvent, so it is a MouseEvent. */
function fire(el: HTMLElement, type: string, at: number, pointerType?: 'touch' | 'mouse'): void {
  const ev = Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true }), pointerType ? { pointerType } : {});
  Object.defineProperty(ev, 'timeStamp', { value: at });
  el.dispatchEvent(ev);
}

/** A tap or a click on `el` that came down at `at` ms: pointerdown, then click as the finger lifts. */
function press(el: HTMLElement, pointerType: 'touch' | 'mouse', at: number): void {
  fire(el, 'pointerdown', at, pointerType);
  fire(el, 'click', at + 30);
}

/** Start, which starts an exercise, and Skip to results, which the new screen has where Start was. */
function screen(): { start: HTMLElement; skip: HTMLElement; skipped: ReturnType<typeof vi.fn> } {
  document.body.innerHTML = '<button id="start">Start</button><button id="skip">Skip to results</button>';
  const start = document.getElementById('start')!;
  const skip = document.getElementById('skip')!;
  const skipped = vi.fn();
  start.addEventListener('click', () => guardFollowUpTap());
  skip.addEventListener('click', skipped);
  return { start, skip, skipped };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('guardFollowUpTap', () => {
  it('drops the second tap of a double tap on Start, and not a tap after it', () => {
    const { start, skip, skipped } = screen();
    // The page gets to the first tap late (it was busy), and to the second later still: the taps are 120 ms apart.
    now = 20_600;
    press(start, 'touch', 20_000);
    now = 21_200;
    press(skip, 'touch', 20_120);
    expect(skipped).not.toHaveBeenCalled();
    // A tap the player means, once the double tap is over.
    press(skip, 'touch', 20_500);
    expect(skipped).toHaveBeenCalledTimes(1);
  });

  it('leaves a mouse click and the keyboard alone', () => {
    const { start, skip, skipped } = screen();
    now = 30_000;
    press(start, 'mouse', 30_000);
    press(skip, 'mouse', 30_050);
    expect(skipped).toHaveBeenCalledTimes(1);
    // Enter on a button (a click with no pointerdown) right after a start with a tap.
    press(start, 'touch', 31_000);
    fire(skip, 'click', 31_100);
    expect(skipped).toHaveBeenCalledTimes(2);
  });

  it('a touch that gave no click does not hold back a later key: a scroll, a long press', () => {
    const { start, skip, skipped } = screen();
    now = 40_000;
    press(start, 'touch', 40_000);
    // A touch right after the start that turns into a scroll, then Enter on Skip to results.
    fire(skip, 'pointerdown', 40_200, 'touch');
    fire(skip, 'pointercancel', 40_400, 'touch');
    fire(skip, 'click', 42_000);
    expect(skipped).toHaveBeenCalledTimes(1);
    // A long press right after a start gives no click either; Enter comes seconds later.
    press(start, 'touch', 50_000);
    fire(skip, 'pointerdown', 50_300, 'touch');
    fire(skip, 'click', 53_000);
    expect(skipped).toHaveBeenCalledTimes(2);
  });
});
