import type { FastifyPluginAsync } from 'fastify';
import { ObjectId, type Filter } from 'mongodb';
import type { AuditEntry } from '../../../shared/api.js';
import {
  FEEDBACK_KINDS,
  FEEDBACK_NOTE_MAX,
  FEEDBACK_STATUSES,
  type FeedbackDetail,
  type FeedbackListResponse,
  type FeedbackMode,
  type FeedbackPerson,
  type FeedbackReport,
  type FeedbackSaved,
  type FeedbackStatus,
  type FeedbackUpdateRequest,
} from '../../../shared/feedback.js';
import { writeAudit } from '../accounts/audit.js';
import { toFeedbackDetail, toFeedbackSummary, type FeedbackSummaryFields } from '../accounts/views.js';
import { signedIn } from '../auth/guard.js';
import type { AppContext } from '../context.js';
import { inTransaction, parseId, type FeedbackDoc } from '../db.js';
import { ApiError } from '../errors.js';
import { storableProblem } from './progress.js';
import * as s from './schemas.js';

// Feedback reports (docs/FEEDBACK-LOOP.md, step 1; BACKEND-PLAN.md §3.9, §7). An account with feedback.give sends what
// it marked in the app, and the API stores it. An admin with feedback.review reads the reports in the app, accepts or
// declines them, and keeps a note for the team; they also turn feedback mode on and off, which decides whether the app
// shows the Feedback button at all (Me.feedbackMode). Nothing goes to GitHub from here yet: opening issues for the accepted
// reports is the next step, and the server's GitHub token comes with it.
// (Not the feedback someone leaves when deleting their account: that is accounts/closures.ts.)

/** Sends per account per hour: plenty for a person, and a stop for a loop gone wrong. */
export const FEEDBACK_PER_HOUR = 30;
const HOUR = 60 * 60_000;
const LIST_MAX = 500;

const REVIEW = { permission: 'feedback.review' } as const;
const notFound = () => new ApiError('not_found', 'No such report');

const text = (max: number) => ({ type: 'string', maxLength: max }) as const;
const num = { type: 'number' } as const;
const obj = <P extends Record<string, object>>(properties: P) => s.body(properties, Object.keys(properties) as (keyof P & string)[]);

const report = obj({
  kind: { enum: FEEDBACK_KINDS },
  title: text(200),
  description: text(5000),
  target: obj({
    mode: { enum: ['element', 'area'] },
    selector: text(2000),
    label: text(300),
    text: text(1000),
    html: text(4000),
    rect: obj({ x: num, y: num, width: num, height: num }),
    scroll: obj({ x: num, y: num }),
  }),
  context: obj({
    version: text(40),
    url: text(2000),
    route: text(300),
    viewport: obj({ width: num, height: num, dpr: num }),
    breakpoint: { enum: ['phone', 'tablet', 'desktop'] },
    orientation: { enum: ['portrait', 'landscape'] },
    pointer: { enum: ['fine', 'coarse'] },
    theme: obj({ setting: text(20), shown: { enum: ['light', 'dark'] } }),
    locale: text(20),
    userAgent: text(500),
    at: text(40),
    // The player's settings as the app keeps them: any shape, kept small by the body limit (and checked in code).
    prefs: { type: 'object' },
  }),
});

/** Longer than FEEDBACK_NOTE_MAX characters can be, so the limit (counted as code points) is checked in code. */
const note = { type: 'string', maxLength: 4 * FEEDBACK_NOTE_MAX } as const;

/** What a list row shows: not the markup, the settings or the rest of the context, which can be long. */
const SUMMARY_FIELDS = {
  kind: 1,
  title: 1,
  description: 1,
  status: 1,
  authorId: 1,
  createdAt: 1,
  'target.label': 1,
  'target.mode': 1,
  'context.route': 1,
} as const;

/**
 * A note as stored: trimmed, with Windows line breaks made plain ones. More than FEEDBACK_NOTE_MAX characters (code
 * points), or a control character other than a line break, is bad_request.
 */
