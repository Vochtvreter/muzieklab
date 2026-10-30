import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEFAULT_NOTE_SETTINGS, generateRound } from '../src/core/noteRound';
import { LETTERS, letterOf } from '../src/core/pitch';
import { announcer, pad, pathUpTo, QUARTERS, seed, SOL_DONE, tabTo, tapLate, VIEWPORTS } from './helpers';

/**
 * The main loop: Home → lesson 2.1 (rhythm: quarter notes, 60 BPM, 2 bars, one bar of count-in; after sol's unit) →
 * How to play → tap along → pause → resume → Results → Home. Taps are not timed precisely; the test checks the screens,
 * not the score.
 */
for (const [name, input] of [['phone', 'pad'], ['desktop', 'key']] as const) {
  test(`play a lesson to the end (${name})`, async ({ page }) => {
    test.setTimeout(60_000);
    await seed(page, { progress: { lessons: SOL_DONE } });
    await page.setViewportSize(VIEWPORTS[name]);
    /** One tap; false when the pad is gone (the run ended and Results replaced Play between checks). */
    const tap = async (): Promise<boolean> => {
      if (input === 'key') {
        await page.keyboard.down('j');
        await page.waitForTimeout(150);
        await page.keyboard.up('j');
      } else {
        const box = await pad(page)
          .boundingBox({ timeout: 2000 })
          .catch(() => null);
        if (!box) return false;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(150);
        await page.mouse.up();
      }
      return true;
    };

    await page.goto('./');
    await expect(page.getByText('No streak yet')).toBeVisible();
    await page.getByRole('button', { name: 'Continue lesson' }).click();
    await expect(page).toHaveURL(/#\/play$/);
    await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();

    await page.waitForTimeout(1500);
    await tap();
    if (input === 'key') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    if (input === 'key') {
      // Focus starts on Resume, so Enter carries on (it used to land on Restart).
      await expect(page.getByRole('button', { name: /Resume/ })).toBeFocused();
      await page.keyboard.press('Enter');
    } else {
      await page.getByRole('button', { name: /Resume/ }).click();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (input === 'key') {
      // A control that keeps focus after a click does not swallow Space: Space is a tap, the switch stays on.
      const metronome = page.getByRole('switch', { name: 'Metronome' });
      await metronome.click();
      await metronome.click();
      await page.keyboard.press(' ');
      await expect(metronome).toHaveAttribute('aria-checked', 'true');
    }

    // Count-in (4 s) + 2 bars (8 s) + grace: tap along until Results shows.
    for (let i = 0; i < 16 && !page.url().includes('/results'); i++) {
      if (!(await tap())) break;
      await page.waitForTimeout(850);
    }
    await expect(page).toHaveURL(/#\/results$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();
    // Retry, or Try again under 2 stars: these taps are untimed.
    await expect(page.getByRole('button', { name: /^(Retry|Try again)$/ })).toBeVisible();

    // A run with at least one hit note keeps the streak; these taps are untimed, so read what Results counted.
    const hits = await page.locator('.counts .count-n').evaluateAll((els) => els.slice(0, 3).reduce((s, el) => s + Number(el.textContent), 0));
    // Each missed note has a × on the staff as well as the miss colour (colour plus shape, DESIGN.md §9).
    const misses = Number(await page.locator('.counts .count-n').nth(3).textContent());
    await expect(page.locator('.results-staff .staff-miss path')).toHaveCount(misses);
    await page.goto('./#/');
    await expect(page.getByText(hits > 0 ? '1-day streak' : 'No streak yet')).toBeVisible();
  });
}

test('Settings: Reset progress, confirmed, says so; the line is read out, as the buttons are gone, and the About heading takes the focus', async ({ page }) => {
  await seed(page, { progress: { lessons: SOL_DONE } });
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.reset-done')).toHaveText('Progress was reset.');
  await expect(page.locator('.reset-done')).not.toHaveAttribute('role', 'status');
  await expect(announcer(page)).toHaveText('Progress was reset.');
  await expect(page.getByRole('heading', { level: 2, name: 'About' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('muzieklab.progress.v1') ?? '{}').lessons ?? {})).toEqual({});
});

test('two tabs open: neither saves its older copy over what the other saved, progress or prefs', async ({ context }) => {
  // Tab A opens first and stays open, as a tab left in the background does.
  const a = await context.newPage();
  await a.goto('./#/notes');
  const b = await context.newPage();
  await b.goto('./');
  await b.getByRole('button', { name: 'Start lesson' }).click();
  const names = b.getByRole('group', { name: 'Note names' }).getByRole('button');
  for (let i = 0; i < 10; i++) {
    await names.first().click();
    await b.getByRole('button', { name: /^(Next note|See summary)/ }).click();
  }
  await expect(b.getByRole('heading', { name: 'Lesson 1.1 done' })).toBeVisible();
  const stored = (key: string): Promise<Record<string, unknown>> => a.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), key);
  const earned = await stored('muzieklab.progress.v1');
  expect(earned.xp).toBeGreaterThan(0);

  // A setup change in tab A keeps the lesson tab B played, and tab A shows it too.
  await a.getByRole('button', { name: 'Bass F clef' }).click();
  await expect.poll(() => stored('muzieklab.progress.v1')).toMatchObject({ notes: { settings: { clefs: ['treble', 'bass'] } } });
  expect(await stored('muzieklab.progress.v1')).toMatchObject({ xp: earned.xp, lessons: earned.lessons, practiceDays: earned.practiceDays });
  await a.evaluate(() => (location.hash = '#/'));
  await expect(a.getByText('1-day streak')).toBeVisible();

  // A pref picked in each tab: both are kept, and each tab follows the other's.
  await a.evaluate(() => (location.hash = '#/settings'));
  await b.evaluate(() => (location.hash = '#/settings'));
  await a.getByRole('button', { name: 'Dark' }).click();
  await b.getByRole('button', { name: 'Strict' }).click();
  await expect.poll(() => stored('muzieklab.prefs.v1')).toMatchObject({ theme: 'dark', leniency: 'strict' });
  await expect(b.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(a.getByRole('button', { name: 'Strict' })).toHaveAttribute('aria-pressed', 'true');
});

test('two tabs open: a language picked in one waits while the other plays a round, so the round does not start over', async ({ context }) => {
  const a = await context.newPage();
  await a.goto('./');
  const b = await context.newPage();
  await b.goto('./#/settings');
  await a.getByRole('button', { name: 'Start lesson' }).click();
  const names = a.getByRole('group', { name: 'Note names' }).getByRole('button');
  for (let i = 0; i < 3; i++) {
    await names.first().click();
    await a.getByRole('button', { name: /^Next note/ }).click();
  }
  const count = a.getByText('Note 4 of 10');
  await expect(count).toBeVisible();
  await b.getByRole('button', { name: 'Nederlands' }).click();
  await expect(b.getByRole('heading', { level: 1, name: 'Instellingen' })).toBeVisible();
  // Tab A gets the language at once (the storage event), but the round goes on as it was, in English.
  await a.waitForTimeout(300);
  await expect(count).toBeVisible();
  await expect(a.locator('html')).toHaveAttribute('lang', 'en');
  for (let i = 3; i < 10; i++) {
    await names.first().click();
    await a.getByRole('button', { name: /^(Next note|See summary)/ }).click();
  }
  // The next screen is in the new language.
  await expect(a.getByRole('heading', { name: 'Les 1.1 klaar' })).toBeVisible();
  await expect(a.locator('html')).toHaveAttribute('lang', 'nl');
});

/** The browser bar's colour in each theme (index.html's theme-color metas). */
const BAR = { light: '#eef1f0', dark: '#101415' } as const;

/**
 * The colour the browser gives its bar (an installed app, its status bar): the first theme-color meta that matches, in
 * document order (the HTML standard; Chromium and WebKit do so).
 */
const browserBar = (page: Page): Promise<string | null> =>
  page.evaluate(() => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].find((m) => !m.media || matchMedia(m.media).matches)?.content ?? null);

// The page before the app has run (its script held back) is in the theme Settings picked, not the device's, and so is
// the browser bar.
for (const [device, theme, ground] of [['light', 'dark', 'rgb(16, 20, 21)'], ['dark', 'light', 'rgb(238, 241, 240)']] as const) {
  test(`Theme ${theme} on a ${device} device shows from the first paint, page and browser bar, before the app has loaded`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: device });
    await seed(page, { prefs: { theme } });
    let release = (): void => undefined;
    const held = new Promise<void>((go) => (release = go));
    await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('./#/settings', { waitUntil: 'commit' });
    await expect.poll(() => page.evaluate(() => (document.body ? getComputedStyle(document.body).backgroundColor : null))).toBe(ground);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    expect(await browserBar(page)).toBe(BAR[theme]);
    release();
    await expect(page.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await browserBar(page)).toBe(BAR[theme]);
  });
}

