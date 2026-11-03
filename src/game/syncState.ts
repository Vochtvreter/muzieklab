/**
 * What this device knows about the account's copy of its progress (BACKEND-PLAN.md §6.2), kept in storage so a reload
 * or a day offline does not forget it: whose account, the rev and reset it last saw, and `base`, the copy both sides
 * agreed on then. A change on this device is what differs from `base`; merging uses it to tell who changed what.
 */
import { readSynced, type Synced } from './merge';

export const SYNC_KEY = 'muzieklab.sync.v1';

export interface SyncState {
  accountId: string;
  /** The account's rev this device last saw (0: the account had no copy). */
  rev: number;
  /** The account's resetAt at that rev. */
  resetAt: string | null;
  /** The copy at that rev (null while the account had none). */
  base: Synced | null;
  /** Settings → Reset progress was used while the account could not be told: DELETE /progress before anything else. */
  pendingReset: boolean;
}

/** The sync state for this account, or null when there is none (a first sign-in here) or it is another account's. */
export function loadSync(accountId: string): SyncState | null {
  let raw: unknown;
  try {
    const text = localStorage.getItem(SYNC_KEY);
    raw = text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (v.accountId !== accountId || typeof v.rev !== 'number' || !Number.isInteger(v.rev) || v.rev < 0) return null;
  const base = v.base === null ? null : readSynced(v.base as Parameters<typeof readSynced>[0]);
  // A copy that cannot be read is no common ground: start again as on a first sign-in.
  if (v.base !== null && !base) return null;
  return {
    accountId,
    rev: v.rev,
    resetAt: typeof v.resetAt === 'string' ? v.resetAt : null,
    base,
    pendingReset: v.pendingReset === true,
  };
}

/** Saves it, or forgets it for null (signed out: the next sign-in here is a first one again). */
export function saveSync(state: SyncState | null): void {
  try {
    if (state) localStorage.setItem(SYNC_KEY, JSON.stringify(state));
    else localStorage.removeItem(SYNC_KEY);
  } catch {
    /* storage full or blocked: the next sync starts as a first one, which merges and loses nothing */
  }
}
