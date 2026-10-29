/**
 * A tiny hash router: #/, #/path, #/setup, #/play, #/results, #/settings, #/calibrate, #/changelog, Read notes (#/notes, #/notes/key,
 * #/notes/play, #/notes/done), Scales (#/scales, #/scales/setup, #/scales/key, #/scales/play, #/scales/done), Learn (#/learn and a chapter, #/learn/8), and #/dev/render. A `?s=10.2` query names a Learn section.
 * #/learn/practice?s=8.2 starts a section's practice (its practice link, opened in a new tab).
 * Progress (#/progress, and its skill levels #/progress/skills and one skill, #/progress/skills/rhythm).
 * Accounts (BACKEND-PLAN.md §5, §10.1): #/signin, #/invite/<token> and #/reset/<token> (the links an admin sends),
 * #/account, #/privacy, and the admin screens #/admin, #/admin/invite, #/admin/account/<id> and #/admin/deleted.
 * Feedback reports (docs/FEEDBACK-LOOP.md): #/admin/feedback and one report, #/admin/feedback/<id>.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import type { SkillId } from '../game/storage';

export type Route =
  | '/'
  | '/path'
  | '/setup'
  | '/play'
  | '/results'
  | '/settings'
  | '/calibrate'
  | '/changelog'
  | '/notes'
  | '/notes/key'
  | '/notes/play'
  | '/notes/done'
  | '/scales'
  | '/scales/setup'
  | '/scales/key'
  | '/scales/play'
  | '/scales/done'
  | '/learn'
  | '/learn/practice'
  | `/learn/${number}`
  | '/progress'
  | '/progress/skills'
  | `/progress/skills/${SkillId}`
  | '/signin'
  | `/invite/${string}`
  | `/reset/${string}`
  | '/account'
  | '/privacy'
  | '/admin'
  | '/admin/invite'
  | '/admin/deleted'
  | `/admin/account/${string}`
  | '/admin/feedback'
  | `/admin/feedback/${string}`
  | '/dev/render';

const ROUTES: Route[] = [
  '/',
  '/path',
  '/setup',
  '/play',
  '/results',
  '/settings',
  '/calibrate',
  '/changelog',
  '/notes',
  '/notes/key',
  '/notes/play',
  '/notes/done',
  '/scales',
  '/scales/setup',
  '/scales/key',
  '/scales/play',
  '/scales/done',
  '/learn',
  '/learn/practice',
  '/progress',
  '/progress/skills',
  '/signin',
  '/account',
  '/privacy',
  '/admin',
  '/admin/invite',
  '/admin/deleted',
  '/admin/feedback',
  '/dev/render',
];

/**
 * Routes with a parameter. Invite and new-password tokens are base64url (the server makes 32 random bytes: 43 chars);
 * an account's or a feedback report's id is a database id (24 hex characters).
 */
const PATTERNS: RegExp[] = [
  /^\/learn\/\d+$/,
  /^\/progress\/skills\/(rhythm|ear|treble|bass|scales|theory)$/,
  /^\/(invite|reset)\/[A-Za-z0-9_-]{20,128}$/,
  /^\/admin\/account\/[0-9a-fA-F]{24}$/,
  /^\/admin\/feedback\/[0-9a-fA-F]{24}$/,
];

/** '#/play?x' -> '/play'; anything unknown (a token or id that cannot be one) -> '/'. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (PATTERNS.some((p) => p.test(clean))) return clean as Route;
  return (ROUTES as string[]).includes(clean) ? (clean as Route) : '/';
}

/** The parameter after `prefix` ('/invite/abc…' with '/invite/' -> 'abc…'), or null when the route is another one. */
export function routeParam(
  route: Route,
  prefix: '/invite/' | '/reset/' | '/admin/account/' | '/admin/feedback/' | '/learn/' | '/progress/skills/',
): string | null {
  return route.startsWith(prefix) ? route.slice(prefix.length) : null;
}

/** The query part of a hash ('#/learn/10?s=10.2' -> s=10.2). */
export function hashQuery(hash: string): URLSearchParams {
  const i = hash.indexOf('?');
  return new URLSearchParams(i < 0 ? '' : hash.slice(i + 1));
}

/** The current hash, kept up to date (for screens that read its query). */
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => '');
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => parseHash(window.location.hash),
    () => '/' as Route,
  );
}

/**
 * A screen opened with navigate() or a Link keeps, in its place in the history, the address it was opened from; a screen
 * swapped in for it keeps it too (Results for Play at the end, Play for Results on Retry). leave() goes back there.
 */
interface Entry {
  from?: string;
}

export function navigate(to: Route, opts: { replace?: boolean; query?: string } = {}): void {
  const hash = '#' + to + (opts.query ? '?' + opts.query : '');
  if (window.location.hash === hash) return;
  if (opts.replace) {
    window.history.replaceState(window.history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    const from = window.location.hash;
    window.location.hash = hash.slice(1);
    window.history.replaceState({ from } satisfies Entry, '');
  }
}

/** Whether the current screen was opened with navigate() from this address. An address without a hash is Home. */
export function openedFrom(to: Route, query?: string): boolean {
  const from = (window.history.state as Entry | null)?.from;
  return from !== undefined && (from || '#/') === '#' + to + (query ? '?' + query : '');
}

/**
 * Quit: leaves an exercise for `to`, or a screen that is gone once its action is done for the one it belongs under
 * (Results' and Round done's back arrow; Cancel invite and Delete report for their list; Sign in, Sign out everywhere
 * and Delete account for Settings). When it was opened from there (Learn's section, the Read notes setup, the accounts
 * list, Settings), it goes back to it; swapping the screen for it would leave the same address twice in a row in the
 * history, and the browser's Back would then seem to do nothing. Otherwise the screen is swapped for `to`, so Back does
 * not walk into it again. A Key screen's Use leaves it for its setup the same way. An address without a hash is Home.
 */
export function leave(to: Route, query?: string): void {
  if (openedFrom(to, query)) window.history.back();
  else navigate(to, { replace: true, query });
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: Route; query?: string; leaves?: boolean };

/**
 * A real link (<a href="#/…">), so it works with the keyboard, middle-click and screen readers. A plain click goes
 * through navigate(), so the screen it opens knows where it came from (leave()); with `leaves`, the back arrow of a
 * screen that is gone once done (Results, Round done), it leave()s for `to` instead, so the browser's Back does not
 * open the finished screen again. One that opens a new tab or window (Ctrl, Cmd, Shift or Alt), or that its own
 * onClick took, is left to the browser.
 */
export function Link({ to, query, leaves, onClick, ...rest }: LinkProps): JSX.Element {
  const click = (e: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (rest.target && rest.target !== '_self')) return;
    e.preventDefault();
    if (leaves) leave(to, query);
    else navigate(to, { query });
  };
  return <a href={'#' + to + (query ? '?' + query : '')} onClick={click} {...rest} />;
}
