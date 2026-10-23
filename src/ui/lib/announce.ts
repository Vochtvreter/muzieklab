/**
 * Polite announcements for screen readers (WCAG 4.1.3): what happened after an action that leaves no focus on its
 * result (Delete account and Sign out everywhere end on Settings, Cancel invite on the accounts list, a search or
 * filter changes the list). The Announcer (components/Announcer.tsx) is one live region that is in the page from the
 * start, so its text changing is read; a role="status" that is inserted already holding its text is not read by every
 * screen reader.
 */
type Listener = (text: string) => void;

let listener: Listener | null = null;

/** Says `text` politely (after what is being read). Without an Announcer on the page (unit tests), nothing happens. */
export function announce(text: string): void {
  if (text) listener?.(text);
}

/** The Announcer's hook-up: it shows each text that is announced. Returns the way to stop. */
export function listenToAnnouncements(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
