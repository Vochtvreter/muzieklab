// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App';
import { defaultProgress, PROGRESS_KEY, type Progress } from '../../../game/storage';
import { setLocale } from '../../../i18n';

// The screen's width for useBreakpoint: phone unless a test sets it (the hook keeps one MediaQueryList per query).
let width = 390;
window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? width >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;
window.scrollTo = () => undefined;

/**
 * The Skill levels board's player on its "today", Thursday 15 October 2026: rhythm 6, ear 4, treble 5, bass 3, scales 3
 * and theory 4 (25 of 60), four levels passed in the last 30 days, theory last practised 16 days ago.
 */
function boardProgress(): Progress {
  const lessons: Progress['lessons'] = {};
  for (let u = 1; u <= 6; u++) for (let i = 1; i <= 5; i++) lessons[`${u}.${i}`] = { stars: 3, bestAccuracy: 93 };
  for (let i = 1; i <= 4; i++) lessons[`7.${i}`] = { stars: 2, bestAccuracy: 84 };
  lessons['7.5'] = { stars: 1, bestAccuracy: 70 };
  const passed = (skill: string, days: string[]): Record<string, string> => Object.fromEntries(days.map((d, i) => [`${skill}:${i + 1}`, d]));
  return {
    ...defaultProgress(),
    lessons,
    practiceDays: ['2026-10-13', '2026-10-14', '2026-10-15'],
    xp: 1445,
    scales: { settings: null, stars: { 'C-major': 3, 'G-major': 3, 'F-major': 3, 'D-major': 2, 'Bb-major': 2, 'A-major': 1, 'Eb-major': 1 } },
    learnRead: ['1.1', '1.2', '1.3', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '4.3', '5.1'],
    stats: {
      days: { '2026-10-14': { sec: 600, rounds: 2, acc: 176, off: -440, hits: 20, cells: { dottedQE: [1440, 2000] } } },
      clefs: {},
      noteMs: {},
      lastKey: null,
      reading: { 'treble:6': [84, 2200], 'bass:4': [74, 2400] },
      echo: { '5': [3, 1] },
      seen: { rhythm: '2026-10-15', ear: '2026-10-14', treble: '2026-10-13', bass: '2026-10-10', scales: '2026-10-12', theory: '2026-09-29' },
    },
    skills: {
      ...passed('rhythm', ['2026-06-01', '2026-06-20', '2026-07-10', '2026-08-06', '2026-08-27', '2026-09-25']),
      ...passed('ear', ['2026-06-15', '2026-07-12', '2026-08-12', '2026-09-24']),
      ...passed('treble', ['2026-06-10', '2026-07-05', '2026-07-30', '2026-08-20', '2026-10-01']),
      ...passed('bass', ['2026-07-01', '2026-08-05', '2026-09-02']),
      ...passed('scales', ['2026-08-04', '2026-08-26', '2026-09-30']),
      ...passed('theory', ['2026-07-01', '2026-07-28', '2026-08-12', '2026-08-25']),
    },
  };
}

const open = (hash: string, progress: Progress | null = boardProgress()): void => {
  if (progress) localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  window.location.hash = hash;
  render(<App />);
};
const stored = (): Progress => JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Progress;
/** The main navigation: the tab bar on phone, the top header on tablet and desktop. */
const mainNav = (): HTMLElement => (width >= 700 ? within(screen.getByRole('banner')) : screen).getByRole('navigation', { name: 'Main' });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLocale('en');
  width = 390;
});

