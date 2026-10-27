// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, type Me } from '../../../../shared/api';
import type { FeedbackDetail, FeedbackListResponse, FeedbackMode, FeedbackReport, FeedbackStatus, FeedbackSummary } from '../../../../shared/feedback';
import { ACCOUNT_KEY } from '../../../game/storage';
import { setLocale } from '../../../i18n';
import { resetAccountCheck } from '../../account';
import { ANNOUNCE_DELAY_MS, Announcer } from '../../components/Announcer';
import { clearListNotice } from '../../lib/admin';
import { StoreProvider } from '../../store';
import { AdminFeedback, resetFeedbackFilter } from './AdminFeedback';
import { AdminFeedbackReport } from './AdminFeedbackReport';

// Phone width for useBreakpoint (the hook keeps one MediaQueryList per query).
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
const MEMBER: Me = { ...ADMIN, id: '6718f0c2a1b2c3d4e5f60001', name: 'Sam Jansen', email: 'sam@example.com', roles: [], permissions: ['self.manage', 'feedback.give'] };
/** A teacher whose role was given feedback.review: no Accounts, but the reports. */
const REVIEWER: Me = { ...MEMBER, roles: ['teacher'], permissions: ['self.manage', 'class.create', 'feedback.review'] };

const ID_A = '6718f0c2a1b2c3d4e5f6a001';
const ID_B = '6718f0c2a1b2c3d4e5f6a002';
const REPORT: FeedbackReport = {
  kind: 'change',
  title: 'Start is cut off',
  description: 'The Start button is cut off at the bottom.\nIt should fit above the tab bar.',
  target: {
    mode: 'element',
    selector: 'main.frame > button.start-btn',
    label: 'button “Start”',
    text: 'Start',
    html: '<button class="start-btn">Start</button>',
    rect: { x: 12.4, y: 300, width: 366, height: 52.2 },
    scroll: { x: 0, y: 0 },
  },
  context: {
    version: '0.17.0',
    url: 'https://test.vivanova.app/#/settings',
    route: '/settings',
    viewport: { width: 390, height: 844, dpr: 3 },
    breakpoint: 'phone',
    orientation: 'portrait',
    pointer: 'coarse',
    theme: { setting: 'system', shown: 'dark' },
    locale: 'en',
    userAgent: 'Mozilla/5.0 (iPhone)',
    at: '2026-10-25T12:00:00.000Z',
    prefs: {},
  },
};
const summary = (r: FeedbackReport, over: Partial<FeedbackSummary>): FeedbackSummary => ({
  id: ID_A,
  kind: r.kind,
  title: r.title,
  description: r.description,
  route: r.context.route,
  label: r.target.label,
  mode: r.target.mode,
  status: 'new',
  author: { id: MEMBER.id, name: MEMBER.name },
  createdAt: '2026-10-25T12:00:00.000Z',
  ...over,
});
/** A new report with a title, and an accepted one without (its author's account deleted since). */
const A = summary(REPORT, {});
const B_REPORT: FeedbackReport = { ...REPORT, kind: 'bug', title: '', target: { ...REPORT.target, mode: 'area', label: 'heading “Settings”' } };
const B = summary(B_REPORT, { id: ID_B, status: 'accepted', author: null, createdAt: '2026-10-24T12:00:00.000Z' });
const COUNTS: Record<FeedbackStatus, number> = { new: 1, accepted: 1, declined: 0 };
const detailOf = (s: FeedbackSummary, report: FeedbackReport): FeedbackDetail => ({ ...s, report, note: '', reviewer: null, reviewedAt: null });

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Answers fetch by path; records every request. */
let answer: (path: string, init: RequestInit) => Response;
let fetchMock: ReturnType<typeof vi.fn>;
const calls = (): { path: string; method: string; body: unknown }[] =>
  fetchMock.mock.calls.map((c) => {
    const init = (c[1] ?? {}) as RequestInit;
    return { path: String(c[0]), method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined };
  });
