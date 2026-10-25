import { describe, expect, it } from 'vitest';
import { buildIssue, clip, newIssueUrl, parseIssueBody, REPORT_MARKER, STATUS_NEW, type FeedbackReport } from '../../shared/feedback';

const report = (patch: Partial<FeedbackReport> = {}): FeedbackReport => ({
  kind: 'change',
  title: 'Start button too low',
  description: 'The Start button sits under the fold on a small phone.\nMove it up.',
  target: {
    mode: 'element',
    selector: 'main.frame > div.frame-column > button.btn.start-btn',
    label: 'button “Start”',
    text: 'Start',
    html: '<button class="btn btn--accent start-btn">Start</button>',
    rect: { x: 16.4, y: 600.6, width: 358, height: 54 },
    scroll: { x: 0, y: 120 },
  },
  context: {
    version: '0.11.0',
    url: 'https://test.vivanova.app/#/setup',
    route: '/setup',
    viewport: { width: 375, height: 553, dpr: 3 },
    breakpoint: 'phone',
    orientation: 'portrait',
    pointer: 'coarse',
    theme: { setting: 'system', shown: 'dark' },
    locale: 'nl',
    userAgent: 'Mozilla/5.0 (iPhone)',
    at: '2026-10-23T10:00:00.000Z',
    prefs: { theme: 'system', language: 'nl' },
  },
  ...patch,
});

describe('buildIssue', () => {
  it('writes a readable issue with the screen, the spot, the device and the steps to see it again', () => {
    const d = buildIssue(report());
    expect(d.title).toBe('Start button too low');
    expect(d.labels).toEqual(['feedback', 'type:change', STATUS_NEW]);
    expect(d.body).toContain('**Change request** · reported in the app (v0.11.0)');
    expect(d.body).toContain('The Start button sits under the fold on a small phone.\nMove it up.');
    expect(d.body).toContain('- **Screen:** `#/setup`');
    expect(d.body).toContain('- **Marked:** button “Start” — `main.frame > div.frame-column > button.btn.start-btn`');
    expect(d.body).toContain('- **Box:** x 16, y 601, 358 × 54 px, in a 375 × 553 viewport, scrolled to 0, 120');
    expect(d.body).toContain('- **Device:** phone, portrait, touch, dark theme, nl');
    expect(d.body).toContain('1. Open https://test.vivanova.app/#/setup at 375 × 553 (device pixel ratio 3).');
    expect(d.body.trimEnd().endsWith(`<!-- ${REPORT_MARKER} -->`)).toBe(true);
  });

  it('names an untitled report after its kind, spot and screen', () => {
    expect(buildIssue(report({ title: '  ', kind: 'bug' })).title).toBe('Bug: button “Start” on /setup');
    const area = report({ target: { ...report().target, mode: 'area' } });
    expect(buildIssue(area).body).toContain('- **Marked:** an area around button “Start”');
  });

  it('keeps backticks in a selector from breaking its code span', () => {
    const d = buildIssue(report({ target: { ...report().target, selector: 'a`b' } }));
    expect(d.body).toContain("`a'b`");
  });

  it('round-trips: the agent reads back everything that was sent', () => {
    const data = parseIssueBody(buildIssue(report()).body) as ReturnType<typeof JSON.parse>;
    expect(data.format).toBe(REPORT_MARKER);
    expect(data.kind).toBe('change');
    expect(data.target.rect).toEqual({ x: 16, y: 601, width: 358, height: 54 });
    expect(data.target.html).toContain('start-btn');
    expect(data.context.prefs).toEqual({ theme: 'system', language: 'nl' });
    expect(data.context.viewport).toEqual({ width: 375, height: 553, dpr: 3 });
  });

  it('leaves out the markup, then the prefs, when it has to be short', () => {
    const lean1 = parseIssueBody(buildIssue(report(), 1).body) as ReturnType<typeof JSON.parse>;
    expect(lean1.target.html).toBeUndefined();
    expect(lean1.context.prefs).toBeDefined();
    const lean2 = parseIssueBody(buildIssue(report(), 2).body) as ReturnType<typeof JSON.parse>;
    expect(lean2.context.prefs).toBeUndefined();
    expect(lean2.context.route).toBe('/setup');
  });
});

describe('parseIssueBody', () => {
  it('ignores issues the app did not write', () => {
    expect(parseIssueBody('Just a bug report')).toBeNull();
    expect(parseIssueBody('```json\n{"format":"muzieklab-feedback:v1"}\n```')).toBeNull();
    expect(parseIssueBody(`\`\`\`json\n{not json\n\`\`\`\n<!-- ${REPORT_MARKER} -->`)).toBeNull();
  });
});

describe('newIssueUrl', () => {
  it('prefills GitHub’s new issue page with the title, the body and the labels', () => {
    const url = new URL(newIssueUrl(report()));
    expect(url.origin + url.pathname).toBe('https://github.com/Vochtvreter/muzieklab/issues/new');
    expect(url.searchParams.get('title')).toBe('Start button too low');
    expect(url.searchParams.get('labels')).toBe(`feedback,type:change,${STATUS_NEW}`);
    expect(parseIssueBody(url.searchParams.get('body')!)).not.toBeNull();
  });

  it('drops the bulky data to stay short enough for a link', () => {
    const big = report({ target: { ...report().target, html: '<div>' + 'x'.repeat(6000) + '</div>' } });
    const url = newIssueUrl(big);
    expect(url.length).toBeLessThanOrEqual(8000);
    const body = new URL(url).searchParams.get('body')!;
    expect((parseIssueBody(body) as { target: { html?: string } }).target.html).toBeUndefined();
  });
});

describe('clip', () => {
  it('flattens white space and cuts with an ellipsis', () => {
    expect(clip('  a \n\n b  ', 10)).toBe('a b');
    expect(clip('abcdefghij', 5)).toBe('abcd…');
  });
});
