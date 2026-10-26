// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, type Me } from '../../../shared/api';
import type { FeedbackReport } from '../../../shared/feedback';
import { ACCOUNT_KEY } from '../../game/storage';
import { setLocale } from '../../i18n';
import { resetAccountCheck } from '../account';
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
  const layer = screen.getByRole('dialog', { name: /^Click the part you mean/ });
  fireEvent.pointerDown(layer, { clientX: 40, clientY: 40 });
  fireEvent.pointerUp(layer, { clientX: 40, clientY: 40 });
  await screen.findByRole('dialog', { name: 'Feedback' });
  fireEvent.change(screen.getByPlaceholderText('What is wrong here, and what you expect instead'), { target: { value: 'Start is cut off.' } });
}

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
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    expect(screen.queryByRole('link', { name: /GitHub/ })).toBeNull();
    expect((screen.getByPlaceholderText('What is wrong here, and what you expect instead') as HTMLTextAreaElement).value).toBe('Start is cut off.');
    sendStatus = 201;
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('dialog', { name: 'Saved for review' });
    expect(sent()).toHaveLength(2);
  });
});