const paths = (): string[] => calls().map((c) => c.path);
const said = (): string => document.getElementById('announcer')?.textContent ?? '';

/** The API with reports A and B: the list (filtered by status), one report, and its changes. */
function feedbackApi(me: Me = ADMIN): (path: string, init: RequestInit) => Response {
  const stored: Record<string, FeedbackDetail> = { [ID_A]: detailOf(A, REPORT), [ID_B]: detailOf(B, B_REPORT) };
  return (path, init) => {
    if (path === '/api/v1/me') return json(200, me);
    const url = new URL(path, 'http://x');
    if (url.pathname === '/api/v1/admin/feedback') {
      const status = url.searchParams.get('status');
      const res: FeedbackListResponse = { reports: [A, B].filter((r) => !status || r.status === status), counts: COUNTS };
      return json(200, res);
    }
    const id = url.pathname.split('/').at(-1) ?? '';
    const found = stored[id];
    if (!found) return json(404, { error: 'not_found', message: '' });
    if (init.method === 'DELETE') {
      delete stored[id];
      return new Response(null, { status: 204 });
    }
    if (init.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Partial<FeedbackDetail>;
      stored[id] = { ...found, ...body, reviewer: { id: ADMIN.id, name: ADMIN.name }, reviewedAt: '2026-10-25T13:00:00.000Z' };
    }
    return json(200, stored[id]);
  };
}

/** Holds each PATCH until `next` lets the oldest one through to `api`, to see what the screen does meanwhile. */
function holdPatches(api: (path: string, init: RequestInit) => Response): { waiting: (() => void)[]; next(): void } {
  answer = api;
  const waiting: (() => void)[] = [];
  fetchMock.mockImplementation((path: string, init: RequestInit = {}) =>
    init.method === 'PATCH' ? new Promise<Response>((resolve) => waiting.push(() => resolve(api(path, init)))) : Promise.resolve(api(path, init)),
  );
  return { waiting, next: () => waiting.shift()?.() };
}

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  resetFeedbackFilter();
  clearListNotice();
  window.location.hash = '';
  fetchMock = vi.fn((path: string, init: RequestInit) => Promise.resolve(answer(path, init)));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
});

// The Announcer first: in the app it is on the page before any screen, so a screen's first effect can already speak.
const inStore = (ui: JSX.Element) =>
  render(
    <>
      <Announcer />
      <StoreProvider>{ui}</StoreProvider>
    </>,
  );

describe('Admin: Feedback mode', () => {
  it('turns the Feedback button on and off for everyone, and says why when it could not', async () => {
    let mode = false;
    let fail = false;
    const reports = feedbackApi({ ...ADMIN, feedbackMode: false });
    answer = (path, init) => {
      if (path !== '/api/v1/admin/feedback-mode') return reports(path, init);
      if (fail) return json(500, { error: 'internal', message: '' });
      mode = (JSON.parse(String(init.body)) as FeedbackMode).on;
      return json(200, { on: mode } satisfies FeedbackMode);
    };
    inStore(<AdminFeedback />);
    const toggle = await screen.findByRole('switch', { name: 'Feedback mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toContain('Off: nobody sees the Feedback button.');
    // The reports are there whether it is on or off.
    await screen.findByRole('heading', { name: '1 new report' });

    fireEvent.click(toggle);
    await waitFor(() => expect(mode).toBe(true));
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect(toggle.textContent).toContain('On: everyone who can send feedback sees the Feedback button on every screen.');
    // The account as this device keeps it: its own Feedback button comes at once.
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? '{}')).toMatchObject({ feedbackMode: true }));

    // Turning it off fails: it stays on, and says why.
    fail = true;
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(calls().filter((c) => c.path === '/api/v1/admin/feedback-mode').map((c) => [c.method, c.body])).toEqual([
      ['PUT', { on: true }],
      ['PUT', { on: false }],
    ]);
  });
});

