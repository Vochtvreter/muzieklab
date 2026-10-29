// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SCALE_SETTINGS, type KeyId, type ScaleType } from '../../../core/api';
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

/** Plays a round of these keys (G major) without a mistake on TODAY, then shows Round done. */
function Round({ keys = ['G'], types = ['major'] }: { keys?: KeyId[]; types?: ScaleType[] }): JSX.Element | null {
  const { state, dispatch } = useStore();
  useEffect(() => {
    const run = makeScaleRun({ ...DEFAULT_SCALE_SETTINGS, keyMode: 'pick', keys, types }, 5);
    dispatch({ type: 'scaleStart', run });
    dispatch({ type: 'scaleFinish', played: run.scales.map((scale) => ({ scale, mistakes: 0 })), today: TODAY, seconds: 30 });
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

// The circle draws one dot per position, but B and C♭, F♯ and G♭, D♭ and C♯ are two scales each: both are named when
// both reach ★★ in the round, as the count beside them counts both.
describe('Round done: the circle card', () => {
  it('names both spellings of a position that reached two stars', () => {
    const { unmount } = render(
      <StoreProvider>
        <Round keys={['F#', 'Gb', 'Db', 'C#']} />
      </StoreProvider>,
    );
    expect(screen.getByText(/reached ★★ this round/).textContent).toContain('F♯ major, G♭ major, D♭ major and C♯ major reached ★★ this round.');
    // Said in words to a screen reader.
    expect(screen.getByRole('img', { name: /New this round: F sharp major, G flat major, D flat major and C sharp major\.$/ })).toBeTruthy();
    unmount();
    localStorage.clear();

    render(
      <StoreProvider>
        <Round keys={['B', 'Cb']} types={['natural']} />
      </StoreProvider>,
    );
    expect(screen.getByText(/reached ★★ this round/).textContent).toContain('G♯ minor and A♭ minor reached ★★ this round.');
  });
});
