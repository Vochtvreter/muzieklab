import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MutableRefObject } from 'react';

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

/**
 * A phone in portrait under 700 px tall: a phone browser's screen (DESIGN.md §9: 390 × 664 on an iPhone 14 in Safari).
 * The CSS tightens gaps and paddings there with the same query, and Read notes draws a staff with ledger lines smaller.
 */
export const SHORT_PHONE = '(max-width: 699.98px) and (max-height: 699.98px) and (orientation: portrait)';

/**
 * A phone in portrait under 600 px tall: what a phone browser leaves of a small phone under its toolbars (DESIGN.md §9:
 * 375 × 553 on an iPhone SE in Safari). Exercise screens draw their staff smaller there; the CSS tightens the rest with
 * the same query, and from 700 px down already tightens gaps and paddings (SHORT_PHONE).
 */
export const SHORTER_PHONE = '(max-width: 699.98px) and (max-height: 599.98px) and (orientation: portrait)';

/** DESIGN.md §9 breakpoints: phone < 700 px, tablet 700–1099 px, desktop ≥ 1100 px. */
export function useBreakpoint(): Breakpoint {
  const desktop = useMediaQuery('(min-width: 1100px)');
  const tablet = useMediaQuery('(min-width: 700px)');
  return desktop ? 'desktop' : tablet ? 'tablet' : 'phone';
}

/** A phone on its side: tablet-wide, but too short for the tablet layout (DESIGN.md §9; the CSS uses the same query). */
export const PHONE_LANDSCAPE = '(orientation: landscape) and (max-height: 560px)';

/**
 * The exercise screens' layout (Play, Echo, Read notes, Scales): the breakpoint, except that a phone on its side keeps
 * the phone layout, which its CSS lays out in two columns.
 */
export function useExerciseLayout(): Breakpoint {
  const bp = useBreakpoint();
  const phoneLandscape = useMediaQuery(PHONE_LANDSCAPE);
  return bp === 'tablet' && phoneLandscape ? 'phone' : bp;
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
  // Kept as it renders, not in the effect: React runs an effect's update a task later, so a value closed before then
  // (a tap whose click closes what it opened) would come back after closing, and stay.
  if (value !== null && value !== shown) setShown(value);
  useEffect(() => {
    if (value !== null) {
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

/** A ref that is true while the component is mounted: a request that answers after the screen was left changes nothing. */
export function useMounted(): MutableRefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
