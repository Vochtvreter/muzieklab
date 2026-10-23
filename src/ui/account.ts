/**
 * useAccount(): who is signed in, for Settings → Account and the account and admin screens (BACKEND-PLAN.md §5).
 *
 * The app stays offline first: no request goes out until a screen that needs the account is opened. The first such
 * screen of an app session asks GET /me once: 200 → signed in; 401 → signed out; no answer (offline, or a site with no
 * API, like production today) → `unreachable`, and a cached account is shown as offline. Everything else that changes
 * the account goes through the functions here, so the store and the cache (muzieklab.account.v1) stay right.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { Me, Permission } from '../../shared/api';
import { api, asApiError, type ApiError } from '../api/client';
import { useStore, type AccountNotice, type AccountState, type Action } from './store';

/** The GET /me of this app session: started by the first screen that needs it, answered once. */
let check: Promise<void> | null = null;
/**
 * Bumped by every account change made here (sign in, sign out…): a GET /me that was sent before one answers about the
 * old state, so its answer is dropped.
 */
let generation = 0;

/** Tests only: forget this session's GET /me, as a reload would. */
export function resetAccountCheck(): void {
  check = null;
  generation = 0;
}

function askMe(dispatch: (a: Action) => void): Promise<void> {
  const asked = generation;
  return api.get<Me>('/me').then(
    (me) => {
      if (asked === generation) dispatch({ type: 'signedIn', me });
    },
    (e: unknown) => {
      if (asked !== generation) return;
      const err = asApiError(e);
      // 401: nobody is signed in (or the session ended). Anything else: no usable answer, keep what is cached.
      if (err.code === 'unauthenticated') dispatch({ type: 'signedOut' });
      else dispatch({ type: 'apiUnreachable' });
    },
  );
}

export interface UseAccount {
  me: Me | null;
  /** 'unknown' until GET /me answered in this app session. */
  api: AccountState['api'];
  /** The message for Settings after an account change (signed out, deleted…), until Settings is left. */
  notice: AccountNotice | null;
  /** True when the signed-in account has this permission (the app shows only what is allowed; the server checks). */
  can(permission: Permission): boolean;
  /** POST /auth/sign-in. Resolves with the account (now signed in); rejects with an ApiError. */
  signIn(email: string, password: string): Promise<Me>;
  /** POST /auth/sign-out (this device). A session that had already ended counts as signed out too. */
  signOut(notice?: AccountNotice): Promise<void>;
  /** POST /auth/sign-out-everywhere (every device of the account, this one too). */
  signOutEverywhere(): Promise<void>;
  /** GET /me again (after coming back online, or to pick up roles an admin changed). */
  refresh(): Promise<void>;
  /** An account a request answered with (PATCH /me, an accepted invite…): it is the signed-in account from now on. */
  setMe(me: Me, notice?: AccountNotice): void;
  /** Nobody is signed in any more (the account was deleted…). */
  setSignedOut(notice?: AccountNotice): void;
  setNotice(notice: AccountNotice | null): void;
  /**
   * For a failed request on any account or admin screen: a 401 means the session ended (signed out from now on; the
   * account screens then go to Sign in). Returns the error as an ApiError, for errorMessage / failureOf.
   */
  handleError(e: unknown): ApiError;
}

export function useAccount(): UseAccount {
  const { state, dispatch } = useStore();
  const { me, api: reach, notice } = state.account;

  useEffect(() => {
    if (!check) check = askMe(dispatch);
  }, [dispatch]);

  // Unreachable at first (offline): ask again when the device is back online.
  useEffect(() => {
    if (reach !== 'unreachable') return;
    const again = (): void => {
      check = askMe(dispatch);
    };
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [reach, dispatch]);

  const setMe = useCallback((next: Me, n?: AccountNotice) => {
    generation++;
    dispatch({ type: 'signedIn', me: next, notice: n });
  }, [dispatch]);
  const setSignedOut = useCallback((n?: AccountNotice) => {
    generation++;
    dispatch({ type: 'signedOut', notice: n });
  }, [dispatch]);

  const setNotice = useCallback((n: AccountNotice | null) => dispatch({ type: 'accountNotice', notice: n }), [dispatch]);

  // Only a 401 changes the state. No answer to one request is shown as that request's error: the screen keeps its
  // forms (and what was typed) instead of switching to the offline layout, which only GET /me decides.
  const handleError = useCallback((e: unknown): ApiError => {
    const err = asApiError(e);
    if (err.code === 'unauthenticated') setSignedOut();
    return err;
  }, [setSignedOut]);

  return useMemo<UseAccount>(() => ({
    me,
    api: reach,
    notice,
    can: (p) => !!me && reach !== 'unreachable' && me.permissions.includes(p),
    signIn: async (email, password) => {
      // A wrong password is a 401 too, but not a session that ended: a failure changes nothing here.
      const next = await api.post<Me>('/auth/sign-in', { email, password }).catch((e: unknown) => {
        throw asApiError(e);
      });
      setMe(next);
      return next;
    },
    signOut: async (n = 'signedOut') => {
      try {
        await api.post<void>('/auth/sign-out');
      } catch (e) {
        const err = asApiError(e);
        if (err.code !== 'unauthenticated') throw handleError(err);
      }
      setSignedOut(n);
    },
    signOutEverywhere: async () => {
      try {
        await api.post<void>('/auth/sign-out-everywhere');
      } catch (e) {
        const err = asApiError(e);
        if (err.code !== 'unauthenticated') throw handleError(err);
      }
      setSignedOut('signedOutEverywhere');
    },
    refresh: () => {
      check = askMe(dispatch);
      return check;
    },
    setMe,
    setSignedOut,
    setNotice,
    handleError,
  }), [me, reach, notice, dispatch, setMe, setSignedOut, setNotice, handleError]);
}
