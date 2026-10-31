// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_SETTINGS, LETTERS, letterOf, scoreRound, type NoteAnswer } from '../../../core/api';
import { makeNoteRun, StoreProvider, useStore } from '../../store';
import { NotesDone } from './NotesDone';

window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? 390 >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

const run = makeNoteRun({ ...DEFAULT_NOTE_SETTINGS, count: 20, playNotes: false }, 7, {});
/** Every note named one letter too high. */
const answers: NoteAnswer[] = run.notes.map((n) => {
  const letter = LETTERS[(LETTERS.indexOf(letterOf(n.step)) + 1) % 7];
  return { outcome: 'wrong', ms: 1200, given: { kind: 'name', letter, alter: 0 } };
});

/** Plays the round with these answers (every note wrong unless given), then shows Round done. */
function Round({ given = answers }: { given?: NoteAnswer[] }): JSX.Element | null {
  const { state, dispatch } = useStore();
  useEffect(() => {
    dispatch({ type: 'noteStart', run });
    dispatch({ type: 'noteFinish', answers: given, today: '2026-10-29' });
  }, []);
  return state.noteLast ? <NotesDone /> : null;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Round done: Needs practice', () => {
  it('lists every note missed, as Practice missed notes drills them all', () => {
    const missed = scoreRound(run.notes, answers).missed;
    // The round misses more notes than the card once showed (6).
    expect(missed.length).toBeGreaterThan(6);
    render(
      <StoreProvider>
        <Round />
      </StoreProvider>,
    );
    expect(within(screen.getByRole('list', { name: 'Missed' })).getAllByRole('listitem')).toHaveLength(missed.length);
  });
});

describe('Round done: the score', () => {
  it('shows the accuracy rounded down, so 94.7% is not the 95% of three stars (§6.3)', () => {
    // Free practice skipped to the summary after 19 notes, 18 of them right: 94.74%, two stars.
    const given = run.notes
      .slice(0, 19)
      .map((n, i): NoteAnswer => (i === 0 ? answers[0] : { outcome: 'right', ms: 1200, given: { kind: 'name', letter: letterOf(n.step), alter: n.alter } }));
    expect(scoreRound(run.notes, given)).toMatchObject({ right: 18, total: 19, stars: 2 });
    render(
      <StoreProvider>
        <Round given={given} />
      </StoreProvider>,
    );
    expect(document.querySelector('.score-pct')?.textContent).toBe('94%');
    screen.getByRole('img', { name: '2 of 3 stars' });
  });
});
