// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, type AccountDetail, type AccountSummary, type AdminUpdateRequest, type Me } from '../../../../shared/api';
import { setLocale } from '../../../i18n';
import { resetAccountCheck } from '../../account';
import { Announcer } from '../../components/Announcer';
import { sortRoles } from '../../lib/admin';
import { StoreProvider } from '../../store';
import { AdminAccount } from './AdminAccount';
import { AdminAccounts, SEARCH_DELAY_MS } from './AdminAccounts';
import { AdminInvite } from './AdminInvite';

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
  feedbackMode: false,
};
const MEMBER: Me = { ...ADMIN, id: '6718f0c2a1b2c3d4e5f60001', name: 'Sam Jansen', email: 'sam@example.com', roles: [], roleNames: {}, permissions: ['self.manage', 'progress.own', 'class.join'] };
const LIES: AccountSummary = {
  id: '6718f0c2a1b2c3d4e5f60003',
  email: 'lies@example.com',
  name: 'Lies Bakker',
  status: 'invited',
  roles: ['teacher'],
  premium: { active: false, until: null },
  lastSignInAt: null,
  createdAt: '2026-10-22T10:00:00.000Z',
};
const ANN: AccountSummary = { ...LIES, id: ADMIN.id, email: ADMIN.email, name: ADMIN.name, status: 'active', roles: ['admin'], lastSignInAt: '2026-10-23T07:00:00.000Z' };
const detail = (a: AccountSummary): AccountDetail => ({ ...a, inviteExpiresAt: null, sessions: 1 });

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Answers fetch by path; records every request. */
let answer: (path: string, init: RequestInit) => Response;
let fetchMock: ReturnType<typeof vi.fn>;
const paths = (): string[] => fetchMock.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  fetchMock = vi.fn((path: string, init: RequestInit) => Promise.resolve(answer(path, init)));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
});

const inStore = (ui: JSX.Element) => render(<StoreProvider>{ui}</StoreProvider>);

describe('Admin: Accounts', () => {
  it('lists the accounts, and asks again only once typing pauses', async () => {
    answer = (path) => {
      if (path === '/api/v1/me') return json(200, ADMIN);
      const q = new URL(path, 'http://x').searchParams.get('q');
      return json(200, { accounts: q ? [LIES] : [LIES, ANN] });
    };
    inStore(<AdminAccounts />);
    expect(screen.getByText('Checking your account…')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('heading', { name: '2 accounts' })).toBeTruthy());
    expect(screen.getByRole('link', { name: /^Ann de Vries \(you\)/ }).getAttribute('href')).toBe('#/admin/account/' + ANN.id);
    expect(screen.getByRole('link', { name: 'Invite someone' }).getAttribute('href')).toBe('#/admin/invite');

    const search = screen.getByLabelText('Search');
    for (const text of ['l', 'li', 'lie', 'lies']) fireEvent.change(search, { target: { value: text } });
    await waitFor(() => expect(screen.getByRole('heading', { name: '1 account found' })).toBeTruthy(), { timeout: SEARCH_DELAY_MS * 8 });
    expect(paths().filter((p) => p.startsWith('/api/v1/admin/accounts'))).toEqual(['/api/v1/admin/accounts', '/api/v1/admin/accounts?q=lies']);

    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Invited' }));
    await waitFor(() => expect(paths().at(-1)).toBe('/api/v1/admin/accounts?q=lies&status=invited'));
  });

  it('reads out what a search or filter found (the list heading is not a live region), not the first load', async () => {
    answer = (path) => {
      if (path === '/api/v1/me') return json(200, ADMIN);
      const url = new URL(path, 'http://x');
      if (url.searchParams.get('status') === 'blocked') return json(200, { accounts: [] });
      return json(200, { accounts: url.searchParams.get('q') ? [LIES] : [LIES, ANN] });
    };
    render(
      <>
        <StoreProvider>
          <AdminAccounts />
        </StoreProvider>
        <Announcer />
      </>,
    );
    const said = (): string => document.getElementById('announcer')?.textContent ?? '';
    await waitFor(() => expect(screen.getByRole('heading', { name: '2 accounts' })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 200));
    expect(said()).toBe('');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'lies' } });
    await waitFor(() => expect(said()).toBe('1 account found'), { timeout: SEARCH_DELAY_MS * 8 });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Blocked' }));
    await waitFor(() => expect(said()).toBe('No accounts match.'), { timeout: SEARCH_DELAY_MS * 8 });
    // Shown, but not a second live region: the announcement is the one that is read.
    expect(screen.getByText('No accounts match.', { selector: '.acct-empty' }).getAttribute('role')).toBeNull();
  });

  it('says when nothing matches, and offers Try again when the list does not come', async () => {
    let fail = true;
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : fail ? json(500, { error: 'internal', message: '' }) : json(200, { accounts: [] }));
    inStore(<AdminAccounts />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('No accounts match.')).toBeTruthy());
  });

  it('reads out the list that Try again brings after a failed first load (the focused button is gone)', async () => {
    let fail = true;
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : fail ? json(500, { error: 'internal', message: '' }) : json(200, { accounts: [LIES, ANN] }));
    render(
      <>
        <StoreProvider>
          <AdminAccounts />
        </StoreProvider>
        <Announcer />
      </>,
    );
    const said = (): string => document.getElementById('announcer')?.textContent ?? '';
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Something went wrong on our side. Try again later.'));
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '2 accounts' })).toBeTruthy());
    await waitFor(() => expect(said()).toBe('2 accounts'));
  });

  it('a member has no access, and no request for the list goes out', async () => {
    answer = () => json(200, MEMBER);
    inStore(<AdminAccounts />);
    await waitFor(() => expect(screen.getByText("You don't have access to this page.")).toBeTruthy());
    expect(paths()).toEqual(['/api/v1/me']);
    expect(screen.queryByRole('link', { name: 'Invite someone' })).toBeNull();
  });

  it('reads in Dutch', async () => {
    setLocale('nl');
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : json(200, { accounts: [LIES] }));
    inStore(<AdminAccounts />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '1 account' })).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Iemand uitnodigen' })).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Status' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Alle', 'Uitgenodigd', 'Actief', 'Geblokkeerd']);
    expect(screen.getByRole('link', { name: /^Lies Bakker/ }).textContent).toContain('UitgenodigdDocent');
  });
});

