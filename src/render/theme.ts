import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Theme tokens used by the notation and the length lane, as [CSS variable, light fallback].
 * The app's theme defines the variables for light and dark (DESIGN.md §9 token table).
 */
export const TOKENS = {
  ink: ['--ink', '#161b1c'],
  staff: ['--staff', '#9aa5a5'],
  /** Perfect / great. */
  hit: ['--good', '#1f8a5b'],
  /** Good (early / late), and the dashed outline of a cut-short hold. */
  early: ['--gold', '#b7791f'],
  miss: ['--miss', '#d64545'],
  slate: ['--slate', '#2f6669'],
  /** Held and silent counts under the notes. */
  muted: ['--muted', '#5a6667'],
  laneNote: ['--lane-note', '#dde4e3'],
  laneGrid: ['--lane-grid', '#e3e8e7'],
  laneBar: ['--lane-bar', '#b9c3c2'],
} as const satisfies Record<string, readonly [string, string]>;

export type TokenName = keyof typeof TOKENS;

/** `var(--x, fallback)` for use in inline styles, so theme switches need no re-render. */
export function cssVar(name: TokenName): string {
  const [v, fallback] = TOKENS[name];
  return `var(${v}, ${fallback})`;
}

/** Resolved colour of a token at an element (for VexFlow, which needs literal colours). */
export function readToken(el: Element, name: TokenName): string {
  const [v, fallback] = TOKENS[name];
  const value = getComputedStyle(el).getPropertyValue(v).trim();
  return value || fallback;
}

/** Width of an element, kept up to date with a ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | SVGElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * A counter that changes whenever the theme may have changed: the system colour scheme, or a class / data
 * attribute / style on <html> or <body>. Components that resolve colours in JS redraw on it.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', bump);
    const mo = new MutationObserver(bump);
    const opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
    mo.observe(document.documentElement, opts);
    if (document.body) mo.observe(document.body, opts);
    return () => {
      mq?.removeEventListener('change', bump);
      mo.disconnect();
    };
  }, []);
  return version;
}
