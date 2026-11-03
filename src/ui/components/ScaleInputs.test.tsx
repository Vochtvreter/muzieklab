// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DegreeRow, ScalePiano, type DegreeCell } from './ScaleInputs';

afterEach(cleanup);

const labels = (els: NodeListOf<Element>): (string | null)[] => [...els].map((el) => el.getAttribute('aria-label'));

describe('DegreeRow', () => {
  it('tells a screen reader which degrees are answered, which is now and which are still to come', () => {
    // Spelling D major after D and E: the letters are given, F is now.
    const names: DegreeCell[] = [
      { degree: 1, text: 'D', given: 'D', state: 'done' },
      { degree: 2, text: 'E', given: 'E', state: 'done' },
      { degree: 3, text: 'F', given: 'F', state: 'current' },
      { degree: 4, text: 'G', given: 'G', state: 'next' },
    ];
    const { container } = render(<DegreeRow cells={names} steps={[null, null, null]} known={1} label="Scale degrees going up" />);
    const items = container.querySelectorAll('[role="listitem"]');
    expect(labels(items)).toEqual(['Degree 1: D', 'Degree 2: E', 'Degree 3: F, now', 'Degree 4: G, not yet']);
    expect([...items].map((el) => el.getAttribute('aria-current'))).toEqual([null, null, 'step', null]);
  });

  it('does not read the piano\'s "?" as an answer', () => {
    const piano: DegreeCell[] = [
      { degree: 1, text: 'D', state: 'done' },
      { degree: 2, text: '?', state: 'current' },
      { degree: 3, text: '', state: 'next' },
    ];
    const { container } = render(<DegreeRow cells={piano} steps={[null, null]} known={0} label="Scale degrees going up" />);
    expect(labels(container.querySelectorAll('[role="listitem"]'))).toEqual(['Degree 1: D', 'Degree 2: now', 'Degree 3: not yet']);
  });

  it('names an answered note as it is said, not by its sign', () => {
    // G♯ harmonic minor's 6th and 7th: a screen reader reads ♯ and 𝄪 as symbols, or skips 𝄪 (F𝄪 would sound like F).
    const cells: DegreeCell[] = [
      { degree: 6, text: 'E', spoken: 'E', state: 'done' },
      { degree: 7, text: 'F𝄪', spoken: 'F double sharp', state: 'done' },
      { degree: 8, text: '?', state: 'current' },
    ];
    const { container } = render(<DegreeRow cells={cells} steps={[null, null]} known={1} label="Scale degrees going up" />);
    expect(labels(container.querySelectorAll('[role="listitem"]'))).toEqual(['Degree 6: E', 'Degree 7: F double sharp', 'Degree 8: now']);
    expect(container.querySelectorAll('.degree-name')[1].textContent).toBe('F𝄪');
  });
});

describe('ScalePiano', () => {
  // In the order they are drawn and played, low to high: Tab and a screen reader went through the white keys first and
  // then the black ones, so F♯ major's first note was the tenth stop.
  it('names the two keys of a note in the window low and high, in pitch order', () => {
    const { container } = render(<ScalePiano scale={{ key: 'G', type: 'major' }} marks={{}} played={[]} onPick={() => undefined} />);
    expect(labels(container.querySelectorAll('button'))).toEqual([
      'G, low', 'G sharp or A flat, low', 'A, low', 'A sharp or B flat', 'B', 'C', 'C sharp or D flat', 'D', 'D sharp or E flat', 'E', 'F',
      'F sharp or G flat', 'G, high', 'G sharp or A flat, high', 'A, high',
    ]);
  });

  it('starts on the white key below a black tonic, then the tonic', () => {
    const { container } = render(<ScalePiano scale={{ key: 'F#', type: 'major' }} marks={{}} played={[]} onPick={() => undefined} />);
    expect(labels(container.querySelectorAll('button')).slice(0, 3)).toEqual(['F, low', 'F sharp or G flat, low', 'G, low']);
  });

  it('adds the computer key after it on desktop', () => {
    const { container } = render(<ScalePiano scale={{ key: 'G', type: 'major' }} marks={{}} played={[]} onPick={() => undefined} kbd />);
    expect(labels(container.querySelectorAll('button')).slice(0, 4)).toEqual(['G, low, key A', 'G sharp or A flat, low, key W', 'A, low, key S', 'A sharp or B flat, key E']);
  });
});
