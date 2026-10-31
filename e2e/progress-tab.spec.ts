import { expect, test, type Page } from '@playwright/test';
import { expectClickable, expectNoSideScroll, QUARTERS, seed, SOL_DONE, tapLate, VIEWPORTS } from './helpers';
import { emptyProgress, PROGRESS_CLOCK, PROGRESS_PREFS, richProgress } from './progressFixture';

/**
 * The Progress tab (v1.5) end to end: a round played shows on the tab the same day, a level-up's sheet leads to it, and
 * the tab in dark. The layout at every size is in layout.spec.ts.
 */
test.use({ viewport: VIEWPORTS.phone, hasTouch: true });

const stored = (page: Page): Promise<Record<string, unknown>> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('muzieklab.progress.v1') ?? '{}') as Record<string, unknown>);

/** Today as the Progress tab writes a date ("Oct 25"); the browser's own today, as the app's. */
const todayShort = (page: Page): Promise<string> => page.evaluate(() => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date()));

test('a free practice round shows on Progress the same day: its minutes, its accuracy and today on the calendar', async ({ page }) => {
  test.setTimeout(60_000);
  // A new player with a one-bar setup (four quarter notes at 120 BPM, tap only).
  await seed(page, { progress: { ...emptyProgress(), lastSettings: QUARTERS }, prefs: { ...PROGRESS_PREFS, seenHowTo: true, seenHold: true, holdMode: 'tap' } });
  await page.goto('./#/progress');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(page.getByText('No practice this week yet.')).toBeVisible();
  await expect(page.getByText('No rhythm rounds in the last 14 days.')).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 2, name: 'No streak yet' })).toBeVisible();

  // Home → Rhythm → Start, and four taps on the beat (on the keyboard, each at its beat's time).
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: /^Rhythm/ }).click();
  await expect(page).toHaveURL(/#\/setup$/);
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await tapLate(page, 4, 500, 0);
  await expect(page.getByRole('heading', { name: 'Exercise done' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => ((await stored(page)).practiceDays as string[]).length, { message: 'the round counts as practice' }).toBe(1);

  // Back to the tab, without a reload: the round is on it.
  await page.getByRole('link', { name: 'Back to home' }).click();
  await nav.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page).toHaveURL(/#\/progress$/);
  const today = await todayShort(page);
  // A few seconds of practice count as a minute, today's bar: "1 minute" in the label.
  const minutes = page.getByRole('region', { name: 'Minutes this week' });
  await expect(minutes.getByRole('img', { name: /today [A-Za-z]+ 1; 1 minute in total\.$/ })).toBeVisible();
  await expect(minutes.getByText('Today', { exact: true })).toBeVisible();
  await expect(page.getByText('No practice this week yet.')).toHaveCount(0);
  // The accuracy line has today's point (and only that: no rhythm rounds on the 13 days before).
  const accuracy = page.getByRole('region', { name: 'Accuracy · 14 days' }).getByRole('img');
  await expect(accuracy).toHaveAccessibleName(new RegExp(`^Rhythm accuracy per day from .+ to ${today}, (\\d+)% today; no rhythm rounds on 13 days\\. Average \\1%\\.$`));
  await expect(page.getByRole('region', { name: 'Timing tendency' }).getByRole('img', { name: /^Average timing offset per day/ })).toBeVisible();
  // The calendar marks today as the first day of a streak.
  await expect(page.locator('.prog-head .streak-pill')).toHaveText('1-day streak');
  const calendar = page.getByRole('region', { name: '1-day streak' });
  await expect(calendar.getByRole('img')).toHaveAccessibleName(new RegExp(`; a 1-day streak on ${today}\\.$`));
  const now = calendar.locator('.prog-cal-day.is-now');
  await expect(now).toHaveClass(/\bis-streak\b/);
  await expect(now).toHaveAttribute('title', `${today}: streak day (today)`);
  await expectNoSideScroll(page);
});

test('a level-up after a lesson lists the personal best, and See progress opens the Progress tab', async ({ page }) => {
  test.setTimeout(60_000);
  // Lesson 2.1 (rhythm: quarter notes, 60 BPM, 2 bars) played before at 40%, and 5 XP short of level 8 (1750 XP).
  await seed(page, {
    progress: { ...emptyProgress(), lessons: { ...SOL_DONE, '1.1': { stars: 1, bestAccuracy: 40 } }, xp: 1745 },
    prefs: { ...PROGRESS_PREFS, seenHowTo: true, seenHold: true },
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByText('Lesson 2.1', { exact: true })).toBeVisible();
  // Played well: every beat of the two bars tapped on time.
  await tapLate(page, 8, 1000, 0);
  await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible({ timeout: 10_000 });

  const sheet = page.getByRole('dialog', { name: 'Level 8 · Groove' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('New personal best')).toBeVisible();
  await expect(sheet.getByText(/^Lesson 2\.1 · \d+%$/)).toBeVisible();
  // A bar with every note Perfect also earns Perfect bar, listed above the best; the sheet lists what the run earned.
  await expect.poll(async () => ((await stored(page)).xp as number) >= 1750).toBe(true);
  const earned = Object.keys((await stored(page)).achievements as Record<string, string>);
  expect(earned.every((id) => id === 'perfectBar'), `only Perfect bar can be earned here: ${earned}`).toBe(true);
  await expect(sheet.getByText('Achievement unlocked')).toHaveCount(earned.length);
  if (earned.length) await expect(sheet.getByText('Perfect bar', { exact: true })).toBeVisible();

  const see = sheet.getByRole('link', { name: 'See progress' });
  await expectClickable(see);
  await expectClickable(sheet.getByRole('button', { name: 'Continue' }));
  await see.click();
  await expect(page).toHaveURL(/#\/progress$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.prog-level')).toContainText('Level 8 · Groove');
  await expect(page.getByRole('region', { name: 'Achievements' }).getByText(`${earned.length} earned`)).toBeVisible();
});

/** WCAG contrast of each visible element's text against the background it sits on (the nearest one that is opaque). */
async function contrasts(page: Page, selector: string): Promise<{ text: string; ratio: number }[]> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.locator(selector).evaluateAll((els) => {
    const rgb = (c: string): number[] => {
      const v = (c.match(/[\d.]+/g) ?? []).map(Number);
      // color(srgb r g b / a) gives 0–1 channels; rgb()/rgba() 0–255.
      return c.startsWith('color(') ? [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1] : v;
    };
    const lum = ([r, g, b]: number[]): number => {
      const f = (x: number): number => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const back = (el: Element | null): number[] => {
      for (; el; el = el.parentElement) {
        const c = rgb(getComputedStyle(el).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c;
      }
      return [255, 255, 255];
    };
    return els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(back(el))];
        return { text: (el.textContent ?? '').trim(), ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10 };
      });
  });
}

test('dark: the Progress tab and Skill levels draw on the dark tokens, with readable text', async ({ page }) => {
  await page.clock.setFixedTime(PROGRESS_CLOCK);
  await seed(page, { progress: richProgress(), prefs: { ...PROGRESS_PREFS, theme: 'dark' } });
  for (const size of [VIEWPORTS.phone, VIEWPORTS.desktop]) {
    await page.setViewportSize(size);
    await page.goto('./#/progress');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    // Dark cards.
    const dark = await page.locator('.prog-card').first().evaluate((el) => {
      const [r, g, b] = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
      return r + g + b < 3 * 80;
    });
    expect(dark, 'the cards are dark').toBe(true);
    // The titles, card headings, values and labels read on their cards.
    const text = 'h1, .prog-card h2, .prog-meta, .prog-skills b, .prog-cell-name, .prog-cell-value, .prog-badge-name, .prog-legend, .prog-level, .prog-lvl-xp';
    const tab = await contrasts(page, text);
    expect(tab.length, 'text measured').toBeGreaterThan(20);
    expect(tab.filter((c) => c.ratio < 4.5), 'text under 4.5:1 on its background').toEqual([]);
    await page.getByRole('link', { name: /^Skill levels/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Skill levels' })).toBeVisible();
    const skills = await contrasts(page, 'h1, h2, .skill-row-name, .skill-row-line, .skill-meta, .skill-focus-text, .skill-foot');
    expect(skills.length, 'text measured').toBeGreaterThan(12);
    expect(skills.filter((c) => c.ratio < 4.5), 'Skill levels: text under 4.5:1 on its background').toEqual([]);
    await expectNoSideScroll(page);
  }
});