test('the browser bar takes the theme picked in Settings, after a reload too, and follows the device again on System', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./#/settings');
  expect(await browserBar(page)).toBe(BAR.light);
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect.poll(() => browserBar(page)).toBe(BAR.dark);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  expect(await browserBar(page)).toBe(BAR.dark);
  await page.getByRole('button', { name: 'System' }).click();
  await expect.poll(() => browserBar(page)).toBe(BAR.light);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await browserBar(page)).toBe(BAR.dark);
});

test('a reload on Play keeps the lesson and waits for Start', async ({ page }) => {
  await seed(page, { progress: { lessons: SOL_DONE } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.reload();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByRole('dialog', { name: 'Ready?' }).getByText('Lesson 2.1', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Ready?' })).toBeVisible();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Count-in, beat|Counting beat/ })).toBeAttached({ timeout: 3000 });
});

test("a phone's timing lane follows the bars being played, two rows at a time; Results shows every bar", async ({ page }) => {
  test.setTimeout(40_000);
  // Sixteen bars at 200 BPM, a bar every 1.2 s. All four rows of the lane pushed Skip to results off a short phone.
  await seed(page, { prefs: { seenHowTo: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 16, tempo: 200 } } });
  await page.setViewportSize(VIEWPORTS['phone-se-browser']);
  await page.goto('./#/setup');
  await page.getByRole('button', { name: /^Start · / }).click();
  const head = page.locator('.lane-head');
  const lane = page.getByRole('img', { name: 'Note lengths compared with how long each note was held' });
  await expect(head).toContainText('bars 1–8');
  for (const bars of ['bars 5–12', 'bars 9–16']) {
    await expect(head).toContainText(bars, { timeout: 8000 });
    // Two rows of four bars, 26 px each. The window has just moved on, so the row being played is on top.
    await expect(lane).toHaveAttribute('viewBox', /^0 0 [\d.]+ 52$/);
    await expect(lane.locator('line[stroke-width="2.5"]')).toHaveAttribute('y1', '0');
  }
  // At the end the window keeps the last two rows: bars 13–16 are played on the lower one.
  await expect(lane.locator('line[stroke-width="2.5"]')).toHaveAttribute('y1', '26', { timeout: 8000 });
  await expect(head).toContainText('bars 9–16');
  await expect(lane).toHaveAttribute('viewBox', /^0 0 [\d.]+ 52$/);
  await page.getByRole('button', { name: 'Skip to results' }).click();
  // Results shows the whole exercise, two bars a row (8 rows of 30 px).
  await expect(page).toHaveURL(/#\/results$/);
  await expect(page.getByRole('img', { name: 'Note lengths compared with how long each note was held' })).toHaveAttribute('viewBox', /^0 0 [\d.]+ 240$/);
});

/**
 * Minutes practised count what was played: a round ended with Skip to results counts up to where the music stopped,
 * with its count-in. It counted the whole exercise, 102 s for 16 bars at 40 BPM.
 */
test('Skip to results adds only the seconds played to Minutes this week', async ({ page }) => {
  test.setTimeout(40_000);
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 16, tempo: 40 } } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  await page.getByRole('button', { name: /^Start · / }).click();
  await tapLate(page, 2, 1500, 0);
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page).toHaveURL(/#\/results$/);
  // A bar of count-in (6 s), the lead-in and about 3 s of bars.
  const seconds = (): Promise<number> =>
    page.evaluate(() => {
      const days: Record<string, { sec: number }> = JSON.parse(localStorage.getItem('muzieklab.progress.v1') ?? '{}').stats?.days ?? {};
      return Object.values(days).reduce((sum, d) => sum + d.sec, 0);
    });
  await expect.poll(seconds).toBeGreaterThan(5);
  expect(await seconds()).toBeLessThan(15);
});

/**
 * Results shows the accuracy rounded down, so a threshold the run did not reach never shows (DESIGN.md §6.3): four
 * quarters on the beat and an extra tap are (400 − 25) / 400 = 93.75%, shown as 93%. Rounded to the nearest, it was 94%.
 */
for (const name of ['phone', 'desktop'] as const) {
  test(`Results shows the accuracy rounded down (${name})`, async ({ page }) => {
    await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: QUARTERS } });
    await page.setViewportSize(VIEWPORTS[name]);
    await page.goto('./#/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    // One bar at 120 BPM, a press on each beat and one 250 ms after beat 2: outside every window (120 ms at most).
    await tapLate(page, 4, 500, 0, [750]);
    await expect(page.getByRole('heading', { name: 'Exercise done' })).toBeVisible();
    const cells = await page.locator('.counts > div').evaluateAll((divs) =>
      divs.map((d) => [d.querySelector('.count-label')?.textContent ?? '', Number(d.querySelector('.count-n')?.textContent)] as const),
    );
    expect(Object.fromEntries(cells)).toEqual({ Perfect: 4, Great: 0, Good: 0, Miss: 0, Extra: 1 });
    await expect(page.locator('.score-pct')).toHaveText('93%');
    await expect(page.getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
  });
}

