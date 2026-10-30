import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEFAULT_NOTE_SETTINGS, generateRound, noteMidi, pianoKeyMidi, type NoteSettings } from '../src/core/noteRound';
import { LETTERS, letterOf, pitchClass } from '../src/core/pitch';
import { noteLessonSettings } from '../src/game/notesPath';
import { DEFAULT_SETTINGS } from '../src/core/defaults';
import { generateExercise } from '../src/core/generator';
import type { Settings } from '../src/core/types';
import { exerciseHas } from '../src/game/intro';
import { pad, pathUpTo, seed as seedStorage, tabTo, VIEWPORTS } from './helpers';

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

/** Plays this round when the page opens: the same settings and seed draw the same notes here and in the app. */
async function seedRun(page: Page, settings: NoteSettings, seed: number): Promise<void> {
  await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
}

/** The first seed whose round starts with notes of these signs (1 sharp, 0 none), so a test knows what it answers. */
function seedStartingWith(settings: NoteSettings, alters: number[]): number {
  for (let seed = 1; ; seed++) {
    const notes = generateRound(settings, seed);
    if (alters.every((a, i) => notes[i].alter === a)) return seed;
  }
}

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
  await expect(page.getByRole('img', { name: /^Answer time for 1 note\. / })).toBeVisible();
  // One label under the one bar, not a second "1" at the start.
  await expect(page.locator('svg.nchart text')).toHaveText(['3 s', '1']);
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

test('read notes: a note answered with a hint is on Needs practice, which Practice missed notes drills', async ({ page }) => {
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, count: 10, playNotes: false };
  const seed = 4242;
  await seedRun(page, settings, seed);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./#/notes/play');
  // Every note right, the third after a hint.
  const notes = generateRound(settings, seed);
  for (const [i, n] of notes.entries()) {
    await expect(page.getByText(`Note ${i + 1} of 10`)).toBeVisible();
    if (i === 2) await page.getByRole('button', { name: 'Hint' }).click();
    await page.keyboard.press(letterOf(n.step).toLowerCase());
    if (i === 2) {
      await expect(page.locator('.nfeedback')).toHaveText(/^Right: /);
      await page.keyboard.press('Enter');
    }
  }
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page.locator('.score-sub')).toHaveText(/^9 of 10 notes right · .+ · 1 with a hint · /);
  await expect(page.getByText('Nothing to practise: every note right, and quick.')).toHaveCount(0);
  const hinted = page.getByRole('list', { name: 'With a hint' }).getByRole('listitem');
  await expect(hinted).toHaveCount(1);
  await expect(hinted.first()).toHaveAccessibleName(new RegExp(`^${letterOf(notes[2].step)} on the .+ \\(treble clef\\), answered with a hint$`));
  await expect(page.getByRole('button', { name: 'Practice missed notes' })).toBeVisible();
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
  // A radio group: one Tab stop, and the arrows pick the next sign (they did nothing, and Tab stopped at all three).
  const natural = page.getByRole('radio', { name: 'natural' });
  await tabTo(page, natural);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'sharp' })).toBeFocused();
  await expect(page.getByRole('radio', { name: 'sharp' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'the next Tab leaves the group').not.toBe('radio');
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

test('read notes: after a miss the green name button reads the right name, its sign included', async ({ page }) => {
  // A major: F, C and G are sharp. The round starts with a sharp note, then one without a sign.
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, keys: ['A'], count: 10, playNotes: false };
  const seed = seedStartingWith(settings, [1, 0]);
  const [first, second] = generateRound(settings, seed);
  await seedStorage(page, { prefs: { noteNames: 'letters' } });
  await seedRun(page, settings, seed);
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/play');
  const names = page.getByRole('group', { name: 'Note names' });
  const green = names.locator('.name-btn.is-right');
  const red = names.locator('.name-btn.is-wrong');
  // F♯ with the sign left on ♮ and a wrong letter: the button tapped is red, as it reads; the green one reads F♯.
  const L1 = letterOf(first.step);
  const wrong1 = LETTERS.find((L) => L !== L1)!;
  await names.getByRole('button', { name: wrong1, exact: true }).click();
  await expect(page.locator('.nfeedback')).toHaveText(new RegExp(`^That was ${L1}♯`));
  await expect(red.locator('.name-main')).toHaveText(wrong1);
  await expect(green.locator('.name-main')).toHaveText(L1 + '♯');
  await expect(green).toHaveAccessibleName(L1 + ' sharp');
  // A plain note answered with ♯ and a wrong letter: the green button reads the plain name.
  await page.getByRole('button', { name: /^Next note/ }).click();
  await page.keyboard.press('=');
  const L2 = letterOf(second.step);
  const wrong2 = LETTERS.find((L) => L !== L2)!;
  await names.getByRole('button', { name: wrong2 + ' sharp', exact: true }).click();
  await expect(page.locator('.nfeedback')).toHaveText(new RegExp(`^That was ${L2} `));
  await expect(red.locator('.name-main')).toHaveText(wrong2 + '♯');
  await expect(green.locator('.name-main')).toHaveText(L2);
  await expect(green).toHaveAccessibleName(L2);
});

test('read notes: when the time is up, the green name button reads the right name, its sign included', async ({ page }) => {
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, keys: ['A'], count: 10, timer: 3, playNotes: false };
  const seed = seedStartingWith(settings, [1]);
  const [first] = generateRound(settings, seed);
  await seedStorage(page, { prefs: { noteNames: 'letters' } });
  await seedRun(page, settings, seed);
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/play');
  await expect(page.locator('.nfeedback')).toHaveText(/^Time's up/, { timeout: 6000 });
  const green = page.getByRole('group', { name: 'Note names' }).locator('.name-btn.is-right');
  await expect(green.locator('.name-main')).toHaveText(letterOf(first.step) + '♯');
  await expect(green).toHaveAccessibleName(letterOf(first.step) + ' sharp');
});

test('read notes: Enter and Space on a control reached with Tab press that control, not Next note', async ({ page }) => {
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, count: 10, playNotes: false };
  const seed = 4242;
  const notes = generateRound(settings, seed);
  const wrong = (i: number): string => LETTERS.find((L) => L !== letterOf(notes[i].step))!;
  await seedStorage(page, { prefs: { noteNames: 'letters' } });
  await seedRun(page, settings, seed);
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/play');
  const count = page.locator('.nplay-count');
  const feedback = page.locator('.nfeedback');
  // A name button: Enter answers. Once the note is answered the button has nothing more to do, so Enter goes on.
  await tabTo(page, page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: wrong(0), exact: true }));
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText(/^That was/);
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('2 / 10');
  // After a wrong answer, Space on the Piano mode switches to the piano and the note stays.
  await page.keyboard.press(wrong(1).toLowerCase());
  await expect(feedback).toHaveText(/^That was/);
  const piano = page.getByRole('group', { name: 'Answer with' }).getByRole('button', { name: 'Piano' });
  await tabTo(page, piano);
  await page.keyboard.press(' ');
  await expect(piano).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText('2 / 10');
  // The mode already chosen has nothing more to do either: Enter there goes on, and so does Space after a wrong key on
  // the computer's piano (A S D F G H J = C D E F G A B).
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('3 / 10');
  const n = notes[2];
  await page.keyboard.press('asdfghj'[LETTERS.findIndex((L) => pitchClass(L, 0) !== pitchClass(letterOf(n.step), n.alter))]);
  await expect(feedback).toHaveText(/^That was/);
  await expect(piano).toBeFocused();
  await page.keyboard.press(' ');
  await expect(count).toHaveText('4 / 10');
  // Enter on Skip to summary opens the summary.
  await tabTo(page, page.getByRole('button', { name: 'Skip to summary' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page.getByText(/^0 of 3 notes right/)).toBeVisible();
});