describe('Admin: one account', () => {
  it('your own roles cannot change, and Block and Delete are not offered', async () => {
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : json(200, detail(ANN)));
    inStore(<AdminAccount id={ANN.id} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Ann de Vries' })).toBeTruthy());
    for (const role of ['Admin', 'Editor', 'Teacher']) expect((screen.getByRole('switch', { name: role }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You can't change your own roles.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Block/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
  });

  it('Block, then Unblock: each time the other one takes the focus from the pressed button, which is gone', async () => {
    let account = detail({ ...LIES, status: 'active', roles: [] });
    answer = (path, init) => {
      if (path === '/api/v1/me') return json(200, ADMIN);
      if (init?.method === 'PATCH') account = { ...account, ...(JSON.parse(String(init.body)) as Pick<AccountDetail, 'status'>) };
      return json(200, account);
    };
    inStore(<AdminAccount id={LIES.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Block/ }));
    const block = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Block' });
    block.focus();
    fireEvent.click(block);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Unblock/ })));
    fireEvent.click(document.activeElement!);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Block/ })));
    expect(account.status).toBe('active');
  });

  it('Try again after a failed load: the account takes its place, and the heading the focus', async () => {
    let fail = true;
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : fail ? json(500, { error: 'internal', message: '' }) : json(200, detail(LIES)));
    inStore(<AdminAccount id={LIES.id} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fail = false;
    retry.focus();
    fireEvent.click(retry);
    await screen.findByRole('heading', { level: 1, name: 'Lies Bakker' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('an invite: its link end, New invite link and Cancel invite (with Keep invite)', async () => {
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : json(200, { ...detail(LIES), inviteExpiresAt: '2026-10-29T12:00:00.000Z' }));
    inStore(<AdminAccount id={LIES.id} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lies Bakker' })).toBeTruthy());
    expect(screen.getByRole('region', { name: 'Details' }).textContent).toContain('Invite linkUntil October 29, 2026 at');
    expect(screen.getByRole('button', { name: /^New invite link/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel invite/ }));
    const confirm = screen.getByRole('alertdialog', { name: 'Cancel the invite for Lies Bakker?' });
    expect(within(confirm).getByRole('button', { name: 'Keep invite' })).toBeTruthy();
    expect(within(confirm).getByRole('button', { name: 'Cancel invite' })).toBeTruthy();
  });

  /**
   * Lies as the API keeps her while the screen is open. PATCH changes her as the server does: roles as a whole set, or
   * one role at a time against the roles she has then; a new email cancels the links made for the old one.
   */
  let lies: AccountDetail;
  const patches: AdminUpdateRequest[] = [];
  const keepLies = (start: AccountDetail): void => {
    lies = start;
    patches.length = 0;
    answer = (path, init) => {
      if (path === '/api/v1/me') return json(200, ADMIN);
      if (path.endsWith('-link')) {
        const expiresAt = '2026-10-30T12:00:00.000Z';
        if (lies.status === 'invited') lies = { ...lies, inviteExpiresAt: expiresAt };
        return json(200, { link: `https://vivanova.app/#/${lies.status === 'invited' ? 'invite' : 'reset'}/abc123`, expiresAt });
      }
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as AdminUpdateRequest;
        patches.push(body);
        const { name = lies.name, email = lies.email, addRoles = [], removeRoles = [] } = body;
        const roles = body.roles ?? [...lies.roles.filter((r) => !removeRoles.includes(r)), ...addRoles];
        lies = { ...lies, name, email, roles: sortRoles(roles), ...(body.email ? { inviteExpiresAt: null } : {}) };
      }
      return json(200, lies);
    };
  };
  const profile = () => within(screen.getByRole('region', { name: 'Name and email' }));
  const save = async (field: 'Name' | 'Email', value: string): Promise<void> => {
    fireEvent.change(profile().getByLabelText(field), { target: { value } });
    fireEvent.click(profile().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(profile().getByText('Saved.')).toBeTruthy());
  };

  it.each([
    ['an invite link', 'invited', /^New invite link/, 'Invite link'],
    ['a new password link', 'active', /^New password link/, 'New password link'],
  ] as const)('%s on screen goes when the email changes (it no longer works); a new name keeps it', async (_, status, button, field) => {
    keepLies({ ...detail({ ...LIES, status }), inviteExpiresAt: status === 'invited' ? '2026-10-29T12:00:00.000Z' : null });
    inStore(<AdminAccount id={LIES.id} />);
    fireEvent.click(await screen.findByRole('button', { name: button }));
    await waitFor(() => expect(screen.getByLabelText(field)).toBeTruthy());
    await save('Name', 'Lies B.');
    expect(screen.getByLabelText(field)).toBeTruthy();
    expect(screen.getByText('New link ready. Send it yourself.')).toBeTruthy();

    await save('Email', 'lies.b@example.com');
    expect(screen.queryByLabelText(field)).toBeNull();
    expect(screen.queryByText('New link ready. Send it yourself.')).toBeNull();
    expect(screen.getByRole('button', { name: button })).toBeTruthy();
    if (status === 'invited') expect(screen.getByRole('region', { name: 'Details' }).textContent).toContain('No working link. Make a new one below.');
  });

  it('a role switch changes only its own role: a role another admin changed meanwhile stays as they left it', async () => {
    keepLies(detail({ ...LIES, status: 'active', roles: [] }));
    inStore(<AdminAccount id={LIES.id} />);
    const editor = await screen.findByRole('switch', { name: 'Editor' });
    // Another admin makes Lies a teacher; this screen still shows no roles.
    lies = { ...lies, roles: ['teacher'] };
    fireEvent.click(editor);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Teacher' }).getAttribute('aria-checked')).toBe('true'));
    expect(patches).toEqual([{ addRoles: ['editor'] }]);
    expect(lies.roles).toEqual(['editor', 'teacher']);
    expect(screen.getByRole('switch', { name: 'Editor' }).getAttribute('aria-checked')).toBe('true');

    // And the other way: they take Editor away again; switching Teacher off here gives Editor back to nobody.
    lies = { ...lies, roles: ['teacher'] };
    fireEvent.click(screen.getByRole('switch', { name: 'Teacher' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Teacher' }).getAttribute('aria-checked')).toBe('false'));
    expect(patches.at(-1)).toEqual({ removeRoles: ['teacher'] });
    expect(lies.roles).toEqual([]);
  });

  it('a name with a tab (pasted from a spreadsheet) is said at the field, and nothing is sent', async () => {
    keepLies(detail(LIES));
    inStore(<AdminAccount id={LIES.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Lies Bakker' });
    const name = profile().getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Lies\tde Boer' } });
    fireEvent.click(profile().getByRole('button', { name: 'Save' }));
    expect(await profile().findByText('Remove the tabs and other hidden characters.')).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    expect(patches).toEqual([]);
    // Around the name it is only space, which is trimmed.
    await save('Name', 'Lies de Boer\t');
    expect(patches).toEqual([{ name: 'Lies de Boer' }]);
  });
});

describe('Admin: Invite someone', () => {
  it('without roles.grant there are no role switches', async () => {
    answer = () => json(200, { ...ADMIN, permissions: ['self.manage', 'accounts.read', 'accounts.invite'] });
    inStore(<AdminInvite />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create invite' })).toBeTruthy());
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('a name with a tab (pasted from a spreadsheet) is said at the field, and nothing is sent', async () => {
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : json(404, { error: 'not_found', message: '' }));
    inStore(<AdminInvite />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'lies@example.com' } });
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Lies\tBakker' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(await screen.findByText('Remove the tabs and other hidden characters.')).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    expect(paths()).not.toContain('/api/v1/admin/invites');
  });

  it('a name that shows nothing (a zero-width space) is an empty one: nothing is sent', async () => {
    answer = (path) => (path === '/api/v1/me' ? json(200, ADMIN) : json(404, { error: 'not_found', message: '' }));
    inStore(<AdminInvite />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'lies@example.com' } });
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: '\u200B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(await screen.findByText('Type their name.')).toBeTruthy();
    expect(document.activeElement).toBe(name);
    expect(paths()).not.toContain('/api/v1/admin/invites');
  });
});