describe('Skill levels', () => {
  for (const w of [390, 834, 1280]) {
    it(`lists the six skills, each a link to its own screen, under the Progress tab (${w} px)`, () => {
      width = w;
      open('#/progress/skills');
      expect(screen.getByRole('heading', { level: 1, name: 'Skill levels' })).toBeTruthy();
      expect(document.title).toBe('Skill levels · Muzieklab');
      expect(screen.getByRole('link', { name: 'Back to Progress' }).getAttribute('href')).toBe('#/progress');
      expect(within(mainNav()).getByRole('link', { name: 'Progress' }).getAttribute('aria-current')).toBe('page');
      expect(screen.getByRole('img', { name: '25 of 60 levels' })).toBeTruthy();

      const tiles = within(screen.getByRole('region', { name: 'Last 30 days' }));
      expect(tiles.getByText('+4')).toBeTruthy();
      expect(tiles.getByText('levels up in 30 days')).toBeTruthy();
      expect(tiles.getByText('review due · Theory')).toBeTruthy();

      const list = within(screen.getByRole('region', { name: 'Your skills' }));
      const rows = list.getAllByRole('link');
      expect(rows.map((a) => a.getAttribute('href'))).toEqual(
        ['rhythm', 'ear', 'treble', 'bass', 'scales', 'theory'].map((s) => '#/progress/skills/' + s),
      );
      expect(rows[0].getAttribute('aria-label')).toBe('Rhythm reading: level 6 of 10. 1 of 3 checks for level 7, Dotted notes. +1 this month.');
      expect(rows[3].getAttribute('aria-label')).toBe('Bass clef: level 3 of 10. 0 of 2 checks for level 4, Middle C down to F.');
      expect(rows[5].getAttribute('aria-label')).toBe('Theory: level 4 of 10. 1 of 3 checks for level 5, Making notes longer. Review due.');
      // The level meter: six levels passed, and the 7th a third done (1 of 3 checks), in gold.
      const segs = rows[0].querySelectorAll('.skill-seg');
      expect(segs).toHaveLength(10);
      expect(rows[0].querySelectorAll('.skill-seg-fill:not(.is-part)')).toHaveLength(6);
      expect((segs[6].querySelector('.is-part') as HTMLElement).style.width).toBe('33%');

      const focus = within(screen.getByRole('region', { name: 'Focus next' }));
      expect(focus.getByText(/is your lowest skill/).textContent).toBe('Bass clef is your lowest skill: level 3, 2 levels behind treble clef.');
      expect(focus.getByText('Bass clef').tagName).toBe('B');
      expect(focus.getByRole('link', { name: 'Read bass notes' }).getAttribute('href')).toBe('#/notes');
      expect(screen.getByText(/^A level is passed when all its checks are met/).textContent).toContain('for 14 days shows Review due until');
    });
  }

  it("Focus next's button puts its clef on the Read notes setup", () => {
    open('#/progress/skills');
    fireEvent.click(screen.getByRole('link', { name: 'Read bass notes' }));
    expect(stored().notes.settings?.clefs).toEqual(['bass']);
  });

  it('a new player: no levels yet, nothing due, all skills level', () => {
    open('#/progress/skills', null);
    expect(screen.getByRole('img', { name: '0 of 60 levels' })).toBeTruthy();
    const tiles = within(screen.getByRole('region', { name: 'Last 30 days' }));
    expect(tiles.getByText('No review due')).toBeTruthy();
    expect(screen.getByText('Your skills are all at level 0.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /: level 0 of 10\. 0 of \d+ checks? for level 1, / })).toHaveLength(6);
    // Treble clef, Bass clef and Scales have one check for level 1: "check", as the skill's screen writes it.
    expect(screen.getByRole('link', { name: 'Treble clef: level 0 of 10. 0 of 1 check for level 1, Lines: E G B D F.' })).toBeTruthy();
    expect(screen.queryAllByRole('link', { name: /0 of 1 checks/ })).toHaveLength(0);
    // Rhythm reading comes first in the skills' order: its button opens the Learning path.
    expect(screen.getByRole('link', { name: 'Continue unit 2' }).getAttribute('href')).toBe('#/path');
  });

  it('in Dutch', () => {
    localStorage.setItem('muzieklab.prefs.v1', JSON.stringify({ language: 'nl' }));
    open('#/progress/skills');
    expect(screen.getByRole('heading', { level: 1, name: 'Vaardigheden' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terug naar Voortgang' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '25 van 60 niveaus' })).toBeTruthy();
    expect(screen.getByText('te herhalen · Theorie')).toBeTruthy();
    expect(screen.getByText('10 niveaus per vaardigheid')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ritme lezen: niveau 6 van 10. 1 van 3 voorwaarden voor niveau 7, Gepunteerde noten. +1 deze maand.' })).toBeTruthy();
    expect(screen.getByText(/is je laagste vaardigheid/).textContent).toBe('Bassleutel is je laagste vaardigheid: niveau 3, 2 niveaus achter op de vioolsleutel.');
  });
});

describe('One skill', () => {
  for (const w of [390, 834, 1280]) {
    it(`rhythm reading: the level, the next level's checks and button, 12 weeks and all levels (${w} px)`, () => {
      width = w;
      open('#/progress/skills/rhythm');
      expect(screen.getByRole('heading', { level: 1, name: 'Rhythm reading' })).toBeTruthy();
      expect(document.title).toBe('Rhythm reading · Muzieklab');
      expect(screen.getByRole('link', { name: 'Back to Skill levels' }).getAttribute('href')).toBe('#/progress/skills');
      expect(within(mainNav()).getByRole('link', { name: 'Progress' }).getAttribute('aria-current')).toBe('page');
      expect(screen.getByRole('img', { name: 'Level 6 of 10, and 1 of 3 checks for level 7' })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Review due' })).toBeNull();

      const next = within(screen.getByRole('region', { name: 'Next · level 7' }));
      expect(next.getByText('Dotted notes')).toBeTruthy();
      expect(next.getByText('1 of 3').closest('.skill-meta')?.textContent).toBe('1 of 3 checks');
      expect(next.getByRole('img', { name: '1 of 3 checks done' })).toBeTruthy();
      const checks = next.getAllByRole('listitem');
      expect(checks.map((li) => li.textContent)).toEqual([
        'Done: Lessons 14.1–14.4 at ★★ or more',
        'Dotted quarter + eighth at 85%now 72%',
        'Unit review 14.5 at ★★★now 1 star',
      ]);
      expect(next.getByRole('link', { name: 'Continue unit 14' }).getAttribute('href')).toBe('#/path');

      const hist = within(screen.getByRole('region', { name: 'Level · 12 weeks' }));
      expect(hist.getByText('+1 in 30 days')).toBeTruthy();
      expect(hist.getByRole('img', { name: 'Level over the last 12 weeks: from 3 to 6.' })).toBeTruthy();

      const ladder = within(screen.getByRole('region', { name: 'All levels' }));
      const levels = ladder.getAllByRole('listitem');
      expect(levels).toHaveLength(10);
      expect(ladder.getAllByText('Passed')).toHaveLength(6);
      expect(levels[6].textContent).toBe('7Dotted notes1 of 3');
      expect(levels[9].textContent).toBe('10Six-eight');
    });
  }

  it('theory, due for review: the review card opens the next chapter', () => {
    open('#/progress/skills/theory');
    const review = within(screen.getByRole('region', { name: 'Review due' }));
    expect(review.getByText('Last practised 16 days ago. Your level stays; one round clears this.')).toBeTruthy();
    expect(review.getByRole('link', { name: 'Continue chapter 5' }).getAttribute('href')).toBe('#/learn/5');
    const next = within(screen.getByRole('region', { name: 'Next · level 5' }));
    expect(next.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Done: Read 5.1 Ties', 'Read 5.2 Dotted notes', 'Read 5.3 Dotted eighth and sixteenth']);
    expect(screen.getByRole('region', { name: 'Level · 12 weeks' }).textContent).toContain('No change in 30 days');
  });

  it("rhythm by ear's button puts Echo mode on the rhythm setup", () => {
    open('#/progress/skills/ear');
    const cta = screen.getByRole('link', { name: 'Practice Echo' });
    expect(cta.getAttribute('href')).toBe('#/setup');
    fireEvent.click(cta);
    // The setup (where the link goes) opens with Echo picked.
    act(() => {
      window.location.hash = '#/setup';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('group', { name: 'Mode' }).querySelector('[aria-pressed="true"]')?.textContent).toBe('Echo');
  });

  it("the clefs' button puts the clef on the Read notes setup", () => {
    open('#/progress/skills/treble');
    fireEvent.click(screen.getByRole('link', { name: 'Read treble notes' }));
    expect(stored().notes.settings?.clefs).toEqual(['treble']);
  });

  it('a click that opens the button in a new tab leaves this tab\'s setups as they are', () => {
    open('#/progress/skills/treble');
    const before = stored();
    fireEvent.click(screen.getByRole('link', { name: 'Read treble notes' }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'Read treble notes' }), { metaKey: true });
    expect(stored().notes).toEqual(before.notes);
    cleanup();
    open('#/progress/skills/ear');
    fireEvent.click(screen.getByRole('link', { name: 'Practice Echo' }), { shiftKey: true });
    act(() => {
      window.location.hash = '#/setup';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('group', { name: 'Mode' }).querySelector('[aria-pressed="true"]')?.textContent).not.toBe('Echo');
  });

  it('levels without lessons yet come later, without checks', () => {
    const p = boardProgress();
    p.skills = { ...p.skills, 'rhythm:7': '2026-10-10', 'rhythm:8': '2026-10-12' };
    open('#/progress/skills/rhythm', p);
    const next = within(screen.getByRole('region', { name: 'Next · level 9' }));
    expect(next.getByText('Syncopation')).toBeTruthy();
    expect(next.getByText('This level comes later, with its lessons.')).toBeTruthy();
    expect(next.queryByRole('listitem')).toBeNull();
    expect(next.queryByText(/checks/)).toBeNull();
    expect(next.getByRole('link', { name: 'Free practice' }).getAttribute('href')).toBe('#/setup');
    expect(screen.getByRole('img', { name: 'Level 8 of 10' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'All levels' })).getAllByRole('listitem')[8].textContent).toBe('9SyncopationLater');
  });

  it('a new player: one check for level 1 is "1 check" in the labels too, in English and in Dutch', () => {
    open('#/progress/skills/treble', null);
    expect(screen.getByRole('img', { name: 'Level 0 of 10, and 0 of 1 check for level 1' })).toBeTruthy();
    const next = within(screen.getByRole('region', { name: 'Next · level 1' }));
    expect(next.getByText('0 of 1').closest('.skill-meta')?.textContent).toBe('0 of 1 check');
    expect(next.getByRole('img', { name: '0 of 1 check done' })).toBeTruthy();
    cleanup();
    localStorage.setItem('muzieklab.prefs.v1', JSON.stringify({ language: 'nl' }));
    open('#/progress/skills/treble', null);
    expect(screen.getByRole('img', { name: 'Niveau 0 van 10, en 0 van 1 voorwaarde voor niveau 1' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '0 van 1 voorwaarde gehaald' })).toBeTruthy();
  });

  it('every level passed', () => {
    const p = boardProgress();
    for (let n = 4; n <= 10; n++) p.skills[`scales:${n}`] = '2026-10-14';
    open('#/progress/skills/scales', p);
    expect(screen.getByRole('img', { name: 'Level 10 of 10' })).toBeTruthy();
    const card = within(screen.getByRole('region', { name: 'Level 10' }));
    expect(card.getByText('Every level passed')).toBeTruthy();
    expect(card.getByRole('link', { name: 'Practice scales' }).getAttribute('href')).toBe('#/scales');
    expect(within(screen.getByRole('region', { name: 'All levels' })).getAllByText('Passed')).toHaveLength(10);
  });

  it('in Dutch', () => {
    localStorage.setItem('muzieklab.prefs.v1', JSON.stringify({ language: 'nl' }));
    open('#/progress/skills/theory');
    expect(screen.getByRole('heading', { level: 1, name: 'Theorie' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terug naar Vaardigheden' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Niveau 4 van 10, en 1 van 3 voorwaarden voor niveau 5' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Herhalen' }).textContent).toContain('16 dagen geleden voor het laatst geoefend.');
    expect(screen.getByRole('region', { name: 'Volgende · niveau 5' }).textContent).toContain('1 van 3 voorwaarden');
    expect(screen.getByRole('region', { name: 'Niveau · 12 weken' }).textContent).toContain('Geen verandering in 30 dagen');
  });
});
