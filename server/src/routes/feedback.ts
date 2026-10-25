import type { FastifyPluginAsync } from 'fastify';
import type { FeedbackSent } from '../../../shared/api.js';
import { buildIssue, FEEDBACK_KINDS, type FeedbackReport } from '../../../shared/feedback.js';
import { writeAudit } from '../accounts/audit.js';
import { signedIn } from '../auth/guard.js';
import type { AppContext } from '../context.js';
import { ApiError } from '../errors.js';
import * as s from './schemas.js';

// Feedback (docs/FEEDBACK-LOOP.md, step 1): an account with feedback.give sends what it marked in the app, and the API
// opens the GitHub issue with its own token, so no device holds one. The issue's format and labels are built here
// (shared/feedback.ts), not taken from the app. The issue names no one, as the repository is public; the audit log
// says who sent it.

/** Sends per account per hour: plenty for a person, and a stop for a loop gone wrong. */
export const FEEDBACK_PER_HOUR = 30;
const HOUR = 60 * 60_000;
const GITHUB_TIMEOUT_MS = 15_000;

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
    // The player's settings as the app keeps them: any shape, kept small by the body limit.
    prefs: { type: 'object' },
  }),
});

export const feedbackRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { c } = ctx;
  /** When each account last sent, for FEEDBACK_PER_HOUR. Kept in memory: a restart forgets, which is fine. */
  const sent = new Map<string, number[]>();

  app.post<{ Body: FeedbackReport }>(
    '/feedback',
    { config: { permission: 'feedback.give' }, schema: { body: report } },
    async (request): Promise<FeedbackSent> => {
      const actor = signedIn(request).account;
      if (!ctx.github) throw new ApiError('feedback_unavailable', 'This server has no GitHub token for feedback');
      if (!request.body.description.trim()) throw new ApiError('bad_request', 'Say what should change');

      const now = ctx.now().getTime();
      const key = actor._id.toHexString();
      const recent = (sent.get(key) ?? []).filter((at) => at > now - HOUR);
      if (recent.length >= FEEDBACK_PER_HOUR) {
        const retryAfter = Math.ceil((recent[0] + HOUR - now) / 1000);
        throw new ApiError('too_many_attempts', 'Too much feedback in an hour', retryAfter);
      }

      const draft = buildIssue(request.body);
      const { token, repo } = ctx.github;
      let res: Response;
      try {
        res = await ctx.fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'muzieklab-api',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify(draft),
          signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
        });
      } catch (err) {
        request.log.warn({ err }, 'feedback: GitHub did not answer');
        throw new ApiError('feedback_failed', 'GitHub did not answer');
      }
      if (res.status !== 201) {
        // The status says enough (401: the token was refused; 403/404: it has no access to the repository).
        request.log.warn({ status: res.status }, 'feedback: GitHub refused the issue');
        throw new ApiError('feedback_failed', `GitHub answered ${res.status}`);
      }
      const issue = (await res.json()) as { number: number; html_url: string };
      sent.set(key, [...recent, now]);
      await writeAudit(c, ctx.now(), {
        actorId: actor._id,
        action: 'feedback.send',
        targetId: null,
        details: { issue: issue.number, kind: request.body.kind },
      });
      return { number: issue.number, url: issue.html_url };
    },
  );
};
