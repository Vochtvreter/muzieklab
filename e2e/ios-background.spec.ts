import { expect, test, type Page } from '@playwright/test';
import { pad, seed, SOL_DONE, VIEWPORTS } from './helpers';

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
    class Fake extends Real {
      broken: { mode: string; t: number } | null = null;
      constructor(opts?: AudioContextOptions) {
        super(opts);
        made.push(this);
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
    await page.getByRole('link', { name: 'Quit exercise' }).click();
    // Back to Home's own place in the history, here an address without a hash.
    await expect(page).toHaveURL(/\/(#\/)?$/);
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
