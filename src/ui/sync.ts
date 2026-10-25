/**
 * Progress on the account (BACKEND-PLAN.md §6.2): keeps this device's progress and synced prefs and the account's copy
 * the same while someone is signed in. Without an account nothing here runs, and no request goes out.
 *
 * - When: on start with a signed-in account (or a sign-in), a moment after each change (a finished exercise, a setup,
 *   a pref), when the device is back online, and when the app comes back into view.
 * - How: a change is saved with PUT /progress and the rev this device last saw. When another device saved meanwhile,
 *   the answer is the account's copy (409 rev_conflict); it is merged into this device's (game/merge.ts), and the merge
 *   is saved in turn. A first sign-in on a device merges the same way, so nothing done before is lost.
 * - Settings → Reset progress, signed in, resets the account too (DELETE /progress, sent when the API can be reached);
 *   other devices see the account's resetAt change, and take its progress instead of merging theirs back in.
 * - What the device last agreed on with the account is kept in storage (game/syncState.ts), and forgotten when nobody
 *   is signed in any more: a save sends the whole copy, so it must only ever be made on top of the account's own.
 */
import { useEffect, useRef } from 'react';
import type { Me, SavedProgress } from '../../shared/api';
import { api, ApiError, asApiError } from '../api/client';
import { t } from '../i18n';
import { mergeSynced, readSynced, sameValue, syncedOf, type Synced } from '../game/merge';
import { isEmptyProgress } from '../game/storage';
import { loadSync, saveSync, type SyncState } from '../game/syncState';
import { sessionEnded } from './account';
import { announce } from './lib/announce';
import { useStore, type Action, type SyncStatus } from './store';

/** A change is saved this long after the last one, so a few in a row (an exercise, then its XP) are one save. */
export const CHANGE_DELAY_MS = 1500;
/**
 * After a failure (no answer, a server error), the next try comes this much later, unless something else asks first;
 * twice as long after each failure in a row, up to RETRY_MAX_MS.
 */
export const RETRY_MS = 30_000;
export const RETRY_MAX_MS = 10 * 60_000;
/** Coming back into view asks the account for news at most this often. */
export const PULL_EVERY_MS = 30_000;
/** Sign out waits this long at most for the last change to be saved. */
export const FLUSH_MS = 5000;

/** What the sync reads and changes: the store's latest committed state, and its dispatch. */
export interface SyncHost {
  me(): Me | null;
  local(): Synced;
  dispatch(action: Action): void;
}

/** Why a sync runs. Only 'change' skips asking the account when nothing changed here. */
export type SyncReason = 'start' | 'change' | 'online' | 'visible' | 'retry';

/** A copy that came from the API, checked: the shape SavedProgress says, else null. */
function savedOf(v: unknown): SavedProgress | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (typeof s.rev !== 'number' || !Number.isInteger(s.rev) || s.rev < 0) return null;
  const data = s.data === null || (typeof s.data === 'object' && s.data !== null) ? (s.data as SavedProgress['data']) : undefined;
  if (data === undefined) return null;
  return { rev: s.rev, data, resetAt: typeof s.resetAt === 'string' ? s.resetAt : null, updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : null };
}

