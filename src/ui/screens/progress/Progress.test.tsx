// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, PROGRESS_CLOCK, PROGRESS_PREFS, richProgress } from '../../../../e2e/progressFixture';
import { App } from '../../../App';
import { DEFAULT_SETTINGS } from '../../../core/defaults';
import { generateExercise } from '../../../core/generator';
import { noteCells } from '../../../game/cells';
import { syncedOf } from '../../../game/merge';
import { defaultProgress, defaultStats, DEFAULT_PREFS, PREFS_KEY, PROGRESS_KEY, type Progress } from '../../../game/storage';
import type { Settings } from '../../../core/types';
import { setLocale, t } from '../../../i18n';
import { resetAccountCheck } from '../../account';
import { signedMs } from '../../lib/format';
import { RUN_KEY, StoreProvider, useStore } from '../../store';
import { ProgressScreen } from './Progress';

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
    addListener: () => undefined,
    removeListener: () => undefined,
  }) as unknown as MediaQueryList;
window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

/** The rhythm setup the store holds, read after the screen changed it; and the store's dispatch. */
let settings: Settings | null = null;
let dispatch: ReturnType<typeof useStore>['dispatch'] | null = null;
function SettingsProbe(): null {
  const store = useStore();
  settings = store.state.settings;
  dispatch = store.dispatch;
  return null;
}

/** The Progress tab on the boards' today (Thursday 15 October 2026), with `progress` saved. */
function show(progress: Progress, at = 390): void {
  width = at;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  localStorage.setItem(PREFS_KEY, JSON.stringify(PROGRESS_PREFS));
  render(
    <StoreProvider>
      <ProgressScreen />
      <SettingsProbe />
    </StoreProvider>,
  );
}

/** The sample player with each of the charts' 14 days (Oct 2–15) played at a mean timing offset of `off` ms. */
function timingAt(off: number): Progress {
  const p = richProgress();
  for (let d = 2; d <= 15; d++) p.stats.days[`2026-10-${String(d).padStart(2, '0')}`] = { sec: 600, rounds: 2, acc: 170, off: off * 40, hits: 40, cells: {} };
  return p;
}

const view = (name: string, group = 'Show progress for'): void => {
  fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('button', { name }));
};
const heading = (name: string): HTMLElement => screen.getByRole('heading', { level: 2, name });
const headings = (): string[] => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
/** An element's words as shown (without what is there for screen readers only), and as a screen reader hears them. */
const without = (el: Element, selector: string): string => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(selector).forEach((x) => x.remove());
  return copy.textContent ?? '';
};
const seen = (el: Element): string => without(el, '.sr-only');
const heard = (el: Element): string => without(el, '[aria-hidden="true"]');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(PROGRESS_CLOCK));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLocale('en');
  width = 390;
  window.location.hash = '';
});

