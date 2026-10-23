import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_NOTE_SETTINGS, generateRound } from '../src/core/noteRound';
import { letterOf } from '../src/core/pitch';
import { CHAPTERS } from '../src/ui/learn/chapters';
import {
  expectClickable, expectFits, expectNoClippedLabels, expectNoOverlap, expectNoSideScroll, expectNotSqueezed, expectTouchHeight, pad, pathUpTo, seed, SOL_DONE, VIEWPORTS,
  type ViewportName,
} from './helpers';

/**
 * Known layout bugs from the MVP QA, fixed in the follow-up layout PR. `test.fail` keeps CI green while they are open
 * and turns red the moment one starts passing, so the entry gets removed with its fix.
 */
const KNOWN: Record<string, string> = {};
const known = (vp: string, screen: string): void => {
  const why = KNOWN[`${vp}/${screen}`];
  test.fail(!!why, why);
};

/** One bar of four quarter notes at 120 BPM, tap only: a free-practice run of a few seconds. */
const QUARTERS = { mode: 'tap', hold: false, meters: ['4/4'], notes: ['quarter'], rests: [], dotted: false, ties: false, triplets: false, bars: 1, tempo: 120,
  metronome: 'on', countIn: 1, density: 'balanced', restAmount: 'few' };

/**
 * Plays along on the keyboard, every beat `lateMs` after it, from the first counted beat on Play: a steady late tapper
 * (Bluetooth headphones). Each key event carries its own time stamp, so a timer that fires late does not move a tap.
 */
async function tapLate(page: Page, beats: number, beatMs: number, lateMs: number): Promise<void> {
  await page.evaluate(
    ({ beats, beatMs, lateMs }) =>
      new Promise<void>((resolve) => {
        const key = (type: string, at: number): void => {
          const ev = new KeyboardEvent(type, { key: 'j', code: 'KeyJ', bubbles: true });
          Object.defineProperty(ev, 'timeStamp', { value: at });
          window.dispatchEvent(ev);
        };
        const look = (): void => {
          if (!document.querySelector('[role="img"][aria-label^="Counting beat 1 "]')) return void requestAnimationFrame(look);
          const t0 = performance.now();
          for (let k = 0; k < beats; k++) {
            const at = t0 + k * beatMs + lateMs;
            window.setTimeout(() => {
              key('keydown', at);
              key('keyup', at + 80);
            }, at + 80 - performance.now());
          }
          window.setTimeout(resolve, beats * beatMs + lateMs);
        };
        look();
      }),
    { beats, beatMs, lateMs },
  );
}

/**
 * Calibrates on the keyboard: the first press starts the 16 clicks (90 BPM, the first 1 s later), then one press on each
 * click. As in tapLate, each key event carries its own time stamp.
 */
async function calibrateAlong(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const key = (type: string, at: number): void => {
          const ev = new KeyboardEvent(type, { key: 'j', code: 'KeyJ', bubbles: true });
          Object.defineProperty(ev, 'timeStamp', { value: at });
          window.dispatchEvent(ev);
        };
        const t0 = performance.now();
        key('keydown', t0);
        key('keyup', t0 + 80);
        const clicks = Array.from({ length: 16 }, (_, k) => t0 + 1000 + (k * 60_000) / 90);
        for (const at of clicks) {
          window.setTimeout(() => {
            key('keydown', at);
            key('keyup', at + 80);
          }, at + 80 - performance.now());
        }
        window.setTimeout(resolve, clicks[15] + 200 - performance.now());
      }),
  );
}