/** A conflict's copy, or the error itself when it is not a usable conflict. */
function conflictCopy(e: unknown): SavedProgress {
  const err = asApiError(e);
  const copy = err.code === 'rev_conflict' ? savedOf(err.current) : null;
  if (!copy) throw err;
  return copy;
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export class ProgressSync {
  private running: Promise<void> | null = null;
  private again: SyncReason | null = null;
  private changeTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pulledAt = -Infinity;
  private failures = 0;
  /** Reset progress was pressed: a run that started before drops what it learnt, so the reset goes first. */
  private resetAsked = false;

  constructor(private readonly host: SyncHost) {}

  /** Something synced changed here: saved after CHANGE_DELAY_MS without another change. */
  changed(): void {
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => void this.request('change'), CHANGE_DELAY_MS);
  }

  /** Syncs now, or right after the sync that is running. Resolves when this one is done; it never rejects. */
  request(reason: SyncReason): Promise<void> {
    if (this.running) {
      // One more run after this one covers every ask meanwhile; any reason but a change also asks the account.
      this.again = this.again && this.again !== 'change' ? this.again : reason;
      return this.running;
    }
    clearTimeout(this.retryTimer);
    const run = this.run(reason).finally(() => {
      this.running = null;
      const next = this.again;
      this.again = null;
      if (next) void this.request(next);
    });
    this.running = run;
    return run;
  }

  /** Before signing out: saves what is not saved yet, waiting FLUSH_MS at most. */
  async flush(ms = FLUSH_MS): Promise<void> {
    clearTimeout(this.changeTimer);
    const done = async (): Promise<void> => {
      await this.request('change');
      // A change made while that one ran is saved by the run after it.
      while (this.running) await this.running;
    };
    await Promise.race([done(), sleep(ms)]);
  }

  /** Settings → Reset progress while signed in: the account's progress is reset too, now or once it can be reached. */
  reset(): void {
    const me = this.host.me();
    if (!me) return;
    const s = loadSync(me.id) ?? { accountId: me.id, rev: 0, resetAt: null, base: null, pendingReset: false };
    saveSync({ ...s, pendingReset: true });
    this.resetAsked = true;
    void this.request('retry');
  }

  /** Nobody is signed in any more: forget what this device knew about the account, and stop. */
  forget(): void {
    clearTimeout(this.changeTimer);
    clearTimeout(this.retryTimer);
    this.again = null;
    this.pulledAt = -Infinity;
    this.failures = 0;
    this.resetAsked = false;
    saveSync(null);
  }

  private saved(): void {
    this.failures = 0;
    this.status('saved');
  }

  private status(status: SyncStatus): void {
    this.host.dispatch({ type: 'syncStatus', status });
  }

  /**
   * Still signed in to the account this run is for, and not overtaken by Reset progress: a sign-out or a reset
   * meanwhile drops what the run learnt (the run after it starts from the new state).
   */
  private still(id: string): boolean {
    return this.host.me()?.id === id && !this.resetAsked;
  }

  /** Remembers the account's copy at `saved.rev` as `base`, the common ground from now on. */
  private keep(id: string, saved: SavedProgress, base: Synced | null): SyncState {
    const state: SyncState = { accountId: id, rev: saved.rev, resetAt: saved.resetAt, base, pendingReset: false };
    saveSync(state);
    return state;
  }

  private local(): Synced {
    return this.host.local();
  }

  private async run(reason: SyncReason): Promise<void> {
    const me = this.host.me();
    if (!me) return;
    const id = me.id;
    try {
      let s = loadSync(id);
      // The account's copy is known as of now (the answer to a reset): no need to ask for it again.
      let fresh = false;
      if (s?.pendingReset) {
        this.resetAsked = false;
        const saved = savedOf(await api.del<SavedProgress>('/progress'));
        if (!saved) throw new Error('DELETE /progress: not a SavedProgress');
        if (!this.still(id)) return;
        // This device was reset already; what it did since is a change on top of the reset copy.
        s = this.keep(id, saved, readSynced(saved.data));
        fresh = true;
      }
      if (!this.still(id)) return;
      const local = this.local();
      const clean = !!s && s.base !== null && sameValue(local, s.base);
      if (clean && (reason === 'change' || fresh)) {
        this.status('saved');
        return;
      }
      // A save sends the whole copy, so it must never hold less than the account's last copy. Another tab of the app,
      // which shares this storage, may have saved results this tab's store does not have yet: they come in first, and
      // the change that makes in the store saves them all.
      if (s?.base && !clean && !sameValue(mergeSynced(local, s.base, s.base), local)) {
        this.host.dispatch({ type: 'syncApply', remote: s.base, base: s.base, reset: false });
        this.status('saving');
        return;
      }
      let remote: SavedProgress;
      if (s && !clean) {
        // A change here, made on top of the copy at s.rev (or on none, at rev 0): save it.
        this.status('saving');
        try {
          const saved = savedOf(await api.put<SavedProgress>('/progress', { rev: s.rev, prefs: local.prefs, progress: local.progress }));
          if (!saved) throw new Error('PUT /progress: not a SavedProgress');
          if (!this.still(id)) return;
          this.keep(id, saved, local);
          this.saved();
          return;
        } catch (e) {
          remote = conflictCopy(e);
        }
      } else {
        if (reason === 'visible' && Date.now() - this.pulledAt < PULL_EVERY_MS) return;
        const got = savedOf(await api.get<SavedProgress>('/progress'));
        if (!got) throw new Error('GET /progress: not a SavedProgress');
        remote = got;
        this.pulledAt = Date.now();
      }
      if (!this.still(id)) return;
      await this.receive(id, s, remote, local);
    } catch (e) {
      this.failed(e, id);
    }
  }

  /** The account's copy arrived: nothing new, the first save of this account, or a copy to merge in. */
  private async receive(id: string, s: SyncState | null, remote: SavedProgress, local: Synced, tries = 3): Promise<void> {
    if (s && s.base && remote.rev === s.rev) {
      this.status('saved');
      return;
    }
    const first = !s;
    if (!remote.data) {
      // The account has no copy yet: this device's is the first.
      this.status('saving');
      const sent = this.local();
      try {
        const saved = savedOf(await api.put<SavedProgress>('/progress', { rev: remote.rev, prefs: sent.prefs, progress: sent.progress }));
        if (!saved) throw new Error('PUT /progress: not a SavedProgress');
        if (!this.still(id)) return;
        this.keep(id, saved, sent);
        this.saved();
        if (first) this.added(sent);
      } catch (e) {
        const copy = conflictCopy(e);
        if (tries <= 1 || !this.still(id)) throw e;
        await this.receive(id, s, copy, local, tries - 1);
      }
      return;
    }
    if (!this.still(id)) return;
    const copy = readSynced(remote.data)!;
    // A reset on another device since this one last saw the account: its progress replaces this device's.
    const reset = !!s && remote.resetAt !== s.resetAt;
    this.host.dispatch({ type: 'syncApply', remote: copy, base: s?.base ?? null, reset });
    this.keep(id, remote, copy);
    // The merge, when it differs from the account's copy, is saved by the change it makes in the store.
    this.status(sameValue(this.local(), copy) ? 'saved' : 'saving');
    if (first) this.added(local);
  }

  /** A first sign-in on a device with progress: say it is on the account now. */
  private added(local: Synced): void {
    if (isEmptyProgress(local.progress)) return;
    this.host.dispatch({ type: 'accountNotice', notice: 'progressAdded' });
    announce(t('settings.noticeProgressAdded'));
  }

  private failed(e: unknown, id: string): void {
    if (!this.still(id)) return;
    const err = asApiError(e);
    if (err.code === 'unauthenticated') {
      // The session ended: signed out (this device's progress stays, and what it knew of the account goes).
      sessionEnded(this.host.dispatch);
      return;
    }
    // Not an answer of the API: a bug here, worth seeing in the console.
    if (!(e instanceof ApiError)) console.error(e);
    const s = loadSync(id);
    const dirty = !s || !s.base || s.pendingReset || !sameValue(this.local(), s.base);
    this.status(err.code === 'unavailable' ? (dirty ? 'pending' : 'saved') : 'failed');
    clearTimeout(this.retryTimer);
    const wait = Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** this.failures);
    this.failures++;
    this.retryTimer = setTimeout(() => void this.request('retry'), wait);
  }
}

