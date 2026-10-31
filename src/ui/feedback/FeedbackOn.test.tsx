// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, type Me } from '../../../shared/api';
import { FEEDBACK_DESCRIPTION_MAX, type FeedbackReport } from '../../../shared/feedback';
import { ACCOUNT_KEY } from '../../game/storage';
import { setLocale } from '../../i18n';
import { resetAccountCheck } from '../account';
import { PasswordField } from '../components/Form';
import { StoreProvider } from '../store';
import { FeedbackOn } from './FeedbackOn';

// Phone width for useBreakpoint; a mouse, and the light theme.
window.matchMedia = (query: string) =>
  ({
    get matches() {
      const min = /min-width: (\d+)px/.exec(query);
      return min ? 390 >= Number(min[1]) : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

const ADMIN: Me = {
  id: '6718f0c2a1b2c3d4e5f60002',
  email: 'ann@example.com',
  name: 'Ann de Vries',
  locale: 'en',
  roles: ['admin'],
  roleNames: {},
  permissions: [...PERMISSIONS],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
  feedbackMode: true,
};
/** A tester: sends feedback, does not review it. */
const TESTER: Me = { ...ADMIN, id: '6718f0c2a1b2c3d4e5f60001', name: 'Sam Jansen', roles: [], permissions: ['self.manage', 'feedback.give'] };
const REPORT_ID = '6718f0c2a1b2c3d4e5f6a001';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let me: Me;
/** POST /feedback's answer. */
let sendStatus: number;
let fetchMock: ReturnType<typeof vi.fn>;
const sent = (): FeedbackReport[] =>
  fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/v1/feedback').map((c) => JSON.parse(String((c[1] as RequestInit).body)) as FeedbackReport);

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  me = ADMIN;
  sendStatus = 201;
  fetchMock = vi.fn((path: string) => {
    if (path === '/api/v1/me') return Promise.resolve(json(200, me));
    if (path === '/api/v1/feedback') return Promise.resolve(sendStatus === 201 ? json(201, { id: REPORT_ID }) : json(sendStatus, { error: 'internal', message: '' }));
    return Promise.resolve(json(404, { error: 'not_found', message: '' }));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
});

/** The tool over a screen with a Start button, which a tap marks (jsdom has no layout: the tap finds the button). */
async function markStart(): Promise<void> {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
  render(
    <StoreProvider>
      <main className="frame">
        <button type="button" className="start-btn">
          Start
        </button>
      </main>
      <FeedbackOn onHide={() => undefined} />
    </StoreProvider>,
  );
  const start = screen.getByRole('button', { name: 'Start' });
  document.elementsFromPoint = () => [start];
  fireEvent.click(screen.getByRole('button', { name: 'Feedback: mark a part of this screen' }));
  tap(screen.getByRole('dialog', { name: /^Click the part you mean/ }));
  await screen.findByRole('dialog', { name: 'Feedback' });
  fireEvent.change(screen.getByPlaceholderText(DESC), { target: { value: 'Start is cut off.' } });
}

/** A tap or click on the marking layer: the pointer goes down and up, then the click that ends it. */
function tap(layer: HTMLElement, pointerType = 'mouse'): void {
  fireEvent.pointerDown(layer, { clientX: 40, clientY: 40, pointerType });
  fireEvent.pointerUp(layer, { clientX: 40, clientY: 40, pointerType });
  fireEvent.click(layer, { clientX: 40, clientY: 40 });
}

const DESC = 'What is wrong here, and what you expect instead';
const FAB = 'Feedback: mark a part of this screen';
const LAYER = /^Click the part you mean/;

describe('Feedback tool: sending a report', () => {
  it('saves it for review: says where an admin reads it, and links a reviewer to it', async () => {
    await markStart();
    expect(screen.getByText(/^Saved for the team to review, with this screen/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const done = await screen.findByRole('dialog', { name: 'Saved for review' });
    expect(within(done).getByText('An admin reads it in Settings → Account → Feedback, and picks what goes on to GitHub.')).toBeTruthy();
    expect(within(done).getByRole('link', { name: 'Review it' }).getAttribute('href')).toBe('#/admin/feedback/' + REPORT_ID);
    expect(within(done).queryByRole('link', { name: /issue|GitHub/i })).toBeNull();
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ kind: 'change', description: 'Start is cut off.', target: { mode: 'element', label: 'button “Start”' } });
  });

  it('someone who does not review feedback gets no link to the report', async () => {
    me = TESTER;
    await markStart();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const done = await screen.findByRole('dialog', { name: 'Saved for review' });
    expect(within(done).queryByRole('link')).toBeNull();
  });

  it('a failure keeps the form with why, without a way to GitHub, and Send tries again', async () => {
    sendStatus = 500;
    await markStart();
    // The first report waits for its answer.
    let answer: (r: Response) => void = () => undefined;
    let held = false;
    const rest = fetchMock.getMockImplementation() as (path: string) => Promise<Response>;
    fetchMock.mockImplementation((path: string) => {
      if (path !== '/api/v1/feedback' || held) return rest(path);
      held = true;
      return new Promise<Response>((resolve) => (answer = resolve));
    });
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    send.focus();
    fireEvent.click(send);
    // While it sends, Send does nothing and keeps the focus: aria-disabled, not disabled, which drops it to the page.
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(sent()).toHaveLength(1);
    await act(async () => answer(json(500, { error: 'internal', message: '' })));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    expect(send.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(send);
    expect(screen.queryByRole('link', { name: /GitHub/ })).toBeNull();
    expect((screen.getByPlaceholderText('What is wrong here, and what you expect instead') as HTMLTextAreaElement).value).toBe('Start is cut off.');
    sendStatus = 201;
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('dialog', { name: 'Saved for review' });
    expect(sent()).toHaveLength(2);
  });

  it('a description that shows nothing (spaces, or a zero-width space pasted in) is none: Send and Copy wait for one', async () => {
    await markStart();
    const area = screen.getByPlaceholderText(DESC);
    const send = (): HTMLButtonElement => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    for (const value of ['   ', '\u200b', ' \u2060\n\u3164 ', '\u2800\u00ad', '\ufff9\ufffa\ufffb']) {
      fireEvent.change(area, { target: { value } });
      expect(send().disabled, JSON.stringify(value)).toBe(true);
      expect((screen.getByRole('button', { name: 'Copy' }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.change(area, { target: { value: '\u200bStart is cut off.' } });
    expect(send().disabled).toBe(false);
  });

  it('the description takes no more than the API stores', async () => {
    await markStart();
    const area = screen.getByPlaceholderText('What is wrong here, and what you expect instead') as HTMLTextAreaElement;
    expect(area.maxLength).toBe(FEEDBACK_DESCRIPTION_MAX);
  });
});

describe('Feedback tool: closing it', () => {
  const fab = (): HTMLElement => screen.getByRole('button', { name: 'Feedback: mark a part of this screen' });
  const mark = (): void => tap(screen.getByRole('dialog', { name: LAYER }));

  it('puts the focus back on the Feedback button: the X, Cancel or Esc while marking', async () => {
    await markStart();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(fab()));

    fireEvent.click(fab());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(fab()));

    fireEvent.click(fab());
    fireEvent.keyDown(screen.getByRole('dialog', { name: /^Click the part you mean/ }), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(fab()));
  });

  it('puts the focus back on the Feedback button: Esc in the form, and Close once it was sent', async () => {
    await markStart();
    fireEvent.keyDown(screen.getByPlaceholderText('What is wrong here, and what you expect instead'), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(fab()));

    fireEvent.click(fab());
    mark();
    fireEvent.change(await screen.findByPlaceholderText('What is wrong here, and what you expect instead'), { target: { value: 'Start is cut off.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const done = await screen.findByRole('dialog', { name: 'Saved for review' });
    fireEvent.click(within(done).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(fab()));
  });

  it('not after Review it, which opens the report instead', async () => {
    await markStart();
    fireEvent.keyDown(screen.getByPlaceholderText('What is wrong here, and what you expect instead'), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(fab()));
    // Esc on the Feedback button closes nothing, and leaves nothing behind for the next close.
    fireEvent.keyDown(fab(), { key: 'Escape' });
    fireEvent.click(fab());
    mark();
    fireEvent.change(await screen.findByPlaceholderText('What is wrong here, and what you expect instead'), { target: { value: 'Start is cut off.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const done = await screen.findByRole('dialog', { name: 'Saved for review' });
    fireEvent.click(within(done).getByRole('link', { name: 'Review it' }));
    await waitFor(() => expect(fab()).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).not.toBe(fab());
  });
});

/** The tool over a screen with a heading and a Start button; nothing marked yet. */
function openTool(): HTMLElement {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
  render(
    <StoreProvider>
      <main className="frame">
        <h1>Free practice</h1>
        <button type="button" className="start-btn">
          Start
        </button>
      </main>
      <FeedbackOn onHide={() => undefined} />
    </StoreProvider>,
  );
  const start = screen.getByRole('button', { name: 'Start' });
  document.elementsFromPoint = () => [start];
  fireEvent.click(screen.getByRole('button', { name: FAB }));
  return screen.getByRole('dialog', { name: LAYER });
}

describe('Feedback tool: marking', () => {
  it('a tap marks the spot on its click, its last event, so the click cannot press what opens under the finger', async () => {
    const layer = openTool();
    fireEvent.pointerDown(layer, { clientX: 40, clientY: 40, pointerType: 'touch' });
    fireEvent.pointerUp(layer, { clientX: 40, clientY: 40, pointerType: 'touch' });
    expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull();
    fireEvent.click(layer, { clientX: 40, clientY: 40 });
    const form = await screen.findByRole('dialog', { name: 'Feedback' });
    expect(within(form).getByText('button “Start”')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(DESC));
  });

  it('a click on the hint bar marks nothing; a drag marks its box', async () => {
    let layer = openTool();
    fireEvent.click(within(layer).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: FAB }));
    layer = screen.getByRole('dialog', { name: LAYER });
    fireEvent.click(within(layer).getByText(LAYER));
    expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull();
    // jsdom has no PointerEvent: these carry where the pointer is.
    const pointer = (type: string, x: number, y: number) => fireEvent(layer, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    pointer('pointerdown', 10, 10);
    pointer('pointermove', 120, 90);
    pointer('pointerup', 120, 90);
    expect(within(await screen.findByRole('dialog', { name: 'Feedback' })).getByText('Marked area')).toBeTruthy();
  });

  it('a short touch drag marks its box on the click the screen still sends for it, so that click presses nothing', async () => {
    const layer = openTool();
    // 10 px: a drag to the tool, a tap to a touch screen, which sends a click after it.
    const pointer = (type: string, x: number) => fireEvent(layer, new MouseEvent(type, { bubbles: true, clientX: x, clientY: 40 }));
    pointer('pointerdown', 40);
    pointer('pointermove', 50);
    pointer('pointerup', 50);
    // The box is drawn, and the layer stays for the click.
    expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull();
    expect(layer.querySelector('.fb-box--drag')).toBeTruthy();
    fireEvent.click(layer, { clientX: 50, clientY: 40 });
    const form = await screen.findByRole('dialog', { name: 'Feedback' });
    expect(within(form).getByText('Marked area')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(DESC));
  });

  it('a longer drag, which a touch screen sends no click for, marks its box a moment after the pointer went up', async () => {
    const layer = openTool();
    fireEvent(layer, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    fireEvent(layer, new MouseEvent('pointerup', { bubbles: true, clientX: 120, clientY: 90 }));
    expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull();
    // Another press meanwhile starts nothing new.
    fireEvent(layer, new MouseEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 200 }));
    fireEvent(layer, new MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 200 }));
    const form = await screen.findByRole('dialog', { name: 'Feedback' });
    expect(within(form).getByText('Marked area')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(DESC));
  });

  it('the hint bar goes to the other edge when tapped, so what it covers can be marked, and comes back', () => {
    const layer = openTool();
    const bar = layer.querySelector('.fb-bar')!;
    const text = within(layer).getByText(LAYER);
    expect(bar.classList.contains('fb-bar--low')).toBe(false);
    tap(text, 'touch');
    expect(bar.classList.contains('fb-bar--low')).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull();
    tap(text, 'touch');
    expect(bar.classList.contains('fb-bar--low')).toBe(false);
    // Its Cancel only cancels.
    fireEvent.click(within(layer).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the keyboard: Tab stays in the marking layer, the arrow keys pick a part, which the bar names, and Enter marks it', async () => {
    // jsdom has no layout: every part shows.
    const proto = Element.prototype as Element & { checkVisibility?: () => boolean };
    const had = proto.checkVisibility;
    proto.checkVisibility = () => true;
    try {
      const layer = openTool();
      const cancel = within(layer).getByRole('button', { name: 'Cancel' });
      expect(document.activeElement).toBe(cancel);
      for (const shiftKey of [false, true]) {
        const from = document.activeElement!;
        const ev = createEvent.keyDown(from, { key: 'Tab', shiftKey });
        fireEvent(from, ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(layer.contains(document.activeElement)).toBe(true);
      }
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      expect(within(layer).getByText('heading “Free practice”')).toBeTruthy();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      expect(within(layer).getByText('button “Start”')).toBeTruthy();
      expect(within(layer).queryByText('heading “Free practice”')).toBeNull();
      // From the last part, on to the first again; and back.
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      expect(within(layer).getByText('heading “Free practice”')).toBeTruthy();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
      expect(within(layer).getByText('button “Start”')).toBeTruthy();
      // Tab goes between the picked part and Cancel, both in the layer.
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(document.activeElement).toBe(cancel);
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(document.activeElement).toBe(layer);
      fireEvent.keyDown(layer, { key: 'Enter' });
      const form = await screen.findByRole('dialog', { name: 'Feedback' });
      expect(within(form).getByText('button “Start”')).toBeTruthy();
    } finally {
      proto.checkVisibility = had;
    }
  });

  it('in Dutch, the bar and the form name the part in Dutch; the report keeps it in English, as its issue', async () => {
    const proto = Element.prototype as Element & { checkVisibility?: () => boolean };
    const had = proto.checkVisibility;
    proto.checkVisibility = () => true;
    try {
      setLocale('nl');
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
      render(
        <StoreProvider>
          <main className="frame">
            <h1>Vrij oefenen</h1>
            <button type="button">Start</button>
          </main>
          <FeedbackOn onHide={() => undefined} />
        </StoreProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Feedback: markeer een deel van dit scherm' }));
      const layer = screen.getByRole('dialog', { name: /^Klik op het deel dat je bedoelt/ });
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      expect(within(layer).getByText('kop “Vrij oefenen”')).toBeTruthy();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      expect(within(layer).getByText('knop “Start”')).toBeTruthy();
      fireEvent.keyDown(layer, { key: 'Enter' });
      const form = await screen.findByRole('dialog', { name: 'Feedback' });
      expect(within(form).getByText('knop “Start”')).toBeTruthy();
      fireEvent.change(form.querySelector('textarea')!, { target: { value: 'Start staat te laag.' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Versturen' }));
      await waitFor(() => expect(sent()).toHaveLength(1));
      expect(sent()[0].target.label).toBe('button “Start”');
    } finally {
      proto.checkVisibility = had;
    }
  });

  it('a tap on a password field marks the field by its label, without what was typed in it', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
    function Screen(): JSX.Element {
      const [pw, setPw] = useState('');
      return (
        <main className="frame">
          <PasswordField label="New password" autoComplete="new-password" value={pw} onChange={setPw} />
        </main>
      );
    }
    render(
      <StoreProvider>
        <Screen />
        <FeedbackOn onHide={() => undefined} />
      </StoreProvider>,
    );
    const input = screen.getByLabelText('New password');
    fireEvent.change(input, { target: { value: 'pw-secret-typed' } });
    // React keeps it in the attribute too, which the report's markup would copy.
    expect(input.getAttribute('value')).toBe('pw-secret-typed');
    document.elementsFromPoint = () => [input];
    fireEvent.click(screen.getByRole('button', { name: FAB }));
    tap(screen.getByRole('dialog', { name: LAYER }));
    const form = await screen.findByRole('dialog', { name: 'Feedback' });
    expect(within(form).getByText('field “New password”')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(DESC), { target: { value: 'The rules are hard to read.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(JSON.stringify(sent()[0])).not.toContain('pw-secret');
    expect(sent()[0].target).toMatchObject({ label: 'field “New password”', text: '' });
  });
});

describe('Feedback tool: Mark again', () => {
  const field = (placeholder: string): HTMLInputElement => screen.getByPlaceholderText(placeholder) as HTMLInputElement;
  const layer = (): HTMLElement => screen.getByRole('dialog', { name: LAYER });
  const kept = async (): Promise<void> => {
    await screen.findByRole('dialog', { name: 'Feedback' });
    expect(field(DESC).value).toBe('Start is cut off.');
    expect(field('A short summary (optional)').value).toBe('Cut off');
    expect(screen.getByRole('button', { name: 'Bug' }).getAttribute('aria-pressed')).toBe('true');
  };

  it('keeps the kind, title and description typed; Cancel and Esc while marking again go back to the form', async () => {
    await markStart();
    fireEvent.click(screen.getByRole('button', { name: 'Bug' }));
    fireEvent.change(field('A short summary (optional)'), { target: { value: 'Cut off' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark again' }));
    tap(layer());
    await kept();

    fireEvent.click(screen.getByRole('button', { name: 'Mark again' }));
    fireEvent.click(within(layer()).getByRole('button', { name: 'Cancel' }));
    await kept();
    fireEvent.click(screen.getByRole('button', { name: 'Mark again' }));
    fireEvent.keyDown(layer(), { key: 'Escape' });
    await kept();
    expect(screen.queryByRole('dialog', { name: LAYER })).toBeNull();

    // Once it is sent, Mark another starts a new report, empty; so does the Feedback button.
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark another' }));
    tap(layer());
    await screen.findByRole('dialog', { name: 'Feedback' });
    expect(field(DESC).value).toBe('');
    expect(screen.getByRole('button', { name: 'Change' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(field(DESC), { target: { value: 'Not sent.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByRole('button', { name: FAB })).toBeTruthy());
    // Cancel while marking a new report closes the tool, as ever.
    fireEvent.click(screen.getByRole('button', { name: FAB }));
    fireEvent.click(within(layer()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: FAB }));
    tap(layer());
    await screen.findByRole('dialog', { name: 'Feedback' });
    expect(field(DESC).value).toBe('');
    expect(sent()).toHaveLength(1);
  });
});

describe('Feedback tool: Copy', () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  afterEach(() => {
    delete (window.navigator as { clipboard?: unknown }).clipboard;
  });

  it('says Copied for 2 s, and Copy again as soon as the report changes', async () => {
    await markStart();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('button', { name: 'Copied' });
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^# Change request: button “Start” on /));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy(), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('button', { name: 'Copied' });
    fireEvent.change(screen.getByPlaceholderText(DESC), { target: { value: 'Start is cut off on a phone.' } });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  }, 10_000);

  it('where copying is refused, the Markdown shows to copy by hand', async () => {
    writeText.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    await markStart();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const markdown = (await screen.findByLabelText('Markdown')) as HTMLTextAreaElement;
    expect(markdown.value).toMatch(/^# Change request: button “Start” on [\s\S]*Start is cut off\./);
    // With its own Copy, which selects it where the clipboard is refused.
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(2);
  });
});