describe('Progress tab, phone (App design canvas, Mobile · Progress)', () => {
  it('heads every view with the streak, the level line, the switch and Skill levels; Rhythm shows its six cards', () => {
    show(richProgress());
    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toBeTruthy();
    expect(screen.getByText('12-day streak', { selector: '.streak-pill' })).toBeTruthy();
    expect(screen.getByText('1445 / 1750 XP')).toBeTruthy();
    expect(screen.getByText(/^305 XP to level 8 · next rank/).textContent).toBe('305 XP to level 8 · next rank Groove');
    expect(screen.getByRole('img', { name: '95 of 400 XP, 23 percent of the way to level 8' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rhythm' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('link', { name: /^Skill levels/ }).getAttribute('href')).toBe('#/progress/skills');
    expect(screen.getByText('25 of 60 levels · 6 skills · 1 review due')).toBeTruthy();
    expect(headings()).toEqual(['12-day streak', 'Accuracy · 14 days', 'Minutes this week', 'Skill map · rhythm cells', 'Timing tendency', 'Achievements']);
    // The boards' labels, from the data.
    screen.getByRole('img', {
      name: 'Practice calendar, Sep 14 to Oct 18. Practised 28 of 32 days; missed Sep 16, Sep 20, Sep 25 and Oct 3; streak from Oct 4 to today, Oct 15.',
    });
    // The average is rounded down (§6.3): 82%, where the boards still read 83%.
    screen.getByRole('img', { name: 'Rhythm accuracy per day from Oct 2 to Oct 15, rising from 76% to 88% on Oct 14, 80% today; no rhythm rounds on Oct 3. Average 82%.' });
    screen.getByRole('img', { name: 'Minutes practised this week: Monday 14, Tuesday 9, Wednesday 17 and today Thursday 11; 51 minutes in total.' });
    screen.getByRole('img', {
      name: 'Average timing offset per day from Oct 2 to Oct 15: from minus 52 ms, rushing, to minus 22 ms today, inside the steady band from minus 40 to plus 30 ms.',
    });
    expect(screen.getByText('Was rushing (−52 ms). A little early is normal.')).toBeTruthy();
    const cells = within(heading('Skill map · rhythm cells').closest('section')!);
    expect(cells.getAllByRole('listitem').map((c) => c.getAttribute('aria-label'))).toEqual([
      'Quarter: 96%',
      'Half: 97%',
      'Eighths: 89%',
      'Rests: 86%',
      'Ties: 78%, weak spot',
      'Dotted half: 91%',
      'Dotted quarter + eighth: 72%, weak spot',
      'Sixteenths: locked until unit 16',
    ]);
    const badges = within(heading('Achievements').closest('section')!);
    expect(badges.getByText('3 earned')).toBeTruthy();
    expect(badges.getAllByText('Earned')).toHaveLength(3);
    expect(badges.getAllByText('Locked')).toHaveLength(2);
    // Each badge reads its name, its status and then what it asks for (no title to stand in for its name).
    const streak7 = badges.getAllByRole('listitem')[0];
    expect(streak7.textContent).toBe('7-day streakEarnedPractice on seven days in a row');
    expect(streak7.hasAttribute('title')).toBe(false);
    // Phone has the level line, not the Level card with its ranks.
    expect(screen.queryByRole('list', { name: 'Ranks' })).toBeNull();
  });

  it('Notes: accuracy per clef, the slowest notes and the last key; Scales: the major and minor scales', () => {
    show(richProgress());
    view('Notes');
    expect(headings()).toEqual(['Accuracy per clef', 'Slowest notes', 'Key']);
    screen.getByRole('img', { name: 'Note reading accuracy: treble clef 88% and bass clef 74%.' });
    const slow = within(heading('Slowest notes').closest('section')!).getAllByRole('listitem');
    expect(slow.map(seen)).toEqual(['𝄞Etop space · treble3.1 s', '𝄞F♯top line · treble2.6 s', '𝄢Csecond space · bass2.4 s']);
    expect(screen.getByText('G major · E minor')).toBeTruthy();
    expect(screen.getByText('1 sharp: every F is F♯')).toBeTruthy();
    expect(screen.getByText('last round · treble')).toBeTruthy();
    // The setup it opens goes back to Progress, as do the other practice buttons here.
    expect(screen.getByRole('link', { name: 'Read notes' }).getAttribute('href')).toBe('#/notes?from=progress');
    expect(screen.getByRole('link', { name: /^Skill levels/ })).toBeTruthy();

    view('Scales');
    expect(headings()).toEqual(['Major scales', 'Minor scales']);
    screen.getByRole('img', { name: '5 of 15 major scales with two stars or more' });
    const majors = within(heading('Major scales').closest('section')!).getAllByRole('listitem');
    expect(majors).toHaveLength(15);
    expect(majors[0].getAttribute('aria-label')).toBe('C\u00a0major: 3 of 3 stars');
    expect(majors[9].getAttribute('aria-label')).toBe('B flat\u00a0major: 2 of 3 stars');
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((r) => r.querySelector('th')?.textContent)).toEqual(['Key', 'A\u00a0minor', 'E\u00a0minor', 'D\u00a0minor', 'B\u00a0minor']);
    expect(screen.getByRole('link', { name: 'Open the circle of fifths' }).getAttribute('href')).toBe('#/scales?from=progress');
  });

  // As on the Scales hub: a screen reader reads a sign as a symbol or skips it, and F♯ major would then sound like F
  // major. The screen shows the signs.
  it('names keys and notes with a sign in words for screen readers: F sharp major, F sharp minor', () => {
    const p = richProgress();
    p.stats.lastKey = { key: 'F#', clef: 'treble' };
    p.scales.stars['F#-natural'] = 1;
    show(p);
    view('Notes');
    screen.getByRole('img', { name: 'Key signature of F sharp\u00a0major: 6 sharps' });
    expect(screen.getByText('F♯ major · D♯ minor')).toBeTruthy();
    // The card's lines too, which come straight after the staff's name: as written, and in words.
    const key = heading('Key').closest('section')!;
    expect(seen(key)).toContain('F♯\u00a0major · D♯\u00a0minor6 sharps: F♯, C♯, G♯, D♯, A♯, E♯');
    expect(heard(key)).toContain('F sharp\u00a0major · D sharp\u00a0minor6 sharps: F sharp, C sharp, G sharp, D sharp, A sharp, E sharp');
    expect(heard(key)).not.toMatch(/[♯♭]/);
    // The slowest notes as the last round's key spells them.
    const slow = within(heading('Slowest notes').closest('section')!).getAllByRole('listitem');
    expect(slow.map(seen)).toEqual(['𝄞E♯top space · treble3.1 s', '𝄞F♯top line · treble2.6 s', '𝄢C♯second space · bass2.4 s']);
    expect(slow.map(heard)).toEqual(['E sharptop space · treble3.1 s', 'F sharptop line · treble2.6 s', 'C sharpsecond space · bass2.4 s']);

    view('Scales');
    const majors = within(heading('Major scales').closest('section')!).getAllByRole('listitem');
    expect(majors[6].getAttribute('aria-label')).toBe('F sharp\u00a0major: 0 of 3 stars');
    const row = screen.getByRole('rowheader', { name: 'F sharp\u00a0minor' });
    expect(row.textContent).toBe('F♯\u00a0minor');
  });

  it('Practice weak spots puts the weak cells on the rhythm setup and opens it', () => {
    show(richProgress());
    const before = settings!;
    expect(before.ties).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: 'Practice weak spots' }));
    expect(window.location.hash).toBe('#/setup?from=progress');
    // Ties (78%) and dotted quarter + eighth (72%) are the weak spots.
    expect(settings).toMatchObject({ ties: true, dotted: true });
    expect(settings!.notes).toEqual(expect.arrayContaining(['quarter', 'eighth']));
  });

  describe('started from the setup it opens', () => {
    // newSeed's seed for Start. Its exercise of these settings has no dotted half.
    const seed = 12345;
    const stored = (): { settings: Settings; seed: number; shows?: string[] } => JSON.parse(sessionStorage.getItem(RUN_KEY) ?? 'null');
    const dottedHalf = (settings: Settings, at: number): boolean => noteCells(generateExercise(settings, at)).some((c) => c.includes('dottedHalf'));
    /** Only the dotted half under 80%, on a setup of 1 bar with eighths, which the path teaches before it (unit 4). */
    const weakDottedHalf = (): Progress => ({
      ...defaultProgress(),
      practiceDays: ['2026-10-15'],
      lastSettings: { ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'eighth'], bars: 1 },
      stats: { ...defaultStats(), days: { '2026-10-15': { sec: 600, rounds: 2, acc: 160, off: -20, hits: 30, cells: { quarter: [1900, 2000], half: [1900, 2000], dottedHalf: [1000, 2000] } } } },
    });
    const start = async (): Promise<void> => {
      fireEvent.click(await screen.findByRole('button', { name: /^Start · / }));
      await screen.findByRole('link', { name: 'Quit exercise' });
    };
    beforeEach(() => {
      sessionStorage.clear();
      resetAccountCheck();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
      vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
        (a as unknown as Uint32Array)[0] = seed * 2;
        return a;
      });
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(weakDottedHalf()));
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...PROGRESS_PREFS, seenHowTo: true, seenHold: true }));
      window.location.hash = '#/progress';
      render(<App />);
      fireEvent.click(screen.getByRole('link', { name: 'Practice weak spots' }));
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('Start plays an exercise with the weak cell, also with eighths on, where most exercises have no dotted half', async () => {
      await start();
      const run = stored();
      // 3 bars: with eighths on, 1 exercise of 2 bars in 6 has a dotted half (1 in 3 of 3 bars).
      expect(run.settings).toMatchObject({ dotted: true, bars: 3, notes: ['half', 'quarter', 'eighth'], meters: ['3/4', '4/4'] });
      // The start seed's exercise has none: the start looks further, as a Learn practice link does, and Next will too.
      expect(dottedHalf(run.settings, seed)).toBe(false);
      expect(dottedHalf(run.settings, run.seed)).toBe(true);
      expect(run.shows).toEqual(['cell:dottedHalf']);
    });

    it('only the run it starts: the setup changed by hand, or started again, plays as it comes', async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'More bars' }));
      await start();
      expect(stored()).toMatchObject({ seed, settings: { bars: 4, dotted: true } });
      expect(stored().shows).toBeUndefined();
      // The preset again and its run, then the setup it left started once more.
      window.location.hash = '#/progress';
      fireEvent.click(await screen.findByRole('link', { name: 'Practice weak spots' }));
      await start();
      expect(stored().shows).toEqual(['cell:dottedHalf']);
      window.location.hash = '#/setup';
      await start();
      expect(stored()).toMatchObject({ seed, settings: { bars: 4, dotted: true } });
      expect(stored().shows).toBeUndefined();
    });
  });

  it('a new player: every card says what is still to come, and there are no weak spots to practise', () => {
    show(emptyProgress());
    expect(screen.getByText('No streak yet', { selector: '.streak-pill' })).toBeTruthy();
    expect(screen.getByText('0 / 100 XP')).toBeTruthy();
    expect(screen.getAllByText('No rhythm rounds in the last 14 days.')).toHaveLength(2);
    expect(screen.getByText('No practice this week yet.')).toBeTruthy();
    expect(screen.getByText('0 earned')).toBeTruthy();
    expect(screen.getByText('0 of 60 levels · 6 skills · no review due')).toBeTruthy();
    expect(t('progress.skillsSub', { total: 30, max: 60, count: 6, due: 2 })).toBe('30\u00a0of 60\u00a0levels · 6\u00a0skills · 2\u00a0reviews\u00a0due');
    expect(screen.queryByRole('link', { name: 'Practice weak spots' })).toBeNull();
    expect(screen.getByRole('listitem', { name: 'Quarter: locked until unit 2' })).toBeTruthy();
    view('Notes');
    expect(screen.getAllByText('No Read notes round yet.')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Read notes' })).toBeTruthy();
    view('Scales');
    expect(screen.getByText('No minor scale started yet.')).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'C\u00a0major: 0 of 3 stars' })).toBeTruthy();
  });
});