describe('Admin: Feedback', () => {
  it('lists the new reports first, with how many there are of each status, and filters by status', async () => {
    answer = feedbackApi();
    inStore(<AdminFeedback />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '1 new report' })).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1, name: 'Feedback' })).toBeTruthy();
    expect(screen.getByText('Reports sent from the app.')).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Status' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['New 1', 'Accepted 1', 'Declined 0', 'All 2']);
    expect(within(group).getByRole('button', { name: 'New 1' }).getAttribute('aria-pressed')).toBe('true');
    const row = screen.getByRole('link', { name: /^Start is cut off/ });
    expect(row.getAttribute('href')).toBe('#/admin/feedback/' + ID_A);
    expect(row.textContent).toContain('Change · button “Start” · Sam Jansen · October 25, 2026');
    // Under one status every row has it: no pill.
    expect(row.querySelector('.status-pill')).toBeNull();
    // The first list is not read out: the screen's heading covers it. (The Announcer shows a text only after a moment.)
    await new Promise((r) => setTimeout(r, ANNOUNCE_DELAY_MS * 2));
    expect(said()).toBe('');

    fireEvent.click(within(group).getByRole('button', { name: 'All 2' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '2 reports' })).toBeTruthy());
    await waitFor(() => expect(said()).toBe('2 reports'));
    expect(paths().filter((p) => p.startsWith('/api/v1/admin/feedback'))).toEqual(['/api/v1/admin/feedback?status=new', '/api/v1/admin/feedback']);
    expect(screen.getByRole('link', { name: /^Start is cut off/ }).querySelector('.status-pill')?.textContent).toBe('New');

    fireEvent.click(within(group).getByRole('button', { name: 'Declined 0' }));
    await waitFor(() => expect(said()).toBe('No reports with this status.'));
    expect(screen.getByText('No reports with this status.', { selector: '.acct-empty' })).toBeTruthy();
  });

  it('names a report without a title by its kind and screen, and an author whose account is gone', async () => {
    answer = feedbackApi();
    inStore(<AdminFeedback />);
    await screen.findByRole('heading', { name: '1 new report' });
    fireEvent.click(screen.getByRole('button', { name: 'Accepted 1' }));
    const row = await screen.findByRole('link', { name: /^Bug on #\/settings/ });
    expect(row.getAttribute('href')).toBe('#/admin/feedback/' + ID_B);
    expect(row.textContent).toContain('Bug · heading “Settings” · A deleted account · October 24, 2026');
    expect(screen.getByRole('heading', { name: '1 accepted report' })).toBeTruthy();
  });

  it('keeps the filter when it comes back from a report', async () => {
    answer = feedbackApi();
    const first = inStore(<AdminFeedback />);
    await screen.findByRole('heading', { name: '1 new report' });
    fireEvent.click(screen.getByRole('button', { name: 'All 2' }));
    await screen.findByRole('heading', { name: '2 reports' });
    first.unmount();
    inStore(<AdminFeedback />);
    await screen.findByRole('heading', { name: '2 reports' });
    expect(paths().filter((p) => p.startsWith('/api/v1/admin/feedback')).at(-1)).toBe('/api/v1/admin/feedback');
  });

  it('says when there are no reports at all, without a filter', async () => {
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : json(200, { reports: [], counts: { new: 0, accepted: 0, declined: 0 } }));
    inStore(<AdminFeedback />);
    await screen.findByText('No reports yet. They appear here when someone sends feedback from the app.');
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull();
  });

  it('offers Try again when the list does not come', async () => {
    let fail = true;
    answer = (path, init) => (path === '/api/v1/me' ? json(200, ADMIN) : fail ? json(500, { error: 'internal', message: '' }) : feedbackApi()(path, init));
    inStore(<AdminFeedback />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    // The filter stays, without counts, so another one can be chosen.
    expect(within(screen.getByRole('group', { name: 'Status' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['New', 'Accepted', 'Declined', 'All']);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: '1 new report' });
    await waitFor(() => expect(said()).toBe('1 new report'));
  });

  it('keeps the filter, with its counts and the focus, when another filter does not come', async () => {
    const api = feedbackApi();
    let fail = false;
    answer = (path, init) => (fail && path.startsWith('/api/v1/admin/') ? json(500, { error: 'internal', message: '' }) : api(path, init));
    inStore(<AdminFeedback />);
    await screen.findByRole('heading', { name: '1 new report' });
    fail = true;
    const accepted = screen.getByRole('button', { name: 'Accepted 1' });
    accepted.focus();
    fireEvent.click(accepted);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    const group = screen.getByRole('group', { name: 'Status' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['New 1', 'Accepted 1', 'Declined 0', 'All 2']);
    expect(accepted.isConnected).toBe(true);
    expect(document.activeElement).toBe(accepted);
    expect(accepted.getAttribute('aria-pressed')).toBe('true');
    // Another filter, once the API answers again.
    fail = false;
    fireEvent.click(within(group).getByRole('button', { name: 'New 1' }));
    await screen.findByRole('heading', { name: '1 new report' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('without feedback.review there is no access, and no request for the reports goes out', async () => {
    answer = () => json(200, MEMBER);
    inStore(<AdminFeedback />);
    await screen.findByText("You don't have access to this page.");
    expect(screen.getByText('Only admins review feedback reports.')).toBeTruthy();
    // The back arrow, and the button under the message.
    expect(screen.getAllByRole('link', { name: 'Back to settings' }).map((a) => a.getAttribute('href'))).toEqual(['#/settings', '#/settings']);
    expect(paths()).toEqual(['/api/v1/me']);
  });

  it('feedback.review alone opens it (a role that has it), and a refusal from the API shows no access', async () => {
    answer = feedbackApi(REVIEWER);
    const first = inStore(<AdminFeedback />);
    await screen.findByRole('heading', { name: '1 new report' });
    first.unmount();
    answer = (path) => (path === '/api/v1/me' ? json(200, REVIEWER) : json(403, { error: 'forbidden', message: '' }));
    inStore(<AdminFeedback />);
    await screen.findByText("You don't have access to this page.");
  });

  it('reads in Dutch', async () => {
    setLocale('nl');
    answer = feedbackApi();
    inStore(<AdminFeedback />);
    await screen.findByRole('heading', { name: '1 nieuwe melding' });
    expect(within(screen.getByRole('group', { name: 'Status' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Nieuw 1',
      'Opgepakt 1',
      'Afgewezen 0',
      'Alle 2',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Alle 2' }));
    const row = await screen.findByRole('link', { name: /^Fout op #\/settings/ });
    expect(row.textContent).toContain('Een verwijderd account');
  });
});

describe('Admin: one feedback report', () => {
  it('shows the report as sent: what should change, where, the device, and who sent it when', async () => {
    answer = feedbackApi();
    inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
    expect(screen.getByRole('link', { name: 'Back to feedback' }).getAttribute('href')).toBe('#/admin/feedback');
    const report = screen.getByRole('region', { name: 'Report' });
    expect(report.textContent).toContain('KindChange');
    // As written, with its line break.
    expect(within(report).getByText(/^The Start button/).textContent).toBe(REPORT.description);

    const where = screen.getByRole('region', { name: 'Where' });
    expect(where.textContent).toContain('Screen#/settings');
    expect(where.textContent).toContain('Markedbutton “Start”');
    expect(where.textContent).toContain('Text thereStart');
    expect(where.textContent).toContain('Selectormain.frame > button.start-btn');
    expect(where.textContent).toContain('Marked asAn element');
    expect(where.textContent).toContain('Boxx 12, y 300, 366 × 52 px');
    expect(within(where).getByRole('link', { name: 'Open this screen' }).getAttribute('href')).toBe('#/settings');

    const device = screen.getByRole('region', { name: 'Device' });
    for (const fact of [
      'Viewport390 × 844 px, pixel ratio 3',
      'SizePhone',
      'OrientationPortrait',
      'InputTouch',
      'ThemeDark, from the system setting',
      'LanguageEnglish',
      'App version0.17.0',
      'BrowserMozilla/5.0 (iPhone)',
    ]) {
      expect(device.textContent).toContain(fact);
    }
    const sent = screen.getByRole('region', { name: 'Sent' });
    expect(sent.textContent).toContain('FromSam Jansen');
    expect(sent.textContent).toContain('DateOctober 25, 2026');
    expect(screen.getByRole('region', { name: 'Review' }).textContent).toContain('Not reviewed yet.');
  });

  it('names a report without a title, a drawn area, and an author whose account is gone', async () => {
    answer = feedbackApi();
    inStore(<AdminFeedbackReport id={ID_B} />);
    await screen.findByRole('heading', { level: 1, name: 'Bug on #/settings' });
    expect(screen.getByRole('region', { name: 'Where' }).textContent).toContain('Marked asA drawn area');
    expect(screen.getByRole('region', { name: 'Sent' }).textContent).toContain('FromA deleted account');
    // Accepted, as stored.
    expect(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Accepted' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('saves the status at once and the note with Save, and says who reviewed it', async () => {
    answer = feedbackApi();
    inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
    const status = screen.getByRole('group', { name: 'Status' });
    expect(within(status).getAllByRole('button').map((b) => b.textContent)).toEqual(['New', 'Accepted', 'Declined']);
    fireEvent.click(within(status).getByRole('button', { name: 'Accepted' }));
    await screen.findByText('Reviewed by Ann de Vries, October 25, 2026');
    expect(within(status).getByRole('button', { name: 'Accepted' }).getAttribute('aria-pressed')).toBe('true');
    // The status it already has sends nothing.
    fireEvent.click(within(status).getByRole('button', { name: 'Accepted' }));

    const save = screen.getByRole('button', { name: 'Save note' });
    expect(save.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByLabelText('Note for the team'), { target: { value: '  Picked up for 0.17.1.\nAfter the tab bar fix.  ' } });
    fireEvent.click(save);
    await screen.findByText('Saved.');
    expect((screen.getByLabelText('Note for the team') as HTMLTextAreaElement).value).toBe('Picked up for 0.17.1.\nAfter the tab bar fix.');
    expect(calls().filter((c) => c.method === 'PATCH')).toEqual([
      { path: '/api/v1/admin/feedback/' + ID_A, method: 'PATCH', body: { status: 'accepted' } },
      { path: '/api/v1/admin/feedback/' + ID_A, method: 'PATCH', body: { note: 'Picked up for 0.17.1.\nAfter the tab bar fix.' } },
    ]);
  });

  it('keeps what is typed while the note saves, still to be saved', async () => {
    const held = holdPatches(feedbackApi());
    inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
    const field = screen.getByLabelText('Note for the team') as HTMLTextAreaElement;
    const save = screen.getByRole('button', { name: 'Save note' });
    fireEvent.change(field, { target: { value: 'Looks good' } });
    fireEvent.click(save);
    await waitFor(() => expect(held.waiting).toHaveLength(1));
    fireEvent.change(field, { target: { value: 'Looks good - ship in 0.18' } });
    await act(async () => held.next());
    await screen.findByText('Reviewed by Ann de Vries, October 25, 2026');
    expect(field.value).toBe('Looks good - ship in 0.18');
    expect(screen.queryByText('Saved.')).toBeNull();
    expect(save.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(save);
    await waitFor(() => expect(held.waiting).toHaveLength(1));
    await act(async () => held.next());
    await screen.findByText('Saved.');
    expect(field.value).toBe('Looks good - ship in 0.18');
    expect(calls().filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ note: 'Looks good' }, { note: 'Looks good - ship in 0.18' }]);
  });

  it('sends a status picked while the note saves after it, so the screen ends on both', async () => {
    const held = holdPatches(feedbackApi());
    inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
    fireEvent.change(screen.getByLabelText('Note for the team'), { target: { value: 'Ship it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    const status = screen.getByRole('group', { name: 'Status' });
    fireEvent.click(within(status).getByRole('button', { name: 'Accepted' }));
    // Shown at once, and sent once the note has its answer.
    expect(within(status).getByRole('button', { name: 'Accepted' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(held.waiting).toHaveLength(1));
    expect(calls().filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ note: 'Ship it' }]);
    await act(async () => held.next());
    await waitFor(() => expect(held.waiting).toHaveLength(1));
    expect(within(status).getByRole('button', { name: 'Accepted' }).getAttribute('aria-pressed')).toBe('true');
    await act(async () => held.next());
    await screen.findByText('Saved.');
    expect(within(status).getByRole('button', { name: 'Accepted' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Note for the team') as HTMLTextAreaElement).value).toBe('Ship it');
    expect(calls().filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ note: 'Ship it' }, { status: 'accepted' }]);
  });

  it('refuses a note with a tab before sending it, and shows why a status change failed', async () => {
    const api = feedbackApi();
    answer = (path, init) => (init.method === 'PATCH' && String(init.body).includes('status') ? json(500, { error: 'internal', message: '' }) : api(path, init));
    inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
    fireEvent.change(screen.getByLabelText('Note for the team'), { target: { value: 'One\ttwo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await screen.findByText('Remove the tabs and other hidden characters.');
    expect(document.activeElement).toBe(screen.getByLabelText('Note for the team'));

    const status = screen.getByRole('group', { name: 'Status' });
    fireEvent.click(within(status).getByRole('button', { name: 'Declined' }));
    await screen.findByText('Something went wrong on our side. Try again later.');
    expect(within(status).getByRole('button', { name: 'New' }).getAttribute('aria-pressed')).toBe('true');
    expect(calls().filter((c) => c.method === 'PATCH')).toEqual([{ path: '/api/v1/admin/feedback/' + ID_A, method: 'PATCH', body: { status: 'declined' } }]);
  });

  it('copies the GitHub issue as Markdown', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    answer = feedbackApi();
    inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
    fireEvent.click(screen.getByRole('button', { name: /^Copy as Markdown/ }));
    await screen.findByRole('button', { name: /^Copied/ });
    const text = String((writeText.mock.calls[0] as unknown[])[0]);
    expect(text.startsWith('# Start is cut off\n\n**Change request**')).toBe(true);
    expect(text).toContain('<!-- muzieklab-feedback:v1 -->');
  });

  it('deletes the report and goes back to the list, which says so once', async () => {
    window.location.hash = '#/admin/feedback/' + ID_A;
    answer = feedbackApi();
    const page = inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete report' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Delete this report?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(window.location.hash).toBe('#/admin/feedback'));
    expect(calls().filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/api/v1/admin/feedback/' + ID_A]);
    page.unmount();

    inStore(<AdminFeedback />);
    expect(screen.getByText('The report was deleted.')).toBeTruthy();
    await waitFor(() => expect(said()).toBe('The report was deleted.'));
  });

  it("says when the report isn't there anymore, with the way back", async () => {
    answer = feedbackApi();
    inStore(<AdminFeedbackReport id="6718f0c2a1b2c3d4e5f6a0ff" />);
    await screen.findByText("This report isn't there anymore.");
    expect(screen.getAllByRole('link', { name: 'Back to feedback' }).map((a) => a.getAttribute('href'))).toEqual(['#/admin/feedback', '#/admin/feedback']);
  });

  it('without feedback.review there is no access, and no request for the report goes out', async () => {
    answer = () => json(200, MEMBER);
    inStore(<AdminFeedbackReport id={ID_A} />);
    await screen.findByText("You don't have access to this page.");
    expect(paths()).toEqual(['/api/v1/me']);
  });

  it('offers Try again when the report does not come', async () => {
    let fail = true;
    answer = (path, init) => (path === '/api/v1/me' ? json(200, ADMIN) : fail ? json(500, { error: 'internal', message: '' }) : feedbackApi()(path, init));
    inStore(<AdminFeedbackReport id={ID_A} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { level: 1, name: 'Start is cut off' });
  });
});
