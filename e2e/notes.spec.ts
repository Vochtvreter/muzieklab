import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_NOTE_SETTINGS, generateRound, noteMidi, pianoKeyMidi } from '../src/core/noteRound';
import { LETTERS, letterOf, pitchClass } from '../src/core/pitch';
import { noteLessonSettings } from '../src/game/notesPath';
import { DEFAULT_SETTINGS } from '../src/core/defaults';
import { pad, pathUpTo, seed as seedStorage, VIEWPORTS } from './helpers';

/** v1.3 Read notes and Learn chapter 8: Home → setup → key → a round → summary, and the chapter with its quick check. */

/** Records every piano tone the page plays, as a MIDI number: the triangle body of each tone (not its octave above). */
async function listenForTones(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as Window & { tones?: number[] };
    w.tones = [];
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      const osc = create.call(this);
      const set = osc.frequency.setValueAtTime.bind(osc.frequency);
      osc.frequency.setValueAtTime = (value: number, time: number) => {
        if (osc.type === 'triangle') w.tones!.push(Math.round(69 + 12 * Math.log2(value / 440)));
        return set(value, time);
      };
      return osc;
    };
  });
}
const tones = (page: Page): Promise<number[]> => page.evaluate(() => (window as Window & { tones?: number[] }).tones ?? []);

test('read notes: a G major round from Home to the summary, answered with the keyboard', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./');
  await page.getByRole('link', { name: /^Read notes/ }).click();
  await expect(page.getByRole('heading', { name: 'Read notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Fewer notes' }).click();
  await expect(page.getByRole('button', { name: 'Start · 10 notes' })).toBeVisible();

  await page.getByRole('link', { name: /^Key: C major/ }).click();
  await page.getByRole('button', { name: /^G major or E minor/ }).click();
  await expect(page.getByText('The key signature makes every F into F♯')).toBeVisible();
  await page.getByRole('button', { name: 'Use G major' }).click();
  await expect(page.getByRole('link', { name: /^Key: G major · E minor, 1 sharp: every F is F♯/ })).toBeVisible();

  await page.getByRole('button', { name: 'Start · 10 notes' }).click();
  await expect(page.getByText('Note 1 of 10')).toBeVisible();
  await expect(page.getByRole('img', { name: /staff in G major, one whole note per bar\. Note 1 of 10/ })).toBeVisible();

  // Answer every note with C: wrong ones wait for Enter, right ones move on by themselves.
  for (let n = 1; n <= 10; n++) {
    await expect(page.getByText(`Note ${n} of 10`)).toBeVisible();
    await page.keyboard.press('c');
    const next = page.getByRole('button', { name: n === 10 ? /^See summary/ : /^Next note/ });
    if (await next.isEnabled()) await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/^\d+ of 10 notes right · avg \d+\.\d s/)).toBeVisible();
  await expect(page.getByRole('img', { name: /^Answer time for each of the 10 notes/ })).toBeVisible();
  await expect(page).toHaveURL(/#\/notes\/done$/);

  // The streak counts a round with answers.
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page.getByText('1-day streak')).toBeVisible();
});

