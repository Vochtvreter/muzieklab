// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../shared/api';
import { ACCOUNT_KEY } from '../game/storage';
import { resetAccountCheck, useAccount, type UseAccount } from './account';
import { StoreProvider } from './store';

const ME: Me = {
  id: '6718f0c2a1b2c3d4e5f60002',
  email: 'ann@example.com',
  name: 'Ann de Vries',
  locale: 'en',
  roles: ['admin'],
  permissions: ['self.manage', 'accounts.read'],
  premium: { active: false, until: null },
  createdAt: '2026-10-01T09:00:00.000Z',
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
let latest: UseAccount;

function Probe(): JSX.Element {
  latest = useAccount();
  return <p data-testid="probe">{`${latest.api} ${latest.me?.name ?? 'nobody'}`}</p>;
}
const shown = (): string => screen.getByTestId('probe').textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  resetAccountCheck();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useAccount', () => {
  it('asks GET /me once per app session: signed in', async () => {
    fetchMock.mockResolvedValue(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
        <Probe />
      </StoreProvider>,
    );
    expect(screen.getAllByTestId('probe')[0].textContent).toBe('unknown nobody');
    await waitFor(() => expect(screen.getAllByTestId('probe')[0].textContent).toBe('reachable Ann de Vries'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/me');
    expect(latest.can('accounts.read')).toBe(true);
    expect(latest.can('roles.grant')).toBe(false);
    // Cached for offline use.
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null')?.email).toBe('ann@example.com'));
  });

  it('a 401 is signed out, and clears a cached account', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    fetchMock.mockResolvedValue(json(401, { error: 'unauthenticated', message: '' }));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    expect(shown()).toBe('unknown Ann de Vries');
    await waitFor(() => expect(shown()).toBe('reachable nobody'));
    await waitFor(() => expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull());
  });

  it('no answer keeps the cached account, as offline', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ME));
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('unreachable Ann de Vries'));
    expect(latest.can('accounts.read')).toBe(false);
    expect(localStorage.getItem(ACCOUNT_KEY)).not.toBeNull();
  });

  it('signs in and out', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'unauthenticated', message: '' }));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable nobody'));
    fetchMock.mockResolvedValueOnce(json(200, ME));
    await act(async () => {
      await latest.signIn('ann@example.com', 'a good long password');
    });
    expect(shown()).toBe('reachable Ann de Vries');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ email: 'ann@example.com', password: 'a good long password' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => {
      await latest.signOut();
    });
    expect(shown()).toBe('reachable nobody');
    expect(latest.notice).toBe('signedOut');
  });

  it('a wrong password does not sign anyone out; it rejects with the code', async () => {
    fetchMock.mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_credentials', message: '' }));
    await act(async () => {
      await expect(latest.signIn('ann@example.com', 'wrong')).rejects.toMatchObject({ code: 'invalid_credentials' });
    });
    expect(shown()).toBe('reachable Ann de Vries');
  });

  it('handleError signs out on a 401, and leaves the rest to the screen', async () => {
    fetchMock.mockResolvedValueOnce(json(200, ME));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(shown()).toBe('reachable Ann de Vries'));
    act(() => {
      expect(latest.handleError(new TypeError('x')).code).toBe('internal');
    });
    expect(shown()).toBe('reachable Ann de Vries');
    const { ApiError } = await import('../api/client');
    act(() => {
      expect(latest.handleError(new ApiError(0, 'unavailable')).code).toBe('unavailable');
    });
    expect(shown()).toBe('reachable Ann de Vries');
    act(() => {
      latest.handleError(new ApiError(401, 'unauthenticated'));
    });
    expect(shown()).toBe('reachable nobody');
  });

  it('drops an answer to GET /me that a sign-in overtook', async () => {
    let answer: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    fetchMock.mockResolvedValueOnce(json(200, ME));
    await act(async () => {
      await latest.signIn('ann@example.com', 'a good long password');
    });
    await act(async () => {
      answer(json(401, { error: 'unauthenticated', message: '' }));
    });
    expect(shown()).toBe('reachable Ann de Vries');
  });
});