describe('Progress tab, tablet and desktop (App design canvas, ProgressTablet and ProgressDesktop)', () => {
  it('tablet: the Level card with its ranks beside the streak, Skill levels, then the view in two columns', () => {
    show(richProgress(), 834);
    expect(screen.queryByText('12-day streak', { selector: '.streak-pill' })).toBeNull();
    heading('Level 7 · Measure');
    const ranks = within(screen.getByRole('list', { name: 'Ranks' })).getAllByRole('listitem');
    expect(ranks.map((r) => r.getAttribute('aria-current'))).toEqual([null, null, 'step', null, null, null]);
    expect(ranks[2].textContent).toBe('MeasureLevel 7 · now');
    expect(ranks[3].textContent).toBe('Groovenext');
    expect(screen.getByText('1445 / 1750 XP')).toBeTruthy();
    expect(screen.getByText(/to level 8$/).textContent).toBe('305 XP to level 8');
    expect(headings()).toEqual([
      'Level 7 · Measure',
      '12-day streak',
      'Accuracy · 14 days',
      'Timing tendency',
      'Skill map · rhythm cells',
      'Minutes this week',
      'Achievements',
    ]);
    expect(screen.getByRole('link', { name: /^Skill levels/ })).toBeTruthy();
    // The streak calendar is in every view on tablet.
    view('Notes');
    expect(headings()).toEqual(['Level 7 · Measure', '12-day streak', 'Accuracy per clef', 'Key', 'Slowest notes']);
    view('Scales');
    expect(headings()).toEqual(['Level 7 · Measure', '12-day streak', 'Major scales', 'Minor scales']);
  });

  it('desktop: Level, Skill levels and the streak in the aside, the view beside it, one main landmark', () => {
    show(richProgress(), 1280);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    const aside = within(screen.getByRole('complementary'));
    aside.getByRole('heading', { name: 'Level 7 · Measure' });
    aside.getByRole('link', { name: /^Skill levels/ });
    aside.getByRole('heading', { name: '12-day streak' });
    expect(aside.queryByRole('heading', { name: 'Accuracy · 14 days' })).toBeNull();
    heading('Accuracy · 14 days');
    view('Notes');
    expect(headings()).toEqual(['Level 7 · Measure', '12-day streak', 'Accuracy per clef', 'Key', 'Slowest notes']);
    view('Scales');
    expect(headings()).toEqual(['Level 7 · Measure', '12-day streak', 'Major scales', 'Minor scales']);
  });

  it.each([834, 1280])('a new player at %i px: every card renders', (at) => {
    show(emptyProgress(), at);
    heading('Level 1 · Tick');
    heading('No streak yet');
    expect(screen.getAllByText('No rhythm rounds in the last 14 days.')).toHaveLength(2);
    view('Notes');
    expect(screen.getAllByText('No Read notes round yet.')).toHaveLength(3);
    view('Scales');
    expect(screen.getByText('No minor scale started yet.')).toBeTruthy();
  });
});

