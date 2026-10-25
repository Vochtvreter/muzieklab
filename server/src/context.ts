import type { Db } from 'mongodb';
import type { AttemptLimiter } from './auth/attempts.js';
import type { CookieSettings } from './auth/sessions.js';
import type { GitHubSettings } from './config.js';
import type { Collections } from './db.js';

/** What the routes share: built once in app.ts. */
export interface AppContext {
  db: Db;
  c: Collections;
  /** The clock: tests pass their own, to move time on. */
  now: () => Date;
  cookies: CookieSettings;
  attempts: AttemptLimiter;
  /** Where feedback goes, or null when this server has no GitHub token (config.ts). */
  github: GitHubSettings | null;
  /** fetch, for the calls to GitHub: tests pass their own. */
  fetch: typeof fetch;
}
