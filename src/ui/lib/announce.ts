/**
 * Polite announcements for screen readers (WCAG 4.1.3): what happened after an action that leaves no focus on its
 * result (Delete account and Sign out everywhere end on Settings, Cancel invite on the accounts list, a search or
 * filter changes the list, a Save's line away from its button: every FormDone line, Try again on the note for no answer
 * and on the sync line). The Announcer (components/Announcer.tsx) is one live region that is in the page from the
 * start, so its text changing is read; a role="status" that is inserted already holding its text is not read by every
 * screen reader.
 */
/**
 * What is said: its text, or what gives the text when it is read out, a moment later. That one is in the language the
 * app shows by then: a first sign-in's sync can switch to the account's language in the same tick as it announces.
 */
export type Announcement = string | (() => string);
type Listener = (text: Announcement) => void;

let listener: Listener | null = null;

/** Says `text` politely (after what is being read). Without an Announcer on the page (unit tests), nothing happens. */
export function announce(text: Announcement): void {
  if (text) listener?.(text);
}

/** The words of an announcement, now. */
export function spoken(text: Announcement): string {
  return typeof text === 'function' ? text() : text;
}

/** The Announcer's hook-up: it shows each text that is announced. Returns the way to stop. */
export function listenToAnnouncements(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
