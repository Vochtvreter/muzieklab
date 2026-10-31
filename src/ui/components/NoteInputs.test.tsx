// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Alter } from '../../core/api';
import { Piano, SignRow } from './NoteInputs';

afterEach(cleanup);

function Signs({ disabled }: { disabled?: boolean }): JSX.Element {
  const [sign, setSign] = useState<Alter>(0);
  return <SignRow value={sign} onChange={setSign} disabled={disabled} />;
}

const radio = (name: string): HTMLElement => screen.getByRole('radio', { name });
const checked = (): string[] => screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label')!);

describe('SignRow', () => {
  // A radio group (♭ ♮ ♯) is one Tab stop, and the arrow keys pick and focus the next sign, as the ARIA radio group
  // pattern tells a screen reader user: they did nothing, and Tab went through all three.
  it('is one Tab stop, on the sign picked', () => {
    render(<Signs />);
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('picks and focuses the next or previous sign with the arrow keys, round the ends, and the first or last with Home and End', () => {
    render(<Signs />);
    radio('natural').focus();
    fireEvent.keyDown(radio('natural'), { key: 'ArrowRight' });
    expect(checked()).toEqual(['sharp']);
    expect(document.activeElement).toBe(radio('sharp'));
    expect(radio('sharp').tabIndex).toBe(0);
    fireEvent.keyDown(radio('sharp'), { key: 'ArrowDown' });
    expect(checked()).toEqual(['flat']);
    expect(document.activeElement).toBe(radio('flat'));
    fireEvent.keyDown(radio('flat'), { key: 'ArrowLeft' });
    expect(checked()).toEqual(['sharp']);
    fireEvent.keyDown(radio('sharp'), { key: 'ArrowUp' });
    expect(checked()).toEqual(['natural']);
    fireEvent.keyDown(radio('natural'), { key: 'Home' });
    expect(checked()).toEqual(['flat']);
    fireEvent.keyDown(radio('flat'), { key: 'End' });
    expect(checked()).toEqual(['sharp']);
    expect(document.activeElement).toBe(radio('sharp'));
  });

  it('leaves other keys, and a row that is off, alone', () => {
    render(<Signs disabled />);
    fireEvent.keyDown(radio('natural'), { key: 'ArrowRight' });
    expect(checked()).toEqual(['natural']);
    cleanup();
    render(<Signs />);
    const e = fireEvent.keyDown(radio('natural'), { key: 'c' });
    expect(e).toBe(true);
    expect(checked()).toEqual(['natural']);
  });
});

describe('Piano', () => {
  // In the order they are drawn, low to high, for Tab and a screen reader: the white keys came first, then the black.
  it('has its keys in pitch order, C to B', () => {
    const { container } = render(<Piano labels="letters" marks={{}} onPick={() => undefined} />);
    expect([...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'C, do', 'C sharp or D flat', 'D, re', 'D sharp or E flat', 'E, mi', 'F, fa', 'F sharp or G flat', 'G, sol', 'G sharp or A flat', 'A, la',
      'A sharp or B flat', 'B, si',
    ]);
  });
});
