// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { levelStart } from '../../game/xp';
import { setLocale } from '../../i18n';
import { AchievementBadges, CodeCopy, LevelContent, LevelUpContent } from './Reward';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setLocale('en');
});

/** A level-up row's title, whose percentage is set apart in its own element. */
const title = (text: string): HTMLElement => screen.getByText((_, el) => el?.tagName === 'B' && el.textContent === text);

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

  it('lists the achievements and the personal best the run earned, then See progress and Continue', () => {
    const onDone = vi.fn();
    render(
      <LevelUpContent xpBefore={90} xpAfter={levelStart(2) + 35} achievements={['perfectBar', 'firstSixteenths']}
        best={{ kind: 'lesson', lesson: '14.3', accuracy: 80 }} onDone={onDone} />,
    );
    const rows = within(screen.getByRole('list', { name: '' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Achievement unlockedPerfect barA whole bar with every note Perfect',
      'Achievement unlockedFirst sixteenthsTwo stars on a rhythm with sixteenths',
      'New personal bestLesson 14.3 · 80%Your best accuracy on this lesson so far',
    ]);
    // One after another, once the sheet is up (App design canvas, Resolve · Level up: .45 s, then .6 s).
    expect(rows.map((r) => r.style.animationDelay)).toEqual(['450ms', '600ms', '750ms']);
    expect(screen.getByRole('link', { name: 'See progress' }).getAttribute('href')).toBe('#/progress');
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go.hasAttribute('data-autofocus')).toBe(true);
    fireEvent.click(go);
    expect(onDone).toHaveBeenCalled();
  });

  it("a daily challenge's best; no list when the run earned nothing more than the level", () => {
    render(<LevelUpContent xpBefore={90} xpAfter={110} best={{ kind: 'daily', accuracy: 92 }} onDone={() => undefined} />);
    expect(title('Daily challenge · 92%')).toBeTruthy();
    expect(screen.getByText('Your best accuracy on a daily challenge so far')).toBeTruthy();
    cleanup();
    const { container } = render(<LevelUpContent xpBefore={90} xpAfter={110} onDone={() => undefined} />);
    expect(container.querySelector('.levelup-rows')).toBeNull();
    expect(screen.getByRole('link', { name: 'See progress' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('in Dutch', () => {
    setLocale('nl');
    render(<LevelUpContent xpBefore={90} xpAfter={110} achievements={['streak7']} best={{ kind: 'lesson', lesson: '2.1', accuracy: 88 }} onDone={() => undefined} />);
    expect(screen.getByText('Prestatie behaald')).toBeTruthy();
    expect(screen.getByText('7 dagen op rij')).toBeTruthy();
    expect(title('Les 2.1 · 88%')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bekijk voortgang' })).toBeTruthy();
  });
});

describe('AchievementBadges (a summary screen, a run without a level)', () => {
  it('shows a gold badge per achievement, its description as the title', () => {
    render(<AchievementBadges ids={['perfectBar', 'tempo160']} />);
    const badge = screen.getByText('Achievement unlocked · Perfect bar');
    expect(badge.className).toBe('badge badge--gold');
    expect(badge.getAttribute('title')).toBe('A whole bar with every note Perfect');
    expect(screen.getByText('Achievement unlocked · Played at 160 BPM')).toBeTruthy();
  });
});

describe('CodeCopy (Results)', () => {
  const code = 'T44-HQ-R-4B-66-XN-603QC0';
  const refused = (): void => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(() => Promise.reject(new DOMException('denied', 'NotAllowedError'))) } });
  };

  it('copies the code and says Copied for 2 seconds', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<CodeCopy code={code} className="ghost-btn" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    });
    expect(writeText).toHaveBeenCalledWith(code);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
  });

  it('copies another way when the clipboard refuses, and gives the focus back to the button', async () => {
    refused();
    let copied = '';
    document.execCommand = vi.fn(() => {
      copied = String(document.getSelection()) || (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });
    render(<CodeCopy code={code} className="ghost-btn" />);
    const button = screen.getByRole('button', { name: 'Copy code' });
    button.focus();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(copied).toBe(code);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the code selected, to copy by hand, when copying is not allowed at all', async () => {
    for (const block of [refused, () => vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })]) {
      block();
      document.execCommand = vi.fn(() => false);
      render(<CodeCopy code={code} className="ghost-btn" />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
      });
      const field = screen.getByRole('textbox', { name: 'Exercise code' }) as HTMLInputElement;
      expect(field.value).toBe(code);
      expect(field.readOnly).toBe(true);
      expect(document.activeElement).toBe(field);
      expect(field.selectionEnd! - field.selectionStart!).toBe(code.length);
      expect(screen.getByRole('status').textContent).toMatch(/^Selected/);
      cleanup();
    }
  });
});