test('read notes lesson: Enter and Space on Higher reached with Tab move the note to write, and do not check it', async ({ page }) => {
  // Lesson 1.2 writes sol.
  await seedStorage(page, { progress: { lessons: pathUpTo('1.1', 3, 100) }, prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/path');
  await page.getByRole('button', { name: 'Start lesson 1.2' }).click();
  const slider = page.getByRole('slider');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Not on the staff yet');
  await tabTo(page, page.getByRole('button', { name: 'Higher' }));
  await page.keyboard.press('Enter');
  await expect(slider).toHaveAttribute('aria-valuetext', 'the middle line');
  await page.keyboard.press('Enter');
  await expect(slider).toHaveAttribute('aria-valuetext', 'the 3rd space');
  await page.keyboard.press(' ');
  await expect(slider).toHaveAttribute('aria-valuetext', 'the 4th line');
  await expect(page.getByRole('progressbar', { name: 'Round progress' })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.nfeedback')).not.toHaveText(/^You wrote/);
});

/**
 * Hint once used, Next note until the next answer and the staff written on once it is checked go away under the
 * focus. It must go on to what comes next, not fall to the page, where a screen reader hears nothing and Tab starts
 * over at Quit.
 */
for (const size of ['phone', 'desktop'] as const) {
  test(`read notes: Hint and Next note pressed with the keyboard hand the focus to the answers (${size})`, async ({ page }) => {
    const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, count: 10, playNotes: false };
    const seed = 4242;
    const notes = generateRound(settings, seed);
    const wrong = (i: number): string => LETTERS.find((L) => L !== letterOf(notes[i].step))!;
    await seedStorage(page, { prefs: { noteNames: 'letters' } });
    await seedRun(page, settings, seed);
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/notes/play');
    const firstName = page.getByRole('group', { name: 'Note names' }).getByRole('button').first();
    const progress = page.getByRole('progressbar', { name: 'Round progress' }).first();
    await tabTo(page, page.getByRole('button', { name: 'Hint' }));
    await page.keyboard.press('Enter');
    await expect(page.locator('.nfeedback')).toHaveClass(/is-hint/);
    await expect(firstName).toBeFocused();
    // The Tab was to Hint, not to the answer it handed the focus to: Space does not answer with that one.
    await page.keyboard.press(' ');
    await page.waitForTimeout(200);
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    // A wrong answer waits for Next note, which waits, blocked, for the next note's answer.
    await page.keyboard.press(wrong(0).toLowerCase());
    await tabTo(page, page.getByRole('button', { name: /^Next note/ }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('img', { name: /Note 2 of 10 is highlighted/ })).toBeVisible();
    await expect(firstName).toBeFocused();
    // Nor does a second Enter, right after the one on Next note.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
    // Next note clicked: the focus goes on to the answers too, but Enter does not answer with the one it is on (only
    // an answer reached with Tab takes Enter).
    await page.keyboard.press(wrong(1).toLowerCase());
    await page.getByRole('button', { name: /^Next note/ }).click();
    await expect(page.getByRole('img', { name: /Note 3 of 10 is highlighted/ })).toBeVisible();
    await expect(firstName).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
    await page.waitForTimeout(200);
    await expect(progress).toHaveAttribute('aria-valuenow', '2');
  });

  test(`read notes: in a mixed round, Next note into the piano notes hands the focus to the piano (${size})`, async ({ page }) => {
    // Names for the first 5 notes, then the piano.
    const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, input: 'mixed', count: 10, playNotes: false };
    const seed = 4242;
    const notes = generateRound(settings, seed);
    const wrong = (i: number): string => LETTERS.find((L) => L !== letterOf(notes[i].step))!;
    await seedStorage(page, { prefs: { noteNames: 'letters' } });
    await seedRun(page, settings, seed);
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/notes/play');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press(wrong(i).toLowerCase());
      await page.keyboard.press('Enter');
      await expect(page.getByRole('img', { name: new RegExp(`Note ${i + 2} of 10 is highlighted`) })).toBeVisible();
    }
    await page.keyboard.press(wrong(4).toLowerCase());
    await tabTo(page, page.getByRole('button', { name: /^Next note/ }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: /^Piano/ }).getByRole('button').first()).toBeFocused();
  });

  test(`read notes lesson: a note written and checked with the keyboard hands the focus on (${size})`, async ({ page }) => {
    // Lesson 1.2 writes sol (the 2nd line); the first arrow key puts the note on the middle line.
    await seedStorage(page, { progress: { lessons: pathUpTo('1.1', 3, 100) }, prefs: { seenHowTo: true, seenHold: true } });
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/path');
    await page.getByRole('button', { name: 'Start lesson 1.2' }).click();
    const slider = page.getByRole('slider');
    const next = page.getByRole('button', { name: /^Next note/ });
    const feedback = page.locator('.nfeedback');
    // Right: the staff is drawn without its slider once checked, so Next note takes the focus; the next note's staff
    // takes it once the note is shown.
    await tabTo(page, slider);
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
    await expect(feedback).toHaveText(/^Right/);
    await expect(next).toBeFocused();
    await expect(slider).toHaveAttribute('aria-valuetext', 'Not on the staff yet');
    await expect(slider).toBeFocused();
    // Wrong (the middle line): Next note, then Enter there, then the next note's staff.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(feedback).toHaveText(/^You wrote/);
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Not on the staff yet');
    await expect(slider).toBeFocused();
  });
}

test('read notes: turning a tablet keeps the focus on the control it was on', async ({ page }) => {
  // The tablet and desktop layouts are drawn in other trees: the turn took the focused control away, and the focus fell
  // to the page.
  await seedRun(page, { ...DEFAULT_NOTE_SETTINGS, playNotes: false }, 4242);
  await page.setViewportSize(VIEWPORTS.tablet);
  await page.goto('./#/notes/play');
  await expect(page.locator('.ntab')).toBeVisible();
  const hint = page.getByRole('button', { name: 'Hint' });
  await tabTo(page, hint);
  await page.setViewportSize(VIEWPORTS['tablet-landscape']);
  await expect(page.locator('.nplay-desk')).toBeVisible();
  await expect(hint).toBeFocused();
  // A name button, whose name says its computer key in the desktop layout only.
  const name = page.getByRole('group', { name: 'Note names' }).getByRole('button').nth(2);
  await tabTo(page, name);
  await page.setViewportSize(VIEWPORTS.tablet);
  await expect(page.locator('.ntab')).toBeVisible();
  await expect(name).toBeFocused();
});

test('scales: turning a tablet keeps the focus on the piano key it was on', async ({ page }) => {
  // The piano is drawn again in the other layout, where its keys show their computer key (E, key D). (Play's Tap pad is
  // no button in the desktop layout: from there the focus goes to the screen's heading.)
  await page.setViewportSize(VIEWPORTS.tablet);
  await startScale(page, { keys: ['C'], input: 'piano' });
  await expect(page.locator('.stab')).toBeVisible();
  const piano = page.getByRole('group', { name: /^Piano keyboard/ });
  await tabTo(page, piano.getByRole('button', { name: 'E', exact: true }));
  await page.setViewportSize(VIEWPORTS['tablet-landscape']);
  await expect(page.locator('.splay-desk')).toBeVisible();
  await expect(piano.getByRole('button', { name: 'E, key D', exact: true })).toBeFocused();
  await page.setViewportSize(VIEWPORTS.tablet);
  await expect(page.locator('.stab')).toBeVisible();
  await expect(piano.getByRole('button', { name: 'E', exact: true })).toBeFocused();
});

test('read notes: a tap on a staff line writes the note on that line, under the room for a flat over the staff', async ({ page }) => {
  // B♭ major with extra signs, seed 59: the first note is G♭5, whose flat puts the top line lower in the drawing.
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, keys: ['Bb'], extras: 'both', tasks: ['write'], playNotes: false };
  const [first] = generateRound(settings, 59);
  expect([first.step, first.sign], 'the first note is G♭5 with its flat').toEqual([39, -1]);
  await seedRun(page, settings, 59);
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/play');
  const slider = page.getByRole('slider');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Not on the staff yet');
  // The five lines of the first bar, top to bottom, where the page shows them.
  const lines = await page.locator('.nplay-staff-svg .vf-stave').first().evaluate((stave) =>
    [...stave.querySelectorAll('path')].map((p) => {
      const r = p.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }).sort((a, b) => a.y - b.y),
  );
  expect(lines).toHaveLength(5);
  for (const [k, text] of ['the top line', 'the 4th line', 'the middle line', 'the 2nd line', 'the bottom line'].entries()) {
    await page.mouse.click(lines[k].x, lines[k].y);
    await expect(slider).toHaveAttribute('aria-valuetext', text);
  }
});

