// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusHandOff } from './screenFocus';

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
});
