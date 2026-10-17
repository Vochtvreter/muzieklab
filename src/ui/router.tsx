/** A tiny hash router: #/, #/path, #/setup, #/play, #/results, #/settings, #/calibrate (and #/dev/render). */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export type Route = '/' | '/path' | '/setup' | '/play' | '/results' | '/settings' | '/calibrate' | '/dev/render';

const ROUTES: Route[] = ['/', '/path', '/setup', '/play', '/results', '/settings', '/calibrate', '/dev/render'];

/** '#/play?x' -> '/play'; anything unknown -> '/'. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return (ROUTES as string[]).includes(clean) ? (clean as Route) : '/';
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

export function navigate(to: Route, opts: { replace?: boolean } = {}): void {
  const hash = '#' + to;
  if (window.location.hash === hash) return;
  if (opts.replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: Route };

/** A real link (<a href="#/…">), so it works with the keyboard, middle-click and screen readers. */
export function Link({ to, onClick, ...rest }: LinkProps): JSX.Element {
  const handle = (e: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(e);
  };
  return <a href={'#' + to} onClick={handle} {...rest} />;
}
