import { expect, test, type Page } from '@playwright/test';
import { calibrateAlong, pad, QUARTERS, seed, SOL_DONE, VIEWPORTS } from './helpers';

/**
 * iOS, back from the background (most often as a Home Screen app): the AudioContext the page had can stay
 * 'interrupted' with resume() never settling, or say 'running' while its clock stands still. Chromium does neither,
 * so the init script wraps AudioContext and breaks every context that exists at that moment the way iOS does.
 * Contexts made afterwards work normally, as on the device after a full restart.
 */
type Broken = 'frozen' | 'interrupted';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    const made: Fake[] = [];
    let stuck = false;
    class Fake extends Real {
      broken: { mode: string; t: number } | null = null;
      constructor(opts?: AudioContextOptions) {
        super(opts);
        made.push(this);
        // A stuck context (stickAudio, below) fires no statechange, like one that never starts: this listener comes
        // before the engine's and stops the real context's.
        this.addEventListener('statechange', (e) => {
          if (stuck) e.stopImmediatePropagation();
        });
      }
      get currentTime(): number {
        return this.broken ? this.broken.t : super.currentTime;
      }
      get state(): AudioContextState {
        return (this.broken?.mode === 'interrupted' ? 'interrupted' : super.state) as AudioContextState;
      }
      resume(): Promise<void> {
        return this.broken?.mode === 'interrupted' ? new Promise(() => undefined) : super.resume();
      }
      getOutputTimestamp(): AudioTimestamp {
        return this.broken ? { contextTime: this.broken.t, performanceTime: performance.now() } : super.getOutputTimestamp();
      }
    }
    window.AudioContext = Fake;
    (window as unknown as { breakAudio(mode: string): void }).breakAudio = (mode) => {
      for (const c of made) c.broken = { mode, t: c.currentTime };
    };
    // A context that never starts: it says 'suspended' and its clock stands still, though resume() resolves, and it
    // fires no statechange (above), so only Calibrate's own check of the state can end the run.
    const real = { state: Object.getOwnPropertyDescriptor(Fake.prototype, 'state')!.get!, time: Object.getOwnPropertyDescriptor(Fake.prototype, 'currentTime')!.get! };
    Object.defineProperty(Fake.prototype, 'state', { get(this: Fake) { return stuck ? 'suspended' : real.state.call(this); } });
    Object.defineProperty(Fake.prototype, 'currentTime', { get(this: Fake) { return stuck ? 0 : real.time.call(this); } });
    (window as unknown as { stickAudio(on: boolean): void }).stickAudio = (on) => {
      stuck = on;
    };
    // What a browser does to a page in the background, or Chromium to a tab: the context says 'suspended'.
    (window as unknown as { suspendAudio(): Promise<unknown> }).suspendAudio = () => Promise.all(made.map((c) => c.suspend().catch(() => undefined)));
  });
  // Sol's unit passed, so Continue starts a rhythm lesson.
  await seed(page, { prefs: { seenHowTo: true, seenHold: true }, progress: { lessons: SOL_DONE } });
  await page.setViewportSize(VIEWPORTS.phone);
});

/** The app goes to the background and comes back; meanwhile iOS breaks its audio. */
async function background(page: Page, mode: Broken): Promise<void> {
  await page.evaluate((m) => {
    const vis = (v: string): void => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    vis('hidden');
    (window as unknown as { breakAudio(mode: string): void }).breakAudio(m);
    vis('visible');
  }, mode);
}

/** Taps along until Results shows: only possible if the count-in ends and the exercise clock runs. */
async function playToResults(page: Page): Promise<void> {
  await expect(page.getByRole('img', { name: /Count-in, beat 2/ })).toBeAttached({ timeout: 4000 });
  for (let i = 0; i < 16 && !page.url().includes('/results'); i++) {
    const box = await pad(page)
      .boundingBox({ timeout: 2000 })
      .catch(() => null);
    if (!box) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(850);
  }
  await expect(page).toHaveURL(/#\/results$/, { timeout: 10_000 });
}

for (const mode of ['frozen', 'interrupted'] as const) {
  test(`back from the background on Home (${mode} audio), Start plays`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./');
    // Play once so the page has an AudioContext, as after any earlier exercise.
    await page.getByRole('button', { name: 'Continue lesson' }).click();
    await expect(page.getByRole('img', { name: /Count-in, beat/ })).toBeAttached({ timeout: 3000 });
    // A lesson quits to the Path; Home is a tab away.
    await page.getByRole('link', { name: 'Quit exercise' }).click();
    await expect(page).toHaveURL(/#\/path$/);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue lesson' })).toBeVisible();

    await background(page, mode);
    await page.getByRole('button', { name: 'Continue lesson' }).click();
    await playToResults(page);
  });
}

test('back from the background mid-exercise, Resume plays on', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await expect(page.getByRole('img', { name: /Count-in, beat/ })).toBeAttached({ timeout: 3000 });
  await background(page, 'frozen');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: /Resume/ }).click();
  await playToResults(page);
});

