import { useEffect, useState, useSyncExternalStore } from 'react';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

function mq(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = mq(query);
      m?.addEventListener('change', cb);
      return () => m?.removeEventListener('change', cb);
    },
    () => mq(query)?.matches ?? false,
    () => false,
  );
}

/** DESIGN.md §9 breakpoints: phone < 700 px, tablet 700–1099 px, desktop ≥ 1100 px. */
export function useBreakpoint(): Breakpoint {
  const desktop = useMediaQuery('(min-width: 1100px)');
  const tablet = useMediaQuery('(min-width: 700px)');
  return desktop ? 'desktop' : tablet ? 'tablet' : 'phone';
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
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
