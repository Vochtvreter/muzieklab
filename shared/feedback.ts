/**
 * Feedback reports (docs/FEEDBACK-LOOP.md, step 1): what someone with feedback.give marked on a screen, what they want
 * changed, and the context an agent needs to find and reproduce it.
 *
 * The app sends a report to the API (POST /feedback), which stores it for an admin with feedback.review to read and
 * accept or decline in the app (the bodies below). An accepted report is meant to become one GitHub issue later: a
 * readable body plus a JSON block the triage agent parses (`buildIssue`, the `muzieklab-feedback:v1` marker); until
 * that step is built, Copy (Markdown) and GitHub's own new-issue page (`newIssueUrl`) are the way there.
 *
 * Shared by the app and the API. No imports: both sides bundle it as it is.
 */

export type FeedbackKind = 'bug' | 'change' | 'idea';
export const FEEDBACK_KINDS: FeedbackKind[] = ['bug', 'change', 'idea'];

/** The ticket system: issues on the app's own repository, where the agents work too. */
export const FEEDBACK_REPO = 'Vochtvreter/muzieklab';
/** The issue body's marker: the agent only picks up issues that carry it (and come from an allowed author). */
export const REPORT_MARKER = 'muzieklab-feedback:v1';
/** Every new report starts in triage; the label is the ticket’s place in the loop (docs/FEEDBACK-LOOP.md §2). */
export const STATUS_NEW = 'status:triage';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of the screen that was marked: one element (a tap or click) or a box drawn over the screen. */
export interface FeedbackTarget {
  mode: 'element' | 'area';
  /** A CSS selector for the element (for an area: the element under its centre). */
  selector: string;
  /** How a person would name it: `button “Start”`, `heading “Settings”`. */
  label: string;
  /** Its visible text, shortened. */
  text: string;
  /** Its markup, shortened. */
  html: string;
  /** The marked box in CSS px, relative to the viewport. */
  rect: Rect;
  /**
   * The page's scroll offset when it was marked, so the box can be found again on a long page: the window's plus that
   * of the boxes around the element (a screen scrolls inside .page), leaving out scroll that does not move it (of the
   * box a sticky part sticks in, all but how far the part went along before it stuck; all of it for a fixed part). The
   * box plus it is the spot on the unscrolled page.
   */
  scroll: { x: number; y: number };
}

export interface FeedbackContext {
  version: string;
  /** location.href when the report was made. */
  url: string;
  /** The hash route, '/settings'. */
  route: string;
  viewport: { width: number; height: number; dpr: number };
  breakpoint: 'phone' | 'tablet' | 'desktop';
  orientation: 'portrait' | 'landscape';
  pointer: 'fine' | 'coarse';
  theme: { setting: string; shown: 'light' | 'dark' };
  locale: string;
  userAgent: string;
  /** ISO time. */
  at: string;
  /** The player's preferences, so the agent can seed them (e2e/helpers.ts seed()) and see the same screen. */
  prefs: unknown;
}

/** The longest description the API stores (counted as code points; a text field's maxLength counts no fewer). */
export const FEEDBACK_DESCRIPTION_MAX = 5000;

export interface FeedbackReport {
  kind: FeedbackKind;
  title: string;
  /** What should change, up to FEEDBACK_DESCRIPTION_MAX characters. */
  description: string;
  target: FeedbackTarget;
  context: FeedbackContext;
}

export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

const KIND_WORD: Record<FeedbackKind, string> = { bug: 'Bug', change: 'Change request', idea: 'Idea' };

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

/**
 * An invite or new-password screen's route, with its token: '/reset/<token>', or '#/reset/<token>' in an address, or
 * in the text or markup of a marked part (an admin's link card). A token is base64url, so the match ends at the space,
 * quote or tag after it.
 */
