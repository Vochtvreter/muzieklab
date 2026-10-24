/**
 * The app's one polite live region (ui/lib/announce.ts): visually hidden, in the page from the first render, outside
 * the screens (a route change or the language switch does not replace it). A text is set a moment after the region is
 * cleared, so the same words twice are read twice, and it is cleared again after a while, so it does not stay in the
 * page for someone reading it line by line.
 */
import { useEffect, useState } from 'react';
import { listenToAnnouncements } from '../lib/announce';

/** From clearing the region to setting the new text. */
export const ANNOUNCE_DELAY_MS = 100;
/** How long a text stays in the region. */
export const ANNOUNCE_KEEP_MS = 7000;

export function Announcer(): JSX.Element {
  const [text, setText] = useState('');
  useEffect(() => {
    let show = 0;
    let clear = 0;
    const stop = listenToAnnouncements((next) => {
      window.clearTimeout(show);
      window.clearTimeout(clear);
      setText('');
      show = window.setTimeout(() => {
        setText(next);
        clear = window.setTimeout(() => setText(''), ANNOUNCE_KEEP_MS);
      }, ANNOUNCE_DELAY_MS);
    });
    return () => {
      stop();
      window.clearTimeout(show);
      window.clearTimeout(clear);
    };
  }, []);
  return (
    // aria-live without role="status": the screens' own status lines stay the only ones a test or tool finds by role.
    <div id="announcer" className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
