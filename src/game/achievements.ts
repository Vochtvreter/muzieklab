/**
 * Achievements (DESIGN.md §8.3, the Progress tab's five): a 7-day streak, a perfect bar, an Echo with no replays,
 * the first sixteenths at two stars, and two stars at 160 BPM. Each is earned once and keeps the day it was earned
 * (`progress.achievements`). Pure: the store's reducers pass the finished round in.
 */
import { buildTimeline } from '../core/timeline';
import type { Exercise, JudgeResult } from '../core/types';
import { hasSixteenth } from './cells';
import type { EchoPlays } from './stats';
import { ACHIEVEMENT_IDS, shiftDay, type AchievementId, type Progress } from './storage';

/** The achievements in the Progress tab's order; names and descriptions are achievements.{id}.name / .text. */
export const ACHIEVEMENTS: readonly AchievementId[] = ACHIEVEMENT_IDS;
/** Days in a row for the streak achievement. */
export const STREAK_DAYS = 7;
/** The tempo (BPM) Played at 160 BPM needs, or faster. */
export const FAST_TEMPO = 160;

/**
 * The day a 7-day streak was first reached: the 7th day of the first run of STREAK_DAYS practice days in a row, or
 * null. Every device works out the same day from the same practice days, so a streak from before is dated as it
 * happened.
 */
export function streakDay(practiceDays: readonly string[]): string | null {
  const days = [...new Set(practiceDays)].sort();
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && shiftDay(days[i - 1], 1) === days[i] ? run + 1 : 1;
    if (run >= STREAK_DAYS) return days[i];
  }
  return null;
}

/** A bar whose notes (at least one) were all Perfect. */
function perfectBar(exercise: Exercise, result: Pick<JudgeResult, 'notes'>): boolean {
  const judged = new Map(result.notes.map((r) => [r.index, r.judgement]));
  const bars = new Map<number, boolean>();
  for (const note of buildTimeline(exercise).notes) bars.set(note.bar, (bars.get(note.bar) ?? true) && judged.get(note.index) === 'perfect');
  return [...bars.values()].some(Boolean);
}

/**
 * What one finished rhythm round (tap or Echo) earns on its own, whatever was earned before: a perfect bar; ★★★ on an
 * Echo heard only once (`echo`: how it was heard; a replay on the listen card or with Hear again is hearing it again);
 * ★★ with a sixteenth note; ★★ at 160 BPM or faster.
 */
export function roundAchievements(exercise: Exercise, result: Pick<JudgeResult, 'notes' | 'stars'>, echo?: EchoPlays | null): AchievementId[] {
  const out: AchievementId[] = [];
  const stars = result.stars ?? 0;
  if (perfectBar(exercise, result)) out.push('perfectBar');
  if (exercise.settings.mode === 'echo' && echo && echo.replays === 0 && stars >= 3) out.push('noReplays');
  if (stars >= 2 && hasSixteenth(exercise)) out.push('firstSixteenths');
  if (stars >= 2 && exercise.tempo >= FAST_TEMPO) out.push('tempo160');
  return out;
}

/**
 * Progress with the achievements it has newly earned: the 7-day streak (on the day it was reached, streakDay) and
 * `earned` (from roundAchievements) on `today`. Earned ones keep their day. `added` lists the new ones, in order.
 */
export function awardAchievements(p: Progress, today: string, earned: readonly AchievementId[] = []): { progress: Progress; added: AchievementId[] } {
  const add: Partial<Record<AchievementId, string>> = {};
  if (!p.achievements.streak7) {
    const day = streakDay(p.practiceDays);
    if (day) add.streak7 = day;
  }
  for (const id of earned) if (!p.achievements[id]) add[id] = today;
  const added = ACHIEVEMENT_IDS.filter((id) => add[id]);
  if (added.length === 0) return { progress: p, added };
  return { progress: { ...p, achievements: { ...p.achievements, ...add } }, added };
}
