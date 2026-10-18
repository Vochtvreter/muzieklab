import { expect, test } from '@playwright/test';
import { CHAPTERS } from '../src/ui/learn/chapters';
import { expectClickable, expectNoClippedLabels, expectNoOverlap, expectNoSideScroll, expectNotSqueezed, pad, seed, VIEWPORTS, type ViewportName } from './helpers';

/**
 * Known layout bugs from the MVP QA, fixed in the follow-up layout PR. `test.fail` keeps CI green while they are open
 * and turns red the moment one starts passing, so the entry gets removed with its fix.
 */
const KNOWN: Record<string, string> = {};
const known = (vp: string, screen: string): void => {
  const why = KNOWN[`${vp}/${screen}`];
  test.fail(!!why, why);
};

/** Every screen's main action can be reached and tapped, at every supported size, with no sideways scroll. */
for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(name, () => {
    test.use({ viewport: VIEWPORTS[name], hasTouch: !name.startsWith('desktop') && !name.startsWith('laptop') });

    test('home: continue lesson and free practice', async ({ page }) => {
      known(name, 'home');
      await page.goto('./');
      await expectClickable(page.getByRole('button', { name: 'Continue lesson' }));
      await expectClickable(page.getByRole('link', { name: /^Rhythm/ }));
      await expectClickable(page.getByRole('link', { name: /^Read notes/ }));
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.free'));
      await expectNotSqueezed(page.locator('.continue-card'));
      await expectNoSideScroll(page);
    });

    test('home: level, XP and the daily challenge', async ({ page }) => {
      known(name, 'home-daily');
      await page.goto('./');
      await expect(page.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: /^Play the daily challenge for / }));
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.daily-card'));
      await expectNoOverlap(page.locator('.daily-card'), page.locator('.free'));
      await expectNotSqueezed(page.locator('.daily-card'));
      await expectNoSideScroll(page);
    });

    test('setup: start button', async ({ page }) => {
      known(name, 'setup');
      await page.goto('./#/setup');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      await expectClickable(page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }));
      await expectNoSideScroll(page);
    });

    test('echo: listen, then the tap-back card and the pad', async ({ page }) => {
      known(name, 'echo');
      await page.goto('./#/setup');
      await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectClickable(page.getByRole('button', { name: 'Play the rhythm' }), { scroll: false });
      await expectNotSqueezed(page.locator('.echo-card'));
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expect(pad(page)).toBeVisible();
      await expectNoSideScroll(page);
    });

    test('path: start lesson', async ({ page }) => {
      known(name, 'path');
      await page.goto('./#/path');
      await expectClickable(page.getByRole('button', { name: /^Start lesson/ }));
      await expectNoSideScroll(page);
    });

    test('settings: leniency and reset progress', async ({ page }) => {
      known(name, 'settings');
      await page.goto('./#/settings');
      await expectClickable(page.getByText('Leniency', { exact: true }));
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
      await expect(page.getByRole('img', { name: /taps? measured/ })).toBeInViewport();
      await expectNoSideScroll(page);
    });

    test('results: retry and next', async ({ page }) => {
      known(name, 'results');
      // Desktop Play has no Skip link: finish on a phone-sized window, then show Results at this size.
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Lesson 1.1 done' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Copy' }));
      await expectClickable(page.getByRole('button', { name: 'Retry' }));
      await expectClickable(page.getByRole('button', { name: 'Next exercise' }));
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
      for (let i = 0; i < 7; i++) await expectClickable(names.nth(i));
      await expectClickable(page.getByRole('radio', { name: 'sharp' }));
      await page.getByRole('group', { name: 'Answer with' }).getByRole('button', { name: 'Piano' }).click();
      const keys = page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button');
      await expect(keys).toHaveCount(12);
      for (let i = 0; i < 12; i++) await expectClickable(keys.nth(i));
      await expectClickable(page.getByRole('button', { name: 'Hint' }));
      await expectNoSideScroll(page);
    });

    test('learn: chapter list and chapters 9–10', async ({ page }) => {
      known(name, 'learn');
      const { width } = VIEWPORTS[name];
      const layout = width >= 1100 ? 'desktop' : width >= 700 ? 'tablet' : 'phone';
      await page.goto('./#/learn');
      // Chapter 1 starts open. Tablet and desktop use the width: its sections sit in two columns, read down.
      const [first, third] = [await page.getByRole('link', { name: /^1\.1/ }).boundingBox(), await page.getByRole('link', { name: /^1\.3/ }).boundingBox()];
      expect(third!.y === first!.y, 'sections in two columns').toBe(layout !== 'phone');
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
      await expect(page.getByText('Start here · Path units 1, 3, 5')).toBeVisible();
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

    test('learn: every chapter fits, with its practice links reachable', async ({ page }) => {
      known(name, 'learn-all');
      for (const c of CHAPTERS) {
        await page.goto(`./#/learn/${c.n}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(String(c.n));
        await expect(page.locator('.learn-section')).toHaveCount(c.sections.length);
        await expect(page.locator('.learn-practice')).toHaveCount(c.sections.filter((s) => s.practice).length);
        await expectNoSideScroll(page);
        if (c.sections.some((s) => s.practice)) await expectClickable(page.locator('.learn-practice').last());
        await expectClickable(page.getByRole('link', { name: 'Back to all chapters' }));
      }
    });

    test('play: how to play, then the pad', async ({ page }) => {
      known(name, 'play');
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expectClickable(pad(page), { scroll: false });
      await expectNoSideScroll(page);
    });

    test('play with the analog metronome: pendulum and the pad', async ({ page }) => {
      known(name, 'play-analog');
      await page.goto('./#/settings');
      await page.getByRole('group', { name: 'Metronome style' }).getByRole('button', { name: 'Analog' }).click();
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
    test.beforeEach(async ({ page }) => seed(page, { prefs: { language: 'nl', seenHowTo: true } }));

    const screens: [string, string, string][] = [
      ['', 'Start', 'Verder met de les'],
      ['#/setup', 'Vrij oefenen', 'Start · '],
      ['#/path', 'Leerpad', 'Begin les'],
      ['#/settings', 'Instellingen', 'Voortgang wissen'],
      ['#/changelog', 'Wat is er nieuw', '0.1.0'],
      ['#/calibrate', 'Timing kalibreren', 'Ritmepad'],
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
    ];
    for (const [hash, title, action] of screens) {
      test(`${hash || '#/'}: ${title}`, async ({ page }) => {
        known(name, 'nl' + hash);
        await page.goto('./' + hash);
        await expect(page).toHaveTitle(new RegExp(title === 'Start' ? 'Muzieklab' : title));
        if (action) await expectClickable(page.getByRole('button', { name: new RegExp('^' + action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first());
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });
    }

    test('play, results and read notes', async ({ page }) => {
      known(name, 'nl-play');
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
      await expect(page.getByRole('heading', { name: 'Les 1.1 klaar' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Volgende oefening' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.goto('./#/notes');
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
    await page.close();
  }
});
