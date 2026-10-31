// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { keyForTabbedControl } from './focusModality';
import { useFocusAcrossLayouts, useFocusHandOff } from './screenFocus';

afterEach(cleanup);

/** Hint, used once, and the answers it hands the focus on to (the first one off, as a sign row once answered). */
function Exercise(): JSX.Element {
  const [hinted, setHinted] = useState(false);
  const holdFocus = useFocusHandOff(() => ['.answer']);
  return (
    <>
      <button type="button" disabled={hinted}
        onClick={() => {
          holdFocus();
          setHinted(true);
        }}>
        Hint
      </button>
      <button type="button" className="answer" disabled>
        Flat
      </button>
      <button type="button" className="answer">
        C
      </button>
    </>
  );
}

describe('useFocusHandOff', () => {
  it('hands the focus on from a control the step disables to the first enabled one it names', () => {
    render(<Exercise />);
    const hint = screen.getByRole('button', { name: 'Hint' });
    hint.focus();
    fireEvent.click(hint);
    expect((hint as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'C' }));
  });

  it('moves nothing when the focus was not on a control as the step came (Safari leaves it on the page after a click)', () => {
    render(<Exercise />);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves Space and Enter to the exercise on the control it hands the focus to, until the player presses Tab', () => {
    render(<Exercise />);
    const hint = screen.getByRole('button', { name: 'Hint' });
    const enterOn = (el: Element): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      el.dispatchEvent(e);
      return e;
    };
    // Hint reached with Tab: Enter is its own.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    hint.focus();
    expect(keyForTabbedControl(enterOn(hint))).toBe(true);
    // The Tab was to Hint, not to C: the next Enter does not press C.
    fireEvent.click(hint);
    const c = screen.getByRole('button', { name: 'C' });
    expect(document.activeElement).toBe(c);
    expect(keyForTabbedControl(enterOn(c))).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(keyForTabbedControl(enterOn(c))).toBe(true);
  });
});

/** A screen drawn in two trees, as an exercise screen's tablet and desktop layouts are; desktop shows computer keys. */
function Turned({ layout, extra }: { layout: 'tablet' | 'desktop'; extra?: boolean }): JSX.Element {
  useFocusAcrossLayouts(layout);
  const kbd = layout === 'desktop';
  const answer = (
    <>
      {['C', 'D', 'E'].map((L, i) => (
        <button key={L} type="button" className="name-btn">
          {L}
          {kbd ? <kbd>{L}</kbd> : <span>{['do', 're', 'mi'][i]}</span>}
        </button>
      ))}
      <button type="button">Hint</button>
      <button type="button">
        Next note{kbd && <kbd>↵</kbd>}
      </button>
      {extra && layout === 'tablet' && <button type="button">Only on a tablet</button>}
    </>
  );
  return (
    <div>
      <h1>Read notes</h1>
      <button type="button">Quit</button>
      {layout === 'tablet' ? <section>{answer}</section> : <main><div>{answer}</div></main>}
    </div>
  );
}

describe('useFocusAcrossLayouts', () => {
  // Turning a tablet swaps its layout for desktop's, drawn in another tree: the focused control went with the old one,
  // and the focus fell to the page.
  it('puts the focus on the same control in the new layout', () => {
    const { rerender } = render(<Turned layout="tablet" />);
    screen.getByRole('button', { name: 'Hint' }).focus();
    rerender(<Turned layout="desktop" />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hint' }));
    // Its computer key, shown on desktop only, does not make it another control.
    screen.getByRole('button', { name: /^Next note/ }).focus();
    rerender(<Turned layout="tablet" />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next note' }));
  });

  it('finds a name button that reads otherwise in the new layout by its place among them', () => {
    const { rerender, container } = render(<Turned layout="tablet" />);
    (container.querySelectorAll('.name-btn')[1] as HTMLElement).focus();
    rerender(<Turned layout="desktop" />);
    expect(document.activeElement).toBe(container.querySelectorAll('.name-btn')[1]);
  });

  it('puts it on the heading when the new layout has no such control', () => {
    const { rerender } = render(<Turned layout="tablet" extra />);
    screen.getByRole('button', { name: 'Only on a tablet' }).focus();
    rerender(<Turned layout="desktop" extra />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Read notes' }));
  });

  it('moves nothing when the focused control is still there', () => {
    const { rerender } = render(<Turned layout="tablet" />);
    const quit = screen.getByRole('button', { name: 'Quit' });
    quit.focus();
    rerender(<Turned layout="desktop" />);
    expect(document.activeElement).toBe(quit);
  });
});
