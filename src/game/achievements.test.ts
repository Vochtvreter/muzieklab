import { DEFAULT_SETTINGS } from '../core/defaults';
import { getMeter } from '../core/meters';
import type { Exercise, JudgeResult, NoteResult, RhythmEvent, Settings } from '../core/types';
import { ACHIEVEMENTS, awardAchievements, roundAchievements, streakDay } from './achievements';
import { ACHIEVEMENT_IDS, defaultProgress, shiftDay } from './storage';

const note = (start: number, duration: number): RhythmEvent => ({ start, duration, kind: 'note' });
const quarters = (): RhythmEvent[] => [note(0, 48), note(48, 48), note(96, 48), note(144, 48)];
const sixteenths = (): RhythmEvent[] => [note(0, 12), note(12, 12), note(24, 12), note(36, 12), note(48, 48), note(96, 96)];

function exercise(bars: RhythmEvent[][], settings: Partial<Settings> = {}, tempo = 80): Exercise {
  return { seed: 1, settings: { ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'sixteenth'], ...settings }, meter: getMeter('4/4'), tempo, bars: bars.map((events) => ({ events })), form: 'a', difficulty: 3 };
}
const result = (judgements: NoteResult['judgement'][], stars: JudgeResult['stars']): Pick<JudgeResult, 'notes' | 'stars'> => ({
  notes: judgements.map((judgement, index) => ({ index, judgement, offsetMs: 0, hold: null, releaseOffsetMs: null, tap: null })),
  stars,
});

/** `n` consecutive dates from `from`. */
const run = (from: string, n: number): string[] => Array.from({ length: n }, (_, i) => shiftDay(from, i));

describe('streakDay', () => {
  it('is the 7th day of the first run of 7 practice days in a row', () => {
    expect(streakDay(run('2026-10-01', 6))).toBeNull();
    expect(streakDay(run('2026-10-01', 7))).toBe('2026-10-07');
    expect(streakDay([...run('2026-09-01', 5), ...run('2026-09-10', 9), ...run('2026-10-01', 7)])).toBe('2026-09-16');
    // Across a month and a DST change, in any order, with repeats.
    expect(streakDay([...run('2026-10-22', 7)].reverse().concat('2026-10-23'))).toBe('2026-10-28');
    expect(streakDay([])).toBeNull();
  });
});

describe('roundAchievements', () => {
  const two = exercise([quarters(), quarters()]);

  it('a bar with every note Perfect', () => {
    expect(roundAchievements(two, result(['great', 'perfect', 'perfect', 'perfect', 'perfect', 'perfect', 'perfect', 'perfect'], 3))).toEqual(['perfectBar']);
    expect(roundAchievements(two, result(['great', 'perfect', 'perfect', 'perfect', 'perfect', 'perfect', 'perfect', 'good'], 3))).toEqual([]);
    // A bar of rest has no notes: it is no perfect bar.
    const rests = exercise([[{ start: 0, duration: 192, kind: 'rest' }], quarters()]);
    expect(roundAchievements(rests, result(['good', 'perfect', 'perfect', 'perfect'], 2))).toEqual([]);
  });

  it('an Echo at ★★★ heard once', () => {
    const echo = exercise([quarters(), quarters()], { mode: 'echo' });
    const r = result(['great', 'great', 'great', 'great', 'great', 'great', 'great', 'good'], 3);
    expect(roundAchievements(echo, r, { plays: 1, replays: 0 })).toEqual(['noReplays']);
    expect(roundAchievements(echo, r, { plays: 2, replays: 1 })).toEqual([]);
    expect(roundAchievements(echo, { ...r, stars: 2 }, { plays: 1, replays: 0 })).toEqual([]);
    expect(roundAchievements(echo, r)).toEqual([]);
    // Tap mode is not Echo.
    expect(roundAchievements(two, r, { plays: 1, replays: 0 })).toEqual([]);
  });

  it('★★ on a rhythm with sixteenths, and ★★ at 160 BPM or faster', () => {
    const r = (stars: JudgeResult['stars']) => result(['good', 'good', 'good', 'good', 'good', 'good'], stars);
    expect(roundAchievements(exercise([sixteenths()]), r(2))).toEqual(['firstSixteenths']);
    expect(roundAchievements(exercise([sixteenths()]), r(1))).toEqual([]);
    const fast = exercise([quarters()], {}, 160);
    expect(roundAchievements(fast, result(['good', 'good', 'good', 'good'], 2))).toEqual(['tempo160']);
    expect(roundAchievements(exercise([quarters()], {}, 159), result(['good', 'good', 'good', 'good'], 4))).toEqual([]);
    // The diamond is more than two stars.
    expect(roundAchievements(fast, result(['perfect', 'perfect', 'perfect', 'perfect'], 5))).toEqual(['perfectBar', 'tempo160']);
  });
});

describe('awardAchievements', () => {
  it('keeps the day each was first earned, and lists the new ones in order', () => {
    const first = awardAchievements(defaultProgress(), '2026-10-20', ['tempo160', 'perfectBar']);
    expect(first.added).toEqual(['perfectBar', 'tempo160']);
    expect(first.progress.achievements).toEqual({ perfectBar: '2026-10-20', tempo160: '2026-10-20' });
    const again = awardAchievements(first.progress, '2026-10-25', ['perfectBar']);
    expect(again.added).toEqual([]);
    expect(again.progress).toBe(first.progress);
  });

  it('dates a 7-day streak from before on the day it was reached', () => {
    const p = { ...defaultProgress(), practiceDays: [...run('2026-09-01', 8), '2026-10-24'] };
    const { progress, added } = awardAchievements(p, '2026-10-25');
    expect(added).toEqual(['streak7']);
    expect(progress.achievements).toEqual({ streak7: '2026-09-07' });
    // Reached today: today.
    expect(awardAchievements({ ...defaultProgress(), practiceDays: run('2026-10-19', 7) }, '2026-10-25').progress.achievements).toEqual({ streak7: '2026-10-25' });
    expect(awardAchievements({ ...defaultProgress(), practiceDays: run('2026-10-19', 6) }, '2026-10-25').added).toEqual([]);
  });

  it('lists the five in the Progress tab’s order', () => {
    expect(ACHIEVEMENTS).toEqual(ACHIEVEMENT_IDS);
    expect(ACHIEVEMENTS).toEqual(['streak7', 'perfectBar', 'noReplays', 'firstSixteenths', 'tempo160']);
  });
});