const TOKEN_ROUTE = /(^|#)\/(invite|reset)\/[\w-]+/g;

/**
 * The route, address or text with an invite or new-password link's token left out ('/reset/:token'). Whoever has the
 * token can claim the account (BACKEND-PLAN.md §5.1), and a report is read by its reviewers and may become a public
 * issue, so the app leaves it out of what it sends, and the API again of what it stores.
 */
export function withoutToken(routeOrUrl: string): string {
  return routeOrUrl.replace(TOKEN_ROUTE, '$1/$2/:token');
}

/** A field's start tag as a browser writes it, its attributes whole (a quoted value may hold a '>'), cut short or not. */
const FIELD_TAG = /<(?:input|textarea)\b(?: [^\s"'>/=]+(?:="[^"]*(?:"|$))?)*/gi;
const FIELD_VALUE = / value="[^"]*(?:"|$)/gi;
/** A text area's start tag and its text, up to its end tag or the end of markup that was cut. */
const AREA_TEXT = /(<textarea\b(?: [^\s"'>/=]+(?:="[^"]*")?)*>)[^<]*/gi;

/**
 * The marked part as a report keeps it: no link token in its name, text or markup (withoutToken), and nothing typed in
 * a field in its markup. React keeps what is typed in a field in its value attribute, a password too, and a text area's
 * in its text. The app leaves them out of what it sends (src/feedback/dom.ts), and the API again of what it stores and
 * hands out, for a report sent before the app did.
 */
export function withoutSecrets(target: FeedbackTarget): FeedbackTarget {
  const html = withoutToken(target.html)
    .replace(FIELD_TAG, (tag) => tag.replace(FIELD_VALUE, ''))
    .replace(AREA_TEXT, '$1');
  return { ...target, label: withoutToken(target.label), text: withoutToken(target.text), html };
}

/** One line with no line breaks or runs of spaces, cut to `max` characters. */
export function clip(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat;
}

/** Backticks would end the inline code they are shown in. */
const code = (s: string): string => '`' + s.replace(/`/g, "'") + '`';

/** What the agent parses: everything in the report, with the box rounded. `lean` drops the markup and prefs (URL length). */
export function reportData(r: FeedbackReport, lean = 0): object {
  const target = { ...r.target, rect: round(r.target.rect), ...(lean >= 1 ? { html: undefined } : {}) };
  const context = { ...r.context, ...(lean >= 2 ? { prefs: undefined, userAgent: undefined } : {}) };
  return { format: REPORT_MARKER, kind: r.kind, title: r.title, description: r.description, target, context };
}

/**
 * The GitHub issue for a report. `lean` (0–2) leaves out the bulky parts, for a prefilled issue link that has to stay
 * short; the readable part is the same.
 */
export function buildIssue(r: FeedbackReport, lean = 0): IssueDraft {
  const { target: tg, context: cx } = r;
  const box = round(tg.rect);
  const title = clip(r.title, 120) || `${KIND_WORD[r.kind]}: ${clip(tg.label, 60)} on ${cx.route}`;
  const shown = `${cx.viewport.width} × ${cx.viewport.height}`;
  const lines = [
    `**${KIND_WORD[r.kind]}** · reported in the app (v${cx.version})`,
    '',
    '### What should change',
    '',
    r.description.trim() || '_No description._',
    '',
    '### Where',
    '',
    `- **Screen:** ${code('#' + cx.route)}`,
    `- **Marked:** ${tg.mode === 'area' ? 'an area around ' : ''}${tg.label} — ${code(tg.selector)}`,
    ...(tg.text ? [`- **Text there:** “${clip(tg.text, 160)}”`] : []),
    `- **Box:** x ${box.x}, y ${box.y}, ${box.width} × ${box.height} px, in a ${shown} viewport` +
      (tg.scroll.y || tg.scroll.x ? `, scrolled to ${Math.round(tg.scroll.x)}, ${Math.round(tg.scroll.y)}` : ''),
    `- **Device:** ${cx.breakpoint}, ${cx.orientation}, ${cx.pointer === 'coarse' ? 'touch' : 'mouse'}, ${cx.theme.shown} theme, ${cx.locale}`,
    '',
    '### Reproduce',
    '',
    `1. Open ${cx.url} at ${shown} (device pixel ratio ${cx.viewport.dpr}).`,
    '2. Seed `muzieklab.prefs.v1` with `context.prefs` below (`seed()` in `e2e/helpers.ts`).',
    `3. Look at the box above; it is drawn on the screenshot the triage step takes.`,
    '',
    '<details><summary>Report data</summary>',
    '',
    '```json',
    JSON.stringify(reportData(r, lean), null, 2),
    '```',
    '',
    '</details>',
    '',
    `<!-- ${REPORT_MARKER} -->`,
  ];
  return { title, body: lines.join('\n'), labels: ['feedback', 'type:' + r.kind, STATUS_NEW] };
}

/**
 * GitHub's "new issue" page with the report filled in, for sending without a token: the administrator checks it and
 * presses Create there (and can paste a screenshot). Long reports drop their bulky data to stay under `max` characters.
 */
export function newIssueUrl(r: FeedbackReport, repo = FEEDBACK_REPO, max = 8000): string {
  let url = '';
  for (let lean = 0; lean <= 2; lean++) {
    const d = buildIssue(r, lean);
    const q = new URLSearchParams({ title: d.title, body: d.body, labels: d.labels.join(',') });
    url = `https://github.com/${repo}/issues/new?${q.toString()}`;
    if (url.length <= max) return url;
  }
  return url;
}

/** Parses the report data back out of an issue body (what the triage agent does), or null if it has none. */
export function parseIssueBody(body: string): ReturnType<typeof reportData> | null {
  if (!body.includes(`<!-- ${REPORT_MARKER} -->`)) return null;
  const m = /```json\n([\s\S]*?)\n```/.exec(body);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]) as { format?: string };
    return data.format === REPORT_MARKER ? data : null;
  } catch {
    return null;
  }
}