test('read notes: a round answered all right ends on the summary (the last right answer moves on by itself)', async ({ page }) => {
  // The round Play restores after a reload: the same settings and seed draw the same notes here and in the app.
  const settings = { ...DEFAULT_NOTE_SETTINGS, count: 10 };
  const seed = 4242;
  await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./#/notes/play');
  for (const [i, note] of generateRound(settings, seed).entries()) {
    await expect(page.getByText(`Note ${i + 1} of 10`)).toBeVisible();
    await page.keyboard.press(letterOf(note.step).toLowerCase());
  }
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible({ timeout: 5000 });
  await expect(page).toHaveURL(/#\/notes\/done$/);
  await expect(page.getByText(/^10 of 10 notes right/)).toBeVisible();
});

test('read notes lesson: from the Path to Round done, then the next lesson', async ({ page }) => {
  // Read notes unit 1 is the path's unit 15 (after si and rhythm unit 7). The lesson Play restores after a reload: its
  // settings and seed draw the same notes here and in the app.
  const settings = noteLessonSettings('notes', '1.1')!;
  const seed = 4242;
  await page.setViewportSize(VIEWPORTS.desktop);
  await seedStorage(page, { progress: { lessons: pathUpTo('14.5') }, prefs: { seenHowTo: true, seenHold: true } });
  await page.goto('./#/path');
  await page.getByRole('button', { name: 'Start lesson 15.1' }).click();
  await expect(page).toHaveURL(/#\/notes\/play$/);
  await expect(page.getByText('Lesson 15.1 · Treble clef · C major')).toBeVisible();
  // The same lesson with a known seed, so the test knows the notes.
  await page.evaluate((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [], lesson: { track: 'notes', id: '1.1' } });
  await page.reload();
  for (const [i, note] of generateRound(settings, seed).entries()) {
    await expect(page.getByText(`Note ${i + 1} of 10`)).toBeVisible();
    await page.keyboard.press(letterOf(note.step).toLowerCase());
  }
  await expect(page.getByRole('heading', { name: 'Lesson 15.1 done' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Unit 15 · The whole treble staff')).toBeVisible();
  await expect(page.getByText('Lesson 15.2 unlocked')).toBeVisible();
  await page.getByRole('button', { name: 'Next lesson: 15.2 · Twenty notes' }).click();
  await expect(page.getByText('Lesson 15.2 · Treble clef · C major')).toBeVisible();
  await expect(page.getByText('Note 1 of 20')).toBeVisible();
  // Quit goes back to the Path, where 1.1 has its stars.
  await page.getByRole('link', { name: /^Quit/ }).click();
  await expect(page).toHaveURL(/#\/path$/);
  await expect(page.getByRole('button', { name: 'Play lesson 15.1 · Name the notes: 3 of 3 stars' })).toBeVisible();
});

test('read notes lesson: skipping to the summary counts the notes left as missed', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.goto('./#/path');
  await page.getByRole('button', { name: 'Play lesson 1.1 · Meet sol: 0 of 3 stars' }).click();
  await expect(page.getByText('Lesson 1.1 · Treble clef · C major')).toBeVisible();
  await page.getByRole('group', { name: 'Note names' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Lesson 1.1 done' })).toBeVisible();
  // One note answered, ten in the score; the time chart shows the one answered.
  await expect(page.getByText(/^[01] of 10 notes right/)).toBeVisible();
  await expect(page.getByRole('img', { name: /^Answer time for each of the 1 notes/ })).toBeVisible();
  await expect(page.getByText('Get 2 stars to open lesson 1.2')).toBeVisible();
  await page.getByRole('button', { name: 'New round' }).click();
  await expect(page.getByText('Lesson 1.1 · Treble clef · C major')).toBeVisible();
});

test('read notes lesson: three right, then skipped, is not "every note right"', async ({ page }) => {
  await seedStorage(page, { progress: { lessons: pathUpTo('14.5') } });
  const settings = noteLessonSettings('notes', '1.1')!;
  const seed = 4242;
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [], lesson: { track: 'notes', id: '1.1' } });
  await page.goto('./#/notes/play');
  for (const [i, note] of generateRound(settings, seed).slice(0, 3).entries()) {
    await expect(page.getByText(`Note ${i + 1} of 10`)).toBeVisible();
    await page.keyboard.press(letterOf(note.step).toLowerCase());
  }
  await expect(page.getByText('Note 4 of 10')).toBeVisible();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Lesson 15.1 done' })).toBeVisible();
  await expect(page.getByText(/^3 of 10 notes right/)).toBeVisible();
  await expect(page.getByText('Get 2 stars to open lesson 15.2')).toBeVisible();
  await expect(page.getByText('Nothing to practise: every note right, and quick.')).toHaveCount(0);
});

test('read notes: piano answers, a hint and skipping to the summary', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes');
  await page.getByRole('group', { name: 'Answer with' }).getByRole('button', { name: 'Piano' }).click();
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page.getByText('Play the highlighted note')).toBeVisible();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.nfeedback')).toHaveText(/^(This is .+: .+\.|.+ is .+\. This note is (one step|\d steps) (higher|lower)\.)/);
  await page.getByRole('button', { name: 'C, do' }).click();
  await expect(page.locator('.nfeedback')).toHaveText(/^(Right|That was)/);
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page.getByText(/^[01] of 1 note right/)).toBeVisible();
});

test('read notes: a piano key sounds when pressed, and after a wrong one the right note follows', async ({ page }) => {
  const settings = { ...DEFAULT_NOTE_SETTINGS, input: 'piano' as const, count: 10 };
  const seed = 4242;
  await listenForTones(page);
  await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/play');
  const [first, second] = generateRound(settings, seed);
  const key = (L: string) => page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button', { name: new RegExp('^' + L + ', ') });
  // Right: the key is the note on the staff, in its octave, so it sounds once.
  await key(letterOf(first.step)).click();
  await expect.poll(() => tones(page)).toEqual([noteMidi(first)]);
  await expect(page.locator('.nplay-count')).toHaveText('2 / 10');
  // Wrong: the key pressed, then the right note.
  const wrong = LETTERS.find((L) => L !== letterOf(second.step))!;
  await key(wrong).click();
  await expect(page.locator('.nfeedback')).toHaveText(/^That was/);
  await expect.poll(() => tones(page)).toEqual([noteMidi(first), pianoKeyMidi(second, pitchClass(wrong, 0)), noteMidi(second)]);
  // After the answer a key only sounds, to compare.
  await key(letterOf(second.step)).click();
  await expect.poll(() => tones(page)).toHaveLength(4);
  await expect(page.locator('.nplay-count')).toHaveText('2 / 10');
});

test('read notes: Hear the notes, on by default in a path lesson, and off for a lesson too once turned off', async ({ page }) => {
  await listenForTones(page);
  await page.setViewportSize(VIEWPORTS.phone);
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  const nameAnswer = async (): Promise<void> => {
    await page.getByRole('group', { name: 'Note names' }).getByRole('button').first().click();
    await expect(page.locator('.nfeedback')).toHaveText(/^(Right|That was)/);
  };
  await page.goto('./#/path');
  await page.getByRole('button', { name: 'Play lesson 1.1 · Meet sol: 0 of 3 stars' }).click();
  // A named answer sounds the note on the staff, right or wrong.
  await nameAnswer();
  await expect.poll(async () => (await tones(page)).length).toBe(1);

  await page.goto('./#/notes');
  const sound = page.getByRole('switch', { name: /^Hear the notes/ });
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await expect(sound).toHaveAccessibleName(/Silent$/);
  await page.getByRole('button', { name: /^Start · / }).click();
  await nameAnswer();
  await page.goto('./#/path');
  await page.getByRole('button', { name: 'Play lesson 1.1 · Meet sol: 0 of 3 stars' }).click();
  await nameAnswer();
  expect(await tones(page)).toHaveLength(1);
});

test('read notes: the sign row only when a note can have a sign', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./#/notes');
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page.getByText('Note 1 of 20')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Sharp or flat' })).toHaveCount(0);
  await expect(page.getByText('Type the letter of the note')).toBeVisible();
  await expect(page.locator('.nfeedback')).toHaveText('Which note is highlighted?');
  // A sign key does nothing here: the next letter is a plain name.
  await page.keyboard.press('=');
  await page.keyboard.press('c');
  await expect(page.locator('.nfeedback')).toHaveText(/^(Right: C \(do\)|That was )/);

  await page.goto('./#/notes');
  await page.getByRole('link', { name: /^Key: C major/ }).click();
  await page.getByRole('button', { name: /^G major or E minor/ }).click();
  await page.getByRole('button', { name: 'Use G major' }).click();
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page.getByRole('radiogroup', { name: 'Sharp or flat' })).toBeVisible();
  await expect(page.getByText('Mind the key signature. Pick the sign, then the name.')).toBeVisible();
  await expect(page.getByText('Type the letter; press = for ♯, 0 for ♮ or − for ♭ first')).toBeVisible();
});

