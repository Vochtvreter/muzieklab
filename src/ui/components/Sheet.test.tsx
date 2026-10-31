// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sheet } from './Sheet';

afterEach(cleanup);

/** A screen with a heading, the control that opens the sheet (unless `noOpener`) and a Pause button. */
function Screen({ open, noOpener = false, withReturn = false }: { open: boolean; noOpener?: boolean; withReturn?: boolean }): JSX.Element {
  const [pause, setPause] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <h1>Exercise done</h1>
      {!noOpener && <button type="button">How to play</button>}
      <button ref={setPause} type="button">
        Pause
      </button>
      {open && (
        <Sheet variant="sheet" closing={false} panelKey="help" labelledBy="t" returnFocus={withReturn ? () => pause : undefined}>
          <h2 id="t">How to play</h2>
          <button type="button" data-autofocus>
            Got it
          </button>
        </Sheet>
      )}
    </>
  );
}

describe('Sheet', () => {
  it('moves focus into the panel, and back to the control that opened it when it closes', () => {
    const { rerender } = render(<Screen open={false} />);
    const opener = screen.getByRole('button', { name: 'How to play' });
    opener.focus();
    rerender(<Screen open />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Got it' }));
    act(() => rerender(<Screen open={false} />));
    expect(document.activeElement).toBe(opener);
  });

  it('a sheet that opened by itself, or whose opener is gone, hands focus to returnFocus, else to the heading', () => {
    // Opened with the screen, with focus on the page: no control opened it.
    const first = render(<Screen open noOpener withReturn />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Got it' }));
    act(() => first.rerender(<Screen open={false} noOpener withReturn />));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pause' }));
    cleanup();
    // The control that opened it went away meanwhile.
    const second = render(<Screen open={false} withReturn />);
    screen.getByRole('button', { name: 'How to play' }).focus();
    second.rerender(<Screen open withReturn />);
    second.rerender(<Screen open noOpener withReturn />);
    act(() => second.rerender(<Screen open={false} noOpener withReturn />));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pause' }));
    cleanup();
    // Nothing given: the screen's heading, which takes focus from a script only.
    const third = render(<Screen open noOpener />);
    act(() => third.rerender(<Screen open={false} noOpener />));
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(document.activeElement).toBe(h1);
    expect(h1.tabIndex).toBe(-1);
  });

  it('a press on the backdrop leaves the focus in the panel, where Tab stays', () => {
    const { rerender } = render(<Screen open={false} />);
    screen.getByRole('button', { name: 'How to play' }).focus();
    rerender(<Screen open />);
    const gotIt = screen.getByRole('button', { name: 'Got it' });
    expect(document.activeElement).toBe(gotIt);
    // The browser would move the focus to the page (the backdrop takes none), out of the trap: not if it is refused.
    expect(fireEvent.mouseDown(document.querySelector('.overlay')!)).toBe(false);
    expect(document.activeElement).toBe(gotIt);
    // A press on the panel itself is the browser's to handle: its text, its controls.
    expect(fireEvent.mouseDown(gotIt)).toBe(true);
  });
});
