import type { FastifyPluginAsync } from 'fastify';
import type { ObjectId } from 'mongodb';
import { PROGRESS_MAX_BYTES, type SaveProgressRequest, type SavedProgress } from '../../../shared/api.js';
import { toSavedProgress } from '../accounts/views.js';
import { signedIn } from '../auth/guard.js';
import type { AppContext } from '../context.js';
import { isDuplicateKey } from '../db.js';
import { ApiError } from '../errors.js';
import * as s from './schemas.js';

// The progress and prefs saved on the signed-in account (BACKEND-PLAN.md §6, §7). The app merges; the server only
// keeps one copy per account and its rev, so a device that saves from an older copy is told instead of overwriting.

const OWN = { permission: 'progress.own' } as const;

/** Deeper than any of the app's documents (Progress is four levels deep). */
const MAX_DEPTH = 12;

/**
 * Null when `value` can be stored as it is, else what is wrong. Keys that start with `$` are MongoDB's operators and
 * never the app's; a document too deep or too big is not one the app makes.
 */
export function storableProblem(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return 'nested too deep';
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = storableProblem(item, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('\0')) return `the key ${JSON.stringify(key)} cannot be stored`;
      const problem = storableProblem(item, depth + 1);
      if (problem) return problem;
    }
  }
  return null;
}

const dataSchema = { type: 'object' } as const;

export const progressRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { c } = ctx;

  const current = async (accountId: ObjectId): Promise<SavedProgress> => toSavedProgress(await c.progress.findOne({ _id: accountId }));

  app.get('/progress', { config: OWN }, async (request): Promise<SavedProgress> => current(signedIn(request).account._id));

  app.put<{ Body: SaveProgressRequest }>(
    '/progress',
    {
      config: OWN,
      schema: {
        body: s.body({ rev: { type: 'integer', minimum: 0 }, prefs: dataSchema, progress: dataSchema }, ['rev', 'prefs', 'progress']),
      },
    },
    async (request): Promise<SavedProgress> => {
      const { account } = signedIn(request);
      const { rev, prefs, progress } = request.body;
      const problem = storableProblem(prefs) ?? storableProblem(progress);
      if (problem) throw new ApiError('bad_request', `This progress cannot be saved: ${problem}`);
      if (Buffer.byteLength(JSON.stringify({ prefs, progress })) > PROGRESS_MAX_BYTES) {
        throw new ApiError('bad_request', 'This progress is too big to save');
      }
      const now = ctx.now();
      if (rev === 0) {
        // The first save: two devices saving their first copy at once both send 0, and the unique _id refuses one.
        try {
          const doc = { _id: account._id, schema: 1 as const, prefs, progress, rev: 1, resetAt: null, updatedAt: now };
          await c.progress.insertOne(doc);
          return toSavedProgress(doc);
        } catch (err) {
          if (!isDuplicateKey(err)) throw err;
        }
      } else {
        const doc = await c.progress.findOneAndUpdate(
          { _id: account._id, rev },
          { $set: { prefs, progress, updatedAt: now }, $inc: { rev: 1 } },
          { returnDocument: 'after' },
        );
        if (doc) return toSavedProgress(doc);
      }
      throw new ApiError('rev_conflict', 'The progress on the account has changed since', undefined, {
        current: await current(account._id),
      });
    },
  );

  app.delete('/progress', { config: OWN }, async (request): Promise<SavedProgress> => {
    const { account } = signedIn(request);
    const now = ctx.now();
    // Whatever the rev: a reset wins over every copy, and the other devices drop theirs when they see resetAt.
    const doc = await c.progress.findOneAndUpdate(
      { _id: account._id },
      { $set: { progress: {}, resetAt: now, updatedAt: now }, $inc: { rev: 1 } },
      { returnDocument: 'after' },
    );
    return toSavedProgress(doc);
  });
};
