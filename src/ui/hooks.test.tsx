// @vitest-environment jsdom
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useLingering } from './hooks';

/** A sheet that lingers 50 ms after it is closed, with its Open and Close buttons. */
function Lingering(): JSX.Element {
  const [value, setValue] = useState<string | null>(null);
  const { shown, closing } = useLingering(value, 50);
  return (
    <>
      <button type="button" id="open" onClick={() => setValue('sheet')} />
      <button type="button" id="close" onClick={() => setValue(null)} />
      {shown && <p id="shown" className={closing ? 'closing' : 'open'} />}
    </>
  );
}

let root: Root | null = null;
afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = '';
});

describe('useLingering', () => {
  it('closes a value that closes again before the effects after its opening ran: a tap whose click closes what it opened', async () => {
    // Real clicks outside act(), as in the browser: React renders a click at once, and runs an update an effect asks
    // for a task later.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    const host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    root.render(<Lingering />);
    await new Promise((r) => setTimeout(r, 20));
    const click = (id: string): void => void document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    click('open');
    await Promise.resolve();
    click('close');
    await new Promise((r) => setTimeout(r, 200));
    expect(document.getElementById('shown')).toBeNull();

    // The usual way: open, then close a while later; it lingers, closing, then goes.
    click('open');
    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById('shown')?.className).toBe('open');
    click('close');
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('shown')?.className).toBe('closing');
    await new Promise((r) => setTimeout(r, 200));
    expect(document.getElementById('shown')).toBeNull();
  });
});