/**
 * Records what Play shows on every change from now to the first beat after a count-in: the header line, the staff's
 * first bar, the timing lane's bars and playheads, and the progress, on a phone or on desktop.
 */
async function watchCountIn(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { shown: string[]; beat1: boolean };
    const read = (): string => {
      const line = document.querySelector('.play-info .mono-line, .dplay-head .mono-line')?.textContent?.split(' · ')[0];
      const staff = /Bar (\d+):/.exec(document.querySelector('.play-staff [role=img], .dplay-staff [role=img]')?.getAttribute('aria-label') ?? '')?.[1];
      const lane = document.querySelector('.lane-head span:last-child')?.textContent;
      const playheads = document.querySelectorAll('svg[aria-label="Note lengths compared with how long each note was held"] line[stroke-width="2.5"]').length;
      const progress = document.querySelector('.play-top [role=progressbar], .dplay-head [role=progressbar]')?.getAttribute('aria-valuenow');
      return `${line} · staff ${staff} · ${lane} · playheads ${playheads} · ${progress} %`;
    };
    w.shown = [read()];
    w.beat1 = false;
    const watch = new MutationObserver(() => {
      const now = read();
      if (now === w.shown[w.shown.length - 1]) return;
      w.shown.push(now);
      if (!now.startsWith('Count-in') && w.shown.some((v) => v.startsWith('Count-in'))) {
        w.beat1 = true;
        watch.disconnect();
      }
    });
    watch.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  return async () => {
    await page.waitForFunction(() => (window as unknown as { beat1: boolean }).beat1, null, { timeout: 5000 });
    return page.evaluate(() => (window as unknown as { shown: string[] }).shown);
  };
}

for (const { name, bar, staff, lane, progress } of [
  // A phone's staff shows two bars a row and its lane two rows of four: bar 5 starts both windows again, not bar 3 and 1.
  { name: 'phone', bar: 5, staff: 5, lane: 'bars 5–12', progress: 33 },
  // In bar 6 the bar before is on the phone's lane, where the count-in's clock would put the playhead.
  { name: 'phone', bar: 6, staff: 5, lane: 'bars 5–12', progress: 42 },
  // Desktop's lane shows every bar, the one before too.
  { name: 'desktop', bar: 5, staff: 5, lane: 'bars 1–12', progress: 33 },
] as const) {
  test(`the count-in after a pause shows the bar it leads into, with no playhead, and so does the Pause sheet (${name}, bar ${bar})`, async ({ page }) => {
    test.setTimeout(40_000);
    // Twelve bars at 200 BPM, a bar every 1.2 s. Resumed, the exercise clock is still in the bar before during the count-in.
    await seed(page, { prefs: { seenHowTo: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 12, tempo: 200 } } });
    await page.setViewportSize(VIEWPORTS[name]);
    await page.goto('./#/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    const line = page.locator('.play-info .mono-line, .dplay-head .mono-line');
    const at = `Bar ${bar} of 12`;
    await expect(line).toContainText(at, { timeout: 10_000 });
    await page.keyboard.press('Escape');
    const sheet = page.getByRole('dialog', { name: 'Paused' });
    await expect(sheet).toContainText(at);
    const shown = await watchCountIn(page);
    await sheet.getByRole('button', { name: 'Resume' }).click();
    const seen = await shown();
    // Every moment from Resume to beat 1: the paused screen, then the count-in, which shows the bar it leads into on the
    // staff, the lane and the progress, and draws no playhead (none left over from before the pause either).
    const countIn = seen.findIndex((v) => v.startsWith('Count-in'));
    const beat1 = seen.length - 1;
    expect(seen.slice(0, countIn).filter((v) => !v.includes(' playheads 0 ')), 'a playhead before the count-in').toEqual([]);
    expect([...new Set(seen.slice(countIn, beat1))]).toEqual([`Count-in · staff ${staff} · ${lane} · playheads 0 · ${progress} %`]);
    expect(seen[beat1]).toMatch(new RegExp(`^${at} · staff ${staff} · ${lane} · playheads 1 · `));
    // Paused again, and once more in the count-in that follows: the sheet names the same bar both times, the one Resume
    // plays.
    await page.keyboard.press('Escape');
    await expect(sheet).toContainText(/Bar \d+ of 12/);
    const paused = /Bar \d+ of 12/.exec((await sheet.textContent()) ?? '')![0];
    await sheet.getByRole('button', { name: 'Resume' }).click();
    await expect(line).toContainText('Count-in');
    await page.keyboard.press('Escape');
    await expect(line, 'paused in the count-in').toContainText('Count-in');
    await expect(sheet).toContainText(paused);
  });
}

