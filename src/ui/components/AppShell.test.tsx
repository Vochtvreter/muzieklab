// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Breakpoint } from '../hooks';
import { AppShell } from './AppShell';

afterEach(cleanup);

/** What a screen keeps in its own state: a Learn chapter's quick-check answer, its scroll, an example playing. */
function Counter(): JSX.Element {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      Pressed {n}
    </button>
  );
}

const shell = (bp: Breakpoint): JSX.Element => (
  <AppShell bp={bp} active="/learn" fill>
    <Counter />
  </AppShell>
);

describe('AppShell', () => {
  it('keeps the screen in it when a phone turns on its side: the tab bar gives way to the header, the screen stays', () => {
    const { container, rerender } = render(shell('phone'));
    const main = container.querySelector('main');
    fireEvent.click(screen.getByRole('button', { name: 'Pressed 0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pressed 1' }));
    rerender(shell('tablet'));
    expect(container.querySelector('header')).not.toBeNull();
    expect(container.querySelector('main')).toBe(main);
    expect(screen.getByRole('button', { name: 'Pressed 2' })).toBeTruthy();
    rerender(shell('phone'));
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('main')).toBe(main);
    expect(screen.getByRole('button', { name: 'Pressed 2' })).toBeTruthy();
  });

  it('puts the header before the page and the tab bar after it', () => {
    const { container, rerender } = render(shell('phone'));
    expect([...container.querySelector('.shell')!.children].map((el) => el.tagName)).toEqual(['MAIN', 'NAV']);
    rerender(shell('desktop'));
    expect([...container.querySelector('.shell')!.children].map((el) => el.tagName)).toEqual(['HEADER', 'MAIN']);
  });
});