describe('Progress tab charts', () => {
  it('measures a chart that appears after the tab opened (an account sync brings rounds in)', () => {
    // jsdom has no layout: every box is 500 px wide here, so a measured chart is drawn 500 wide.
    const box = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 500, height: 100 } as DOMRect);
    try {
      show(emptyProgress(), 1280);
      expect(document.querySelectorAll('svg.prog-chart')).toHaveLength(0);
      act(() => dispatch!({ type: 'syncApply', remote: syncedOf(DEFAULT_PREFS, richProgress()), base: null, reset: false }));
      const boxes = Array.from(document.querySelectorAll('svg.prog-chart'), (svg) => svg.getAttribute('viewBox'));
      expect(boxes).toEqual(['0 0 500 90', '0 0 500 90', '0 0 500 84']);
    } finally {
      box.mockRestore();
    }
  });

  it('a day with only Read notes or Scales is a practice day: the accuracy line says it had no rhythm round', () => {
    const p = richProgress();
    // Oct 13 (a Tuesday) with Read notes and Scales only: no rhythm round, but still in the streak and in Minutes.
    p.stats.days['2026-10-13'] = { sec: 540, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} };
    show(p);
    screen.getByRole('img', { name: /80% today; no rhythm rounds on Oct 3 and Oct 13\. Average \d+%\.$/ });
    screen.getByRole('img', { name: /^Minutes practised this week: Monday 14, Tuesday 9,/ });
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('aria-label') ?? '').filter((name) => /no practice/i.test(name))).toEqual([]);
    expect(t('progress.accuracy.gapCount', { count: 12 })).toBe('; no rhythm rounds on 12 days');
  });

  it('Timing tendency on the boards: every label where the boards draw it', () => {
    show(richProgress(), 1280);
    const svg = screen.getByRole('img', { name: /^Average timing offset per day/ });
    expect([...svg.querySelectorAll('text.prog-axis')].map((el) => el.textContent)).toEqual(['+30', '0', '−40']);
    const band = [...svg.querySelectorAll('text.prog-chart-note')].find((el) => el.textContent === 'steady');
    expect(Number(band?.getAttribute('y'))).toBeCloseTo(33.7, 1);
  });

  // A late tapper (headphones not calibrated, a wide leniency) or an early one opens the range up or down: on the 90 px
  // desktop chart the axis labels and the band's word ran into each other, and at any size the line ran through a note.
  // A steady player a little late (+10, +20 ms) runs the line through "steady" at the right.
  for (const [off, at] of [[150, 1280], [60, 1280], [-62, 1280], [150, 390], [60, 390], [10, 1280], [20, 390]] as const) {
    it(`Timing tendency at ${signedMs(off)} (${at} px): its labels keep apart, and the notes are drawn over the line`, () => {
      show(timingAt(off), at);
      const svg = screen.getByRole('img', { name: /^Average timing offset per day/ });
      const baseline = (el: Element): number => Number(el.getAttribute('y'));
      const note = (text: string): Element => [...svg.querySelectorAll('text.prog-chart-note')].find((el) => el.textContent === text)!;
      const zero = Number(svg.querySelector('line.prog-zero')!.getAttribute('y1'));
      const axis = [...svg.querySelectorAll('text.prog-axis')].map(baseline).sort((a, b) => a - b);
      expect(axis.some((y) => Math.abs(y - (zero + 4)) < 0.01), 'the zero line keeps its label').toBe(true);
      for (let i = 1; i < axis.length; i++) expect(axis[i] - axis[i - 1], 'axis labels apart').toBeGreaterThanOrEqual(11);
      const band = [...svg.querySelectorAll('text.prog-chart-note')].find((el) => el.textContent === 'steady');
      if (Math.abs(off) < 30) expect(band, 'a steady player keeps the band word').toBeTruthy();
      if (band) {
        expect(baseline(band), 'the band word above the zero line').toBeLessThanOrEqual(zero + 0.5);
        expect(baseline(note('early · rushing')) - baseline(band), 'the band word clear of the early note').toBeGreaterThanOrEqual(11);
      }
      const line = svg.querySelector('path.prog-line')!;
      for (const text of ['late · dragging', 'early · rushing', ...(band ? ['steady'] : [])]) {
        expect(line.compareDocumentPosition(note(text)) & Node.DOCUMENT_POSITION_FOLLOWING, `${text} is drawn after the line`).toBeTruthy();
      }
    });
  }
});