test('after quitting, Back does not walk into the exercise again', async ({ page }) => {
  await seed(page, { progress: { lessons: SOL_DONE } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: /^Play the daily challenge for / }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  // Play was opened from Home, so Quit goes back to Home's own place in the history (here an address without a hash).
  await expect(page).toHaveURL(/\/(#\/)?$/);
  await expect(page.getByRole('button', { name: 'Continue lesson' })).toBeVisible();
  await page.goBack();
  // Back from Home now leaves Home, or lands on Play waiting for a tap; never a running exercise.
  if (page.url().includes('#/play')) await expect(page.getByRole('dialog', { name: 'Ready?' })).toBeVisible();

  // A lesson quits to the Path, in Play's place: Back from there is Home again, not the exercise.
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await expect(page).toHaveURL(/#\/path$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/(#\/)?$/);
  await expect(page.getByRole('button', { name: 'Continue lesson' })).toBeVisible();
});

test("Pause's Practice settings goes back to the setup's place: Back does not walk into the exercise again", async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  const settings = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Practice settings' }).click();
  };
  // It added the setup again after Play: Back opened the abandoned exercise on its Ready sheet, then the setup again.
  await page.goto('./');
  await page.getByRole('link', { name: /^Rhythm/ }).click();
  await expect(page).toHaveURL(/#\/setup$/);
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await settings();
  await expect(page).toHaveURL(/#\/setup$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Free practice' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/(#\/)?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeAttached();

  // From a Learn practice link, Play gives its place to the setup: Back returns to the section.
  await page.goto('./#/learn/5');
  await page.getByRole('link', { name: 'Practice ties →' }).click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  await settings();
  await expect(page).toHaveURL(/#\/setup\?from=5\.1$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/5\?s=5\.1$/);
});

test('a rhythm lesson quits to the Path, as a note lesson does, and its Results lead back there (DESIGN.md §8.2)', async ({ page }) => {
  await seed(page, { progress: { lessons: SOL_DONE }, prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/path');
  const start = page.getByRole('button', { name: 'Start lesson 2.1' });
  // The ✕ at the top, and Pause → Quit lesson.
  await start.click();
  await expect(page).toHaveURL(/#\/play$/);
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await expect(page).toHaveURL(/#\/path$/);
  await start.click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Quit lesson' }).click();
  await expect(page).toHaveURL(/#\/path$/);
  // Opened from Home's Continue card too.
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await expect(page.getByRole('link', { name: 'Quit exercise' })).toHaveAttribute('href', '#/path');
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await expect(page).toHaveURL(/#\/path$/);
  // Results' back arrow, as Round done's after a note lesson.
  await start.click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the path' }).click();
  await expect(page).toHaveURL(/#\/path$/);
  // Desktop: the Quit link in the exercise header.
  await page.setViewportSize(VIEWPORTS.desktop);
  await start.click();
  await page.getByRole('link', { name: 'Quit', exact: true }).click();
  await expect(page).toHaveURL(/#\/path$/);
});

test('Esc does not start the Ready sheet (browsers do not let Esc start audio); Start does', async ({ page }) => {
  await seed(page, { progress: { lessons: SOL_DONE } });
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Ready?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ready?' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a finished lesson can be played again from Home and from the Path', async ({ page }) => {
  await seed(page, {
    progress: { lessons: { ...SOL_DONE, '1.1': { stars: 2, bestAccuracy: 85 }, '1.2': { stars: 1, bestAccuracy: 65 } }, practiceDays: [], lastSettings: null },
    prefs: { seenHowTo: true, seenHold: true },
  });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: /^Play lesson 2\.1/ }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByText('Lesson 2.1', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await page.goto('./#/path');
  await expect(page.getByRole('img', { name: 'Lesson 2.3 · Halves and quarters, locked' })).toBeVisible();
  await page.getByRole('button', { name: 'Play lesson 2.2 · Half notes: 1 of 3 stars' }).click();
  await expect(page.getByText('Lesson 2.2', { exact: true })).toBeVisible();
});

test('the Path keeps the current unit in view when a phone turns to landscape', async ({ page }) => {
  // Up to si (unit 13) passed: unit 14, rhythm's dotted notes, is current, far down the path.
  await seed(page, { progress: { lessons: pathUpTo('13.5') }, prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/path');
  const unit7 = page.getByRole('button', { name: /^14 · Dotted notes/ });
  await expect(unit7).toBeInViewport();
  await page.setViewportSize(VIEWPORTS['phone-landscape']);
  await expect(unit7).toBeInViewport();
});

test('desktop Home: the learning-path card opens the Path at the unit it shows', async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./');
  await expect(page.getByRole('link', { name: /^Learning path/ })).toContainText('1 · Sol: the G line');
  await page.getByRole('link', { name: /^Learning path/ }).click();
  await expect(page).toHaveURL(/#\/path$/);
  await expect(page.getByRole('heading', { level: 2, name: '1 · Sol: the G line' })).toBeVisible();
});

/**
 * Records every eyebrow the open sheet shows from now until it is gone, its closing animation (240 ms) included: the
 * sheet keeps rendering while it closes.
 */
async function watchEyebrows(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { eyebrows: string[] };
    const read = (): string | null | undefined => document.querySelector('[role=dialog] .eyebrow')?.textContent;
    w.eyebrows = [read() ?? ''];
    new MutationObserver(() => {
      const text = read();
      if (text && !w.eyebrows.includes(text)) w.eyebrows.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  return () => page.evaluate(() => (window as unknown as { eyebrows: string[] }).eyebrows);
}

test('How to play keeps its eyebrow while it closes: First time here before the start, Paused once it has started', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  await page.getByRole('button', { name: /^Start · / }).click();
  const sheet = page.getByRole('dialog', { name: 'How to play' });
  await expect(sheet.getByText('First time here')).toBeVisible();
  let eyebrows = await watchEyebrows(page);
  // Got it counts in at once, so the run has started while the sheet is still closing.
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await eyebrows(), 'the closing sheet keeps its eyebrow').toEqual(['First time here']);
  // Opened during the run, it says Paused, and keeps saying it while it closes on Got it.
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(sheet.getByText('Paused')).toBeVisible();
  eyebrows = await watchEyebrows(page);
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await eyebrows()).toEqual(['Paused']);
});

test('the Pause sheet keeps its bar while it closes, on Restart too', async ({ page }) => {
  // Four bars at 200 BPM, a bar every 1.2 s.
  await seed(page, { prefs: { seenHowTo: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 4, tempo: 200 } } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page.locator('.play-info .mono-line')).toContainText('Bar 2 of 4', { timeout: 10_000 });
  await page.keyboard.press('Escape');
  const sheet = page.getByRole('dialog', { name: 'Paused' });
  await expect(sheet).toContainText('Bar 2 of 4');
  const eyebrows = await watchEyebrows(page);
  // Restart puts the run back at bar 1 at once, while the sheet is still closing.
  await sheet.getByRole('button', { name: 'Restart exercise' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await eyebrows(), 'the closing sheet keeps its bar').toEqual(['Free practice · Bar 2 of 4']);
});

test('the first lesson that judges holds shows How to play again, with holding, once', async ({ page }) => {
  // Rhythm unit 1 (tap only, the path's unit 2) and mi done, its How to play seen: lesson 4.1 (rhythm 2.1) is the
  // first where holding counts.
  const lessons = pathUpTo('3.5', 3, 92);
  await seed(page, { progress: { lessons, practiceDays: [], lastSettings: null }, prefs: { seenHowTo: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  const sheet = page.getByRole('dialog', { name: 'How to play' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('New: hold each note')).toBeVisible();
  await expect(sheet.getByText('Hold it for the length of the note. Lift when the note ends.')).toBeVisible();
  const eyebrows = await watchEyebrows(page);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await eyebrows(), 'the closing sheet keeps its eyebrow').toEqual(['New: hold each note']);
  await expect(page.getByRole('img', { name: /Count-in, beat|Counting beat/ })).toBeAttached({ timeout: 3000 });
  // Only once: the next hold lesson starts straight away. Quit leads to the Path.
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await page.getByRole('button', { name: 'Start lesson 4.1' }).click();
  await expect(page.getByText('Lesson 4.1', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Next lesson introduces what is new before the count-in, once; another lesson waits on Ready', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page, { progress: { lessons: { ...SOL_DONE, '1.1': { stars: 3, bestAccuracy: 95 } }, practiceDays: [], lastSettings: null }, prefs: { seenHowTo: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  const countIn = page.getByRole('img', { name: /^Count-in, beat/ });
  // The first run of the session starts straight away.
  await page.goto('./#/path');
  await page.getByRole('button', { name: /^Play lesson 2\.1/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await page.getByRole('button', { name: /^Next lesson/ }).click();

  // Lesson 2.2 (rhythm 1.2) brings the half note: its card, Listen, Learn more and Start, before any count-in.
  const sheet = page.getByRole('dialog', { name: 'Half notes' });
  await expect(sheet.getByText('New in this lesson')).toBeVisible();
  await expect(sheet.getByText('· 2 beats')).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Learn more: Half note' })).toHaveAttribute('href', '#/learn/2?s=2.1');
  await expect(countIn).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Listen' }).click();
  await expect(sheet.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Stop' }).click();
  await expect(sheet.getByRole('button', { name: 'Listen' })).toHaveAttribute('aria-pressed', 'false');
  // ? opens How to play, which was not due: it names the lesson, not "First time here", and leads back.
  await page.keyboard.press('?');
  const howTo = page.getByRole('dialog', { name: 'How to play' });
  await expect(howTo.getByText('Lesson 2.2', { exact: true })).toBeVisible();
  await expect(howTo.getByText('First time here')).toHaveCount(0);
  await howTo.getByRole('button', { name: 'Got it' }).click();
  await expect(sheet.getByText('New in this lesson')).toBeVisible();
  await sheet.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(countIn).toBeAttached({ timeout: 3000 });

  // Shown once; playing the same lesson again (Try again: nothing was tapped) starts straight away.
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(countIn).toBeAttached({ timeout: 3000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Another lesson than the one finished last: Ready first, so the rhythm can be read; Start counts in.
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await page.goto('./#/path');
  await page.getByRole('button', { name: /^Play lesson 2\.1/ }).click();
  await expect(page.getByRole('dialog', { name: 'Ready?' })).toBeVisible();
  await expect(countIn).toHaveCount(0);
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(countIn).toBeAttached({ timeout: 3000 });
});

test('the intro sheet comes after How to play, the first time both are due', async ({ page }) => {
  await seed(page, { progress: { lessons: { ...SOL_DONE, '1.1': { stars: 3, bestAccuracy: 95 } }, practiceDays: [], lastSettings: null }, prefs: {} });
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.getByRole('button', { name: /^Got it/ }).click();
  await expect(page.getByRole('dialog', { name: 'Half notes' })).toBeVisible();
  // Learn more opens the section; Back returns to the lesson, still waiting on its intro.
  await page.getByRole('link', { name: 'Learn more: Half note' }).click();
  await expect(page).toHaveURL(/#\/learn\/2\?s=2\.1$/);
  // Wait for Learn itself: the URL changes before the screen does, and Back must leave Learn, not the old sheet.
  await expect(page.getByRole('heading', { level: 1, name: /Note values/ })).toBeVisible();
  await page.goBack();
  const intro = page.getByRole('dialog', { name: 'Half notes' });
  await expect(intro).toBeVisible();
  // The sheet puts focus on Start, so Enter starts the count-in.
  await expect(intro.getByRole('button', { name: 'Start', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^Count-in, beat/ })).toBeAttached({ timeout: 3000 });
});

test('free practice follows the path: tap only until unit 2, unless the setup turns holding on', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  const hold = page.getByRole('switch', { name: /^Hold notes for their length/ });
  await expect(hold).toHaveAttribute('aria-checked', 'false');
  await hold.click();
  await expect(hold).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(hold).toHaveAttribute('aria-checked', 'true');
  await hold.click();
  await expect(hold).toHaveAttribute('aria-checked', 'false');
});

test('the setup hold switch turned on and off again before unit 2 leaves Settings → Input on Tap only', async ({ page }) => {
  await seed(page, { prefs: { holdMode: 'tap' } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  const hold = page.getByRole('switch', { name: /^Hold notes for their length/ });
  await expect(hold).toHaveAttribute('aria-checked', 'false');
  await hold.click();
  await expect(hold).toHaveAttribute('aria-checked', 'true');
  await hold.click();
  await expect(hold).toHaveAttribute('aria-checked', 'false');
  // In the same document: a reload would seed Tap only again.
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.getByRole('group', { name: 'Rhythm input' }).getByRole('button', { name: 'Tap only' })).toHaveAttribute('aria-pressed', 'true');
});

test('free practice holds by default once rhythm unit 2 is open', async ({ page }) => {
  const lessons = pathUpTo('3.5');
  await seed(page, { progress: { lessons, practiceDays: [], lastSettings: null }, prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/setup');
  await expect(page.getByRole('switch', { name: /^Hold notes for their length/ })).toHaveAttribute('aria-checked', 'true');
});

test('a new player starts with sol: meet it, write it, and Next lesson goes on', async ({ page }) => {
  await seed(page, { prefs: { noteNames: 'solfege' } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  // Home's Continue shows the first note on the staff, with its name.
  await expect(page.getByRole('img', { name: 'The notes so far: sol' })).toBeVisible();
  await page.getByRole('button', { name: 'Start lesson' }).click();
  await expect(page).toHaveURL(/#\/notes\/play$/);
  await expect(page.getByText('Lesson 1.1 · Treble clef · C major')).toBeVisible();
  // One note learned: one name button.
  const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
  await expect(names).toHaveCount(1);
  for (let i = 0; i < 10; i++) {
    await names.first().click();
    await page.getByRole('button', { name: /^(Next note|See summary)/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Lesson 1.1 done' })).toBeVisible();
  await expect(page.getByText('Unit 1 · Sol: the G line')).toBeVisible();
  await page.getByRole('button', { name: /^Next lesson/ }).click();

  // Lesson 1.2 writes sol: tap the staff, move it with the arrows, Check.
  await expect(page.getByText('Write sol (G) on the staff')).toBeVisible();
  const staff = page.getByRole('slider', { name: 'Where sol (G) goes on the staff' });
  await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();
  await page.getByRole('button', { name: 'Higher' }).click();
  await expect(staff).toHaveAttribute('aria-valuetext', 'the middle line');
  await page.getByRole('button', { name: 'Lower' }).click();
  await expect(staff).toHaveAttribute('aria-valuetext', 'the 2nd space');
  await page.getByRole('button', { name: 'Lower' }).click();
  await expect(staff).toHaveAttribute('aria-valuetext', 'the 2nd line');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Right: sol (G) is on the 2nd line.')).toBeVisible();
});

test('hearing a note: sol, then the note, named from the notes learned so far', async ({ page }) => {
  // Sol, rhythm unit 1 and mi's first two lessons done: lesson 3.3 hears mi.
  await seed(page, { progress: { lessons: pathUpTo('3.2') }, prefs: { seenHowTo: true, seenHold: true, noteNames: 'solfege' } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/path');
  await page.getByRole('button', { name: 'Start lesson 3.3' }).click();
  await expect(page.getByText('Which note comes after sol?')).toBeVisible();
  // The note stays hidden until it is named; the staff says its slot is empty.
  await expect(page.getByRole('img', { name: /Note 1 of 10 is still empty/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hear it again' })).toBeVisible();
  const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
  await expect(names).toHaveCount(2);
  await names.first().click();
  await expect(page.locator('.nfeedback')).toHaveText(/^(Right: mi \(E\), 2 steps below sol\.|That was sol \(G\), the same as sol\.)$/);
  await expect(page.getByRole('img', { name: /Note 1 of 10 is highlighted/ })).toBeVisible();
});

test('hearing a note after a reload: nothing sounds until a tap, then Hear it plays sol and the note', async ({ page }) => {
  // Every tone that starts (two oscillators a piano tone), not the silent sound that unlocks the audio.
  await page.addInitScript(() => {
    const w = window as unknown as { tones: number };
    w.tones = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: [number?]) {
      w.tones++;
      return start.apply(this, args);
    };
  });
  const tones = (): Promise<number> => page.evaluate(() => (window as unknown as { tones: number }).tones);
  await seed(page, { progress: { lessons: pathUpTo('3.2') }, prefs: { seenHowTo: true, seenHold: true, noteNames: 'solfege' } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/path');
  await page.getByRole('button', { name: 'Start lesson 3.3' }).click();
  // Started with a tap: sol and the note sound at once.
  await expect(page.getByRole('button', { name: 'Hear it again' })).toBeVisible();
  await expect.poll(tones).toBe(4);
  // A reload (a phone bringing back a discarded tab) comes back to the same note with no tap, when a browser does not
  // let the audio start: the tones would go into a silent context and come out together at the next tap. It waits.
  await page.reload();
  const hear = page.getByRole('button', { name: 'Hear it', exact: true });
  await expect(hear).toBeVisible();
  await expect(page.locator('.nfeedback')).toHaveText('Tap Hear it: first sol, then the note. Which one is it?');
  await page.waitForTimeout(1000);
  expect(await tones(), 'tones before a tap').toBe(0);
  await hear.click();
  await expect.poll(tones).toBe(4);
  await expect(page.getByRole('button', { name: 'Hear it again' })).toBeVisible();
  await expect(page.locator('.nfeedback')).toHaveText('Listen: first sol, then the note. Which one is it?');
});

/**
 * A double tap on a Start button (two taps 120 ms apart, a touch screen): the first starts the exercise and the screen
 * changes at once; the second must not press what the new screen has at that spot (Skip to results, an answer, a piano
 * key). The same goes for any tap that changes the screen.
 */
test.describe('a double tap on Start', () => {
  test.use({ hasTouch: true, isMobile: true });
  // Each touch carries the time the finger came down, as a phone's does: the second tap is `gap` ms (120) after the
  // first even when the page (and the test, which waits for it) is still busy drawing the new screen.
  const doubleTap = async (page: Page, button: Locator, gap = 120): Promise<void> => {
    const box = (await button.boundingBox())!;
    const touchPoints = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    const cdp = await page.context().newCDPSession(page);
    const tap = async (at: number): Promise<void> => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints, timestamp: at });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: at + 0.03 });
    };
    const t0 = Date.now() / 1000;
    await tap(t0);
    await page.waitForTimeout(gap + 30);
    await tap(t0 + gap / 1000);
    await page.waitForTimeout(500);
  };

  test('rhythm on a phone: Play starts, and Skip to results under the finger is not pressed', async ({ page }) => {
    await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 8, tempo: 60 } } });
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('./#/setup');
    await doubleTap(page, page.getByRole('button', { name: /^Start · / }));
    await expect(page).toHaveURL(/#\/play$/);
    await expect(page.getByRole('button', { name: 'Skip to results' })).toBeVisible();
    // A tap meant for it, after the double tap, still works.
    await page.getByRole('button', { name: 'Skip to results' }).tap();
    await expect(page).toHaveURL(/#\/results$/);
  });

  /**
   * The sheets that start or resume the run: How to play's Got it (every new player sees it first), the intro's and
   * Ready's Start, Pause's Resume and Restart. A sheet closes in 240 ms, so the second tap, 300 ms on, lands on Play.
   */
  for (const [size, sheet] of [['phone', 'How to play'], ['tablet', 'Paused']] as const) {
    test(`${sheet} on a ${size}: its button closes it, and Skip to results under the finger is not pressed`, async ({ page }) => {
      const seen = sheet === 'Paused' ? { seenHowTo: true, seenHold: true } : {};
      await seed(page, { prefs: { ...seen, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 8, tempo: 60 } } });
      await page.setViewportSize(VIEWPORTS[size]);
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).tap();
      // Each tap once the one before has had its 450 ms: a tap that soon after Start is dropped.
      await page.waitForTimeout(500);
      if (sheet === 'Paused') {
        await page.getByRole('button', { name: 'Pause', exact: true }).tap();
        await page.waitForTimeout(500);
      }
      const button = page.getByRole('dialog', { name: sheet }).getByRole('button', { name: sheet === 'Paused' ? 'Resume' : 'Got it' });
      await expect(button).toBeVisible();
      await doubleTap(page, button, 300);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/#\/play$/);
      await expect(page.getByRole('button', { name: 'Skip to results' })).toBeVisible();
    });
  }

  test('echo on a phone: Tap it back starts the tapping, and Hear again under the finger is not pressed', async ({ page }) => {
    await seed(page, { prefs: { seenHowTo: true, seenHold: true, seenEchoHowTo: true }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, mode: 'echo' } } });
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('./#/setup');
    await page.getByRole('button', { name: /^Start · / }).tap();
    // Once Start's own guard is over.
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Play the rhythm' }).tap();
    const tapBack = page.getByRole('button', { name: 'Tap it back' });
    await expect(tapBack).toBeVisible({ timeout: 15_000 });
    await doubleTap(page, tapBack);
    await expect(page.getByRole('heading', { name: 'Now tap it back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hear again · 1 left' })).toBeVisible();
  });

  test('a path lesson on a tablet: the round starts with nothing answered and is not skipped', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.goto('./#/path');
    await doubleTap(page, page.getByRole('button', { name: 'Start lesson 1.1' }));
    await expect(page).toHaveURL(/#\/notes\/play$/);
    await expect(page.getByRole('button', { name: /^Next note/ })).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('muzieklab.progress.v1') ?? '')).not.toContain('pitch:1.1');
  });

  test('scales on a phone: the piano key under the finger is not pressed', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('./#/scales');
    await page.getByRole('group', { name: 'Circle of fifths, major keys' }).getByRole('button', { name: /^G major/ }).tap();
    await doubleTap(page, page.getByRole('button', { name: 'Practice G major' }));
    await expect(page).toHaveURL(/#\/scales\/play$/);
    await expect(page.getByRole('img', { name: 'No mistakes' })).toBeVisible();
  });

  /**
   * The taps that end a round or open a setup change the screen at once too: Round done has New round or Change setup
   * where See the round or See summary was, and a setup its sticky Start or a switch where Change setup or Options was.
   */
  test('scales on a phone: See the round shows Round done, and Change setup the setup, with nothing under the finger pressed', async ({ page }) => {
    await seed(page, { progress: { scales: { settings: { keyMode: 'one', keys: ['C'], types: ['major'], input: 'names', direction: 'up', write: 'signs', showSteps: true, playNotes: false }, stars: {} } } });
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('./#/scales/setup');
    await page.getByRole('button', { name: 'Start · 1 scale' }).tap();
    await page.waitForTimeout(500);
    for (let i = 0; i < 8; i++) await page.keyboard.press('0');
    await doubleTap(page, page.getByRole('button', { name: /^See the round/ }));
    await expect(page).toHaveURL(/#\/scales\/done$/);
    await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
    const change = page.getByRole('link', { name: 'Change setup' });
    await change.scrollIntoViewIfNeeded();
    await doubleTap(page, change);
    await expect(page).toHaveURL(/#\/scales\/setup$/);
  });

  test('read notes on a phone: See summary shows Round done, and Change setup the setup, with nothing under the finger pressed', async ({ page }) => {
    await seed(page, { prefs: { noteNames: 'letters' } });
    // A round the test knows (Play restores it from the session): every note answered wrong, each waits for Next note.
    const settings = { ...DEFAULT_NOTE_SETTINGS, count: 10, playNotes: false };
    const notes = generateRound(settings, 4242);
    await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed: 4242, focus: [] });
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('./#/notes/play');
    for (const [i, note] of notes.entries()) {
      await expect(page.locator('.nplay-count')).toHaveText(`${i + 1} / 10`);
      await page.keyboard.press(LETTERS.find((L) => L !== letterOf(note.step))!.toLowerCase());
      if (i < 9) await page.keyboard.press('Enter');
    }
    await doubleTap(page, page.getByRole('button', { name: /^See summary/ }));
    await expect(page).toHaveURL(/#\/notes\/done$/);
    await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
    const change = page.getByRole('link', { name: 'Change setup' });
    await change.scrollIntoViewIfNeeded();
    await doubleTap(page, change);
    await expect(page).toHaveURL(/#\/notes$/);
  });

  test('the Key screen on a phone: Use C major opens the setup, and Start under the finger is not pressed', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('./#/notes/key');
    await doubleTap(page, page.getByRole('button', { name: 'Use C major' }));
    await expect(page).toHaveURL(/#\/notes$/);
  });

  test('the scales hub on a phone: Options opens the setup, and the switch under the finger is not changed', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('./#/scales');
    await doubleTap(page, page.getByRole('link', { name: 'Options' }));
    await expect(page).toHaveURL(/#\/scales\/setup$/);
    await expect(page.getByRole('switch', { name: /^Play each note/ })).toHaveAttribute('aria-checked', 'true');
  });
});

/**
 * A mouse double click on a Start button (two clicks, the second with detail 2, as a mouse sends them): as with a double
 * tap, the second click must not press what the new screen has under the pointer, nor its press take the focus there.
 * 110 ms apart, and 600 ms: the system counts a double click up to its double-click time (500 ms on Windows, longer if
 * set so), past a double tap's 450 ms.
 */
test.describe('a double click on Start', () => {
  // Each click carries the time it came down, as with the double tap above.
  const doubleClick = async (page: Page, button: Locator, gap = 110): Promise<void> => {
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const click = async (clickCount: number, timestamp: number): Promise<void> => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount, timestamp });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount, timestamp: timestamp + 0.03 });
    };
    const t0 = Date.now() / 1000;
    await click(1, t0);
    await page.waitForTimeout(gap + 30);
    await click(2, t0 + gap / 1000);
    await page.waitForTimeout(500);
  };

  for (const gap of [110, 600]) {
    test(`scales on desktop, ${gap} ms apart: the round is not skipped by Skip to summary under the pointer`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.goto('./#/scales');
      await doubleClick(page, page.getByRole('button', { name: 'Practice C major' }), gap);
      await expect(page).toHaveURL(/#\/scales\/play$/);
      await expect(page.getByRole('listitem', { name: 'Degree 1: now' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Skip to summary' })).not.toBeFocused();
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    });

    test(`rhythm on a phone, ${gap} ms apart: Skip to results under the pointer is not pressed`, async ({ page }) => {
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 4, tempo: 60 } } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./#/setup');
      await doubleClick(page, page.getByRole('button', { name: /^Start · / }), gap);
      await expect(page).toHaveURL(/#\/play$/);
      await expect(page.getByRole('button', { name: 'Skip to results' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Skip to results' })).not.toBeFocused();
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    });
  }

  test('a Learn practice on desktop: the first note is not answered, and Enter does not answer it', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('./#/learn/8');
    await doubleClick(page, page.getByRole('link', { name: 'Practice the treble clef →' }));
    await expect(page).toHaveURL(/#\/notes\/play\?from=8\.2$/);
    await expect(page.getByRole('button', { name: /^Next note/ })).toBeDisabled();
    // The name button under the pointer did not take the focus, so Enter does not press it.
    await expect(page.getByRole('group', { name: 'Note names' }).locator(':focus')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /^Next note/ })).toBeDisabled();
  });
});

/**
 * A click on a sheet's backdrop (it does not close it) leaves the focus in the sheet: it used to fall to the page, out
 * of the trap, and Shift+Tab then reached the control behind the sheet (Skip to results on a phone, the metronome
 * switch on desktop), which Enter pressed.
 */
test('a click on the backdrop of the Pause sheet leaves the focus in it, so Tab keeps to the sheet', async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 4, tempo: 60 } } });
  for (const [size, x, y] of [['phone', 30, 130], ['desktop', 40, 200]] as const) {
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    await expect(page.getByRole('img', { name: /Count-in, beat|Counting beat/ })).toBeAttached();
    await page.keyboard.press('Escape');
    const paused = page.getByRole('dialog', { name: 'Paused' });
    const resume = paused.getByRole('button', { name: /Resume/ });
    await expect(resume, size).toBeFocused();
    await page.mouse.click(x, y);
    await expect(paused, size).toBeVisible();
    await expect(resume, size).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(paused.getByRole('button', { name: 'Quit practice' }), size).toBeFocused();
  }
});

/**
 * While a rhythm runs, Space and Enter are taps, but on a control the player reached with Tab they press it, as in Read
 * notes and Scales: they were taps there too, so Skip to results could not be reached from the keyboard, and Enter on
 * Pause added an extra tap. A sheet that gives the focus back (Resume, to Pause) hands it on: Space is a tap again.
 */
test('rhythm play: Enter on Pause or Skip to results reached with Tab presses it, and Space after Resume is a tap', async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 4, tempo: 60 } } });
  for (const size of ['phone', 'tablet'] as const) {
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    await expect(page).toHaveURL(/#\/play$/);
    // Back from the heading on a tablet: its Pause is in the header above it, and Tab past the end leaves the page.
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    await tabTo(page, pause, size === 'tablet' ? 'Shift+Tab' : 'Tab');
    await page.keyboard.press('Enter');
    const paused = page.getByRole('dialog', { name: 'Paused' });
    await expect(paused, size).toBeVisible();
    await expect(paused.getByRole('button', { name: /Resume/ }), size).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog'), size).toHaveCount(0);
    await expect(pause, size).toBeFocused();
    await page.keyboard.down(' ');
    await expect(pad(page), size).toHaveClass(/is-held/);
    await page.keyboard.up(' ');
    await expect(page.getByRole('dialog'), size).toHaveCount(0);
    await tabTo(page, page.getByRole('button', { name: 'Skip to results' }));
    await page.keyboard.press('Enter');
    await expect(page, size).toHaveURL(/#\/results$/);
  }
});

/**
 * A setup stepper at its end (Bars 1 or 16, Notes 10 or 50) has nothing to do, and keeps the focus: disabled, the
 * button that was just pressed dropped it to the page.
 */
test('a setup stepper pressed to its end keeps the focus, and does nothing more', async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 2 } } });
  await page.setViewportSize(VIEWPORTS.phone);
  const steppers = [
    ['./#/setup', 'Bars', 'Fewer bars', 'More bars', '1', '16', 15],
    ['./#/notes', 'Notes', 'Fewer notes', 'More notes', '10', '50', 4],
  ] as const;
  for (const [screen, group, fewerName, moreName, min, max, presses] of steppers) {
    await page.goto(screen);
    const value = page.getByRole('group', { name: group, exact: true }).locator('[aria-live]');
    const fewer = page.getByRole('button', { name: fewerName });
    const more = page.getByRole('button', { name: moreName });
    await fewer.focus();
    await page.keyboard.press('Enter');
    await expect(value).toHaveText(min);
    await expect(fewer).toBeFocused();
    await expect(fewer).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(value).toHaveText(min);
    await more.focus();
    for (let i = 0; i < presses; i++) await page.keyboard.press('Enter');
    await expect(value).toHaveText(max);
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute('aria-disabled', 'true');
    await expect(fewer).not.toHaveAttribute('aria-disabled', 'true');
  }
});

/**
 * The service worker answers the app's own address from what it keeps, offline too, and leaves every other address to
 * the server. It used to answer them all with the app, whose ./assets addresses then pointed under the path that was
 * asked for (/learn/assets/…): a blank page with errors, where the server says 404.
 */
test("the service worker answers only the app's own address: a deeper one is the server's", async ({ page, context }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.evaluate(async () => void (await navigator.serviceWorker.ready));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { message: 'the service worker controls the page', timeout: 30_000 }).toBe(true);
  for (const path of ['./learn/1', './learn/', './notes/play', './learn/1?gclid=1']) {
    const res = await page.goto(path);
    expect(res?.fromServiceWorker(), path).toBe(false);
  }
  await context.setOffline(true);
  try {
    // The app's own address with any query (a link's tracking parameters) is still the app: it routes by # alone.
    for (const path of ['./#/settings', './?gclid=1#/settings', './index.html?utm_source=x#/settings']) {
      const res = await page.goto(path);
      expect(res?.fromServiceWorker(), path).toBe(true);
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' }), path).toBeVisible();
    }
  } finally {
    await context.setOffline(false);
  }
});

test('a new screen puts focus on its heading, so a screen reader hears it: Setup, Play, then Results', async ({ page }) => {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: QUARTERS } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('link', { name: /^Rhythm/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Free practice' })).toBeFocused();
  await page.getByRole('button', { name: /^Start · / }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  // The run ends without the player doing anything: Results' heading takes the focus that Play's had.
  await expect(page.getByRole('heading', { level: 1, name: 'Exercise done' })).toBeFocused({ timeout: 10_000 });
  // The first screen is left alone: its page load is read out.
  await page.goto('./#/setup');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Free practice' })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('echo: Tap it back and Hear again swap the screen inside Play, and its heading takes the focus', async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, seenEchoHowTo: true }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, mode: 'echo' } } });
  for (const size of ['phone', 'tablet', 'desktop'] as const) {
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    await page.getByRole('button', { name: 'Play the rhythm' }).click();
    const tapBack = page.getByRole('button', { name: 'Tap it back' });
    await expect(tapBack).toBeVisible({ timeout: 15_000 });
    await tapBack.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Tap the rhythm' }), size).toBeFocused();
    // Clicked: while the run is on, Enter and Space are taps, also on a button.
    await page.getByRole('button', { name: /^Hear again/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Listen to the rhythm' }), size).toBeFocused();
  }
});

test('echo: the play button keeps the focus while the rhythm plays, and Tap it back takes it once it has played', async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, seenEchoHowTo: true }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, mode: 'echo' } } });
  for (const size of ['phone', 'desktop'] as const) {
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    const tapBack = page.getByRole('button', { name: 'Tap it back' });
    // The first play, and the replay, after which no play is left.
    for (const name of ['Play the rhythm', 'Replay the rhythm']) {
      const play = page.getByRole('button', { name });
      await play.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Playing…' }), size).toBeVisible();
      await expect(play, size).toBeFocused();
      // A second press while it plays does nothing.
      await page.keyboard.press('Enter');
      await expect(tapBack, size).toBeVisible({ timeout: 15_000 });
      await expect(tapBack, size).toBeFocused();
    }
    await expect(page.getByText('No plays left'), size).toBeVisible();
  }
});

test('calibrate: the result takes the focus from the Tap pad, and Try again gives it to the pad that comes back', async ({ page }) => {
  test.setTimeout(40_000);
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/calibrate');
  await expect(pad(page)).toBeVisible();
  // Space on the focused pad starts the 16 clicks; with no tap on them the run ends on Too few taps, after about 12 s,
  // and its Try again takes the focus.
  await pad(page).focus();
  await page.keyboard.press(' ');
  const again = page.getByRole('button', { name: 'Try again' });
  await expect(again).toBeVisible({ timeout: 20_000 });
  await expect(again).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pad(page)).toBeFocused();
  await expect(page.getByText('PRESS THE PAD TO START')).toBeVisible();
});
