// @vitest-environment jsdom
import { keyForTabbedControl } from './focusModality';

const keyOn = (el: Element, key: string): KeyboardEvent => {
  let seen: KeyboardEvent | null = null;
  const grab = (e: KeyboardEvent): void => {
    seen = e;
  };
  window.addEventListener('keydown', grab);
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  window.removeEventListener('keydown', grab);
  return seen!;
};

describe('keyForTabbedControl', () => {
  it('leaves Space and Enter to a button reached with Tab, not to one that was clicked', () => {
    document.body.innerHTML = '<button id="b">Start over</button><div id="d"></div>';
    const b = document.getElementById('b')!;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(keyForTabbedControl(keyOn(b, ' '))).toBe(true);
    expect(keyForTabbedControl(keyOn(b, 'Enter'))).toBe(true);
    // Other keys stay shortcuts, and so does Space away from a control.
    expect(keyForTabbedControl(keyOn(b, 'a'))).toBe(false);
    expect(keyForTabbedControl(keyOn(document.getElementById('d')!, ' '))).toBe(false);
    // A click (pointerdown) gives Space back to the exercise.
    window.dispatchEvent(new Event('pointerdown'));
    expect(keyForTabbedControl(keyOn(b, ' '))).toBe(false);
  });
});
