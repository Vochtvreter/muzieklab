// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../../shared/api';
import { ACCOUNT_KEY } from '../../game/storage';
import { resetAccountCheck } from '../account';
import { StoreProvider, useStore } from '../store';
import { FeedbackTool } from './FeedbackTool';

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

/** A tester: sends feedback, does not review it. */
const TESTER: Me = {
  id: '6718f0c2a1b2c3d4e5f60001',
  email: 'sam@example.com',
  name: 'Sam Jansen',
  locale: 'en',
  roles: [],
  roleNames: {},
  permissions: ['self.manage', 'feedback.give'],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
  feedbackMode: false,
};
const FAB = 'Feedback: mark a part of this screen';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** GET /me's answer. */
let me: Me;
let fetchMock: ReturnType<typeof vi.fn>;
const asked = (): number => fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/v1/me').length;

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  me = TESTER;
  fetchMock = vi.fn((path: string) => Promise.resolve(path === '/api/v1/me' ? json(200, me) : json(404, { error: 'not_found', message: '' })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = () =>
  render(
    <StoreProvider>
      <FeedbackTool />
    </StoreProvider>,
  );

describe('Feedback tool: feedback mode', () => {
  it('turned on since the device last asked: the app asks GET /me when it starts, and the button shows', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(TESTER));
    me = { ...TESTER, feedbackMode: true };
    open();
    await screen.findByRole('button', { name: FAB }, { timeout: 5000 });
    expect(asked()).toBe(1);
  });

  it('turned off since: the button the device kept goes once GET /me says so', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ ...TESTER, feedbackMode: true }));
    // GET /me answers only once the kept account's button is there.
    let reply = (): void => undefined;
    const held = new Promise<void>((resolve) => (reply = resolve));
    fetchMock.mockImplementation((path: string) => held.then(() => (path === '/api/v1/me' ? json(200, me) : json(404, { error: 'not_found', message: '' }))));
    open();
    await screen.findByRole('button', { name: FAB }, { timeout: 5000 });
    reply();
    await waitFor(() => expect(screen.queryByRole('button', { name: FAB })).toBeNull());
    expect(asked()).toBe(1);
  });

  it('a player who never signed in sends no request, and sees no button', async () => {
    open();
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: FAB })).toBeNull();
  });
});

describe('Feedback tool: the session ends while the sheet is open', () => {
  /** What Sign in will say, and a way to put it away, as Settings does once the refusal comes. */
  function Notice(): JSX.Element {
    const { state, dispatch } = useStore();
    return (
      <button type="button" data-notice={state.account.notice ?? ''} onClick={() => dispatch({ type: 'accountNotice', notice: null })}>
        Put the notice away
      </button>
    );
  }

  /** A report sent after a new password on another device: the report and the renewal both say the session ended. */
  async function sendSignedOut(): Promise<{ form: HTMLElement; desc: HTMLTextAreaElement }> {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(TESTER));
    me = { ...TESTER, feedbackMode: true };
    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(path === '/api/v1/me' ? json(200, me) : json(401, { error: 'unauthenticated', message: '' })),
    );
    render(
      <StoreProvider>
        <main className="frame">
          <button type="button" className="start-btn">
            Start
          </button>
          <Notice />
        </main>
        <FeedbackTool />
      </StoreProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: FAB }, { timeout: 5000 }));
    const start = screen.getByRole('button', { name: 'Start' });
    document.elementsFromPoint = () => [start];
    const layer = screen.getByRole('dialog', { name: /^Click the part you mean/ });
    fireEvent.pointerDown(layer, { clientX: 40, clientY: 40, pointerType: 'mouse' });
    fireEvent.pointerUp(layer, { clientX: 40, clientY: 40, pointerType: 'mouse' });
    fireEvent.click(layer, { clientX: 40, clientY: 40 });
    const form = await screen.findByRole('dialog', { name: 'Feedback' });
    const desc = within(form).getByPlaceholderText('What is wrong here, and what you expect instead') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: 'Start is cut off.' } });
    const send = within(form).getByRole('button', { name: 'Send' });
    send.focus();
    fireEvent.click(send);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("You're signed out. Sign in again to go on."));
    return { form, desc };
  }

  afterEach(() => window.history.replaceState(null, '', window.location.pathname));

  it('Send says so in the sheet and keeps what was typed, with Sign in for Send; the tool goes once it is closed', async () => {
    const { form, desc } = await sendSignedOut();
    expect(screen.getByRole('dialog', { name: 'Feedback' })).toBe(form);
    expect(desc.value).toBe('Start is cut off.');
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/v1/auth/refresh')).toBe(true);
    // Send could only fail again: Sign in takes its place, and the focus Send had.
    expect(within(form).queryByRole('button', { name: 'Send' })).toBeNull();
    const signIn = within(form).getByRole('link', { name: 'Sign in' });
    expect(signIn.getAttribute('href')).toBe('#/signin');
    expect(document.activeElement).toBe(signIn);
    expect(within(form).getByRole('button', { name: 'Copy' }).hasAttribute('disabled')).toBe(false);
    // Signed out meanwhile: closed, the tool and its button go.
    fireEvent.click(within(form).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull());
    expect(screen.queryByRole('button', { name: FAB })).toBeNull();
  });

  it('Sign in closes the tool and opens Sign in, which says nothing was changed, also once Settings put that away', async () => {
    const { form } = await sendSignedOut();
    const notice = screen.getByRole('button', { name: 'Put the notice away' });
    expect(notice.dataset.notice).toBe('sessionEnded');
    fireEvent.click(notice);
    expect(notice.dataset.notice).toBe('');
    fireEvent.click(within(form).getByRole('link', { name: 'Sign in' }));
    expect(window.location.hash).toBe('#/signin');
    expect(notice.dataset.notice).toBe('sessionEnded');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull());
    expect(screen.queryByRole('button', { name: FAB })).toBeNull();
  });
});
