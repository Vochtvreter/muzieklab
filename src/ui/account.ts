/**
 * useAccount(): who is signed in, for Settings → Account and the account and admin screens (BACKEND-PLAN.md §5).
 *
 * The app stays offline first: no request goes out until a screen that needs the account is opened, with one
 * exception: on a device where someone is signed in, keepSignedIn() renews the session when the app starts and when it
 * comes back into view (at most every RENEW_MS, over all tabs), so the session lasts 90 days after the app was last
 * used, not after an account screen was last opened (BACKEND-PLAN.md §5.4). The first screen of an app session that
 * needs the account asks GET /me: 200 → signed in; 401 → signed out; no answer (offline, the API restarting, or
 * a site with no API) → `unreachable`, and a cached account is shown as offline. While it is unreachable, GET /me is
 * asked again when such a screen opens (at most once every RECHECK_MS), when the app comes back into view
 * (visibilitychange), when the device is back online, and on Try again. Everything else that changes the account goes
 * through the functions here, so the store and the cache (muzieklab.account.v1) stay right. An account another tab
 * signs in or out is taken up by the store (the storage event, accountStored); a GET /me answer that was on its way
 * meanwhile is asked again.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { Me, Permission } from '../../shared/api';
import { api, asApiError, forgetRenewals, renewSession, type ApiError } from '../api/client';
import { loadAccount } from '../game/storage';
import { t } from '../i18n';
import { announce } from './lib/announce';
import { useStore, type AccountNotice, type AccountState, type Action } from './store';

/** What Settings → Account says after an account change (the message's key); Sign in says `sessionEnded`. */
export const NOTICE_TEXT: Record<AccountNotice, string> = {
  signedOut: 'settings.noticeSignedOut',
  signedOutEverywhere: 'settings.noticeSignedOutEverywhere',
  deleted: 'settings.noticeDeleted',
  deletedKept: 'settings.noticeDeletedKept',
  welcome: 'settings.noticeWelcome',
  passwordReset: 'settings.noticePasswordReset',
  progressAdded: 'settings.noticeProgressAdded',
  sessionEnded: 'signIn.sessionEnded',
};

/**
 * Says what happened, once, when it happens: the button that led to it is gone (Delete account, Sign out everywhere)
 * or replaced (Sign out). Not when Settings shows the line again (the language switch remounts it).
 */
function announceNotice(n: AccountNotice | undefined): void {
  if (n) announce(t(NOTICE_TEXT[n]));
}

/** While the API did not answer, a screen that opens (or the app coming back into view) asks again at most this often. */
export const RECHECK_MS = 10_000;

/** The latest GET /me of this app session (null until the first screen that needs it); `asking` while it runs. */
let check: Promise<void> | null = null;
let asking: Promise<void> | null = null;
let askedAt = -Infinity;
/**
 * Bumped by every account change made here (sign in, sign out…): a GET /me that was sent before one answers about the
 * old state, so its answer is dropped.
 */
let generation = 0;
/** What the last answer said, for the listeners below (set wherever the account state is dispatched from here). */
let reach: AccountState['api'] = 'unknown';
/** The store's dispatch, for the listeners (the latest screen that used the account). */
let dispatchTo: ((a: Action) => void) | null = null;
let listening = false;

/** Tests only: forget this session's GET /me and renewals, as a reload would. */
export function resetAccountCheck(): void {
  forgetRenewals();
  refusedAt = -Infinity;
  stopKeeping?.();
  stopKeeping = null;
  check = null;
  asking = null;
  askedAt = -Infinity;
  generation = 0;
  reach = 'unknown';
}

/** Whose account the tabs of this browser keep (muzieklab.account.v1), or null. */
const storedId = (): string | null => loadAccount()?.id ?? null;

function askMe(dispatch: (a: Action) => void): Promise<void> {
  const asked = generation;
  // Another tab may sign in or out while this is on its way (the store takes that up): then the answer is about the
  // session before, and saving it would hand that one back to every tab, so it is asked again.
  const stored = storedId();
  return api.get<Me>('/me').then(
    (me) => {
      if (asked !== generation) return;
      if (storedId() !== stored) return askMe(dispatch);
      reach = 'reachable';
      dispatch({ type: 'signedIn', me });
    },
    (e: unknown) => {
      if (asked !== generation) return;
      if (storedId() !== stored) return askMe(dispatch);
      const err = asApiError(e);
      // 401: nobody is signed in (or the session ended). Anything else: no usable answer, keep what is cached.
      if (err.code === 'unauthenticated') {
        reach = 'reachable';
        dispatch({ type: 'signedOut' });
      } else {
        reach = 'unreachable';
        dispatch({ type: 'apiUnreachable' });
      }
    },
  );
}

/** GET /me now (one at a time: a request that is still running is the answer). */
function ask(dispatch: (a: Action) => void): Promise<void> {
  if (asking) return asking;
  askedAt = Date.now();
  const p = askMe(dispatch).finally(() => {
    if (asking === p) asking = null;
  });
  asking = p;
  check = p;
  listen();
  return p;
}

/** GET /me again if the last answer was none, and it was not asked in the last RECHECK_MS. */
function askAgain(dispatch: (a: Action) => void): void {
  if (reach === 'unreachable' && !asking && Date.now() - askedAt >= RECHECK_MS) void ask(dispatch);
}

