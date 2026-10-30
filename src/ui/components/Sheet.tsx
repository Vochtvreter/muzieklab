/**
 * Bottom sheet (phone, tablet) or centred dialog (desktop) on a backdrop. Opening slides up 32 px (dialog: 8 px)
 * and fades in, 320 ms; closing plays it in reverse, 240 ms, while the backdrop fades. Swapping the content
 * (`panelKey`) keeps the backdrop and slides the new panel in. Focus moves into the panel and is trapped there; once
 * the sheet is gone it goes back to the control that opened it, else to `returnFocus`, else to the screen's heading.
 * `low`: the dialog sits low, under the exercise's staff, so the rhythm can be read while it is open.
 */
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { forgetTab } from '../lib/focusModality';
import { focusHeading, focusLost } from '../lib/screenFocus';

interface SheetProps {
  variant: 'sheet' | 'dialog';
  closing: boolean;
  panelKey: string;
  labelledBy: string;
  modal?: boolean;
  maxWidth?: number;
  low?: boolean;
  /** Where focus goes when the sheet closes and no control opened it (it opened by itself), or that one is gone. */
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), a[href], input, textarea, summary, [tabindex]:not([tabindex="-1"])';

export function Sheet({ variant, closing, panelKey, labelledBy, modal = true, maxWidth, low = false, returnFocus, children }: SheetProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus left in the removed panel would fall to the page (screenFocus.ts): it goes back to where it came from. Only
  // when it was lost: a caller that put it somewhere itself (Home's level chip) keeps it there. Before the effect
  // below, which moves focus into the panel.
  const opener = useRef<HTMLElement | null>(null);
  const returnTo = useRef(returnFocus);
  returnTo.current = returnFocus;
  useEffect(() => {
    const active = document.activeElement;
    // Focus already in the panel: the effect's second run in development (StrictMode), which keeps the opener.
    if (active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) opener.current = active;
    return () => {
      if (!focusLost()) return;
      const to = opener.current?.isConnected ? opener.current : returnTo.current?.();
      // Given back by the sheet, not reached with Tab: Space and Enter are the exercise's again (focusModality.ts), so
      // the first Space after Resume is a tap, not Pause pressed again.
      if (to?.isConnected) {
        to.focus({ preventScroll: true });
        forgetTab();
      } else focusHeading();
    };
  }, []);

  // Focus goes to the panel's main action ([data-autofocus], e.g. Resume), else its first control. When that is below
  // what the panel shows (it scrolls: a level-up with several rows on a phone on its side), the panel itself takes
  // focus, so nothing out of sight is focused: its title is read, and Tab goes on to the controls, scrolling to them.
  useEffect(() => {
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    if (!panel || !first) return;
    // Measured against the panel, so its slide-up (a transform on both) does not count.
    const box = panel.getBoundingClientRect();
    const r = first.getBoundingClientRect();
    const shown = r.top >= box.top - 1 && r.bottom <= box.top + panel.clientHeight + 1;
    (shown ? first : panel).focus({ preventScroll: true });
  }, [panelKey]);

  const trap = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    // Only what is shown: a control inside a closed <details> cannot take focus.
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === panelRef.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  // A press on the backdrop (which does not close the sheet) would move the focus to the page, as the backdrop takes
  // none: out of the panel, where the trap above no longer sees Tab, and Shift+Tab reached the screen behind. It stays
  // where it was. A tap sends a mousedown too.
  const keepFocus = (e: MouseEvent<HTMLDivElement>): void => {
    if (!panelRef.current?.contains(e.target as Node)) e.preventDefault();
  };

  const inCls = variant === 'sheet' ? 'm-sheet' : 'm-dialog';
  const outCls = variant === 'sheet' ? 'm-sheet-out' : 'm-dialog-out';
  return (
    <div className={'overlay overlay--' + variant + (low ? ' overlay--low' : '') + ' ' + (closing ? 'm-fade-out' : 'm-in')} onKeyDown={trap} onMouseDown={keepFocus}>
      <div key={panelKey} ref={panelRef} role="dialog" aria-modal={modal} aria-labelledby={labelledBy} tabIndex={-1}
        className={'sheet sheet--' + variant + ' ' + (closing ? outCls : inCls)} style={maxWidth ? { maxWidth } : undefined}>
        {children}
      </div>
    </div>
  );
}
