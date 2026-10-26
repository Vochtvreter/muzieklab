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
});

describe('ScalePiano', () => {
  it('names the two keys of a note in the window low and high', () => {
    const { container } = render(<ScalePiano scale={{ key: 'G', type: 'major' }} marks={{}} played={[]} onPick={() => undefined} />);
    expect(labels(container.querySelectorAll('button'))).toEqual([
      'G, low', 'A, low', 'B', 'C', 'D', 'E', 'F', 'G, high', 'A, high',
      'G sharp or A flat, low', 'A sharp or B flat', 'C sharp or D flat', 'D sharp or E flat', 'F sharp or G flat', 'G sharp or A flat, high',
    ]);
  });

  it('adds the computer key after it on desktop', () => {
    const { container } = render(<ScalePiano scale={{ key: 'G', type: 'major' }} marks={{}} played={[]} onPick={() => undefined} kbd />);
    expect(labels(container.querySelectorAll('button')).slice(0, 3)).toEqual(['G, low, key A', 'A, low, key S', 'B, key D']);
  });
});
