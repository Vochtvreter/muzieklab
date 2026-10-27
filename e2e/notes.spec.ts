import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEFAULT_NOTE_SETTINGS, generateRound, noteMidi, pianoKeyMidi, type NoteSettings } from '../src/core/noteRound';
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

/** Presses Tab until `target` has the focus, as a player on the keyboard gets there. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab does not reach ' + String(target));
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
  await page.getByRole('button', { name: 'Naar het overzicht' }).click();
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

/** Starts a one-scale round (major, up, silent) from the setup, with these settings on top. */
async function startScale(page: Page, settings: object): Promise<void> {
  await seedStorage(page, {
    prefs: { seenHowTo: true, seenHold: true },
    progress: { scales: { settings: { keyMode: 'one', types: ['major'], direction: 'up', write: 'signs', showSteps: true, playNotes: false, ...settings }, stars: {} } },
  });
  await page.goto('./#/scales/setup');
  // A fresh load, so the app reads the settings just seeded (a new hash alone keeps the app and its settings).
  await page.reload();
  await page.getByRole('button', { name: 'Start · 1 scale' }).click();
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
  await expect(hint).toBeDisabled();
  await page.keyboard.press('0');
  await expect(feedback).toHaveText('Not C. From B, go up a whole step (skip one key).');
  await expect(page.locator('.ssign.is-wrong')).toHaveCount(1);
  await expect(hint).toBeEnabled();
  await hint.click();
  await expect(feedback).toHaveText('Hint: from B the step up is W, a whole step (skip one key).');
  await page.keyboard.press('=');
  await expect(feedback).toHaveText('Which sign does D get?');
});

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
});