export function validNote(value: string): string {
  const text = value.replace(/\r\n?/g, '\n').trim();
  if ([...text].length > FEEDBACK_NOTE_MAX || /[^\P{Cc}\n]/u.test(text)) {
    throw new ApiError('bad_request', `A note has at most ${FEEDBACK_NOTE_MAX} characters, and no control characters but line breaks`);
  }
  return text;
}

export const feedbackRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { c } = ctx;
  /** When each account last sent, for FEEDBACK_PER_HOUR. Kept in memory: a restart forgets, which is fine. */
  const sent = new Map<string, number[]>();

  /** The accounts behind these ids, in one query: then each id's person, or null for none or an account that is gone. */
  async function people(ids: (ObjectId | null)[]): Promise<(id: ObjectId | null) => FeedbackPerson | null> {
    const wanted = ids.filter((id) => id !== null);
    const found = wanted.length > 0 ? await c.accounts.find({ _id: { $in: wanted } }, { projection: { name: 1 } }).toArray() : [];
    const byId = new Map(found.map((a) => [a._id.toHexString(), { id: a._id.toHexString(), name: a.name }]));
    return (id) => (id && byId.get(id.toHexString())) ?? null;
  }

  async function detail(doc: FeedbackDoc): Promise<FeedbackDetail> {
    const person = await people([doc.authorId, doc.reviewerId]);
    return toFeedbackDetail(doc, person(doc.authorId), person(doc.reviewerId));
  }

  app.post<{ Body: FeedbackReport }>(
    '/feedback',
    { config: { permission: 'feedback.give' }, schema: { body: report } },
    async (request): Promise<FeedbackSaved> => {
      const actor = signedIn(request).account;
      const { kind, title, description, target, context } = request.body;
      if (!description.trim()) throw new ApiError('bad_request', 'Say what should change');
      // The settings are the one part of the report the schema leaves open, and they are stored as they come: no key may
      // be one of MongoDB's operators, as in synced progress.
      const problem = storableProblem(context.prefs);
      if (problem) throw new ApiError('bad_request', `These settings cannot be stored: ${problem}`);

      const now = ctx.now();
      const at = now.getTime();
      const key = actor._id.toHexString();
      const recent = (sent.get(key) ?? []).filter((t) => t > at - HOUR);
      if (recent.length >= FEEDBACK_PER_HOUR) {
        const retryAfter = Math.ceil((recent[0] + HOUR - at) / 1000);
        throw new ApiError('too_many_attempts', 'Too much feedback in an hour', retryAfter);
      }
      // Counted before the insert, so sends that overlap each see the others (else all of them would pass the check
      // together); taken back if it is not stored, as a sign-in try is (auth/tries.ts countedTry).
      recent.push(at);
      sent.set(key, recent);

      const doc: FeedbackDoc = {
        _id: new ObjectId(),
        kind,
        title,
        description,
        target,
        context,
        status: 'new',
        authorId: actor._id,
        createdAt: now,
        note: '',
        reviewerId: null,
        reviewedAt: null,
      };
      try {
        await inTransaction(ctx.db, async (session) => {
          await c.feedback.insertOne(doc, { session });
          await writeAudit(
            c,
            now,
            { actorId: actor._id, action: 'feedback.send', targetId: null, details: { report: doc._id.toHexString(), kind } },
            session,
          );
        });
      } catch (err) {
        // The list as it is now: a send that overlapped this one may have put a new one in its place.
        const current = sent.get(key) ?? [];
        const i = current.lastIndexOf(at);
        if (i >= 0) current.splice(i, 1);
        throw err;
      }
      return { id: doc._id.toHexString() };
    },
  );

  app.get<{ Querystring: { status?: FeedbackStatus } }>(
    '/admin/feedback',
    {
      config: REVIEW,
      schema: {
        querystring: { type: 'object', additionalProperties: false, properties: { status: { enum: FEEDBACK_STATUSES } } },
      },
    },
    async (request): Promise<FeedbackListResponse> => {
      const { status } = request.query;
      const filter: Filter<FeedbackDoc> = status ? { status } : {};
      const [docs, groups] = await Promise.all([
        c.feedback
          .find<FeedbackSummaryFields>(filter, { projection: SUMMARY_FIELDS })
          .sort({ createdAt: -1, _id: -1 })
          .limit(LIST_MAX)
          .toArray(),
        // Over every report, whatever the filter: the filter shows how many each choice holds.
        c.feedback.aggregate<{ _id: FeedbackStatus; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
      ]);
      const person = await people(docs.map((d) => d.authorId));
      const count = new Map(groups.map((g) => [g._id, g.n]));
      return {
        reports: docs.map((d) => toFeedbackSummary(d, person(d.authorId))),
        counts: Object.fromEntries(FEEDBACK_STATUSES.map((x) => [x, count.get(x) ?? 0])) as Record<FeedbackStatus, number>,
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/admin/feedback/:id',
    { config: REVIEW, schema: { params: s.idParams } },
    async (request): Promise<FeedbackDetail> => {
      const _id = parseId(request.params.id);
      const doc = _id && (await c.feedback.findOne({ _id }));
      if (!doc) throw notFound();
      return detail(doc);
    },
  );

  app.patch<{ Params: { id: string }; Body: FeedbackUpdateRequest }>(
    '/admin/feedback/:id',
    { config: REVIEW, schema: { params: s.idParams, body: s.body({ status: { enum: FEEDBACK_STATUSES }, note }) } },
    async (request): Promise<FeedbackDetail> => {
      const actor = signedIn(request).account;
      const _id = parseId(request.params.id);
      if (!_id) throw notFound();
      const { status } = request.body;
      const newNote = request.body.note === undefined ? undefined : validNote(request.body.note);
      const now = ctx.now();
      const doc = await inTransaction(ctx.db, async (session) => {
        const before = await c.feedback.findOne({ _id }, { session });
        if (!before) throw notFound();
        const set: Partial<FeedbackDoc> = {};
        // The note's text stays out of the audit log: it is for the team, and the log is kept for two years.
        const details: AuditEntry['details'] = { report: before._id.toHexString() };
        if (status !== undefined && status !== before.status) {
          set.status = status;
          details.status = status;
        }
        if (newNote !== undefined && newNote !== before.note) {
          set.note = newNote;
          details.note = true;
        }
        // Sending what is there already changes nothing, not even who reviewed it last.
        if (Object.keys(set).length === 0) return before;
        const after = await c.feedback.findOneAndUpdate(
          { _id },
          { $set: { ...set, reviewerId: actor._id, reviewedAt: now } },
          { session, returnDocument: 'after' },
        );
        await writeAudit(c, now, { actorId: actor._id, action: 'feedback.review', targetId: null, details }, session);
        return after ?? before;
      });
      return detail(doc);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/feedback/:id',
    { config: REVIEW, schema: { params: s.idParams } },
    async (request, reply) => {
      const actor = signedIn(request).account;
      const _id = parseId(request.params.id);
      if (!_id) throw notFound();
      const now = ctx.now();
      await inTransaction(ctx.db, async (session) => {
        const { deletedCount } = await c.feedback.deleteOne({ _id }, { session });
        if (deletedCount === 0) throw notFound();
        await writeAudit(
          c,
          now,
          { actorId: actor._id, action: 'feedback.delete', targetId: null, details: { report: _id.toHexString() } },
          session,
        );
      });
      return reply.code(204).send();
    },
  );

  app.put<{ Body: FeedbackMode }>(
    '/admin/feedback-mode',
    { config: REVIEW, schema: { body: s.body({ on: { type: 'boolean' } }, ['on']) } },
    async (request): Promise<FeedbackMode> => {
      const actor = signedIn(request).account;
      const { on } = request.body;
      const now = ctx.now();
      await inTransaction(ctx.db, async (session) => {
        const before = await c.settings.findOne({ _id: 'app' }, { session });
        // Switching it to what it is already changes nothing, and is not logged.
        if ((before?.feedbackMode === true) === on) return;
        await c.settings.updateOne({ _id: 'app' }, { $set: { feedbackMode: on, updatedAt: now } }, { session, upsert: true });
        await writeAudit(c, now, { actorId: actor._id, action: 'feedback.mode', targetId: null, details: { on } }, session);
      });
      return { on };
    },
  );
};
