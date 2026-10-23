/**
 * Feedback mode on this device (docs/FEEDBACK-LOOP.md §3): off for everyone until an administrator opens the app with
 * `?feedback=on` (in the address or after the hash: `#/settings?feedback=on`, for an installed app); `?feedback=off`
 * turns it off again. An optional GitHub token, kept on this device only, sends reports straight to the issue tracker.
 *
 * Feedback mode is not a security boundary: anyone can open an issue on a public repository. What the agents act on is
 * decided on GitHub, by who wrote the issue (docs/FEEDBACK-LOOP.md §9).
 */
import { FEEDBACK_REPO, type IssueDraft } from './report';

export const FEEDBACK_KEY = 'muzieklab.feedback.v1';

export interface FeedbackAdmin {
  enabled: boolean;
  /** A fine-grained GitHub token with Issues: read and write on the repository only; empty to send by link. */
  token: string;
}

const OFF: FeedbackAdmin = { enabled: false, token: '' };

export function loadAdmin(storage: Storage | undefined = globalThis.localStorage): FeedbackAdmin {
  try {
    const raw = JSON.parse(storage?.getItem(FEEDBACK_KEY) ?? 'null') as Partial<FeedbackAdmin> | null;
    if (!raw || typeof raw !== 'object') return { ...OFF };
    return { enabled: raw.enabled === true, token: typeof raw.token === 'string' ? raw.token.trim() : '' };
  } catch {
    return { ...OFF };
  }
}

export function saveAdmin(admin: FeedbackAdmin, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    if (!admin.enabled && !admin.token) storage?.removeItem(FEEDBACK_KEY);
    else storage?.setItem(FEEDBACK_KEY, JSON.stringify(admin));
  } catch {
    /* storage blocked: feedback mode lasts for this visit */
  }
}

/** `?feedback=on|off` in the query or in the hash's query: true, false, or null when neither says. */
export function switchFrom(search: string, hash: string): boolean | null {
  const hq = hash.indexOf('?');
  for (const q of [new URLSearchParams(search), new URLSearchParams(hq < 0 ? '' : hash.slice(hq + 1))]) {
    const v = q.get('feedback');
    if (v === 'on' || v === '1') return true;
    if (v === 'off' || v === '0') return false;
  }
  return null;
}

/** The URL without its feedback switch, so a copied link or a report never carries it. */
export function withoutSwitch(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('feedback');
  const [path, query] = url.hash.split('?');
  if (query !== undefined) {
    const q = new URLSearchParams(query);
    q.delete('feedback');
    url.hash = path + (q.toString() ? '?' + q.toString() : '');
  }
  return url.toString();
}

export type SendResult = { ok: true; number: number; url: string } | { ok: false; reason: 'token' | 'access' | 'invalid' | 'network' | 'other'; status?: number };

/** Opens the issue with the GitHub REST API. */
export async function createIssue(draft: IssueDraft, token: string, repo = FEEDBACK_REPO, fetcher: typeof fetch = fetch): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetcher(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(draft),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (res.ok) {
    const issue = (await res.json()) as { number: number; html_url: string };
    return { ok: true, number: issue.number, url: issue.html_url };
  }
  const reason = res.status === 401 ? 'token' : res.status === 403 || res.status === 404 ? 'access' : res.status === 422 ? 'invalid' : 'other';
  return { ok: false, reason, status: res.status };
}
