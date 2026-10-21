/**
 * A tiny hash router: #/, #/path, #/setup, #/play, #/results, #/settings, #/calibrate, #/changelog, Read notes (#/notes, #/notes/key,
 * #/notes/play, #/notes/done), Scales (#/scales, #/scales/setup, #/scales/key, #/scales/play, #/scales/done), Learn (#/learn and a chapter, #/learn/8), and #/dev/render. A `?s=10.2` query names a Learn section.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

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
  | `/learn/${number}`
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
  '/dev/render',
];

/** '#/play?x' -> '/play'; anything unknown -> '/'. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (/^\/learn\/\d+$/.test(clean)) return clean as Route;
  return (ROUTES as string[]).includes(clean) ? (clean as Route) : '/';
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

export function navigate(to: Route, opts: { replace?: boolean; query?: string } = {}): void {
  const hash = '#' + to + (opts.query ? '?' + opts.query : '');
  if (window.location.hash === hash) return;
  if (opts.replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash.slice(1);
  }
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: Route; query?: string };

/** A real link (<a href="#/…">), so it works with the keyboard, middle-click and screen readers. */
export function Link({ to, query, ...rest }: LinkProps): JSX.Element {
  return <a href={'#' + to + (query ? '?' + query : '')} {...rest} />;
}
