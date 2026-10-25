/**
 * Bottom sheet (phone, tablet) or centred dialog (desktop) on a backdrop. Opening slides up 32 px (dialog: 8 px)
 * and fades in, 320 ms; closing plays it in reverse, 240 ms, while the backdrop fades. Swapping the content
 * (`panelKey`) keeps the backdrop and slides the new panel in. Focus moves into the panel and is trapped there.
 * `low`: the dialog sits low, under the exercise's staff, so the rhythm can be read while it is open.
 */
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface SheetProps {
  variant: 'sheet' | 'dialog';
  closing: boolean;
  panelKey: string;
  labelledBy: string;
  modal?: boolean;
  maxWidth?: number;
  low?: boolean;
  children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), a[href], input, textarea, summary, [tabindex]:not([tabindex="-1"])';

export function Sheet({ variant, closing, panelKey, labelledBy, modal = true, maxWidth, low = false, children }: SheetProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus goes to the panel's main action ([data-autofocus], e.g. Resume), else its first control.
  useEffect(() => {
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
  }, [panelKey]);

  const trap = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    // Only what is shown: a control inside a closed <details> cannot take focus.
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  const inCls = variant === 'sheet' ? 'm-sheet' : 'm-dialog';
  const outCls = variant === 'sheet' ? 'm-sheet-out' : 'm-dialog-out';
  return (
    <div className={'overlay overlay--' + variant + (low ? ' overlay--low' : '') + ' ' + (closing ? 'm-fade-out' : 'm-in')} onKeyDown={trap}>
      <div key={panelKey} ref={panelRef} role="dialog" aria-modal={modal} aria-labelledby={labelledBy}
        className={'sheet sheet--' + variant + ' ' + (closing ? outCls : inCls)} style={maxWidth ? { maxWidth } : undefined}>
        {children}
      </div>
    </div>
  );
}
