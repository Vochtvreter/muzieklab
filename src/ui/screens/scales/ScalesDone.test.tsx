// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SCALE_SETTINGS } from '../../../core/api';
import { defaultProgress, PROGRESS_KEY } from '../../../game/storage';
import { makeScaleRun, StoreProvider, useStore } from '../../store';
import { ScalesDone } from './ScalesDone';

window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? 390 >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

const TODAY = '2026-10-15';

/** Plays a round of one scale without a mistake on TODAY, then shows Round done. */
function Round(): JSX.Element | null {
  const { state, dispatch } = useStore();
  useEffect(() => {
    const run = makeScaleRun({ ...DEFAULT_SCALE_SETTINGS, keyMode: 'pick', keys: ['G'] }, 5);
    dispatch({ type: 'scaleStart', run });
    dispatch({ type: 'scaleFinish', played: [{ scale: run.scales[0], mistakes: 0 }], today: TODAY, seconds: 30 });
  }, []);
  return state.scaleLast ? <ScalesDone /> : null;
}

/** Six practice days in a row before TODAY: the round makes the seventh (the 7-day streak), with `xp` before it. */
const seed = (xp: number): void => {
  const practiceDays = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...defaultProgress(), practiceDays, xp }));
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Round done: an achievement the round earned', () => {
  it('without a level: a badge beside the score', () => {
    seed(0);
    render(
      <StoreProvider>
        <Round />
      </StoreProvider>,
    );
    expect(screen.getByText('Achievement unlocked · 7-day streak').className).toBe('badge badge--gold');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('with a level: the level-up sheet lists it instead', () => {
    seed(99);
    render(
      <StoreProvider>
        <Round />
      </StoreProvider>,
    );
    const sheet = within(screen.getByRole('dialog', { name: 'Level 2 · Tick' }));
    expect(sheet.getByText('7-day streak')).toBeTruthy();
    expect(sheet.getByText('Practice on seven days in a row')).toBeTruthy();
    expect(screen.queryByText('Achievement unlocked · 7-day streak')).toBeNull();
  });
});
