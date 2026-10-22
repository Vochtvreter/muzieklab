// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { levelStart } from '../../game/xp';
import { LevelContent, LevelUpContent } from './Reward';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LevelContent (Home level details)', () => {
  it('shows the level and rank, the next rank, the rank ladder and one XP label', () => {
    const onDone = vi.fn();
    render(<LevelContent xp={0} onDone={onDone} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Level 1 · Tick' })).toBeTruthy();
    expect(screen.getByText('Count at level 3')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Ranks' }).querySelector('[aria-current="step"]')?.textContent).toBe('Tick');
    expect(screen.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeTruthy();
    expect(screen.getByText('100 XP to level 2')).toBeTruthy();
    expect(screen.queryByText(/\/ 100 XP/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('says so at the top rank', () => {
    render(<LevelContent xp={levelStart(16)} onDone={() => undefined} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Level 16 · Maestro' })).toBeTruthy();
    expect(screen.getByText('The top rank')).toBeTruthy();
  });
});

describe('LevelUpContent', () => {
  it('says what comes next instead of the level it came from, and labels the bar once', () => {
    vi.useFakeTimers();
    render(<LevelUpContent xpBefore={90} xpAfter={levelStart(2) + 35} onDone={() => undefined} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Level 2 · Tick' })).toBeTruthy();
    expect(screen.getByText('Count at level 3')).toBeTruthy();
    expect(screen.queryByText(/Up from level/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.getByRole('img', { name: 'XP bar: 35 of 150' })).toBeTruthy();
    expect(screen.getAllByText(/XP to level/)).toHaveLength(1);
    expect(screen.getByText('115 XP to level 3')).toBeTruthy();
  });

  it('names the new rank when the rank changes', () => {
    render(<LevelUpContent xpBefore={levelStart(3) - 5} xpAfter={levelStart(3) + 5} onDone={() => undefined} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Level 3 · Count' })).toBeTruthy();
    expect(screen.getByText('New rank: up from Tick')).toBeTruthy();
  });
});