test('read notes in Dutch: times with a decimal comma, on the desktop play screen and on Round done', async ({ page }) => {
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, count: 10, playNotes: false };
  const seed = 4242;
  const [first] = generateRound(settings, seed);
  await seedStorage(page, { prefs: { language: 'nl', noteNames: 'letters' } });
  await seedRun(page, settings, seed);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./#/notes/play');
  await page.keyboard.press(LETTERS.find((L) => L !== letterOf(first.step))!.toLowerCase());
  await expect(page.locator('.nfeedback')).toHaveText(/^Dat was/);
  await expect(page.locator('.stat', { hasText: 'Gem. tijd' }).locator('.nstat-big')).toHaveText(/^\d+,\d s$/);
  await page.getByRole('button', { name: 'Naar de samenvatting' }).click();
  await expect(page.getByRole('heading', { name: 'Ronde klaar' })).toBeVisible();
  await expect(page.getByText(/^0 van 1 noot goed · gem\. \d+,\d s/)).toBeVisible();
  await expect(page.locator('.ncard-head')).toHaveText(/^Tijd per noot ?gem\. \d+,\d s$/);
  await expect(page.getByRole('img', { name: /^Antwoordtijd voor 1 noot\. Gemiddeld \d+,\d seconden\. 1 noot gemist\.$/ })).toBeVisible();
});

test('read notes: in C♯ major, misses that forgot the key signature get the By sign card with its tip', async ({ page }) => {
  // Every letter is sharp in C♯ major: all the notes are in one sign group.
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, keys: ['C#'], count: 10, playNotes: false };
  const seed = 4242;
  await seedRun(page, settings, seed);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./#/notes/play');
  for (const [i, n] of generateRound(settings, seed).slice(0, 2).entries()) {
    await expect(page.getByText(`Note ${i + 1} of 10`)).toBeVisible();
    await page.keyboard.press(letterOf(n.step).toLowerCase());
    await expect(page.locator('.nfeedback')).toHaveText(/^Right (line|space), but C♯ major has .♯ in the key signature/);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByText('Note 3 of 10')).toBeVisible();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page.getByText('By sign', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'F♯, C♯, G♯, D♯, A♯, E♯ and B♯ from the key signature: 0 of 2 right' })).toBeVisible();
  await expect(page.getByText("2 misses had the right letter but not the key signature's sign. In C♯ major, every F, C, G, D, A, E and B is sharp.")).toBeVisible();
});

test('read notes setup: Sharps promises no extra signs in C♯ major, where every letter is sharp already', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes');
  const pool = page.locator('.nsetup-summary-text > span');
  await page.getByRole('button', { name: 'Sharps ♯' }).click();
  await expect(pool).toHaveText('11 staff positions per clef · C major · extra signs appear');
  await page.getByRole('link', { name: /^Key: C major/ }).click();
  await page.getByRole('button', { name: /^C♯ major or A♯ minor/ }).click();
  await page.getByRole('button', { name: 'Use C♯ major' }).click();
  await expect(pool).toHaveText('11 staff positions per clef · C♯ major');
  await page.getByRole('button', { name: 'Both ♯ ♭' }).click();
  await expect(pool).toHaveText('11 staff positions per clef · C♯ major · extra signs appear');
});

test('learn: the Key screen links to key signatures; the quick check answers', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/notes/key');
  await page.getByRole('link', { name: 'What is a key?' }).click();
  await expect(page).toHaveURL(/#\/learn\/10\?s=10\.1$/);
  await expect(page.getByRole('heading', { name: /10\.1\s*The key signature/ })).toBeInViewport();
  await page.getByRole('button', { name: 'D', exact: true }).click();
  await expect(page.locator('#scheck .nfeedback')).toHaveText(/^Right\. One key up from the last sharp/);

  // Scrolling to the end marks nothing; a section's quick check answered right marks it read, and the Learn tab shows it.
  await page.locator('.learn-chapter').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const check = page.getByRole('group', { name: 'How long does a key signature hold?' });
  await check.getByRole('button', { name: 'For the whole piece' }).click();
  await expect(check.locator('.nfeedback')).toHaveText(/^Right\. A key signature holds/);
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

test('learn: Practice ties starts an exercise with a tie in it', async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  const stored = (): Promise<{ settings: Settings; seed: number }> => page.evaluate(() => JSON.parse(sessionStorage.getItem('muzieklab.run.v1')!));
  await page.goto('./#/learn/5');
  const link = page.getByRole('link', { name: 'Practice ties →' });
  await link.click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  const { settings } = await stored();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  // A start seed whose exercise has no tie (about one in four with 4 bars: a tie across the bar line is a chance, and
  // an eighth, quarter, eighth syncopates without one). The link once played it as it came.
  let seed = 1;
  while (exerciseHas(generateExercise(settings, seed), ['ties'])) seed++;
  await page.evaluate((s) => {
    crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T): T => ((a as unknown as Uint32Array)[0] = s * 2, a);
  }, seed);
  await link.click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  const run = await stored();
  expect(exerciseHas(generateExercise(run.settings, run.seed), ['ties']), `from seed ${seed}`).toBe(true);
  await expect(page.getByRole('img', { name: /^Rhythm in 4\/4/ })).toHaveAccessibleName(/, tied/);
  // Results' New exercise (nothing tapped, so under 2 stars) goes on with one.
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await page.getByRole('button', { name: 'New exercise' }).click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  const next = await stored();
  expect(exerciseHas(generateExercise(next.settings, next.seed), ['ties']), 'New exercise').toBe(true);
});

