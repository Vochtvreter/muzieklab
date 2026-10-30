export interface TapHandlers {
  /** Pad or key pressed (first key down); `timeStamp` is event.timeStamp. */
  down(timeStamp: number): void;
  /** Last key / pointer released. */
  up(timeStamp: number): void;
  /** Esc on desktop. */
  pause?(): void;
  /** ? key on desktop. */
  help?(): void;
}

export interface TapInputOptions {
  /**
   * Space and Enter are taps even on a focused button or link. For a running exercise: a control that kept focus
   * after a click (the metronome switch, ?) would otherwise swallow every Space. Esc and ? still reach their handlers.
   */
  claimActivationKeys?: boolean;
  /**
   * With claimActivationKeys: whether this Space or Enter still belongs to the focused control, as on one the player
   * reached with Tab (focusModality.ts keyForTabbedControl).
   */
  leaveToControl?: (e: KeyboardEvent) => boolean;
}

/** Keys that never count as a tap: modifiers, Tab (focus navigation), locks and browser/system keys. */
const IGNORED_KEYS = new Set([
  'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper', 'Fn', 'FnLock',
  'CapsLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock', 'Tab', 'ContextMenu', 'PrintScreen', 'Dead',
]);
/** F1–F24, media / volume / browser keys belong to the browser or the OS. */
const IGNORED_KEY_PATTERN = /^(F\d{1,2}|Audio.*|Media.*|Browser.*|Launch.*)$/;

/**
 * A second key or finger going down while one is held is a new press (rolling fingers on fast notes), unless it comes
 * within this many ms of the held one: then it is the same press played as a chord. A sixteenth at 200 BPM is 75 ms.
 */
export const ROLL_MIN_MS = 50;

const TEXT_INPUT = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const ACTIVATABLE = 'button, a[href], summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"]';

/** Whether a key event is a tap. Returns false when the key belongs to focus or to a focused control. */
export function isTapKey(e: KeyboardEvent, pad: HTMLElement | null, opts: TapInputOptions = {}): boolean {
  if (IGNORED_KEYS.has(e.key) || IGNORED_KEY_PATTERN.test(e.key)) return false;
  // Shortcuts (Ctrl/Cmd/Alt + key) stay with the browser.
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const target = e.target instanceof Element ? e.target : null;
  if (!target || (pad && pad.contains(target))) return true;
  // Typing in a field is never a tap.
  if (target.closest(TEXT_INPUT)) return false;
  // Space/Enter activate a focused button (Pause, ?, Listen…): leave them to it. Other keys still tap.
  if ((e.key === ' ' || e.key === 'Enter') && target.closest(ACTIVATABLE) && (!opts.claimActivationKeys || opts.leaveToControl?.(e))) return false;
  return true;
}

/**
 * Keyboard (any key except Esc and ?, auto-repeat ignored, held until the last key is up) on `window`,
 * and pointer on `pad` (pointerdown/up/cancel with pointer capture). Returns a detach function. §3.1 Input.
 */
export function attachTapInput(pad: HTMLElement | null, handlers: TapHandlers, opts: TapInputOptions = {}): () => void {
  const keys = new Set<string>();
  const pointers = new Set<number>();
  const held = (): boolean => keys.size + pointers.size > 0;

  let pressedAt = 0;
  const press = (add: () => void, timeStamp: number): void => {
    const was = held();
    add();
    if (!held()) return;
    if (!was) {
      pressedAt = timeStamp;
      handlers.down(timeStamp);
    } else if (timeStamp - pressedAt >= ROLL_MIN_MS) {
      // Rolled onto another key or finger: the held note ends here and a new one starts.
      handlers.up(timeStamp);
      pressedAt = timeStamp;
      handlers.down(timeStamp);
    }
  };
  const release = (remove: () => boolean, timeStamp: number): void => {
    if (remove() && !held()) handlers.up(timeStamp);
  };
  const releaseAll = (timeStamp: number): void => {
    const was = held();
    keys.clear();
    for (const id of pointers) {
      try {
        pad?.releasePointerCapture?.(id);
      } catch {
        /* capture already gone */
      }
    }
    pointers.clear();
    if (was) handlers.up(timeStamp);
  };

  const keyId = (e: KeyboardEvent): string => e.code || e.key;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (!e.repeat && handlers.pause) {
        e.preventDefault();
        handlers.pause();
      }
      return;
    }
    if (e.key === '?') {
      if (!e.repeat && handlers.help) {
        e.preventDefault();
        handlers.help();
      }
      return;
    }
    if (!isTapKey(e, pad, opts)) return;
    // Stop Space scrolling, Firefox quick-find on / and ', and button activation on the pad.
    e.preventDefault();
    if (e.repeat) return;
    const id = keyId(e);
    if (keys.has(id)) return; // a repeat that was not flagged
    press(() => keys.add(id), e.timeStamp);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    const id = keyId(e);
    if (!keys.has(id)) return;
    e.preventDefault(); // a Space keyup would otherwise activate a focused pad button
    release(() => keys.delete(id), e.timeStamp);
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointers.has(e.pointerId)) return;
    e.preventDefault(); // no text selection, no emulated mouse events
    try {
      pad?.setPointerCapture?.(e.pointerId);
    } catch {
      /* the pointer may already be gone */
    }
    press(() => pointers.add(e.pointerId), e.timeStamp);
  };

  const onPointerUp = (e: PointerEvent): void => {
    release(() => pointers.delete(e.pointerId), e.timeStamp);
  };

  const onBlur = (e: Event): void => releaseAll(e.timeStamp);
  const onVisibility = (e: Event): void => {
    if (document.visibilityState === 'hidden') releaseAll(e.timeStamp);
  };
  const onContextMenu = (e: Event): void => e.preventDefault(); // long-press menu on touch

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  if (pad) {
    pad.addEventListener('pointerdown', onPointerDown);
    pad.addEventListener('pointerup', onPointerUp);
    pad.addEventListener('pointercancel', onPointerUp);
    // Safety net: if capture is lost without an up/cancel (element removed, capture stolen), release that pointer.
    pad.addEventListener('lostpointercapture', onPointerUp);
    pad.addEventListener('contextmenu', onContextMenu);
  }

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    if (pad) {
      pad.removeEventListener('pointerdown', onPointerDown);
      pad.removeEventListener('pointerup', onPointerUp);
      pad.removeEventListener('pointercancel', onPointerUp);
      pad.removeEventListener('lostpointercapture', onPointerUp);
      pad.removeEventListener('contextmenu', onContextMenu);
    }
    keys.clear();
    pointers.clear();
  };
}
