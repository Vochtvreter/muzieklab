import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

const lists = new Map<string, MediaQueryList>();

/** One MediaQueryList per query (its `matches` stays live): Play reads several on every frame. */
function mq(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  let m = lists.get(query);
  if (!m) {
    m = window.matchMedia(query);
    lists.set(query, m);
  }
  return m;
}

export function useMediaQuery(query: string): boolean {
  // A stable subscribe function: a new one each render makes React resubscribe, and Play renders every frame.
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = mq(query);
      m?.addEventListener('change', cb);
      return () => m?.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => mq(query)?.matches ?? false, () => false);
}

/** DESIGN.md §9 breakpoints: phone < 700 px, tablet 700–1099 px, desktop ≥ 1100 px. */
export function useBreakpoint(): Breakpoint {
  const desktop = useMediaQuery('(min-width: 1100px)');
  const tablet = useMediaQuery('(min-width: 700px)');
  return desktop ? 'desktop' : tablet ? 'tablet' : 'phone';
}

/**
 * Keyboard hints (Esc, ?, the letter on each key) go with the desktop layout, but not on a touch-only screen that is
 * desktop-wide (a tablet in landscape): it gets the same layout with touch wording.
 */
export function useKeyboardHints(bp: Breakpoint): boolean {
  const touchOnly = useMediaQuery('(hover: none) and (pointer: coarse)');
  return bp === 'desktop' && !touchOnly;
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Today's date (yyyy-mm-dd, local), kept current: it updates when the page comes back into view or the window gets
 * focus, and at midnight, so the streak on an open Home screen does not go stale.
 */
export function useToday(today: () => string): string {
  const [value, setValue] = useState(today);
  useEffect(() => {
    const refresh = (): void => setValue(today());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = window.setTimeout(refresh, midnight + 1000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [today, value]);
  return value;
}

/** Document title per screen. */
export function useDocTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** Keeps a value for `ms` after it turns falsy, so a closing animation can play. */
export function useLingering<T>(value: T | null, ms: number): { shown: T | null; closing: boolean } {
  const [shown, setShown] = useState<T | null>(value);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (value !== null) {
      setShown(value);
      setClosing(false);
      return;
    }
    if (shown === null) return;
    setClosing(true);
    const id = window.setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return { shown: value ?? shown, closing: value === null && closing };
}
