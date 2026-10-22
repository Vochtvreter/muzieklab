import { expect, test } from '@playwright/test';
import { pad, seed, VIEWPORTS } from './helpers';

/**
 * The main loop: Home → lesson 1.1 (quarter notes, 60 BPM, 2 bars, one bar of count-in) → How to play → tap along →
 * pause → resume → Results → Home. Taps are not timed precisely; the test checks the screens, not the score.
 */
for (const [name, input] of [['phone', 'pad'], ['desktop', 'key']] as const) {
  test(`play a lesson to the end (${name})`, async ({ page }) => {
    test.setTimeout(60_000);
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
    await expect(page.getByRole('heading', { name: 'Lesson 1.1 done' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    // A run with at least one hit note keeps the streak; these taps are untimed, so read what Results counted.
    const hits = await page.locator('.counts .count-n').evaluateAll((els) => els.slice(0, 3).reduce((s, el) => s + Number(el.textContent), 0));
    await page.goto('./#/');
    await expect(page.getByText(hits > 0 ? '1-day streak' : 'No streak yet')).toBeVisible();
  });
}

test('a reload on Play keeps the lesson and waits for Start', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.reload();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByRole('dialog', { name: 'Ready?' }).getByText('Lesson 1.1', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Ready?' })).toBeVisible();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Count-in, beat|Counting beat/ })).toBeAttached({ timeout: 3000 });
});

test('after quitting, Back does not walk into the exercise again', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  // Back from Home now leaves Home, or lands on Play waiting for a tap; never a running exercise.
  if (page.url().includes('#/play')) await expect(page.getByRole('dialog', { name: 'Ready?' })).toBeVisible();
});

test('Esc does not start the Ready sheet (browsers do not let Esc start audio); Start does', async ({ page }) => {
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
    progress: { lessons: { '1.1': { stars: 2, bestAccuracy: 85 }, '1.2': { stars: 1, bestAccuracy: 65 } }, practiceDays: [], lastSettings: null },
    prefs: { seenHowTo: true, seenHold: true },
  });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: /^Play lesson 1\.1/ }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.getByText('Lesson 1.1', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await page.goto('./#/path');
  await expect(page.getByRole('img', { name: 'Lesson 1.3 · Halves and quarters, locked' })).toBeVisible();
  await page.getByRole('button', { name: 'Play lesson 1.2 · Half notes: 1 of 3 stars' }).click();
  await expect(page.getByText('Lesson 1.2', { exact: true })).toBeVisible();
});

test('the Path keeps the current unit in view when a phone turns to landscape', async ({ page }) => {
  const lessons: Record<string, { stars: number; bestAccuracy: number }> = {};
  for (let u = 1; u <= 6; u++) for (let l = 1; l <= 5; l++) lessons[`${u}.${l}`] = { stars: 2, bestAccuracy: 88 };
  await seed(page, { progress: { lessons }, prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/path');
  const unit7 = page.getByRole('button', { name: /^7 · Dotted notes/ });
  await expect(unit7).toBeInViewport();
  await page.setViewportSize(VIEWPORTS['phone-landscape']);
  await expect(unit7).toBeInViewport();
});

test('desktop Home: the learning-path card opens the rhythm path it shows, whichever path was picked last', async ({ page }) => {
  await seed(page, { prefs: { pathTrack: 'notes', seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./');
  await page.getByRole('link', { name: /^Learning path/ }).click();
  await expect(page).toHaveURL(/#\/path$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Rhythm' })).toBeVisible();
});

test('the first lesson that judges holds shows How to play again, with holding, once', async ({ page }) => {
  // Unit 1 (tap only) done, its How to play seen: lesson 2.1 is the first where holding counts.
  const lessons = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`1.${n}`, { stars: 3, bestAccuracy: 92 }]));
  await seed(page, { progress: { lessons, practiceDays: [], lastSettings: null }, prefs: { seenHowTo: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  const sheet = page.getByRole('dialog', { name: 'How to play' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('New: hold each note')).toBeVisible();
  await expect(sheet.getByText('Hold it for the length of the note. Lift when the note ends.')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Count-in, beat|Counting beat/ })).toBeAttached({ timeout: 3000 });
  // Only once: the next hold lesson starts straight away.
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await expect(page.getByText('Lesson 2.1', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
