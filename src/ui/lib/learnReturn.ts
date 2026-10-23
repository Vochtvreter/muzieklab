/**
 * A screen opened from Learn carries ?from=9.3 or ?from=9, so its back arrow (or Quit) returns to that section or
 * chapter instead of Home: the exercise or Read notes round a section's Practice link starts, its Results or Round
 * done, and the setup opened from there or from a chapter's Practice button. The Key screens pass it along and back,
 * and so does Calibrate opened from Results.
 */
import { findChapter } from '../learn/chapters';
import { hashQuery, useHash, type Route } from '../router';

export interface LearnReturn {
  to: Route;
  /** 's=9.3': scroll to the section. */
  query?: string;
  chapter: number;
}

/** Where Back goes from a screen opened from Learn; null when it was not opened from Learn. */
export function learnReturn(query: URLSearchParams): LearnReturn | null {
  const from = query.get('from') ?? '';
  const m = /^(\d{1,2})(?:\.\d{1,2})?$/.exec(from);
  const chapter = m ? findChapter(Number(m[1])) : undefined;
  if (!chapter) return null;
  const to: Route = `/learn/${chapter.n}`;
  return chapter.sections.some((s) => s.id === from) ? { to, query: 's=' + from, chapter: chapter.n } : { to, chapter: chapter.n };
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
  const back = learnReturn(hashQuery(useHash()));
  const from = back ? (back.query ? back.query.slice(2) : String(back.chapter)) : null;
  return { back, carry: from ? 'from=' + from : undefined };
}
