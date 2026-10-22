/**
 * A setup opened from Learn (a section's Practice link, a chapter's Practice button) carries ?from=9.3 or ?from=9, so
 * its back arrow returns to that section or chapter instead of Home. The Key screens pass it along and back.
 */
import { findChapter } from '../learn/chapters';
import { hashQuery, useHash, type Route } from '../router';

export interface LearnReturn {
  to: Route;
  /** 's=9.3': scroll to the section. */
  query?: string;
  chapter: number;
}

/** Where Back goes from a setup opened from Learn; null when it was not opened from Learn. */
export function learnReturn(query: URLSearchParams): LearnReturn | null {
  const from = query.get('from') ?? '';
  const m = /^(\d{1,2})(?:\.\d{1,2})?$/.exec(from);
  const chapter = m ? findChapter(Number(m[1])) : undefined;
  if (!chapter) return null;
  const to: Route = `/learn/${chapter.n}`;
  return chapter.sections.some((s) => s.id === from) ? { to, query: 's=' + from, chapter: chapter.n } : { to, chapter: chapter.n };
}

/** The Learn return of the current screen, and the query that carries it on to the Key screen and back. */
export function useLearnReturn(): { back: LearnReturn | null; carry: string | undefined } {
  const back = learnReturn(hashQuery(useHash()));
  const from = back ? (back.query ? back.query.slice(2) : String(back.chapter)) : null;
  return { back, carry: from ? 'from=' + from : undefined };
}