/** Every screen's main action can be reached and tapped, at every supported size, with no sideways scroll. */
for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(name, () => {
    test.use({ viewport: VIEWPORTS[name], hasTouch: !name.startsWith('desktop') && !name.startsWith('laptop') });

    const desktopLayout = VIEWPORTS[name].width >= 1100;
    const tabletLayout = VIEWPORTS[name].width >= 700 && !desktopLayout;
    /**
     * Phone and tablet in portrait, a phone browser's short screen too: Read notes and Scales fit, so their controls are
     * checked where they are, without scrolling (DESIGN.md §9). A phone in landscape lays them out in two columns whose
     * left one may scroll; desktop has its own layout.
     */
    const portraitLayout = !desktopLayout && VIEWPORTS[name].height > VIEWPORTS[name].width;
    const inPlace = { scroll: !portraitLayout };

    test('home: start the first lesson and free practice', async ({ page }) => {
      known(name, 'home');
      await page.goto('./');
      // Nothing played yet: the card starts lesson 1.1, sol (no "Continue"), with the note on the staff and no meter,
      // bars or tempo.
      await expect(page.getByText('Unit 1 · Lesson 1 of 5', { exact: true })).toBeVisible();
      await expect(page.locator('.continue-card')).not.toContainText('BPM');
      // A new English player reads letters: sol is G.
      await expect(page.getByRole('img', { name: 'The notes so far: G' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Start lesson' }));
      // It is the one filled button on Home: the daily challenge's is outlined.
      await expect(page.locator('.home-desk, .home').locator('.btn--accent, .btn--ink')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Play the daily challenge for / })).toHaveClass(/btn--outline/);
      await expectClickable(page.getByRole('link', { name: /^Rhythm/ }));
      await expectClickable(page.getByRole('link', { name: /^Read notes/ }));
      await expectClickable(page.getByRole('link', { name: /^Scales/ }));
      // Tablet and desktop: the tabs sit in a top header (DESIGN.md §9), on desktop too, not in a sidebar.
      if (VIEWPORTS[name].width >= 700) await expect(page.getByRole('banner').getByRole('navigation', { name: 'Main' })).toBeVisible();
      // Tablet: the staff box keeps the height of its one line of notes instead of stretching down the tall screen.
      if (tabletLayout) expect((await page.locator('.continue-staff').boundingBox())!.height).toBeLessThan(200);
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.free'));
      await expectNotSqueezed(page.locator('.continue-card'));
      await expectNoSideScroll(page);
    });

    test('home: the level chip and its sheet, and the daily challenge', async ({ page }) => {
      known(name, 'home-daily');
      await page.goto('./');
      await expectClickable(page.getByRole('button', { name: /^Play the daily challenge for / }));
      await expect(page.locator('.daily-card')).toContainText('4 bars · new every day');
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.daily-card'));
      await expectNoOverlap(page.locator('.daily-card'), page.locator('.free'));
      await expectNotSqueezed(page.locator('.daily-card'));
      if (desktopLayout) {
        // Desktop keeps its level card (DESIGN.md §9), with one label under the XP bar.
        await expect(page.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeVisible();
        await expect(page.getByText('100 XP to level 2')).toBeVisible();
      } else {
        // Phone and tablet: a level chip beside the streak opens the level details.
        await expect(page.getByRole('img', { name: /^XP bar/ })).toHaveCount(0);
        const chip = page.getByRole('button', { name: 'Level 1' });
        await expectClickable(chip);
        await chip.click();
        const sheet = page.getByRole('dialog', { name: 'Level 1 · Tick' });
        await expect(sheet.getByText('Count at level 3')).toBeVisible();
        await expect(sheet.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeVisible();
        await expect(sheet.getByText('100 XP to level 2')).toBeVisible();
        await expectClickable(sheet.getByRole('button', { name: 'Close' }));
        await expectNoClippedLabels(page);
        await sheet.getByRole('button', { name: 'Close' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(chip).toBeFocused();
      }
      await expect(page.getByText(/\/ 100 XP/)).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test('home and path: lesson stars, with the diamond as four diamond stars', async ({ page }) => {
      known(name, 'home-stars');
      // Sol's unit passed; rhythm unit 1 (the path's unit 2) with a diamond, a 4th star and two stars.
      const lessons = { ...SOL_DONE, '1.1': { stars: 5, bestAccuracy: 100 }, '1.2': { stars: 4, bestAccuracy: 97 }, '1.3': { stars: 2, bestAccuracy: 80 } };
      await seed(page, { progress: { lessons }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./');
      await expect(page.getByText('Continue · Unit 2 · Lesson 4 of 5', { exact: true })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Continue lesson' }));
      const tiles = page.locator(desktopLayout ? '.path-card .tile' : '.continue-card .tile');
      await expect(tiles.nth(0).locator('.diamond-star')).toHaveCount(4);
      await expect(tiles.nth(1)).toContainText('★★★★');
      await expect(tiles.nth(2)).toContainText('★★☆');
      if (desktopLayout) {
        await expect(page.getByRole('img', { name: 'Diamond: every note perfect' })).toBeVisible();
        await expect(page.getByText('Next: lesson 2.4 · A little faster · 80 BPM')).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: 'Play lesson 2.1, Diamond: every note perfect' })).toBeVisible();
      }
      await page.goto('./#/path');
      const diamond = page.getByRole('button', { name: 'Play lesson 2.1 · Quarter notes: Diamond: every note perfect' });
      await expect(diamond.locator('.diamond-star')).toHaveCount(4);
      await expect(page.getByRole('button', { name: 'Play lesson 2.2 · Half notes: 3 of 3 stars and the bonus 4th star' })).toContainText('★★★★');
      await expectNoSideScroll(page);
    });

    test('setup: start button', async ({ page }) => {
      known(name, 'setup');
      await page.goto('./#/setup');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      await expectClickable(page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }));
      // Only the time signatures that can be played: no disabled "6/8 soon" chip.
      await expect(page.getByRole('button', { name: /6\/8/ })).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test('echo: listen, then the tap-back card and the pad', async ({ page }) => {
      known(name, 'echo');
      await page.goto('./#/setup');
      await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      // Before the path teaches holding, Echo is tap only too: How to play does not ask to hold.
      await expect(page.getByRole('dialog', { name: 'How to play' }).getByText(/Only when each note starts counts/)).toBeVisible();
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectClickable(page.getByRole('button', { name: 'Play the rhythm' }), { scroll: false });
      await expectNotSqueezed(page.locator('.echo-card'));
      if (!desktopLayout) {
        // The listen card and the pad both in view, also in a phone browser (DESIGN.md §9).
        await expect(pad(page)).toBeInViewport({ ratio: 1 });
        await expectTouchHeight(pad(page));
        await expectFits(page);
      }
      await expectNoSideScroll(page);
    });

    test('path: start lesson', async ({ page }) => {
      known(name, 'path');
      await page.goto('./#/path');
      await expectClickable(page.getByRole('button', { name: /^Start lesson/ }));
      await expectNoSideScroll(page);
    });

    test('path: one path, a unit open with its lessons by name, notes and rhythm taking turns', async ({ page }) => {
      known(name, 'path-tracks');
      await page.goto('./#/path');
      // One path since 0.11.0: no switcher.
      await expect(page.getByRole('group', { name: 'Paths' })).toHaveCount(0);
      await expect(page.getByText('Unit 1 of 26 · 0 / 390 ★')).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Theory: Learn' }));
      // The current unit is open: sol's lessons by name, the first one to play.
      const sol = page.getByRole('button', { name: /^1 · Sol: the G line/ });
      await expect(sol).toHaveAttribute('aria-expanded', 'true');
      await expectClickable(page.getByRole('button', { name: 'Play lesson 1.1 · Meet sol: 0 of 3 stars' }));
      await expect(page.getByRole('img', { name: 'Lesson 1.2 · Write sol, locked' })).toBeVisible();
      // Then rhythm, then the next note.
      const units = page.getByRole('list', { name: 'Units' });
      await expect(units.getByText('2 · Quarter and half notes')).toBeVisible();
      await expect(units.getByText('3 · Mi: the bottom line')).toBeAttached();
      // What opens the locked units is said once, under the first; no Next line repeats Start.
      await expect(units.getByText('Opens with 2 stars on every unit 1 lesson')).toHaveCount(1);
      await expect(units.getByText(/^Opens with/)).toHaveCount(1);
      await expect(units.getByText(/^Next: lesson/)).toHaveCount(0);
      await expectClickable(page.getByRole('button', { name: 'Start lesson 1.1' }));
      // Checked before a unit opens or closes: its chevron turns, which overflows the header for a moment.
      await expectNoClippedLabels(page);
      // Closing the open unit shows its lessons as stars again.
      await sol.click();
      await expect(sol).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#unit-1')).toBeHidden();
      await expect(page.locator('.unit-stars').getByRole('button', { name: 'Play lesson 1.1 · Meet sol: 0 of 3 stars' })).toBeVisible();
      // A tap low on the header, right above the stars, opens the unit (it does not start lesson 1.1).
      const headBox = (await sol.boundingBox())!;
      await sol.click({ position: { x: 30, y: headBox.height - 5 } });
      await expect(sol).toHaveAttribute('aria-expanded', 'true');
      await expect(page).toHaveURL(/#\/path$/);
      await expectNoSideScroll(page);
    });

    test('settings: leniency and reset progress', async ({ page }) => {
      known(name, 'settings');
      await page.goto('./#/settings');
      await expectClickable(page.getByText('Leniency', { exact: true }));
      // Leniency in words, not milliseconds; one Metronome row (the volume), the look is the Beat counter.
      await expect(page.getByText('Fair timing for most players.')).toBeVisible();
      await expect(page.getByText('Metronome', { exact: true })).toHaveCount(1);
      await expectClickable(page.getByRole('group', { name: 'Beat counter style' }).getByRole('button', { name: 'Analog' }));
      await expectClickable(page.getByRole('button', { name: 'Reset progress' }));
      await expectNoSideScroll(page);
    });

    test('settings: language, switched to Dutch and back', async ({ page }) => {
      known(name, 'settings-language');
      await page.goto('./#/settings');
      const group = page.getByRole('group', { name: 'App language' });
      await expectClickable(group.getByRole('button', { name: 'Nederlands' }));
      await group.getByRole('button', { name: 'Nederlands' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Instellingen' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
      // The switch remounts the screen; the thumb still slides over from English like the other rows.
      const thumb = page.getByRole('group', { name: 'Taal van de app' }).locator('.seg-thumb');
      await expect(thumb).toHaveCSS('animation-name', 'm-slide-a');
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Instellingen' })).toBeVisible();
      await page.getByRole('group', { name: 'Taal van de app' }).getByRole('button', { name: 'English' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    });

    test("settings: what's new, the latest release and the earlier ones", async ({ page }) => {
      known(name, 'changelog');
      await page.goto('./#/settings');
      await page.getByRole('link', { name: /^What's new/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: "What's new" })).toBeVisible();
      await expectNotSqueezed(page.locator('.cl-latest'));
      await expectClickable(page.getByRole('button', { name: /^0\.1\.0/ }));
      await page.getByRole('button', { name: /^0\.3\.0/ }).click();
      await expectClickable(page.getByRole('link', { name: 'Try Read notes' }));
      await expectNoSideScroll(page);
    });

    test('calibration: pad and the timing plot without scrolling', async ({ page }) => {
      known(name, 'calibration');
      await page.goto('./#/calibrate');
      await expectClickable(pad(page), { scroll: false });
      await expectTouchHeight(pad(page));
      await expect(page.getByRole('img', { name: /taps? measured/ })).toBeInViewport();
      await expectFits(page);
      await expectNoSideScroll(page);
    });

    test('calibration from results: your delay, and back to results', async ({ page }) => {
      known(name, 'calibration-results');
      // Sol's unit passed: Continue starts the first rhythm lesson, the path's 2.1.
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();
      await page.evaluate(() => {
        window.location.hash = '#/calibrate?from=results';
      });
      await expect(page.getByRole('heading', { level: 1, name: 'Calibrate timing' })).toBeVisible();
      await expect(page.getByText('Your delay', { exact: true })).toBeVisible();
      const back = page.getByRole('link', { name: 'Back to results' });
      await expectClickable(back, { scroll: false });
      await expectClickable(pad(page), { scroll: false });
      await expectNoSideScroll(page);
      await back.click();
      await expect(page).toHaveURL(/#\/results$/);
      await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();

      // After a reload there is no run to go back to: then it is the way in from Settings.
      await page.evaluate(() => {
        window.location.hash = '#/calibrate?from=results';
      });
      await expect(page.getByRole('heading', { level: 1, name: 'Calibrate timing' })).toBeVisible();
      await page.reload();
      const toSettings = page.getByRole('link', { name: 'Back to settings' });
      await expectClickable(toSettings, { scroll: false });
      await toSettings.click();
      await expect(page).toHaveURL(/#\/settings$/);
    });

    test('results: try again, new exercise and copy code', async ({ page }) => {
      known(name, 'results');
      // Desktop Play has no Skip link: finish on a phone-sized window, then show Results at this size.
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();
      // Nothing was played: the badge says what opens lesson 2.2, the tip says no taps came in, and under 2 stars the
      // filled button plays the same exercise again. The code is not shown, only copied.
      await expect(page.getByText('Get 2 stars to open lesson 2.2')).toBeVisible();
      await expect(page.getByText(/^No taps came in\./)).toBeVisible();
      await expect(page.getByText(/max combo|T44-/)).toHaveCount(0);
      await expect(page.locator('.results-main .btn--accent')).toHaveText('Try again');
      await expectClickable(page.getByRole('button', { name: 'Try again' }));
      await expectClickable(page.getByRole('button', { name: 'New exercise' }));
      await expectClickable(page.getByRole('button', { name: 'Copy code' }));
      // Every note was missed: each has a × under it on the staff as well as the miss colour (DESIGN.md §9).
      const misses = Number(await page.locator('.counts .count-n').nth(3).textContent());
      expect(misses).toBeGreaterThan(0);
      await expect(page.locator('.results-staff .staff-miss path')).toHaveCount(misses);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('results: a steady late tapper is told about latency, with Calibrate', async ({ page }) => {
      known(name, 'results-latency');
      test.setTimeout(60_000);
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: QUARTERS } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await tapLate(page, 4, 500, 130);
      await expect(page.getByRole('heading', { name: 'Exercise done' })).toBeVisible({ timeout: 10_000 });
      await page.setViewportSize(VIEWPORTS[name]);
      // Every tap about 130 ms late: all Miss and Extra, and a tip that names the delay, not the reading.
      const tip = page.getByText(/^Your taps came about \d+ ms late every time\./);
      await expect(tip).toBeVisible();
      const tipText = await tip.textContent();
      const calibrate = page.getByRole('link', { name: 'Calibrate' });
      await expectClickable(calibrate);
      await expectClickable(page.getByRole('button', { name: 'Try again' }));
      await expectClickable(page.getByRole('button', { name: 'Copy code' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expect(calibrate).toHaveAttribute('href', '#/calibrate?from=results');
      // Started from a Learn section's Practice link, the run ends on #/results?from=1.1 (notes.spec.ts, "learn: a rhythm
      // practice link…"): Calibrate takes that along, and brings it back.
      await page.evaluate(() => {
        window.location.hash = '#/results?from=1.1';
      });
      await expect(page.getByRole('link', { name: 'Back to chapter 1' })).toBeVisible();
      await calibrate.click();
      await expect(page).toHaveURL(/#\/calibrate\?from=results&learn=1\.1$/);
      await expect(page.getByRole('link', { name: 'Back to results' })).toHaveAttribute('href', '#/results?from=1.1');

      // Calibrated from the tip: Save returns to the same run, whose tip is still about how it was played. In place of
      // Calibrate, one line says the next exercise uses the calibration.
      await calibrateAlong(page);
      const save = page.getByRole('button', { name: 'Save' });
      await expectClickable(save);
      await expectNoSideScroll(page);
      await save.click();
      await expect(page).toHaveURL(/#\/results\?from=1\.1$/);
      await expect(page.getByRole('link', { name: 'Back to chapter 1' })).toBeVisible();
      await expect(page.getByText(tipText!, { exact: true })).toBeVisible();
      await expect(page.getByText('Calibrated. Your next exercise uses it.', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Calibrate' })).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test('read notes: round done', async ({ page }) => {
      known(name, 'notes-done');
      await page.goto('./#/notes');
      await page.getByRole('button', { name: /^Start · / }).click();
      await page.getByRole('group', { name: 'Note names' }).getByRole('button').first().click();
      await page.getByRole('button', { name: 'Skip to summary' }).click();
      await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'New round' }));
      await expectClickable(page.getByRole('link', { name: 'Change setup' }));
      await expectNoSideScroll(page);
    });

    test('path: the current unit is in view, and long Dutch titles stay inside their boxes', async ({ page }) => {
      known(name, 'path-current');
      // The path up to lesson 14.2 with two stars: unit 14 (rhythm's dotted notes) is current, below the fold.
      await seed(page, { progress: { lessons: pathUpTo('14.2') }, prefs: { language: 'nl', seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await expect(page.getByRole('button', { name: /^14 · Gepunteerde noten/ })).toBeInViewport();
      await expectClickable(page.getByRole('button', { name: /^Begin les 14\.3/ }));
      // "10 · Tweekwartsmaat, achtste rusten", "5 · Fa: de onderste tussenruimte": a long word breaks instead of running
      // into the unit's stars.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const spill = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.unit-head .unit-title, .lesson-title')]
          .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent),
      );
      expect(spill, 'titles that run out of their box').toEqual([]);
      await expectNoSideScroll(page);
    });

    test('read notes lesson: round done with Next lesson', async ({ page }) => {
      known(name, 'notes-lesson-done');
      // Read notes unit 1 is the path's unit 15.
      await seed(page, { progress: { lessons: { ...pathUpTo('14.5'), 'notes:1.1': { stars: 3, bestAccuracy: 96 } } }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Play lesson 15.1 · Name the notes: 3 of 3 stars' }).click();
      await page.getByRole('button', { name: 'Skip to summary' }).click();
      await expect(page.getByRole('heading', { name: 'Lesson 15.1 done' })).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Back to the path' }));
      await expectClickable(page.getByRole('button', { name: 'New round' }));
      await expectClickable(page.getByRole('button', { name: 'Next lesson: 15.2 · Twenty notes' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('path lesson: write a note on the staff', async ({ page }) => {
      known(name, 'notes-write');
      // Sol, rhythm unit 1 and Meet mi passed: lesson 3.2 writes mi (and sol).
      await seed(page, { progress: { lessons: pathUpTo('3.1') }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Start lesson 3.2' }).click();
      const staff = page.getByRole('slider', { name: /^Where (mi \(E\)|sol \(G\)|E \(mi\)|G \(sol\)) goes on the staff$/ });
      await expect(staff).toBeVisible();
      await expect(staff).toHaveAttribute('aria-valuetext', 'Not on the staff yet');
      for (const label of ['Lower', 'Higher', 'Hint']) await expectClickable(page.getByRole('button', { name: label }), inPlace);
      await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();
      // A tap on the staff puts the note on the nearest line or space; Check takes it.
      const svg = (await staff.locator('svg').boundingBox())!;
      await page.mouse.click(svg.x + svg.width / 2, svg.y + svg.height / 2);
      await expect(staff).toHaveAttribute('aria-valuetext', 'the middle line');
      await expectClickable(page.getByRole('button', { name: 'Check' }), inPlace);
      // A line or space is easy to point at: at least 7 px apart (the drawing is 14 steps high).
      expect(svg.height / 14, 'staff steps too close together to point at').toBeGreaterThanOrEqual(7);
      if (portraitLayout) await expectFits(page);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.getByRole('button', { name: 'Check' }).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^(Right|You wrote)/);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
    });

    test('path lesson: hear a note after sol', async ({ page }) => {
      known(name, 'notes-hear');
      await seed(page, { progress: { lessons: pathUpTo('3.2') }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Start lesson 3.3' }).click();
      await expect(page.getByRole('img', { name: /Note 1 of 10 is still empty/ })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Hear it again' }), inPlace);
      // Two notes learned: two name buttons, side by side.
      const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
      await expect(names).toHaveCount(2);
      for (let i = 0; i < 2; i++) await expectClickable(names.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      if (portraitLayout) await expectFits(page);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('read notes: setup, key and start', async ({ page }) => {
      known(name, 'notes-setup');
      await page.goto('./#/notes');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      await page.getByRole('link', { name: /^Key: / }).click();
      // The last row of keys is reachable above the sticky Use button once the list is scrolled to its end.
      await page.locator('.nkeys').evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expectClickable(page.getByRole('button', { name: /^C♯ major or A♯ minor/ }), { scroll: false });
      await expectClickable(page.getByRole('button', { name: /^Use / }));
      await expectNoSideScroll(page);
    });

    test('read notes: name buttons, piano and next', async ({ page }) => {
      known(name, 'notes-play');
      await page.goto('./#/notes');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /staff in C major/ })).toBeVisible();
      const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
      await expect(names).toHaveCount(7);
      // Everything in view without scrolling, in a phone browser too (DESIGN.md §9).
      for (let i = 0; i < 7; i++) await expectClickable(names.nth(i), inPlace);
      await expectTouchHeight(names.first());
      // C major without extra signs: no note can have a sign, so there is no sign row (and no line about it).
      await expect(page.getByRole('radiogroup', { name: 'Sharp or flat' })).toHaveCount(0);
      await expect(page.getByText('Pick the sign if there is one, then the name.')).toHaveCount(0);
      if (portraitLayout) await expectFits(page);
      await expectNoSideScroll(page);
      await page.getByRole('group', { name: 'Answer with' }).getByRole('button', { name: 'Piano' }).click();
      const keys = page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button');
      await expect(keys).toHaveCount(12);
      for (let i = 0; i < 12; i++) await expectClickable(keys.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      await expectTouchHeight(page.getByRole('button', { name: 'Hint' }));
      // The hint takes two lines; the piano gives up the room, so nothing scrolls.
      await page.getByRole('button', { name: 'Hint' }).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^.+\. This note is|^This is /);
      await expectClickable(keys.nth(0), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      if (portraitLayout) await expectFits(page);
      await expectNoSideScroll(page);
    });

    test('read notes: the sign row with extra signs', async ({ page }) => {
      known(name, 'notes-signs');
      await page.goto('./#/notes');
      await page.getByRole('button', { name: 'Sharps ♯' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /staff in C major/ })).toBeVisible();
      for (const sign of ['flat', 'natural', 'sharp']) await expectClickable(page.getByRole('radio', { name: sign }), inPlace);
      const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
      for (let i = 0; i < 7; i++) await expectClickable(names.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      if (portraitLayout) await expectFits(page);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('read notes: round done with the missed notes on small staves, named as the player reads them', async ({ page }) => {
      known(name, 'notes-done-chips');
      // A known round (treble, C major, on the staff): the first three notes answered with a wrong letter.
      const settings = { ...DEFAULT_NOTE_SETTINGS, count: 10 };
      const seed = 4242;
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
      await page.goto('./#/notes/play');
      const notes = generateRound(settings, seed).slice(0, 3);
      for (const n of notes) {
        const wrong = letterOf(n.step) === 'C' ? 'D' : 'C';
        // "C", or "C, key C" with the computer keys shown.
        await page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: new RegExp(`^${wrong}(,|$)`) }).click();
        await page.getByRole('button', { name: /^Next note/ }).click();
      }
      await page.getByRole('button', { name: 'Skip to summary' }).click();
      await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
      const chips = page.getByRole('list', { name: 'Missed' }).getByRole('listitem');
      await expect(chips.first()).toHaveAccessibleName(/^[A-G] on the .+ \(treble clef\), missed (once|\d times)$/);
      await expect(chips.first()).toHaveText(/^[A-G]/);
      await expect(chips.first().locator('.pitch-staff svg')).toBeVisible();
      await expectNotSqueezed(page.locator('.ncard').nth(1));
      await expectClickable(page.getByRole('button', { name: 'Practice missed notes' }));
      await expectNoSideScroll(page);
    });

    test('scales: the hub, its circle and the selected key, a Home page', async ({ page }) => {
      known(name, 'scales-hub');
      const wide = VIEWPORTS[name].width >= 700;
      await page.goto('./#/scales');
      await expect(page.getByRole('heading', { level: 1, name: 'Scales' })).toBeVisible();
      // The hub is opened from Home: Home stays current, in the tab bar on phone and in the header on tablet and desktop.
      const nav = wide ? page.getByRole('banner').getByRole('navigation', { name: 'Main' }) : page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      await expectClickable(page.getByRole('group', { name: 'Major or minor' }).getByRole('button', { name: 'Minor' }));
      const circle = page.getByRole('group', { name: 'Circle of fifths, major keys' });
      for (const key of ['C major', 'F♯ major', 'B major', 'D♭ major']) await expectClickable(circle.getByRole('button', { name: new RegExp('^' + key) }));
      await circle.getByRole('button', { name: /^D major/ }).click();
      await expect(page.getByRole('button', { name: 'Practice D major' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Practice D major' }));
      await expectClickable(page.getByRole('link', { name: 'Options' }));
      await expectClickable(page.getByRole('button', { name: /^Go round the circle/ }));
      if (wide) await expectNoOverlap(page.locator('.hub-circle-col'), page.locator('.hub-sel'));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      // Minor: the inner ring comes to the front; tapping the selected bottom key again switches its spelling.
      await page.getByRole('group', { name: 'Major or minor' }).getByRole('button', { name: 'Minor' }).click();
      const minor = page.getByRole('group', { name: 'Circle of fifths, minor keys' });
      await minor.getByRole('button', { name: /^B♭ minor/ }).click();
      await minor.getByRole('button', { name: /^B♭ minor/ }).click();
      await expect(page.getByRole('button', { name: 'Practice A♯ minor' })).toBeVisible();
      await expectNoSideScroll(page);
    });

    test('scales: setup and start', async ({ page }) => {
      known(name, 'scales-setup');
      await page.goto('./#/scales/setup');
      await expect(page.getByRole('heading', { name: 'Scale practice' })).toBeVisible();
      await expectClickable(page.getByRole('group', { name: 'Keys' }).getByRole('button', { name: 'All 15' }));
      await expectClickable(page.getByRole('button', { name: /^Melodic minor/ }));
      await expectClickable(page.getByRole('switch', { name: /^Play each note/ }));
      await expectClickable(page.getByRole('button', { name: 'Start · 1 scale' }));
      await page.getByRole('group', { name: 'Keys' }).getByRole('button', { name: 'All 15' }).click();
      await expect(page.getByRole('button', { name: 'Start · 15 scales' })).toBeVisible();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('scales: play G major on the piano, then round done', async ({ page }) => {
      known(name, 'scales-play');
      // The Scales piano shows its letters even with Read notes' labels off.
      await seed(page, {
        prefs: { pianoLabels: 'off' },
        progress: { scales: { settings: { keyMode: 'one', keys: ['G'], types: ['major'], input: 'piano', direction: 'up', write: 'signs', showSteps: true, playNotes: true }, stars: {} } },
      });
      await page.goto('./#/scales/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      const keys = page.getByRole('group', { name: /^Piano keyboard from G to A/ }).getByRole('button');
      await expect(keys).toHaveCount(15);
      // The whole piano with its letters in view without scrolling, in a phone browser too (DESIGN.md §9).
      for (let i = 0; i < 15; i++) await expectClickable(keys.nth(i), inPlace);
      await expect(page.locator('.spiano .piano-label')).toHaveText(['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A']);
      if (portraitLayout) for (const label of await page.locator('.spiano .piano-label').all()) await expect(label).toBeInViewport({ ratio: 1 });
      await expectClickable(page.getByRole('button', { name: 'Skip to summary' }), inPlace);
      if (portraitLayout) await expectFits(page);
      // Nothing to hear or start over before the first note.
      await expect(page.getByRole('button', { name: /^Hear it so far/ })).toBeHidden();
      await expect(page.getByRole('button', { name: /^Start over/ })).toBeHidden();
      // G A B C D E F♯ G: the F♯ is the black key between F and G.
      const piano = page.getByRole('group', { name: /^Piano keyboard from G to A/ });
      const key = (name: string) => piano.getByRole('button', { name: new RegExp('^' + name + '(,|$)') });
      await key('G').first().click();
      await expectClickable(page.getByRole('button', { name: /^Hear it so far/ }));
      await expectClickable(page.getByRole('button', { name: /^Start over/ }));
      for (const k of ['A', 'B', 'C', 'D', 'E']) await key(k).first().click();
      await key('F sharp or G flat').click();
      await key('G').nth(1).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^G major: done, no mistakes/);
      await expectClickable(page.getByRole('button', { name: /^Hear the scale/ }));
      await expectClickable(page.getByRole('button', { name: /^See the round/ }));
      await expectNoSideScroll(page);
      await page.getByRole('button', { name: /^See the round/ }).click();
      await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
      await expect(page.getByLabel('1 of 1 scales without a mistake')).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'New round' }));
      await expectClickable(page.getByRole('link', { name: 'Change setup' }));
      await expectNoSideScroll(page);
    });

    test('scales: spell E harmonic minor with the signs', async ({ page }) => {
      known(name, 'scales-spell');
      await seed(page, { progress: { scales: { settings: { keyMode: 'one', keys: ['G'], types: ['harmonic'], input: 'names', direction: 'up', write: 'signs', showSteps: true, playNotes: false }, stars: {} } } });
      await page.goto('./#/scales/setup');
      await page.getByRole('button', { name: 'Start · 1 scale' }).click();
      await expect(page.getByText('E harmonic minor', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Hear it so far/ })).toBeHidden();
      await expect(page.getByRole('button', { name: /^Start over/ })).toBeHidden();
      const signs = page.getByRole('group', { name: 'Sign for E' }).getByRole('button');
      await expect(signs).toHaveCount(3);
      for (let i = 0; i < 3; i++) await expectClickable(signs.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      if (portraitLayout) await expectFits(page);
      await signs.nth(1).click();
      await expectClickable(page.getByRole('button', { name: /^Hear it so far/ }));
      await expectClickable(page.getByRole('button', { name: /^Start over/ }));
      await page.getByRole('group', { name: 'Sign for F' }).getByRole('button', { name: /^F sharp/ }).click();
      await page.getByRole('group', { name: 'Sign for G' }).getByRole('button').nth(2).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^Not G♯\. From F♯, go up a half step/);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('learn: chapter list and chapters 9–10', async ({ page }) => {
      known(name, 'learn');
      const { width } = VIEWPORTS[name];
      const layout = width >= 1100 ? 'desktop' : width >= 700 ? 'tablet' : 'phone';
      await page.goto('./#/learn');
      // Chapter 1 starts open. Tablet and desktop use the width: its sections sit in two columns, read down.
      // Measured together, after the web fonts: a font that loads between two measurements moves the list.
      await page.getByRole('link', { name: /^1\.3/ }).waitFor();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const [first, third] = await page.evaluate(() =>
        ['1.1', '1.3'].map((id) => [...document.querySelectorAll('a')].find((el) => el.textContent?.trim().startsWith(id))!.getBoundingClientRect().y),
      );
      expect(third === first, 'sections in two columns').toBe(layout !== 'phone');
      // Opening chapter 10 closes chapter 1.
      const ch10 = page.getByRole('button', { name: /^10\s*Key signatures/ });
      await expectClickable(ch10);
      await ch10.click();
      await expect(page.getByRole('button', { name: /^1\s*Pulse and meter/ })).toHaveAttribute('aria-expanded', 'false');
      await expectClickable(page.getByRole('link', { name: /^10\.2/ }));
      await expectNoSideScroll(page);

      await page.getByRole('link', { name: /^10\.2/ }).click();
      await expect(page.getByRole('heading', { name: /10\.2\s*The order of sharps and flats/ })).toBeInViewport();
      // Jumping to a section: section chips on tablet, the chapter sidebar on desktop, the chapter list on phone.
      const jump = page.getByRole('navigation', { name: 'Sections' });
      await expect(jump).toHaveCount(layout === 'phone' ? 0 : 1);
      if (layout === 'desktop') await expectNoOverlap(page.locator('.learn-side'), page.locator('.learn-main'));
      if (layout !== 'phone') {
        await expectClickable(jump.getByRole('link', { name: /Naming the key/ }));
        await jump.getByRole('link', { name: /Naming the key/ }).click();
        await expect(page.getByRole('heading', { name: /10\.3\s*Naming the key/ })).toBeInViewport();
      }
      if (layout === 'desktop') {
        await expectClickable(jump.getByRole('link', { name: 'Quick check' }));
        await jump.getByRole('link', { name: 'Quick check' }).click();
        await expect(page.getByRole('button', { name: 'D', exact: true })).toBeInViewport();
        await expectClickable(page.locator('.learn-side').getByRole('link', { name: /Notes on the staff/ }));
      }
      await expectClickable(page.getByRole('link', { name: 'Practice keys up to three signs →' }));
      await expectClickable(page.getByRole('link', { name: /Previous\s*9 · Sharps, flats and naturals/ }));
      await expectClickable(page.getByRole('link', { name: 'Practice reading notes' }));
      await expectNoSideScroll(page);

      // The piano diagrams of chapter 9 fit beside their text.
      await page.getByRole('link', { name: /Previous\s*9 · Sharps, flats and naturals/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: /Sharps, flats and naturals/ })).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Practice on the piano →' }));
      await expectClickable(page.getByRole('link', { name: /Next\s*10 · Key signatures/ }));
      await expectNoSideScroll(page);
    });

    test('learn: rhythm chapters count under the notes, the note tree switches, words answer the quick check', async ({ page }) => {
      known(name, 'learn-rhythm');
      await page.goto('./#/learn/1');
      await expect(page.getByRole('heading', { level: 1, name: /Pulse and meter/ })).toBeVisible();
      await expect(page.getByText('Start here · Path units 2, 6, 10')).toBeVisible();
      // 1.2: two bars of 4/4 counted 1 2 3 4 | 1 (2) 3 (4).
      const bars = page.getByRole('img', { name: /^Two bars of 4\/4: four quarter notes/ });
      await expect(bars.locator('.staff-counts text')).toHaveText(['1', '2', '3', '4', '1', '(2)', '3', '(4)']);
      await expectClickable(page.getByRole('link', { name: 'Practice feeling beat 1 →' }));
      await expectNoSideScroll(page);

      await page.goto('./#/learn/2?s=2.2');
      const tree = page.locator('.learn-tree');
      await expect(tree.getByText(/^sixteenth note$/i)).toBeVisible();
      await expectClickable(tree.getByRole('button', { name: 'Rests' }));
      await tree.getByRole('button', { name: 'Rests' }).click();
      await expect(tree.getByText(/^sixteenth rest$/i)).toBeVisible();
      await expectNoSideScroll(page);

      // Answers in words get a row each and stay clickable.
      await page.goto('./#/learn/5?s=check');
      const right = page.getByRole('button', { name: 'A quarter tied to an eighth' });
      await expectClickable(right);
      await right.click();
      await expect(page.getByRole('status')).toContainText('Right.');
      await expectClickable(page.getByRole('link', { name: /Next\s*6 · Off the beat/ }));
      await expectNoSideScroll(page);
    });

    test('learn: a section is read once its quick check is answered right', async ({ page }) => {
      known(name, 'learn-check');
      await page.goto('./#/learn/2?s=2.1');
      const check = page.getByRole('group', { name: /^A filled note head with a stem and two flags/ });
      await expect(check.getByText('Answer it right to mark this section read.')).toBeVisible();
      // A wrong answer gives a hint, not the answer, and the section stays unread.
      await expectClickable(check.getByRole('button', { name: 'An eighth (½ beat)' }));
      await check.getByRole('button', { name: 'An eighth (½ beat)' }).click();
      await expect(check.getByRole('status')).toHaveText(/^Not quite\. Start from the quarter note/);
      await expect(check.locator('.learn-answer.is-right')).toHaveCount(0);
      await expect(check.getByText('✓ read')).toHaveCount(0);
      await check.getByRole('button', { name: 'A sixteenth (¼ beat)' }).click();
      await expect(check.getByRole('status')).toHaveText(/^Right\. Each flag halves the note/);
      await expect(check.getByText('✓ read')).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Practice whole, half and quarter notes →' }));
      await expectNoSideScroll(page);

      // The Learn tab counts it; 2.2 is still unread.
      await page.goto('./#/learn');
      await page.getByRole('button', { name: /^2\s*Note values/ }).click();
      await expect(page.getByRole('link', { name: /^2\.1.*✓ read/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /^2\.2/ })).not.toContainText('✓ read');
      await expect(page.getByText(`1 / ${CHAPTERS.flatMap((c) => c.sections).length} sections`)).toBeVisible();
    });

    test('learn: every chapter fits, with its practice links reachable', async ({ page }) => {
      known(name, 'learn-all');
      for (const c of CHAPTERS) {
        await page.goto(`./#/learn/${c.n}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(String(c.n));
        await expect(page.locator('.learn-section')).toHaveCount(c.sections.length);
        await expect(page.locator('.learn-check--section')).toHaveCount(c.sections.length);
        await expect(page.locator('.learn-practice')).toHaveCount(c.sections.filter((s) => s.practice).length);
        await expectNoSideScroll(page);
        if (c.sections.some((s) => s.practice)) await expectClickable(page.locator('.learn-practice').last());
        await expectClickable(page.getByRole('link', { name: 'Back to all chapters' }));
      }
    });

    test('learn: examples play one at a time: the pulse, a rhythm, a scale and the piano', async ({ page }) => {
      known(name, 'learn-sound');
      await page.goto('./#/learn/1');
      const pulse = page.getByRole('group', { name: /^Four seconds of beats/ });
      await expectClickable(pulse.getByRole('button', { name: 'Play 60 BPM' }));
      await pulse.getByRole('button', { name: 'Play 60 BPM' }).click();
      await expect(pulse.getByRole('button', { name: 'Stop' })).toBeVisible();
      // Starting another example stops the first.
      const bars = page.locator('#s1-2').getByRole('button', { name: 'Play', exact: true }).first();
      await expectClickable(bars);
      await bars.click();
      await expect(pulse.getByRole('button', { name: 'Play 60 BPM' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(1);
      await expectNoSideScroll(page);

      // Opening another chapter stops it. A scale plays, and so do the piano's marked keys and each key.
      await page.goto('./#/learn/11?s=11.1');
      await expect(page.getByRole('heading', { level: 1, name: /Scales/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
      const scale = page.locator('#s11-1');
      await expect(scale.getByRole('button', { name: 'Play', exact: true })).toHaveCount(2);
      await expectClickable(scale.getByRole('button', { name: 'Play', exact: true }).first());
      const piano = scale.getByRole('group', { name: /^One piano octave/ });
      await expectClickable(piano.getByRole('button', { name: 'E', exact: true }));
      await expectClickable(piano.getByRole('button', { name: 'F sharp or G flat' }));
      await expectNoSideScroll(page);
    });

    test('learn: a rhythm practice link lands on Play, and Quit returns to the section', async ({ page }) => {
      known(name, 'learn-practice');
      await seed(page, { prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/learn/1?s=1.1');
      const link = page.getByRole('link', { name: 'Practice at a steady tempo →' });
      await expectClickable(link);
      await link.click();
      await expect(page).toHaveURL(/#\/play\?from=1\.1$/);
      const quit = page.getByRole('link', { name: /^Quit/ });
      await expectClickable(quit, { scroll: false });
      await expectNoSideScroll(page);
      await quit.click();
      await expect(page).toHaveURL(/#\/learn\/1\?s=1\.1$/);
      await expect(page.getByRole('heading', { name: /1\.1\s*The beat and tempo/ })).toBeInViewport();
    });

    test('play: how to play, then the pad', async ({ page }) => {
      known(name, 'play');
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expectClickable(pad(page), { scroll: false });
      // A phone in landscape has no Skip link: the pad takes the right column.
      if (portraitLayout) await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
      if (!desktopLayout) await expectFits(page);
      await expectNoSideScroll(page);
    });

    test('play: eight bars fit, with the staff, the lane, the beat counter, the pad and Skip in view', async ({ page }) => {
      known(name, 'play-eight-bars');
      // Lessons go up to 8 bars: the staff shows two rows and the timing lane two, the tallest Play gets.
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, notes: ['quarter', 'eighth', 'half'], bars: 8, tempo: 60 } } });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /^Count-in, beat/ })).toBeAttached({ timeout: 3000 });
      await expect(page.locator('.staff-fallback')).toHaveCount(0);
      // A phone in landscape scrolls the staff card in its own column; the pad is beside it.
      if (portraitLayout) {
        await expect(page.locator('.play-staff')).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole('img', { name: 'Note lengths compared with how long each note was held' })).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.beats')).toBeInViewport({ ratio: 1 });
        await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
      }
      if (!desktopLayout) {
        await expectClickable(pad(page), { scroll: false });
        await expectTouchHeight(pad(page));
        await expectFits(page);
      }
      await expectNoSideScroll(page);
    });

    test('play: the count-in says Count-in, with no note highlighted, then bar 1', async ({ page }) => {
      known(name, 'play-count-in');
      await seed(page, { prefs: { seenHowTo: true }, progress: { lessons: SOL_DONE } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await expect(page.getByRole('img', { name: /^Count-in, beat/ })).toBeAttached({ timeout: 3000 });
      // The desktop layout from 1100 px wide (a tablet in landscape too).
      const desk = VIEWPORTS[name].width >= 1100;
      const line = page.locator(desk ? '.dplay-title .mono-line' : '.play-info .mono-line');
      await expect(line).toContainText('Count-in');
      await expect(page.locator(desk ? '.dbeats.is-count-in' : '.beats.is-count-in')).toBeVisible();
      await expect(page.locator('rect[data-cursor]')).toHaveCount(0);
      // Lesson 2.1 (rhythm 1.1): one bar of 4/4 at 60 BPM.
      await expect(page.getByRole('img', { name: /^Counting beat/ })).toBeAttached({ timeout: 6000 });
      await expect(line).toContainText('Bar 1 of 2');
      await expect(page.locator('.is-count-in')).toHaveCount(0);
      await expect(page.locator('rect[data-cursor]')).toHaveCount(1);
      await expectNoSideScroll(page);
    });

    test('play: what a lesson introduces, before the count-in', async ({ page }) => {
      known(name, 'play-intro');
      await seed(page, { prefs: { seenHowTo: true }, progress: { lessons: { ...SOL_DONE, '1.1': { stars: 3, bestAccuracy: 95 } } } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      const sheet = page.getByRole('dialog', { name: 'Half notes' });
      await expect(sheet.getByText('New in this lesson')).toBeVisible();
      await expectClickable(sheet.getByRole('link', { name: 'Learn more: Half note' }));
      await expectClickable(sheet.getByRole('button', { name: 'Listen' }));
      await expectClickable(sheet.getByRole('button', { name: 'Start' }));
      // Desktop: the dialog sits under the staff, so the rhythm stays readable.
      if (VIEWPORTS[name].width >= 1100) await expectNoOverlap(sheet, page.locator('.dplay-staff svg').first());
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('play with the analog metronome: pendulum and the pad', async ({ page }) => {
      known(name, 'play-analog');
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.goto('./#/settings');
      await page.getByRole('group', { name: 'Beat counter style' }).getByRole('button', { name: 'Analog' }).click();
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.locator('.beats--analog')).toBeVisible();
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expectClickable(pad(page), { scroll: false });
      await expectNoSideScroll(page);
    });
  });
}

/**
 * Dutch text is often longer than English (DESIGN.md §11): every screen still fits at every size, with no label cut
 * off and no sideways scroll.
 */
for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(`${name} in Dutch`, () => {
    test.use({ viewport: VIEWPORTS[name], hasTouch: !name.startsWith('desktop') && !name.startsWith('laptop') });
    test.beforeEach(async ({ page }) => seed(page, { prefs: { language: 'nl', seenHowTo: true, seenHold: true } }));

    const screens: [string, string, string][] = [
      ['', 'Start', 'Begin de les'],
      ['#/setup', 'Vrij oefenen', 'Start · '],
      ['#/path', 'Leerpad', 'Begin les'],
      ['#/settings', 'Instellingen', 'Voortgang wissen'],
      ['#/changelog', 'Wat is er nieuw', '0.1.0'],
      ['#/calibrate', 'Timing kalibreren', 'Tikpad'],
      ['#/notes', 'Noten lezen', 'Start · '],
      ['#/notes/key', 'Toonsoort', 'Kies '],
      ['#/learn', 'Leren', ''],
      ['#/learn/1', 'Puls en maat', ''],
      ['#/learn/2', 'Notenwaarden', 'Rusten'],
      ['#/learn/3', 'Rusten', 'Eén hele rust, in het midden'],
      ['#/learn/4', 'De tel verdelen', ''],
      ['#/learn/5', 'Noten langer maken', 'Een kwartnoot overgebonden naar een achtste'],
      ['#/learn/6', 'Naast de tel', ''],
      ['#/learn/7', 'Tellen in drieën', 'Twee achtsten'],
      ['#/learn/8', 'Noten op de balk', ''],
      ['#/learn/9', 'Kruisen, mollen en herstellingstekens', ''],
      ['#/learn/10', 'Voortekening', ''],
      ['#/learn/11', 'Toonladders', ''],
      ['#/scales', 'Toonladders', 'Oefen C majeur'],
      ['#/scales/setup', 'Toonladders oefenen', 'Start · '],
    ];
    for (const [hash, title, action] of screens) {
      test(`${hash || '#/'}: ${title}`, async ({ page }) => {
        known(name, 'nl' + hash);
        await page.goto('./' + hash);
        await expect(page).toHaveTitle(new RegExp(title === 'Start' ? 'Muzieklab' : title));
        if (action) await expectClickable(page.getByRole('button', { name: new RegExp('^' + action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first());
        // Calibrate's prompt above the pad stays on one line (white-space: pre): it must fit inside the 16 px gutters.
        if (hash === '#/calibrate') {
          const width = await page.locator('.judgement--cal').evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getBoundingClientRect().width;
          });
          expect(width, 'the start prompt fits on screen').toBeLessThanOrEqual(VIEWPORTS[name].width - 32);
        }
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });
    }

    test('play: the intro sheet and the count-in', async ({ page }) => {
      known(name, 'nl-play-intro');
      await seed(page, { progress: { lessons: { ...SOL_DONE, '1.1': { stars: 3, bestAccuracy: 95 } } } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Verder met de les' }).dispatchEvent('click');
      const sheet = page.getByRole('dialog', { name: 'Halve noten' });
      await expect(sheet.getByText('Nieuw in deze les')).toBeVisible();
      await expectClickable(sheet.getByRole('button', { name: 'Luisteren' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await sheet.getByRole('button', { name: 'Start' }).click();
      await expect(page.locator(VIEWPORTS[name].width >= 1100 ? '.dplay-title .mono-line' : '.play-info .mono-line')).toContainText('Voortellen');
      await expectNoSideScroll(page);
    });

    test('play, results and read notes', async ({ page }) => {
      known(name, 'nl-play');
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./');
      await page.getByRole('button', { name: 'Verder met de les' }).dispatchEvent('click');
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Tik het ritme' })).toBeAttached();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.setViewportSize(VIEWPORTS.phone);
      await page.getByRole('button', { name: 'Naar de uitslag' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Les 2.1 klaar' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Nog een keer' }));
      await expectClickable(page.getByRole('button', { name: 'Nieuwe oefening' }));
      await expectClickable(page.getByRole('button', { name: 'Kopieer code' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.goto('./#/notes');
      await page.getByRole('button', { name: 'Kruisen ♯' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /notenbalk in C majeur/ })).toBeVisible();
      await expectClickable(page.getByRole('radio', { name: 'kruis' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });
  });
}

test('a touch screen at desktop width (tablet in landscape) gets the desktop layout without keyboard hints', async ({ browser }) => {
  for (const hasTouch of [true, false]) {
    const page = await browser.newPage({ viewport: VIEWPORTS['tablet-landscape'], hasTouch });
    await seed(page, { progress: { lessons: SOL_DONE } });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
    await expect(page.getByText(hasTouch ? /^On a computer, any key works/ : /^Any key works/)).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.locator('.dplay')).toBeVisible();
    await expect(page.locator('.dplay-head kbd')).toHaveCount(hasTouch ? 0 : 1);
    await page.goto('./#/notes');
    await page.getByRole('button', { name: /^Start · / }).click();
    await expect(page.locator('.nplay-desk')).toBeVisible();
    if (hasTouch) await expect(page.locator('.nplay-desk kbd')).toHaveCount(0);
    else await expect(page.locator('.nplay-desk kbd').first()).toBeVisible();
    await page.goto('./#/scales/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    await expect(page.locator('.splay-desk')).toBeVisible();
    if (hasTouch) await expect(page.locator('.splay-desk kbd')).toHaveCount(0);
    else await expect(page.locator('.splay-desk kbd').first()).toBeVisible();
    await page.close();
  }
});
