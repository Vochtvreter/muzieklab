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

/** Plays the round with every note wrong, then shows Round done. */
function Round(): JSX.Element | null {
  const { state, dispatch } = useStore();
  useEffect(() => {
    dispatch({ type: 'noteStart', run });
    dispatch({ type: 'noteFinish', answers, today: '2026-10-29' });
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
