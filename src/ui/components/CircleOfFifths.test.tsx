// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { KeyId } from '../../core/api';
import { CircleOfFifths, type Ring } from './CircleOfFifths';

afterEach(cleanup);

/** The hub's circle with its own selection, as the Scales hub keeps it. */
function Hub(): JSX.Element {
  const [sel, setSel] = useState<{ tab: Ring; key: KeyId }>({ tab: 'major', key: 'C' });
  return <CircleOfFifths tab={sel.tab} selected={sel.key} stars={{}} onPick={(key, tab) => setSel({ key, tab })} />;
}

describe('CircleOfFifths', () => {
  it('keeps the focus on a faint key that switches the ring, in both directions', () => {
    render(<Hub />);
    const eMinor = screen.getByRole('button', { name: /^E minor/ });
    eMinor.focus();
    fireEvent.click(eMinor);
    expect(screen.getByRole('group', { name: 'Circle of fifths, minor keys' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^E minor/ }));
    expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true');

    const aMajor = screen.getByRole('button', { name: /^A major/ });
    aMajor.focus();
    fireEvent.click(aMajor);
    expect(screen.getByRole('group', { name: 'Circle of fifths, major keys' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^A major/ }));
    expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true');
  });
});