test('a clock that freezes without the page being hidden pauses with a note, and Resume plays on', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await expect(page.getByRole('img', { name: /Count-in, beat/ })).toBeAttached({ timeout: 3000 });
  await page.evaluate(() => (window as unknown as { breakAudio(mode: string): void }).breakAudio('frozen'));
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('The sound was interrupted.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Resume/ }).click();
  await playToResults(page);
});

test('echo: leaving the app while the rhythm plays, or audio that stops or never starts, gives that listen back', async ({ page }) => {
  test.setTimeout(80_000);
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, seenEchoHowTo: true }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, mode: 'echo', bars: 2 } } });
  await page.goto('./#/setup');
  await page.getByRole('button', { name: /^Start · / }).click();
  const play = page.getByRole('button', { name: 'Play the rhythm' });
  // To the background and back while it plays (iOS interrupts the audio then), the audio suspended while in view, and
  // audio that never starts: a listen in silence once used up a play and went on to Tap it back.
  for (const cut of ['background', 'suspended', 'never started'] as const) {
    if (cut === 'never started') await page.evaluate(() => (window as unknown as { stickAudio(on: boolean): void }).stickAudio(true));
    await play.click();
    // Audio that never starts is given up within a second (Play's grace for it to start), too soon to look at.
    if (cut !== 'never started') {
      await expect(page.getByRole('heading', { name: 'Playing…' })).toBeVisible();
      await expect(page.getByText('1 play left')).toBeVisible();
    }
    if (cut === 'background') await background(page, 'interrupted');
    else if (cut === 'suspended') await page.evaluate(() => (window as unknown as { suspendAudio(): Promise<unknown> }).suspendAudio());
    // Stopped and not counted, also once the rhythm would have ended: both plays left, and nothing to tap back yet.
    await expect(page.getByText('2 plays left'), cut).toBeVisible({ timeout: 3000 });
    await page.waitForTimeout(7000);
    await expect(page.getByText('2 plays left'), cut).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tap it back' }), cut).toHaveCount(0);
    await expect(play, cut).toBeEnabled();
  }
  await page.evaluate(() => (window as unknown as { stickAudio(on: boolean): void }).stickAudio(false));
  // Heard to the end, it counts.
  await play.click();
  await expect(page.getByRole('button', { name: 'Tap it back' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('1 play left')).toBeVisible();
});

// Calibrate's clicks run on the audio clock: stopped, they never reach the 16th, and the run hung on "TAP ON EACH CLICK"
// with the pad doing nothing. It ends with a note instead, and Try again measures from the start.
for (const cut of ['background', 'frozen', 'suspended', 'never started'] as const) {
  test(`calibrate: audio that stops mid-run (${cut}) ends it with a note, and Try again measures again`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./#/calibrate');
    if (cut === 'never started') await page.evaluate(() => (window as unknown as { stickAudio(on: boolean): void }).stickAudio(true));
    await pad(page).click();
    // A context that never starts ends the run within a second, so only the others are seen measuring first.
    if (cut !== 'never started') await expect(page.getByText('TAP ON EACH CLICK')).toBeVisible();
    // A click or two in.
    await page.waitForTimeout(1500);
    if (cut === 'background') await background(page, 'interrupted');
    else if (cut === 'frozen') await page.evaluate(() => (window as unknown as { breakAudio(mode: string): void }).breakAudio('frozen'));
    else if (cut === 'suspended') await page.evaluate(() => (window as unknown as { suspendAudio(): Promise<unknown> }).suspendAudio());
    await expect(page.getByRole('status')).toHaveText('The clicks were interrupted. Try again to measure from the first click.', { timeout: 3000 });
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    if (cut === 'never started') await page.evaluate(() => (window as unknown as { stickAudio(on: boolean): void }).stickAudio(false));
    await page.getByRole('button', { name: 'Try again' }).click();
    await calibrateAlong(page);
    await expect(page.getByRole('status')).toContainText('Measured over 16 taps');
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });
}
