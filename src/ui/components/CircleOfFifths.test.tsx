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

  it('fills a position of two spellings by the one with progress, as Round done does', () => {
    const { rerender } = render(<CircleOfFifths tab="major" selected="C" stars={{ 'Cb-major': 3, 'C#-major': 2, 'Gb-major': 1, 'F#-major': 2 }} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'C flat major: 3 stars (or B major)' }).className).toContain('is-l3');
    expect(screen.getByRole('button', { name: 'C sharp major: 2 stars (or D flat major)' }).className).toContain('is-l2');
    // Both have stars: the one with more.
    expect(screen.getByRole('button', { name: 'F sharp major: 2 stars (or G flat major)' }).className).toContain('is-l2');
    rerender(<CircleOfFifths tab="minor" selected="C" stars={{ 'Ab-natural': 2, 'Ab-harmonic': 3 }} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'A flat minor: 2 forms with 2 stars (or G sharp minor)' }).className).toContain('is-l2');
    // None on either: the first spelling, as before.
    expect(screen.getByRole('button', { name: 'D sharp minor: no form with 2 stars yet (or E flat minor)' }).className).toContain('is-l0');
    // The selected spelling is the one shown, even with less progress.
    rerender(<CircleOfFifths tab="major" selected="B" stars={{ 'Cb-major': 3 }} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'B major: no stars yet (or C flat major)' }).className).toContain('is-l0');
  });

  it('picks the spelling it shows, and the other one when that is tapped again', () => {
    const picks: KeyId[] = [];
    const circle = (selected: KeyId): JSX.Element => <CircleOfFifths tab="major" selected={selected} stars={{ 'Cb-major': 3 }} onPick={(key) => picks.push(key)} />;
    const { rerender } = render(circle('C'));
    fireEvent.click(screen.getByRole('button', { name: /^C flat major/ }));
    rerender(circle('Cb'));
    fireEvent.click(screen.getByRole('button', { name: /^C flat major/ }));
    expect(picks).toEqual(['Cb', 'B']);
  });
});