/** From the first GET /me on: ask again when the device is back online, or the app comes back into view. */
function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('online', () => {
    // The network is back: no wait (the last try had no network).
    if (dispatchTo && reach === 'unreachable') void ask(dispatchTo);
  });
  document.addEventListener('visibilitychange', () => {
    if (dispatchTo && document.visibilityState === 'visible') askAgain(dispatchTo);
  });
}

/** keepSignedIn() renews the session at most this often, counting every tab's renewals (client.ts, lastRenewal). */
export const RENEW_MS = 12 * 60 * 60_000;
/** When this tab's renewal was last refused, or got an error: not tried again for RENEW_MS. */
let refusedAt = -Infinity;
/** Removes keepSignedIn's listener (tests only, through resetAccountCheck). */
let stopKeeping: (() => void) | null = null;

/**
 * Called once at startup (main.tsx): renews the session now and whenever the app comes back into view, while someone
 * is signed in on this device and its last renewal, in this tab or another one, is over RENEW_MS ago. So of several
 * tabs started together, one renews and the others use its renewal (client.ts, renewSession). What the answer says is
 * left to GET /me: a session that ended shows as signed out once a screen that needs the account opens.
 */
export function keepSignedIn(): void {
  const renew = (): void => {
    const now = Date.now();
    if (!loadAccount() || now - refusedAt < RENEW_MS) return;
    renewSession(now - RENEW_MS).catch((e: unknown) => {
      // No answer (offline): try again when the app next comes into view.
      if (asApiError(e).code !== 'unavailable') refusedAt = Date.now();
    });
  };
  renew();
  if (stopKeeping) return;
  const onView = (): void => {
    if (document.visibilityState === 'visible') renew();
  };
  document.addEventListener('visibilitychange', onView);
  stopKeeping = () => document.removeEventListener('visibilitychange', onView);
}

/**
 * The session ended (a request other than GET /me got a 401, e.g. the progress sync): signed out from now on, as when
 * GET /me says so. A GET /me still running answers about the old state, so its answer is dropped.
 */
export function sessionEnded(dispatch: (a: Action) => void): void {
  generation++;
  reach = 'reachable';
  dispatch({ type: 'signedOut' });
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
  /**
   * POST /auth/sign-out-everywhere (every device of the account, this one too). Unlike signOut, a session that had
   * already ended is a failure: no other device was signed out, so it rejects through handleError.
   */
  signOutEverywhere(): Promise<void>;
  /**
   * GET /me again now (Try again, or to pick up roles an admin changed). Resolves with what the answer said: reachable,
   * or unreachable (no answer).
   */
  refresh(): Promise<AccountState['api']>;
  /** An account a request answered with (PATCH /me, an accepted invite…): it is the signed-in account from now on. */
  setMe(me: Me, notice?: AccountNotice): void;
  /** Nobody is signed in any more (the account was deleted…). */
  setSignedOut(notice?: AccountNotice): void;
  setNotice(notice: AccountNotice | null): void;
  /**
   * For a failed request on any account or admin screen: a 401 means the session ended (signed out from now on; the
   * account screens then go to Sign in, which says nothing was changed: the `sessionEnded` notice). Returns the error
   * as an ApiError, for errorMessage / failureOf.
   */
  handleError(e: unknown): ApiError;
}

export function useAccount(): UseAccount {
  const { state, dispatch } = useStore();
  const { me, api: reached, notice } = state.account;

  // A screen that needs the account opened: the first one asks GET /me; later ones ask again while it did not answer.
  useEffect(() => {
    dispatchTo = dispatch;
    if (!check) void ask(dispatch);
    else askAgain(dispatch);
  }, [dispatch]);

  const setMe = useCallback((next: Me, n?: AccountNotice) => {
    generation++;
    reach = 'reachable';
    dispatch({ type: 'signedIn', me: next, notice: n });
    announceNotice(n);
  }, [dispatch]);
  const setSignedOut = useCallback((n?: AccountNotice) => {
    generation++;
    reach = 'reachable';
    dispatch({ type: 'signedOut', notice: n });
    announceNotice(n);
  }, [dispatch]);

  const setNotice = useCallback((n: AccountNotice | null) => dispatch({ type: 'accountNotice', notice: n }), [dispatch]);

  // Only a 401 changes the state. No answer to one request is shown as that request's error: the screen keeps its
  // forms (and what was typed) instead of switching to the offline layout, which only GET /me decides. After a 401 the
  // screen gives way to Sign in before it can show its error, so Sign in says that nothing was changed, and it is read
  // out: landing there signed out after Delete account would read as done.
  const handleError = useCallback((e: unknown): ApiError => {
    const err = asApiError(e);
    if (err.code === 'unauthenticated') setSignedOut('sessionEnded');
    return err;
  }, [setSignedOut]);

  return useMemo<UseAccount>(() => ({
    me,
    api: reached,
    notice,
    can: (p) => !!me && reached !== 'unreachable' && me.permissions.includes(p),
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
      // Not as signOut: a session that had already ended (a new password on another device) could not end the others,
      // so a 401 is not "signed out on every device".
      try {
        await api.post<void>('/auth/sign-out-everywhere');
      } catch (e) {
        throw handleError(e);
      }
      setSignedOut('signedOutEverywhere');
    },
    refresh: () => ask(dispatch).then(() => reach),
    setMe,
    setSignedOut,
    setNotice,
    handleError,
  }), [me, reached, notice, dispatch, setMe, setSignedOut, setNotice, handleError]);
}
