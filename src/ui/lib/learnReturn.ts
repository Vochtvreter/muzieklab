/**
 * A screen opened from Learn carries ?from=9.3 or ?from=9, so its back arrow (or Quit) returns to that section or
 * chapter instead of Home: the exercise or Read notes round a section's Practice link starts, its Results or Round
 * done, and the setup opened from there or from a chapter's Practice button (chapter 11's opens the Scales tab). So
 * does the round that setup's Start begins, and its Results or Round done: that round's Quit goes back to the setup,
 * and the back arrow of Results or Round done to the section or chapter. The Key screens pass it along and back, and
 * so does Calibrate opened from Results.
 */
import { findChapter } from '../learn/chapters';
import { hashQuery, useHash, type Route } from '../router';

export interface LearnReturn {
  to: Route;
  /** 's=9.3': scroll to the section; 's=check': to the chapter's quick check, at its end. */
  query?: string;
  chapter: number;
}

/**
 * Where Back goes from a screen opened from Learn; null when it was not opened from Learn. A chapter's own Practice
 * button (`from=9`) is at its end, beside the quick check, so Back returns there and not to the chapter's top.
 */
export function learnReturn(query: URLSearchParams): LearnReturn | null {
  const from = query.get('from') ?? '';
  const m = /^(\d{1,2})(?:\.\d{1,2})?$/.exec(from);
  const chapter = m ? findChapter(Number(m[1])) : undefined;
  if (!chapter) return null;
  const to: Route = `/learn/${chapter.n}`;
  if (chapter.sections.some((s) => s.id === from)) return { to, query: 's=' + from, chapter: chapter.n };
  return from === m?.[1] ? { to, query: 's=check', chapter: chapter.n } : { to, chapter: chapter.n };
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