/** The app's one sync, made by useProgressSync (null before, and in tests that do not mount it). */
let engine: ProgressSync | null = null;

/** The app's sync, for Sign out (flush) and Reset progress (reset); null when the app has not started it. */
export function progressSync(): ProgressSync | null {
  return engine;
}

/** Runs the sync for the app: mounted once, inside the StoreProvider. */
export function useProgressSync(): void {
  const { state, dispatch } = useStore();
  const me = state.account.me;
  const live = useRef({ me, local: syncedOf(state.prefs, state.progress) });
  const sync = useRef<ProgressSync | null>(null);
  if (!sync.current) {
    sync.current = new ProgressSync({ me: () => live.current.me, local: () => live.current.local, dispatch });
    engine = sync.current;
  }
  const synced = syncedOf(state.prefs, state.progress);
  // What the sync reads is the state as committed: updated before the effects below ask it to run.
  useEffect(() => {
    live.current = { me, local: synced };
  });

  // Signed in (on start with a cached account, or a sign-in): sync now. Signed out: forget the account's copy.
  const id = me?.id ?? null;
  useEffect(() => {
    live.current = { me, local: synced };
    if (id) void sync.current!.request('start');
    else sync.current!.forget();
  }, [id]);

  // A change of what syncs (not the device's own prefs): saved a moment later.
  const key = JSON.stringify(synced.prefs);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    live.current = { me, local: synced };
    if (id) sync.current!.changed();
  }, [state.progress, key]);

  useEffect(() => {
    const online = (): void => {
      if (live.current.me) void sync.current!.request('online');
    };
    const visible = (): void => {
      if (live.current.me && document.visibilityState === 'visible') void sync.current!.request('visible');
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
}
