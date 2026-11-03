import { randomBytes } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { FEEDBACK_MAX, type Closure, type ClosureKind } from '../../../shared/api.js';
import { showsNothing } from '../../../shared/feedback.js';
import type { AccountDoc, ClosureDoc, Collections } from '../db.js';
import { ApiError } from '../errors.js';

// Deleted accounts (BACKEND-PLAN.md §3.7): one Closure for every account that is deleted, written in the deletion's
// transaction. It keeps nothing that says whose it was, so it can stay when everything else about the account goes.

/**
 * Feedback as stored: trimmed, null when it shows nothing (only spaces, or a pasted zero-width space, as a report's
 * description: feedback.ts, showsNothing); more than FEEDBACK_MAX characters is bad_request.
 */
export function validFeedback(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  if (showsNothing(text)) return null;
  if ([...text].length > FEEDBACK_MAX) throw new ApiError('bad_request', `Feedback has at most ${FEEDBACK_MAX} characters`);
  return text;
}

/** Midnight UTC of the day of `now`: the only time a Closure keeps. */
function dayOf(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface ClosureInput {
  kind: ClosureKind;
  feedback?: string | null;
}

/**
 * Writes the Closure for `account`, before its documents are removed (removeAccount). Only an archived one copies
 * anything of the account: the month it was made, and its saved progress and prefs.
 */
export async function writeClosure(
  c: Collections,
  account: AccountDoc,
  now: Date,
  { kind, feedback = null }: ClosureInput,
  session: ClientSession,
): Promise<void> {
  let archive: ClosureDoc['archive'] = null;
  if (kind === 'archived') {
    const progress = await c.progress.findOne({ _id: account._id }, { session });
    archive = {
      joined: account.createdAt.toISOString().slice(0, 7),
      data: progress ? { prefs: progress.prefs, progress: progress.progress } : null,
    };
  }
  await c.closures.insertOne(
    { _id: randomBytes(16).toString('hex'), day: dayOf(now), kind, feedback: kind === 'admin' ? null : feedback, archive },
    { session },
  );
}

export function toClosure(doc: ClosureDoc): Closure {
  return {
    id: doc._id,
    day: doc.day.toISOString().slice(0, 10),
    kind: doc.kind,
    feedback: doc.feedback,
    archive: doc.archive,
  };
}
