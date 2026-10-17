/**
 * Home-screen install (DESIGN.md §1). Chrome, Edge and Samsung Internet fire `beforeinstallprompt` once the page is
 * installable; it is kept so Settings can show the browser's own install dialog. iPhone and iPad have no such event:
 * there you add the app from the Share menu, so Settings shows how.
 */
import { useSyncExternalStore } from 'react';

/** The install dialog event (Chromium only, so not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** installed: running from the home screen; prompt: the browser can show its install dialog; ios: Share → Add to Home
 * Screen; manual: install from the browser menu, if it offers one. */
export type InstallState = 'installed' | 'prompt' | 'ios' | 'manual';

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());

function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports itself as a Mac; a Mac has no touch screen.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Listens for the install events. Called once at startup, before React renders, so an early event is not missed. */
export function initInstall(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the event for the Settings button instead of the browser's mini-infobar.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

function getState(): InstallState {
  if (installed || standalone()) return 'installed';
  if (deferred) return 'prompt';
  return isIos() ? 'ios' : 'manual';
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Shows the browser's install dialog; the event can be used only once. */
export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') installed = true;
  notify();
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getState, () => 'manual');
}