test('learn: Practice dotted eighths starts an exercise with a dotted eighth, also Next after a reload on Play', async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  const stored = (): Promise<{ settings: Settings; seed: number }> => page.evaluate(() => JSON.parse(sessionStorage.getItem('muzieklab.run.v1')!));
  // The start seed set below, for every start in the tab, also after a reload.
  await page.addInitScript(() => {
    const s = Number(sessionStorage.getItem('e2e.seed'));
    if (s) crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T): T => ((a as unknown as Uint32Array)[0] = s * 2, a);
  });
  await page.goto('./#/learn/5');
  const link = page.getByRole('link', { name: 'Practice dotted eighths →' });
  await link.click();
  await expect(page).toHaveURL(/#\/play\?from=5\.3$/);
  const { settings } = await stored();
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  // A start seed whose exercise has a dot, but on a quarter, not an eighth (about one in six). The link once played it
  // as it came, as the dot was all it asked for.
  const has = (seed: number, id: string): boolean => exerciseHas(generateExercise(settings, seed), [id]);
  let seed = 1;
  while (!has(seed, 'dotted') || has(seed, 'dotted:eighth')) seed++;
  await page.evaluate((s) => sessionStorage.setItem('e2e.seed', String(s)), seed);
  await page.reload();
  await link.click();
  await expect(page).toHaveURL(/#\/play\?from=5\.3$/);
  const run = await stored();
  expect(exerciseHas(generateExercise(run.settings, run.seed), ['dotted:eighth']), `from seed ${seed}`).toBe(true);
  await expect(page.getByRole('img', { name: /^Rhythm in 4\/4/ })).toHaveAccessibleName(/dotted eighth note/);
  // After a reload on Play, which rebuilds the run from the one saved in the tab, Results' New exercise (nothing
  // tapped, so under 2 stars) has one too.
  await page.reload();
  await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await page.getByRole('button', { name: 'New exercise' }).click();
  await expect(page).toHaveURL(/#\/play\?from=5\.3$/);
  const next = await stored();
  expect(exerciseHas(generateExercise(next.settings, next.seed), ['dotted:eighth']), `New exercise from seed ${seed}`).toBe(true);
  await expect(page.getByRole('img', { name: /^Rhythm in 4\/4/ })).toHaveAccessibleName(/dotted eighth note/);
});

test('learn: with Bars at 1 Practice ties plays 2 bars with a tie, and the player keeps 1 bar', async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  // The player's 1 bar is seeded once, not before every load as seedStorage does, so a reload reads the setup the app
  // saved.
  await page.addInitScript((lastSettings) => {
    if (sessionStorage.getItem('e2e.seeded')) return;
    sessionStorage.setItem('e2e.seeded', '1');
    localStorage.setItem('muzieklab.progress.v1', JSON.stringify({ lessons: {}, practiceDays: [], lastSettings }));
  }, { ...DEFAULT_SETTINGS, bars: 1 });
  await page.setViewportSize(VIEWPORTS.phone);
  const stored = (): Promise<{ settings: Settings; seed: number; setupBars?: number }> => page.evaluate(() => JSON.parse(sessionStorage.getItem('muzieklab.run.v1')!));
  // The free-practice setup the run saved, which Setup and the next start take.
  const setupBars = (): Promise<number> => page.evaluate(() => JSON.parse(localStorage.getItem('muzieklab.progress.v1')!).lastSettings.bars);
  const skip = page.getByRole('button', { name: 'Skip to results' });
  await page.goto('./#/learn/5');
  // No exercise of 1 bar has a tie: the link once played one without.
  const link = page.getByRole('link', { name: 'Practice ties →' });
  await link.click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  const run = await stored();
  expect(run).toMatchObject({ settings: { bars: 2, ties: true }, setupBars: 1 });
  expect(exerciseHas(generateExercise(run.settings, run.seed), ['ties'])).toBe(true);
  await expect(page.getByRole('img', { name: /^Rhythm in 4\/4/ })).toHaveAccessibleName(/, tied/);
  expect(await setupBars()).toBe(1);
  // Results' Try again (nothing tapped, so under 2 stars: Retry) plays the same 2 bars, and the player keeps 1.
  await skip.click();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  await expect(skip).toBeVisible();
  expect(await stored(), 'Try again').toEqual(run);
  expect(await setupBars(), 'Try again').toBe(1);
  // Results' New exercise goes on with 2 bars and a tie.
  await skip.click();
  await page.getByRole('button', { name: 'New exercise' }).click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  await expect(skip).toBeVisible();
  const next = await stored();
  expect(next, 'New exercise').toMatchObject({ settings: { bars: 2 }, setupBars: 1 });
  expect(exerciseHas(generateExercise(next.settings, next.seed), ['ties']), 'New exercise').toBe(true);
  expect(await setupBars(), 'New exercise').toBe(1);
  // Only those runs: Practice settings on Play's Pause sheet and on Results opens the setup with the player's 1 bar.
  const ties = page.getByRole('button', { name: 'Ties', exact: true });
  const bars = page.getByRole('group', { name: 'Bars', exact: true }).locator('[aria-live]');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Practice settings' }).click();
  await expect(page).toHaveURL(/#\/setup\?from=5\.1$/);
  await expect(ties).toHaveAttribute('aria-pressed', 'true');
  await expect(bars, 'Play').toHaveText('1');
  // Also after a reload on Play, which rebuilds the run from the one saved in the tab, the player's bars with it.
  await page.getByRole('link', { name: 'Back to chapter 5' }).click();
  await link.click();
  await expect(page).toHaveURL(/#\/play\?from=5\.1$/);
  await page.reload();
  await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await skip.click();
  await page.getByRole('link', { name: 'Practice settings' }).click();
  await expect(page).toHaveURL(/#\/setup\?from=5\.1$/);
  await expect(ties).toHaveAttribute('aria-pressed', 'true');
  await expect(bars, 'Results, after a reload on Play').toHaveText('1');
  // And after a reload on Setup, which reads the setup the app saved.
  expect(await setupBars(), 'the setup saved').toBe(1);
  await page.reload();
  await expect(ties).toHaveAttribute('aria-pressed', 'true');
  await expect(bars, 'after a reload on Setup').toHaveText('1');
});

test("learn: the browser's Back from a practice link returns to its section, as Quit does", async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  const links: [number, string, string, RegExp][] = [
    [8, '8.4', 'Practice with ledger lines →', /#\/notes\/play\?from=8\.4$/],
    [3, '3.2', 'Practice reading rests →', /#\/play\?from=3\.2$/],
    [11, '11.4', 'Practice A minor in all three forms →', /#\/scales\/setup\?from=11\.4$/],
  ];
  for (const [n, id, name, to] of links) {
    // Opened at the top, scrolled down to the link: the chapter's place in the history did not say where the reader was.
    await page.goto(`./#/learn/${n}`);
    const link = page.getByRole('link', { name });
    await link.scrollIntoViewIfNeeded();
    // On the way out the chapter does not jump to the section (the Scales link once scrolled it and gave it focus for
    // a frame before its setup opened).
    await page.locator('.learn-chapter').evaluate((el) => {
      const moved: string[] = [];
      const top = el.scrollTop;
      (window as unknown as { moved: string[] }).moved = moved;
      el.addEventListener('scroll', () => el.scrollTop !== top && moved.push(`scroll ${top} → ${el.scrollTop}`));
      el.addEventListener('focusin', (e) => (e.target as Element).matches('section') && moved.push('focus ' + (e.target as Element).id));
    });
    await link.click();
    await expect(page).toHaveURL(to);
    expect(await page.evaluate(() => (window as unknown as { moved: string[] }).moved), `${id}: the chapter stays put`).toEqual([]);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/learn/${n}\\?s=${id.replace('.', '\\.')}$`));
    await expect(page.getByRole('heading', { name: new RegExp(`^${id.replace('.', '\\.')}\\s*\\D`) })).toBeInViewport();
  }
});

test("learn: the browser's Back to a chapter returns where the reader left it, and the Learn tab keeps its open chapter", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  // Left from its end (the next chapter, its Practice button, all chapters), the chapter opens at its end again, not
  // at the top: it is built afresh in its own scroller on the way back, so the browser cannot restore the place.
  const ends: [RegExp, RegExp][] = [
    [/^Next/, /#\/learn\/2$/],
    [/^Practice rhythm$/, /#\/setup\?from=1$/],
    [/^Back to all chapters$/, /#\/learn$/],
  ];
  for (const [name, to] of ends) {
    await page.goto('./#/learn/1');
    const link = page.getByRole('link', { name });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page).toHaveURL(to);
    await page.goBack();
    await expect(page).toHaveURL(/#\/learn\/1\?s=check$/);
    await expect(page.locator('a.learn-nav-link--next')).toBeInViewport();
  }
  // The setup's back arrow returns there too, to the Practice button that opened it.
  await page.getByRole('link', { name: /^Practice rhythm$/ }).click();
  await page.getByRole('link', { name: 'Back to chapter 1' }).click();
  await expect(page).toHaveURL(/#\/learn\/1\?s=check$/);
  await expect(page.locator('a.learn-nav-link--next')).toBeInViewport();

  // Opened at 1.1 and read on into 1.3, then left by the tab bar: Back opens 1.3, not the section in the address.
  await page.goto('./#/learn/1?s=1.1');
  await expect(page.locator('#s1-1')).toBeFocused();
  await page.locator('#s1-3').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    el.closest('.page')!.scrollTop += 40;
  });
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/1\?s=1\.3$/);
  await expect(page.getByRole('heading', { name: /^1\.3\s*\D/ })).toBeInViewport();

  // The Learn tab opens the chapter that was open when it was left, not the first one not read yet.
  await page.goto('./#/learn');
  await page.getByRole('button', { name: /^10\s*\D/ }).click();
  await page.getByRole('link', { name: /^10\.3\s*\D/ }).click();
  await expect(page).toHaveURL(/#\/learn\/10\?s=10\.3$/);
  await page.goBack();
  await expect(page.getByRole('button', { name: /^10\s*\D/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /^1\s*\D/ })).toHaveAttribute('aria-expanded', 'false');

  // On a tablet 8.1 is shorter than half the view, so 8.2 starts above its middle: Back opens 8.1, the section at the
  // top of the view, again and again (it went one section further down at each Home and Back).
  await page.setViewportSize(VIEWPORTS.tablet);
  await page.goto('./#/learn/8?s=8.1');
  await expect(page.locator('#s8-1')).toBeFocused();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/#\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/learn\/8\?s=8\.1$/);
  }
  await expect(page.getByRole('heading', { name: /^8\.1\s*\D/ })).toBeInViewport();
  // Read to the end, where the last sections cannot reach the top: Back opens the end again, with the examples above
  // it drawn after the chapter opened.
  await page.goto('./#/learn/3');
  const chapter = page.locator('.page.learn-chapter');
  await chapter.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/3\?s=check$/);
  await expect.poll(() => chapter.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
  await expect(page.locator('a.learn-nav-link--next')).toBeInViewport({ ratio: 1 });
});

test("learn: the browser's Back after a jump to a section returns where the reader was, the chapter's top too", async ({ page }) => {
  const chapter = page.locator('.page.learn-chapter');
  const jump = page.getByRole('navigation', { name: 'Sections' });
  // The sidebar on desktop, the chips on a tablet. Back to the chapter's own address once left the page at the section.
  for (const size of ['desktop', 'tablet'] as const) {
    await page.setViewportSize(VIEWPORTS[size]);
    await page.goto('./#/learn/8');
    await jump.getByRole('link', { name: /^8\.3\s*\D/ }).click();
    await expect(page).toHaveURL(/#\/learn\/8\?s=8\.3$/);
    await expect(page.locator('#s8-3')).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(/#\/learn\/8$/);
    await expect.poll(() => chapter.evaluate((el) => el.scrollTop), `${size}: the chapter's top`).toBe(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  }
  // Scrolled down to 8.2 by hand, then a jump to 8.5: Back opens 8.2, where the reader was, not the top or 8.5.
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('./#/learn/8');
  await page.locator('#s8-2').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    el.closest('.page')!.scrollTop += 40;
  });
  await jump.getByRole('link', { name: /^8\.5\s*\D/ }).click();
  await expect(page).toHaveURL(/#\/learn\/8\?s=8\.5$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/8\?s=8\.2$/);
  await expect(page.getByRole('heading', { name: /^8\.2\s*\D/ })).toBeInViewport();
  await page.goForward();
  await expect(page.getByRole('heading', { name: /^8\.5\s*\D/ })).toBeInViewport();
});

test('learn: a phone turned on its side keeps the chapter where it was, its answers, and Stop on the example playing', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn/11?s=11.3');
  const section = page.locator('#s11-3');
  await section.locator('.learn-answer').first().click();
  await expect(section.locator('.nfeedback')).toBeVisible();
  // Past 700 px the shell has a header in place of the tab bar: the chapter was built again, at its top, with no answer.
  for (const size of ['phone-landscape', 'phone'] as const) {
    await page.setViewportSize(VIEWPORTS[size]);
    await expect(page.locator('.shell')).toHaveClass(size === 'phone' ? /shell--phone/ : /shell--tablet/);
    await expect(section.locator('.nfeedback'), size).toBeVisible();
    await expect(section, size).toBeInViewport();
  }
  // An example still sounding kept playing with no Stop to press.
  await page.goto('./#/learn/2?s=2.2');
  await page.getByRole('button', { name: 'Play: sixteenth note' }).click();
  await expect(page.getByRole('button', { name: 'Stop: sixteenth note' })).toBeVisible();
  await page.setViewportSize(VIEWPORTS['phone-landscape']);
  await expect(page.getByRole('button', { name: 'Stop: sixteenth note' })).toBeVisible();
});

test('after Quit, one Back leaves the screen Quit returned to', async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  // From the Learn tab to a section, its practice link and Quit: the first Back returns to the Learn tab, not to the
  // section a second time (it once took two).
  const links: [number, string, string, string][] = [
    [8, '8.4', 'Practice with ledger lines →', 'Quit'],
    [3, '3.2', 'Practice reading rests →', 'Quit exercise'],
  ];
  for (const [n, id, name, quit] of links) {
    const section = id.replace('.', '\\.');
    await page.goto('./#/learn');
    const row = page.getByRole('button', { name: new RegExp(`^${n}\\s*\\D`) });
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
    await page.getByRole('link', { name: new RegExp(`^${section}\\s*\\D`) }).click();
    await page.getByRole('link', { name }).click();
    await page.getByRole('link', { name: quit, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/learn/${n}\\?s=${section}$`));
    await page.goBack();
    await expect(page).toHaveURL(/#\/learn$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
  }

  // The same for a Read notes round started from its setup, and a Scales round from the Scales tab: Back goes Home.
  for (const [tile, start, setup] of [[/^Read notes/, /^Start · /, /#\/notes$/], [/^Scales/, /^Practice C major/, /#\/scales$/]]) {
    await page.goto('./#/');
    await page.getByRole('link', { name: tile }).click();
    await page.getByRole('button', { name: start }).click();
    await page.getByRole('link', { name: 'Quit', exact: true }).click();
    await expect(page).toHaveURL(setup);
    await page.goBack();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeAttached();
  }
});

test('after Use on a Key screen, one Back leaves the setup it went back to', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  // Read notes: the Key row, a key and Use. Use once swapped the Key screen for a second copy of the setup, so the
  // first Back stayed on the setup.
  await page.goto('./#/');
  await page.getByRole('link', { name: /^Read notes/ }).click();
  await page.getByRole('link', { name: /^Key: C major/ }).click();
  await page.getByRole('button', { name: /^G major or E minor/ }).click();
  await page.getByRole('button', { name: 'Use G major' }).click();
  await expect(page.getByRole('link', { name: /^Key: G major/ })).toBeVisible();
  await expect(page).toHaveURL(/#\/notes$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeAttached();

  // Scales: its Key screen by Choose…, then, with keys chosen, by Change. One Back leaves the setup after both.
  await page.getByRole('link', { name: /^Scales/ }).click();
  await page.getByRole('link', { name: 'Options' }).click();
  await page.getByRole('group', { name: 'Keys' }).getByRole('button', { name: 'Choose…' }).click();
  await page.getByRole('group', { name: 'Key' }).getByRole('button', { name: 'Mix keys' }).click();
  await page.getByRole('button', { name: /^G major or E minor/ }).click();
  await page.getByRole('button', { name: 'Use 2 keys' }).click();
  await expect(page).toHaveURL(/#\/scales\/setup$/);
  await page.getByRole('link', { name: 'Change', exact: true }).click();
  await page.getByRole('button', { name: /^D major or B minor/ }).click();
  await page.getByRole('button', { name: 'Use 3 keys' }).click();
  await expect(page.getByRole('group', { name: 'Keys' }).getByRole('button', { name: '3 keys' })).toBeVisible();
  await expect(page).toHaveURL(/#\/scales\/setup$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/scales$/);
});

test('a Read notes setup opened from a chapter keeps the way back to it: Quit returns to it, and one Back to the chapter', async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn/8');
  await page.getByRole('link', { name: 'Practice reading notes' }).click();
  await expect(page).toHaveURL(/#\/notes\?from=8$/);
  // Start once left ?from=8 behind: Quit landed on a setup whose back arrow went Home, and Back showed the setup again.
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page).toHaveURL(/#\/notes\/play\?from=8$/);
  await page.getByRole('link', { name: 'Quit', exact: true }).click();
  await expect(page).toHaveURL(/#\/notes\?from=8$/);
  await expect(page.getByRole('link', { name: 'Back to chapter 8' })).toBeVisible();
  // Back opens the chapter at its end, where its Practice button is (placeOf).
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/8\?s=check$/);

  // Round done of a round started there returns to the chapter; Change setup, Start and Quit go back to that setup.
  await page.getByRole('link', { name: 'Practice reading notes' }).click();
  await page.getByRole('button', { name: /^Start · / }).click();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page).toHaveURL(/#\/notes\/done\?from=8$/);
  await expect(page.getByRole('link', { name: 'Back to chapter 8' })).toBeVisible();
  await page.getByRole('link', { name: 'Change setup' }).first().click();
  await expect(page).toHaveURL(/#\/notes\?from=8$/);
  await page.getByRole('button', { name: /^Start · / }).click();
  await page.getByRole('link', { name: 'Quit', exact: true }).click();
  await expect(page).toHaveURL(/#\/notes\?from=8$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/notes\/done\?from=8$/);
});

test('a rhythm setup opened from a chapter keeps the way back to it: Quit returns to it, and Results to the chapter', async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true, seenEchoHowTo: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn/1');
  const practice = page.getByRole('link', { name: /^Practice rhythm$/ });
  await practice.click();
  await expect(page).toHaveURL(/#\/setup\?from=1$/);
  // Start once left ?from=1 behind: Quit went Home, and Results' back arrow too.
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page).toHaveURL(/#\/play\?from=1$/);
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await expect(page).toHaveURL(/#\/setup\?from=1$/);
  await expect(page.getByRole('link', { name: 'Back to chapter 1' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/1\?s=check$/);

  await practice.click();
  await page.getByRole('button', { name: /^Start · / }).click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page).toHaveURL(/#\/results\?from=1$/);
  await page.getByRole('link', { name: 'Back to chapter 1' }).click();
  await expect(page).toHaveURL(/#\/learn\/1\?s=check$/);

  // Echo's listening has a Quit of its own, which goes back to the setup too.
  await practice.click();
  await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }).click();
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page).toHaveURL(/#\/play\?from=1$/);
  await page.getByRole('link', { name: 'Quit exercise' }).click();
  await expect(page).toHaveURL(/#\/setup\?from=1$/);
  await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Tap' }).click();

  // A section's practice, then Results' Practice settings: the run that setup starts keeps the section.
  await page.goto('./#/learn/1');
  await page.getByRole('link', { name: 'Practice at a steady tempo →' }).click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await page.getByRole('link', { name: 'Practice settings' }).click();
  await expect(page).toHaveURL(/#\/setup\?from=1\.1$/);
  await page.getByRole('button', { name: /^Start · / }).click();
  await expect(page).toHaveURL(/#\/play\?from=1\.1$/);
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await expect(page).toHaveURL(/#\/results\?from=1\.1$/);
  await page.getByRole('link', { name: 'Back to chapter 1' }).click();
  await expect(page).toHaveURL(/#\/learn\/1\?s=1\.1$/);
});

test('a Scales setup opened from a section keeps the way back to it: Quit returns to it, and Round done to the section', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/learn/11');
  const link = page.getByRole('link', { name: 'Practice D major and B♭ major →' });
  await link.click();
  await expect(page).toHaveURL(/#\/scales\/setup\?from=11\.2$/);
  // Start once left ?from=11.2 behind: Quit went to the Scales tab, and Round done's back arrow too.
  await page.getByRole('button', { name: 'Start · 2 scales' }).click();
  await expect(page).toHaveURL(/#\/scales\/play\?from=11\.2$/);
  const quit = page.getByRole('link', { name: 'Quit', exact: true });
  await expect(quit).toHaveAttribute('href', '#/scales/setup?from=11.2');
  await quit.click();
  await expect(page).toHaveURL(/#\/scales\/setup\?from=11\.2$/);
  await expect(page.getByRole('link', { name: 'Back to chapter 11' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/11\?s=11\.2$/);

  // Round done returns to the section; New round and Change setup keep it.
  await link.click();
  await page.getByRole('button', { name: 'Start · 2 scales' }).click();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page).toHaveURL(/#\/scales\/done\?from=11\.2$/);
  await page.getByRole('button', { name: 'New round' }).click();
  await expect(page).toHaveURL(/#\/scales\/play\?from=11\.2$/);
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await page.getByRole('link', { name: 'Change setup' }).click();
  await expect(page).toHaveURL(/#\/scales\/setup\?from=11\.2$/);
  await page.getByRole('button', { name: 'Start · 2 scales' }).click();
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await expect(page.getByRole('link', { name: 'Back to chapter 11' })).toHaveAttribute('href', '#/learn/11?s=11.2');
  await page.getByRole('link', { name: 'Back to chapter 11' }).click();
  await expect(page).toHaveURL(/#\/learn\/11\?s=11\.2$/);
});

test("a finished screen's back arrow leaves it as Quit does, so Back does not open it again", async ({ page }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.phone);
  // From the Learn tab to a section, its practice link, Skip and Back to chapter on Round done or Results: the first
  // Back returns to the Learn tab (it once opened the finished screen again, and then the section a second time).
  const links: [number, string, string, string][] = [
    [8, '8.4', 'Practice with ledger lines →', 'Skip to summary'],
    [3, '3.2', 'Practice reading rests →', 'Skip to results'],
  ];
  for (const [n, id, name, skip] of links) {
    const section = id.replace('.', '\\.');
    await page.goto('./#/learn');
    const row = page.getByRole('button', { name: new RegExp(`^${n}\\s*\\D`) });
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
    await page.getByRole('link', { name: new RegExp(`^${section}\\s*\\D`) }).click();
    await page.getByRole('link', { name }).click();
    await page.getByRole('button', { name: skip }).click();
    await page.getByRole('link', { name: `Back to chapter ${n}` }).click();
    await expect(page).toHaveURL(new RegExp(`#/learn/${n}\\?s=${section}$`));
    await page.goBack();
    await expect(page).toHaveURL(/#\/learn$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
  }

  // Started elsewhere, the back arrow swaps the finished screen for where it goes: Back then returns to the screen the
  // round was started from (Read notes' setup, Home for Scales, the rhythm setup), not to the round.
  const rounds: [RegExp, RegExp, string, string, RegExp][] = [
    [/^Read notes/, /^Start · /, 'Skip to summary', 'Back to home', /#\/notes$/],
    [/^Scales/, /^Practice C major/, 'Skip to summary', 'Back to Scales', /#\/$/],
  ];
  for (const [tile, start, skip, back, before] of rounds) {
    await page.goto('./#/');
    await page.getByRole('link', { name: tile }).click();
    await page.getByRole('button', { name: start }).click();
    await page.getByRole('button', { name: skip }).click();
    await page.getByRole('link', { name: back }).click();
    await page.goBack();
    await expect(page).toHaveURL(before);
  }
  await page.goto('./#/setup');
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Skip to results' }).click();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/setup$/);
});

test('learn: a practice link opened in a new tab starts the same practice there', async ({ page, context }) => {
  await seedStorage(page, { prefs: { seenHowTo: true, seenHold: true } });
  await page.setViewportSize(VIEWPORTS.desktop);
  // A middle click and a Ctrl or Cmd click open a new tab (the click once started practice in this tab instead), and
  // the new tab gets the section's practice, not the plain setup.
  await page.goto('./#/learn/4');
  const link = page.getByRole('link', { name: 'Practice eighths →' });
  const clicks: Parameters<Locator['click']>[0][] = [{ button: 'middle' }, { modifiers: ['ControlOrMeta'] }];
  for (const click of clicks) {
    const [tab] = await Promise.all([context.waitForEvent('page'), link.click(click)]);
    await expect(tab).toHaveURL(/#\/play\?from=4\.1$/);
    await expect(tab.getByRole('link', { name: /^Quit/ })).toHaveAttribute('href', '#/learn/4?s=4.1');
    // No tap led to this tab, so the sound cannot start yet: Play waits on Ready · Start, as after a reload. It once
    // counted in at once on silent audio and paused (The sound was interrupted).
    const ready = tab.getByRole('dialog', { name: 'Ready?' });
    await expect(ready.getByRole('button', { name: /^Start/ })).toBeVisible();
    await expect(tab.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
    await ready.getByRole('button', { name: /^Start/ }).click();
    await expect(tab.getByRole('dialog')).toHaveCount(0);
    await tab.close();
    await expect(page).toHaveURL(/#\/learn\/4$/);
  }
  // Read notes starts its round; Scales opens the setup with the section's keys.
  const tabs: [number, string, RegExp][] = [
    [8, 'Practice the treble clef →', /#\/notes\/play\?from=8\.2$/],
    [11, 'Practice D major and B♭ major →', /#\/scales\/setup\?from=11\.2$/],
  ];
  for (const [n, name, url] of tabs) {
    await page.goto(`./#/learn/${n}`);
    const [tab] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name }).click({ button: 'middle' })]);
    await expect(tab).toHaveURL(url);
    if (n === 11) await expect(tab.getByRole('button', { name: 'Start · 2 scales' })).toBeVisible();
    await tab.close();
  }
});

test('scales: from Home to the circle, a G major round played with the keyboard, and the stars on the circle', async ({ page }) => {
  // A done scale once looked up the step after its last note ("[i18n] missing message: scales.how.undefined").
  const missing: string[] = [];
  page.on('console', (m) => m.text().startsWith('[i18n] missing message') && missing.push(m.text()));
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
  expect(missing).toEqual([]);
});

/** Starts a round of one scale (or `count`: major, up, silent) from the setup, with these settings on top. */
async function startScale(page: Page, settings: object, count = 1): Promise<void> {
  await seedStorage(page, {
    prefs: { seenHowTo: true, seenHold: true },
    progress: { scales: { settings: { keyMode: 'one', types: ['major'], direction: 'up', write: 'signs', showSteps: true, playNotes: false, ...settings }, stars: {} } },
  });
  await page.goto('./#/scales/setup');
  // A fresh load, so the app reads the settings just seeded (a new hash alone keeps the app and its settings).
  await page.reload();
  await page.getByRole('button', { name: count === 1 ? 'Start · 1 scale' : `Start · ${count} scales` }).click();
}

test('scales: after a click, Enter does not press the piano key or the sign again; once the scale is done it goes on', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  const feedback = page.locator('.nfeedback');
  const mistakes = page.locator('.sstats .nstat-big');
  // The G key keeps the focus after the click: Enter is the exercise's, which has nothing to do before the scale is done.
  await startScale(page, { keys: ['G'], input: 'piano' });
  await page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button').first().click();
  await expect(feedback).toHaveText(/^Degree 2: up a whole step/);
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText(/^Degree 2: up a whole step/);
  await expect(mistakes).toHaveText('0');
  await expect(page.locator('.spiano .is-wrong')).toHaveCount(0);

  // Spelling: the ♮ clicked for G is A's ♮ next, and later F's: Enter neither answers A nor counts F♮ as a mistake.
  await startScale(page, { keys: ['G'], input: 'names' });
  const natural = page.getByRole('button', { name: /natural, key 0$/ });
  await natural.click();
  await expect(feedback).toHaveText('Which sign does A get?');
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText('Which sign does A get?');
  for (let i = 0; i < 5; i++) await natural.click();
  await expect(feedback).toHaveText('Which sign does F get?');
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText('Which sign does F get?');
  await expect(mistakes).toHaveText('0');
  await page.getByRole('button', { name: 'F sharp, key =' }).click();
  await natural.click();
  await expect(feedback).toHaveText(/^G major: done, no mistakes/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
});

test('scales: Hint right after a wrong sign shows the hint, and a new mistake says why again', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await startScale(page, { keys: ['A'], input: 'names' });
  const feedback = page.locator('.nfeedback');
  const hint = page.getByRole('button', { name: 'Hint' });
  // A and B natural, then C natural: wrong, A major has C♯.
  for (const k of ['0', '0', '0']) await page.keyboard.press(k);
  await expect(feedback).toHaveText('Not C. From B, go up a whole step (skip one key).');
  await expect(page.locator('.ssign.is-wrong')).toHaveCount(1);
  // The hint takes the place of the wrong answer and its red mark (the ScaleSpell boards).
  await hint.click();
  await expect(feedback).toHaveText('Hint: from B the step up is W, a whole step (skip one key).');
  await expect(page.locator('.ssign.is-wrong')).toHaveCount(0);
  // Asked once, it is disabled until the next mistake, and looks it, as the signs do once the scale is done.
  await expect(hint).toBeDisabled();
  await expect(hint).toHaveCSS('opacity', '0.5');
  await page.keyboard.press('0');
  await expect(feedback).toHaveText('Not C. From B, go up a whole step (skip one key).');
  await expect(page.locator('.ssign.is-wrong')).toHaveCount(1);
  await expect(hint).toBeEnabled();
  await expect(hint).toHaveCSS('opacity', '1');
  await hint.click();
  await expect(feedback).toHaveText('Hint: from B the step up is W, a whole step (skip one key).');
  await page.keyboard.press('=');
  await expect(feedback).toHaveText('Which sign does D get?');
  // Done: Hint and Start over have nothing to do, and look it.
  const startOver = page.getByRole('button', { name: 'Start over' });
  await expect(startOver).toHaveCSS('opacity', '1');
  for (const k of ['0', '0', '=', '=', '0']) await page.keyboard.press(k);
  await expect(feedback).toHaveText(/^A major: done with 2 mistakes/);
  for (const button of [hint, startOver]) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveCSS('opacity', '0.5');
  }
});

/**
 * Hint once used, the signs or the piano keys once the scale is done, Next scale until the next one is done and Start
 * over before a note is played go away under the focus. It goes on to what comes next, not to the page.
 */
for (const size of ['phone', 'desktop'] as const) {
  test(`scales: Hint, the last sign and Next scale pressed with the keyboard hand the focus on (${size})`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[size]);
    await startScale(page, { keyMode: 'pick', keys: ['C', 'G'], input: 'names' }, 2);
    const signs = page.getByRole('group', { name: /^Sign for/ }).getByRole('button');
    // The mistakes so far: over the staff on a phone, in the side panel on desktop.
    const mistakes = page.locator(size === 'phone' ? '.splay-mistakes-n' : '.sstats .nstat-big');
    await tabTo(page, page.getByRole('button', { name: 'Hint' }));
    await page.keyboard.press('Enter');
    await expect(page.locator('.nfeedback')).toHaveClass(/is-hint/);
    await expect(signs.first()).toBeFocused();
    // The Tab was to Hint, not to the sign it handed the focus to: Enter does not answer with that one (♭).
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await expect(mistakes).toHaveText('0');
    // Each scale spelled to its last note with the keys (G major has F♯), and the last one (its tonic, natural) with
    // Enter on the sign.
    for (const n of [1, 2]) {
      const g = (await page.locator('.splay-title').first().textContent())!.startsWith('G');
      for (const k of g ? ['0', '0', '0', '0', '0', '0', '='] : ['0', '0', '0', '0', '0', '0', '0']) await page.keyboard.press(k);
      await tabTo(page, signs.filter({ hasText: '♮' }));
      await page.keyboard.press('Enter');
      await expect(page.locator('.nfeedback')).toHaveText(/: done, no mistakes/);
      const next = page.getByRole('button', { name: n === 1 ? /^Next scale/ : /^See the round/ });
      await expect(next).toBeFocused();
      if (n === 1) {
        await page.keyboard.press('Enter');
        await expect(page.locator('.splay-degrees .degree.is-done')).toHaveCount(0);
        await expect(signs.first()).toBeFocused();
        // Nor does a second Enter, right after the one on Next scale.
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await expect(mistakes).toHaveText('0');
      }
    }
  });

  test(`scales on the piano: Start over, the last key and Next scale pressed with the keyboard hand the focus on (${size})`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[size]);
    await startScale(page, { keyMode: 'pick', keys: ['C', 'G'], input: 'piano' }, 2);
    const keys = page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button');
    const mistakes = page.locator(size === 'phone' ? '.splay-mistakes-n' : '.sstats .nstat-big');
    // The tonic, then Start over: the piano takes the focus.
    await page.keyboard.press('a');
    await tabTo(page, page.getByRole('button', { name: 'Start over' }));
    await page.keyboard.press('Enter');
    await expect(page.locator('.splay-degrees .degree.is-done')).toHaveCount(0);
    await expect(keys.first()).toBeFocused();
    // The Tab was to Start over, not to the key it handed the focus to: a second Enter does not play that key.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await expect(page.locator('.splay-degrees .degree.is-done')).toHaveCount(0);
    await expect(mistakes).toHaveText('0');
    for (const n of [1, 2]) {
      const title = (await page.locator('.splay-title').first().textContent())!;
      // A S D F G H J (C major) or A S D F G H I (G major, F♯), then the top note with Enter on its key.
      for (const k of title.startsWith('G') ? 'asdfghi' : 'asdfghj') await page.keyboard.press(k);
      await tabTo(page, page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button', { name: new RegExp('^' + title[0] + ', high') }));
      await page.keyboard.press('Enter');
      await expect(page.locator('.nfeedback')).toHaveText(/: done, no mistakes/);
      const next = page.getByRole('button', { name: n === 1 ? /^Next scale/ : /^See the round/ });
      await expect(next).toBeFocused();
      if (n === 1) {
        await page.keyboard.press('Enter');
        await expect(page.locator('.splay-degrees .degree.is-done')).toHaveCount(0);
        await expect(keys.first()).toBeFocused();
      }
    }
  });
}

test('scales: the right note in the wrong octave says so, and the two keys of a note are told apart', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await startScale(page, { keys: ['C'], input: 'piano' });
  const piano = page.getByRole('group', { name: 'Piano keyboard from C to D' });
  const key = (name: string): Locator => piano.getByRole('button', { name, exact: true });
  const feedback = page.locator('.nfeedback');
  // C D E F G A B C D, with C♯ twice: a screen reader hears which is which.
  expect(await piano.getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual([
    'C, low', 'D, low', 'E', 'F', 'G', 'A', 'B', 'C, high', 'D, high',
    'C sharp or D flat, low', 'D sharp or E flat', 'F sharp or G flat', 'G sharp or A flat', 'A sharp or B flat', 'C sharp or D flat, high',
  ]);
  // The upper C first, then the upper D: the right notes an octave too high, each a mistake.
  await key('C, high').click();
  await expect(feedback).toHaveText('Right note, wrong octave: play the lower C.');
  await key('C, low').click();
  await key('D, high').click();
  await expect(feedback).toHaveText('Right note, wrong octave: play the lower D.');
  // At the top, the lower C: an octave too low.
  for (const k of ['D, low', 'E', 'F', 'G', 'A', 'B', 'C, low']) await key(k).click();
  await expect(feedback).toHaveText('Right note, wrong octave: play the higher C.');
  await expect(page.getByRole('img', { name: '3 mistakes' })).toBeVisible();
  // Another note is still "Not …".
  await key('D, high').click();
  await expect(feedback).toHaveText(/^Not D\. From B, go up a half step/);
});

test('scales up and down on the piano: only the note to play shows "?", not the top note still to come down', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await startScale(page, { keys: ['C'], input: 'piano', direction: 'upDown' });
  const down = page.getByRole('list', { name: 'Scale degrees going down' }).getByRole('listitem');
  // C D E F G A B: the top C is next going up, and the first box going down is that C again, still to come.
  for (const k of ['a', 's', 'd', 'f', 'g', 'h', 'j']) await page.keyboard.press(k);
  await expect(page.getByRole('listitem', { name: 'Degree 8: now' })).toHaveCount(1);
  await expect(down.first()).toHaveAttribute('aria-label', 'Degree 8: not yet');
  await expect(page.locator('.splay-degrees .degree-name').filter({ hasText: '?' })).toHaveCount(1);
  await expect(down.first().locator('.degree-name')).toHaveText('');
  // Once played, both show it, and the 7th going down is next.
  await page.keyboard.press('k');
  await expect(down.first().locator('.degree-name')).toHaveText('C');
  await expect(down.nth(1).locator('.degree-name')).toHaveText('?');
  await expect(page.locator('.splay-degrees .degree-name').filter({ hasText: '?' })).toHaveCount(1);
});

test('scales: a screen reader hears the notes said (F double sharp), on the staff, the degrees, the feedback and the hub', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  // G♯ harmonic minor (key B), spelled: its 7th is F𝄪.
  await startScale(page, { keys: ['B'], types: ['harmonic'], input: 'names' });
  // The line shows the signs; its live region, beside it, says the notes.
  const feedback = page.locator('.nfeedback');
  const said = page.locator('.nfeedback + [aria-live]');
  // G♯, then A♭: wrong.
  await page.keyboard.press('=');
  await page.keyboard.press('-');
  await expect(feedback).toHaveText(/^Not A♭\. From G♯, go up a whole step/);
  await expect(feedback).toHaveAttribute('aria-hidden', 'true');
  await expect(said).toHaveText('Not A flat. From G sharp, go up a whole step (skip one key).');
  for (const k of ['=', '0', '=', '=', '0', 'x']) await page.keyboard.press(k);
  await expect(page.getByRole('listitem', { name: 'Degree 7: F double sharp' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Treble staff, G sharp harmonic minor: G sharp, A sharp, B, C sharp, D sharp, E, F double sharp' })).toBeVisible();
  await page.keyboard.press('=');
  await expect(feedback).toHaveText('G♯ harmonic minor: done with 1 mistake. G♯ A♯ B C♯ D♯ E F𝄪 G♯');
  await expect(said).toHaveText('G sharp harmonic minor: done with 1 mistake. G sharp, A sharp, B, C sharp, D sharp, E, F double sharp, G sharp');

  // The hub, on G♯ minor: its notes, and its key on the circle.
  await page.goto('./#/scales');
  await page.getByRole('group', { name: 'Major or minor' }).getByRole('button', { name: 'Minor' }).click();
  await expect(page.getByRole('list', { name: 'Notes: G sharp, A sharp, B, C sharp, D sharp, E, F sharp, G sharp' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'F sharp', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'G sharp minor: no form with 2 stars yet (or A flat minor)' })).toHaveAttribute('aria-pressed', 'true');
});

test('scales: going round the circle keeps the circle order, and the setup says so', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('./#/scales');
  await page.getByRole('button', { name: /^Go round the circle/ }).click();
  const summary = page.locator('.ssetup-summary');
  await expect(summary).toContainText('In circle order; a scale with mistakes comes back at the end.');
  await expect(summary).not.toContainText('Shuffled');
  // Two scales of one key are shuffled.
  const keys = page.getByRole('group', { name: 'Keys' });
  await keys.getByRole('button', { name: 'C major' }).click();
  await page.getByRole('button', { name: /^Natural minor/ }).click();
  await expect(summary).toContainText('Shuffled; a scale with mistakes comes back at the end.');
  await keys.getByRole('button', { name: 'All 15' }).click();
  await expect(summary).toContainText('In circle order');
  await page.getByRole('button', { name: 'Start · 30 scales' }).click();
  await expect(page.locator('.splay-title')).toHaveText('C major');
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
  // The circle opened from the chapter returns to its end, as every chapter's Practice button does (it went Home).
  await expect(page).toHaveURL(/#\/scales\?from=11$/);
  await page.getByRole('link', { name: 'Back to chapter 11' }).click();
  await expect(page).toHaveURL(/#\/learn\/11\?s=check$/);
  await expect(page.getByRole('link', { name: 'Practice scales' })).toBeInViewport();
  // Its Options and Practice keep the way back: the round quits to the circle, still Back to chapter 11.
  await page.getByRole('link', { name: 'Practice scales' }).click();
  await page.getByRole('link', { name: 'Options' }).click();
  await expect(page).toHaveURL(/#\/scales\/setup\?from=11$/);
  await expect(page.getByRole('link', { name: 'Back to chapter 11' })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: /^Practice C major/ }).click();
  await expect(page).toHaveURL(/#\/scales\/play\?from=11$/);
  await page.getByRole('link', { name: 'Quit', exact: true }).click();
  await expect(page).toHaveURL(/#\/scales\?from=11$/);
  await expect(page.getByRole('link', { name: 'Back to chapter 11' })).toBeVisible();
  // Opened from Home, its back arrow still goes Home.
  await page.goto('./#/');
  await page.getByRole('link', { name: /^Scales/ }).click();
  await expect(page.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '#/');
});