test('read notes: round done names the missed notes in do re mi after a round in do re mi', async ({ page }) => {
  const settings = { ...DEFAULT_NOTE_SETTINGS, count: 10 };
  const seed = 4242;
  await seedStorage(page, { prefs: { noteNames: 'solfege' } });
  await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/play');
  const [first] = generateRound(settings, seed);
  const wrong = letterOf(first.step) === 'C' ? 'D' : 'C';
  await page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: new RegExp(', ' + wrong + '$') }).click();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  const solfege: Record<string, string> = { C: 'do', D: 're', E: 'mi', F: 'fa', G: 'sol', A: 'la', B: 'si' };
  const chip = page.getByRole('list', { name: 'Missed' }).getByRole('listitem');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveText(solfege[letterOf(first.step)]);
  await expect(chip).toHaveAccessibleName(new RegExp(`^${solfege[letterOf(first.step)]}, ${letterOf(first.step)} on the .+ \\(treble clef\\), missed once$`));
  await expect(chip.locator('.pitch-staff svg')).toBeVisible();
});

test('learn: the Key screen links to key signatures; the quick check answers', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/key');
  await page.getByRole('link', { name: 'What is a key?' }).click();
  await expect(page).toHaveURL(/#\/learn\/10\?s=10\.1$/);
  await expect(page.getByRole('heading', { name: /10\.1\s*The key signature/ })).toBeInViewport();
  await page.getByRole('button', { name: 'D', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/^Right\. One key up from the last sharp/);

  // Scrolling to the end marks nothing; a section's quick check answered right marks it read, and the Learn tab shows it.
  await page.locator('.learn-chapter').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const check = page.getByRole('group', { name: 'How long does a key signature hold?' });
  await check.getByRole('button', { name: 'For the whole piece' }).click();
  await expect(check.getByRole('status')).toHaveText(/^Right\. A key signature holds/);
  await page.getByRole('link', { name: 'Back to all chapters' }).click();
  await expect(page.getByRole('heading', { name: 'Learn' })).toBeVisible();
  await page.getByRole('button', { name: /^10\s*Key signatures/ }).click();
  await expect(page.getByText('✓ read')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /^10\.1.*✓ read/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');
});

test('learn: a practice link starts a Read notes round for its section; Quit and Round done return to it', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn/8?s=8.3');
  const link = page.getByRole('link', { name: 'Practice the bass clef →' });
  await link.click();
  await expect(page).toHaveURL(/#\/notes\/play\?from=8\.3$/);
  await page.getByRole('link', { name: 'Quit' }).click();
  await expect(page).toHaveURL(/#\/learn\/8\?s=8\.3$/);

  // Round done's back arrow returns to the section.
  await link.click();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page).toHaveURL(/#\/notes\/done\?from=8\.3$/);
  await page.getByRole('link', { name: 'Back to chapter 8' }).click();
  await expect(page).toHaveURL(/#\/learn\/8\?s=8\.3$/);

  // Change setup shows the section's preset; its Back returns to the section, also after a visit to the Key screen.
  await link.click();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await page.getByRole('link', { name: 'Change setup' }).click();
  await expect(page).toHaveURL(/#\/notes\?from=8\.3$/);
  await expect(page.getByRole('button', { name: /Treble/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: /Bass/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: /^Key: / }).click();
  await page.getByRole('link', { name: 'Back to setup' }).click();
  await expect(page).toHaveURL(/#\/notes\?from=8\.3$/);
  await page.getByRole('link', { name: 'Back to chapter 8' }).click();
  await expect(page).toHaveURL(/#\/learn\/8\?s=8\.3$/);
});

test('learn: a rhythm practice link starts the exercise for its section; Quit, Results and the setup return to it', async ({ page }) => {
  test.setTimeout(45_000);
  // The player's last setup: Echo, one bar at 200 BPM. The link plays in Tap mode with the section's preset.
  await seedStorage(page, {
    prefs: { seenHowTo: true, seenHold: true },
    progress: { lessons: {}, practiceDays: [], lastSettings: { ...DEFAULT_SETTINGS, mode: 'echo', bars: 1, tempo: 200 } },
  });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn/7');
  const link = page.getByRole('link', { name: 'Practice triplets →' });
  await link.click();
  await expect(page).toHaveURL(/#\/play\?from=7\.1$/);
  await expect(pad(page)).toBeVisible();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await expect(page).toHaveURL(/#\/learn\/7\?s=7\.1$/);

  // Played to the end: Results goes back to the section, and Try again (nothing was tapped) keeps that.
  await link.click();
  await expect(page).toHaveURL(/#\/results\?from=7\.1$/, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/#\/results\?from=7\.1$/, { timeout: 10_000 });
  await page.getByRole('link', { name: 'Back to chapter 7' }).click();
  await expect(page).toHaveURL(/#\/learn\/7\?s=7\.1$/);

  // Practice settings opens the setup with the preset; its Back returns to the section.
  await link.click();
  await page.getByRole('link', { name: 'Practice settings' }).click({ timeout: 10_000 });
  await expect(page).toHaveURL(/#\/setup\?from=7\.1$/);
  await expect(page.getByRole('button', { name: 'Triplets', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Dotted', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Ties', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Tap' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Back to chapter 7' }).click();
  await expect(page).toHaveURL(/#\/learn\/7\?s=7\.1$/);
});

test('scales: from Home to the circle, a G major round played with the keyboard, and the stars on the circle', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./');
  await page.getByRole('link', { name: /^Scales/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Scales' })).toBeVisible();
  await expect(page.getByText('0 of 15')).toBeVisible();
  // C major is selected first; G is one step clockwise.
  await expect(page.getByRole('button', { name: 'Practice C major' })).toBeVisible();
  await page.getByRole('button', { name: 'G major: no stars yet' }).click();
  await page.getByRole('button', { name: 'Practice G major' }).click();
  await expect(page.getByText('Scale 1 of 1')).toBeVisible();
  await expect(page.getByText('Play with A S D F G H J K L (white) and W E R T Y U I O (black)')).toBeVisible();

  // One wrong key first (F instead of F♯ at the 7th degree), so the scale comes back at the end of the round.
  for (const k of ['a', 's', 'd', 'f', 'g', 'h', 'j']) await page.keyboard.press(k);
  await expect(page.locator('.nfeedback')).toHaveText(/^Not F\. From E, go up a whole step/);
  await page.keyboard.press('i');
  await page.keyboard.press('k');
  await expect(page.locator('.nfeedback')).toHaveText(/^G major: done with 1 mistake/);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Scale 2 of 2')).toBeVisible();
  for (const k of ['a', 's', 'd', 'f', 'g', 'h', 'i', 'k']) await page.keyboard.press(k);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page.getByText('Came back at the end of the round')).toBeVisible();
  await expect(page.getByRole('img', { name: '2 of 3 stars' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Scales' }).click();
  await expect(page.getByRole('button', { name: 'G major: 2 stars' })).toBeVisible();
  await expect(page.getByText('1 of 15')).toBeVisible();
});

test('learn: chapter 11 links to the Scales setup and the circle', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn/11');
  await expect(page.getByRole('heading', { level: 1, name: /Scales/ })).toBeVisible();
  await page.getByRole('link', { name: 'Practice D major and B♭ major →' }).click();
  await expect(page.getByRole('heading', { name: 'Scale practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start · 2 scales' })).toBeVisible();
  await page.goto('./#/learn/11');
  await page.getByRole('link', { name: 'Practice scales' }).click();
  await expect(page.getByRole('group', { name: 'Circle of fifths, major keys' })).toBeVisible();
});