describe('Progress tab in Dutch', () => {
  it('speaks Dutch: the switch, the streak, the calendar and the cards', () => {
    setLocale('nl');
    show(richProgress());
    expect(screen.getByRole('heading', { level: 1, name: 'Voortgang' })).toBeTruthy();
    const group = within(screen.getByRole('group', { name: 'Voortgang tonen voor' }));
    expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual(['Ritme', 'Noten', 'Toonladders']);
    expect(screen.getByText('12 dagen op rij', { selector: '.streak-pill' })).toBeTruthy();
    expect(screen.getByText('25 van 60 niveaus · 6 vaardigheden · 1 te herhalen')).toBeTruthy();
    expect(screen.getByText(/^Nog 305 XP tot level 8/).textContent).toBe('Nog 305 XP tot level 8 · volgende rang Groove');
    screen.getByRole('img', {
      name: 'Oefenkalender, 14 sep tot 18 okt. 28 van 32 dagen geoefend; gemist: 16 sep, 20 sep, 25 sep en 3 okt; reeks van 4 okt tot vandaag, 15 okt.',
    });
    expect(screen.getByRole('link', { name: 'Zwakke punten oefenen' })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'Overbindingen: 78%, zwak punt' })).toBeTruthy();
    expect(screen.getByText('Eerst jagend (−52 ms). Een beetje vroeg is normaal.')).toBeTruthy();
    view('Noten', 'Voortgang tonen voor');
    expect(screen.getByText('bovenste tussenruimte · viool')).toBeTruthy();
    expect(screen.getByText('3,1 s')).toBeTruthy();
    const key = heading('Toonsoort').closest('section')!;
    expect(seen(key)).toContain('G\u00a0majeur · E\u00a0mineur1 kruis: elke F is een F♯');
    expect(heard(key)).toContain('G\u00a0majeur · E\u00a0mineur1 kruis: elke F is een fis');
    // Keys as said in Dutch, as on the Scales hub: bes majeur, not B♭ majeur.
    view('Toonladders', 'Voortgang tonen voor');
    const majors = within(heading('Majeurtoonladders').closest('section')!).getAllByRole('listitem');
    expect(majors[9].getAttribute('aria-label')).toBe('bes\u00a0majeur: 2 van 3 sterren');
  });

  it('says a practised day without a rhythm round had no rhythm round, not that it was not practised', () => {
    setLocale('nl');
    const p = richProgress();
    p.stats.days['2026-10-13'] = { sec: 540, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} };
    show(p);
    screen.getByRole('img', { name: /vandaag 80%; geen ritmerondes op 3 okt en 13 okt\. Gemiddeld \d+%\.$/ });
    expect(t('progress.accuracy.gapCount', { count: 12 })).toBe('; 12 dagen zonder ritmeronde');
    expect(t('progress.accuracy.gapCount', { count: 1 })).toBe('; 1 dag zonder ritmeronde');
  });
});
