/**
 * How the focused control got its focus: with Tab, or with a click or tap. Space and Enter on a control the player
 * tabbed to belong to that control; after a click they stay the exercise's shortcuts (on Scales, Space is Hear it so
 * far), so a piano key that kept its focus is not pressed again. The browser's :focus-visible cannot tell the two
 * apart: Chromium turns it on for a clicked button as soon as any key is pressed.
 */
let tabbed = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') tabbed = true;
  }, true);
  window.addEventListener('pointerdown', () => {
    tabbed = false;
  }, true);
}

const CONTROL = 'button, a[href], summary, [role="button"], [role="radio"], [role="switch"], [role="checkbox"]';

/** Space or Enter on a control the player reached with Tab: leave the key to the control. */
export function keyForTabbedControl(e: KeyboardEvent): boolean {
  if (e.key !== ' ' && e.key !== 'Enter') return false;
  const target = e.target instanceof Element ? e.target : null;
  return tabbed && !!target?.closest(CONTROL);
}
