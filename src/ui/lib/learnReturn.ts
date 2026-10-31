/**
 * A screen opened from Learn carries ?from=9.3 or ?from=9, so its back arrow (or Quit) returns to that section or
 * chapter instead of Home: the exercise or Read notes round a section's Practice link starts, its Results or Round
 * done, and the setup opened from there or from a chapter's Practice button (chapter 11's opens the Scales tab). So
 * does the round that setup's Start begins, and its Results or Round done: that round's Quit goes back to the setup,
 * and the back arrow of Results or Round done to the section or chapter. The Key screens pass it along and back, and
 * so does Calibrate opened from Results.
 * A setup or the Scales tab opened from Progress keeps its way back the same way: ?from=progress from the Progress
 * tab, ?from=skills from Skill levels' Focus next, ?from=skills.ear from a skill's own screen.
 */
import { SKILL_IDS, type SkillId } from '../../game/storage';
import { t } from '../../i18n';
import { findChapter } from '../learn/chapters';
import { hashQuery, useHash, type Route } from '../router';

export interface LearnReturn {
  to: Route;
  /** 's=9.3': scroll to the section; 's=check': to the chapter's quick check, at its end. */
  query?: string;
  /** The back arrow's name: "Back to chapter 9", "Back to Progress". */
  label: string;
  /** The tab a screen with the app's navigation marks current (the Scales tab): Learn, or Progress. */
  tab: Route;
}

/** The query a practice button on the Progress tab opens its screen with. */
export const FROM_PROGRESS = 'from=progress';
/** The same for a skill's button: on Skill levels (Focus next), or on that skill's own screen (`from=skills.ear`). */
export const fromSkills = (skill?: SkillId): string => 'from=skills' + (skill ? '.' + skill : '');

/** Opened from the Progress tab, Skill levels or one skill's screen; else null. */
function progressReturn(from: string): LearnReturn | null {
  if (from === 'progress') return { to: '/progress', label: t('skills.list.back'), tab: '/progress' };
  if (from === 'skills') return { to: '/progress/skills', label: t('skills.detail.back'), tab: '/progress' };
  const skill = SKILL_IDS.find((id) => 'skills.' + id === from);
  if (!skill) return null;
  return { to: `/progress/skills/${skill}`, label: t('skills.detail.backToSkill', { name: t(`skills.name.${skill}`) }), tab: '/progress' };
}

/**
 * Where Back goes from a screen opened from Learn or Progress; null when it was opened from neither. A chapter's own
 * Practice button (`from=9`) is at its end, beside the quick check, so Back returns there and not to the chapter's top.
 */
export function learnReturn(query: URLSearchParams): LearnReturn | null {
  const from = query.get('from') ?? '';
  const m = /^(\d{1,2})(?:\.\d{1,2})?$/.exec(from);
  const chapter = m ? findChapter(Number(m[1])) : undefined;
  if (!chapter) return progressReturn(from);
  const to: Route = `/learn/${chapter.n}`;
  const back = { to, label: t('learn.backToChapter', { n: chapter.n }), tab: '/learn' as const };
  if (chapter.sections.some((s) => s.id === from)) return { ...back, query: 's=' + from };
  return from === m?.[1] ? { ...back, query: 's=check' } : back;
}

/**
 * Calibrate opened from Results: its own `from` says where it returns (`from=results`), so Results' Learn return goes
 * along as `learn=7.3` (`carry` is Results' `from=7.3`).
 */
export function calibrateQuery(carry: string | undefined): string {
  return 'from=results' + (carry ? '&learn=' + carry.slice('from='.length) : '');
}

/** Results' query when Calibrate returns to it: the Learn return it passed on (`from=7.3`), if any. */
export function calibrateBackQuery(query: URLSearchParams): string | undefined {
  const learn = query.get('learn') ?? '';
  return learnReturn(new URLSearchParams({ from: learn })) ? 'from=' + learn : undefined;
}

/** The Learn return of the current screen, and the query that carries it on to the Key screen and back. */
export function useLearnReturn(): { back: LearnReturn | null; carry: string | undefined } {
  const query = hashQuery(useHash());
  const back = learnReturn(query);
  return { back, carry: back ? 'from=' + query.get('from') : undefined };
}