// --- reviewing reports in the app (feedback.review; the API's bodies, BACKEND-PLAN.md §7) --------------------------

/**
 * Where a stored report stands: new until an admin looks at it; accepted (picked up: it is to become a GitHub issue,
 * a later step) or declined.
 */
export const FEEDBACK_STATUSES = ['new', 'accepted', 'declined'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** POST /feedback → the stored report's id. */
export interface FeedbackSaved {
  id: string;
}

/** Someone a report names: its author or its reviewer. Null in their place: the account was deleted since. */
export interface FeedbackPerson {
  id: string;
  name: string;
}

/** A report in the list: what it is about, where, from whom, and where the review stands. */
export interface FeedbackSummary {
  id: string;
  kind: FeedbackKind;
  /** As written; '' when the author left it empty (the app then names it by its kind, spot and screen). */
  title: string;
  description: string;
  /** The hash route it was sent from, '/settings'. */
  route: string;
  /** The marked spot as a person would name it (FeedbackTarget.label), and whether it was an element or a drawn box. */
  label: string;
  mode: FeedbackTarget['mode'];
  status: FeedbackStatus;
  author: FeedbackPerson | null;
  createdAt: string;
}

/** One report, whole: the summary, the report as sent, and the review. */
export interface FeedbackDetail extends FeedbackSummary {
  report: FeedbackReport;
  /** The reviewing admin's note, for the team ('' for none). */
  note: string;
  /** Who last changed the status or the note, and when; null before anyone did. */
  reviewer: FeedbackPerson | null;
  reviewedAt: string | null;
}

/** GET /admin/feedback?status= → the reports, newest first (at most 500), and how many there are per status. */
export interface FeedbackListResponse {
  reports: FeedbackSummary[];
  counts: Record<FeedbackStatus, number>;
}

/** PATCH /admin/feedback/:id → FeedbackDetail. Only the fields sent change. */
export interface FeedbackUpdateRequest {
  status?: FeedbackStatus;
  /** Up to FEEDBACK_NOTE_MAX characters; '' clears it. */
  note?: string;
}

export const FEEDBACK_NOTE_MAX = 2000;

/**
 * PUT /admin/feedback-mode (feedback.review) → FeedbackMode: feedback mode on or off, for everyone. Only while it is on
 * does an account with feedback.give see the Feedback button (Me.feedbackMode). Off until an admin turns it on.
 */
export interface FeedbackMode {
  on: boolean;
}

