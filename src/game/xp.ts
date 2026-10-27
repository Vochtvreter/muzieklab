/**
 * XP and levels (DESIGN.md §8.3): one formula on the existing score, levels from total XP, and six ranks.
 * XP = bars × (4 + difficulty) × accuracy, plus a bonus for 3 stars and up and for the day's first daily challenge.
 */
import { DIAMOND, type Exercise, type JudgeResult } from '../core/types';

/** Bonus XP by stars (index = stars, 5 = the diamond). */
const STAR_BONUS = [0, 0, 0, 5, 10, 20];
/** Bonus XP for finishing the day's daily challenge for the first time. */
export const DAILY_BONUS = 20;

/** XP earned by one finished exercise. A run without a single note hit earns nothing. */
export function xpForResult(exercise: Exercise, result: JudgeResult, firstDailyToday = false): number {
  if (!result.notes.some((n) => n.judgement !== 'miss')) return 0;
  const difficulty = Number.isFinite(exercise.difficulty) ? Math.max(0, Math.min(10, exercise.difficulty)) : 0;
  const core = Math.round((exercise.bars.length * (4 + difficulty) * Math.max(0, Math.min(100, result.accuracy))) / 100);
  const stars = result.stars === DIAMOND ? 5 : result.stars;
  return core + (STAR_BONUS[stars] ?? 0) + (firstDailyToday ? DAILY_BONUS : 0);
}

/** XP needed to go from `level` to the next one: 100, 150, 200, … */
export function levelStep(level: number): number {
  return 100 + 50 * (Math.max(1, level) - 1);
}

/** Total XP at which `level` starts (level 1 starts at 0). */
export function levelStart(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += levelStep(l);
  return total;
}

export const RANKS = ['tick', 'count', 'measure', 'groove', 'metronome', 'maestro'] as const;
export type Rank = (typeof RANKS)[number];
/** The level each rank starts at. */
export const RANK_FROM: Record<Rank, number> = { tick: 1, count: 3, measure: 5, groove: 8, metronome: 12, maestro: 16 };

export function rankOf(level: number): Rank {
  let rank: Rank = 'tick';
  for (const r of RANKS) if (level >= RANK_FROM[r]) rank = r;
  return rank;
}

export interface LevelInfo {
  level: number;
  rank: Rank;
  /** XP into the current level, and the XP the level takes. */
  into: number;
  span: number;
  total: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  const total = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (total >= levelStart(level + 1)) level++;
  const start = levelStart(level);
  return { level, rank: rankOf(level), into: total - start, span: levelStep(level), total };
}
