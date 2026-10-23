/**
 * Feedback reports (docs/FEEDBACK-LOOP.md, step 1): what an administrator marked on a screen, what they want changed,
 * and the context an agent needs to find and reproduce it. A report becomes one GitHub issue: a readable body plus a
 * JSON block the triage agent parses (the `muzieklab-feedback:v1` marker names its format).
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
  /** The page's scroll offset when it was marked, so the box can be found again on a long page. */
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

export interface FeedbackReport {
  kind: FeedbackKind;
  title: string;
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
