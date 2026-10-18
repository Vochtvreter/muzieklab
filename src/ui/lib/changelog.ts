/**
 * Release notes for Settings → What's new, newest first. The first entry is the version in package.json (a test checks
 * it), so a release that bumps the version adds its entry here. Titles, changes and action labels are message keys.
 */
import type { Route } from '../router';

export type ChangeKind = 'new' | 'better' | 'fix';

export interface Change {
  kind: ChangeKind;
  text: string;
}

export interface Release {
  version: string;
  /** Release day, yyyy-mm-dd. */
  date: string;
  title: string;
  changes: Change[];
  /** A link to try the release's main feature: on the latest card, and in the release's panel once it is older. */
  action?: { to: Route; label: string };
}

export const KINDS: ChangeKind[] = ['new', 'better', 'fix'];

export const RELEASES: Release[] = [
  {
    version: '0.6.1',
    date: '2026-10-18',
    title: 'changelog.v0_6_1.title',
    changes: [{ kind: 'fix', text: 'changelog.v0_6_1.language' }],
  },
  {
    version: '0.6.0',
    date: '2026-10-18',
    title: 'changelog.v0_6_0.title',
    changes: [
      { kind: 'new', text: 'changelog.v0_6_0.checks' },
      { kind: 'better', text: 'changelog.v0_6_0.read' },
    ],
    action: { to: '/learn/1', label: 'changelog.v0_6_0.try' },
  },
  {
    version: '0.5.0',
    date: '2026-10-18',
    title: 'changelog.v0_5_0.title',
    changes: [
      { kind: 'new', text: 'changelog.v0_5_0.chapters' },
      { kind: 'new', text: 'changelog.v0_5_0.counting' },
      { kind: 'new', text: 'changelog.v0_5_0.practice' },
    ],
    action: { to: '/learn/1', label: 'changelog.v0_5_0.try' },
  },
  {
    version: '0.4.0',
    date: '2026-10-18',
    title: 'changelog.v0_4_0.title',
    changes: [
      { kind: 'new', text: 'changelog.v0_4_0.dutch' },
      { kind: 'new', text: 'changelog.v0_4_0.language' },
    ],
    action: { to: '/settings', label: 'changelog.v0_4_0.try' },
  },
  {
    version: '0.3.4',
    date: '2026-10-18',
    title: 'changelog.v0_3_4.title',
    changes: [
      { kind: 'better', text: 'changelog.v0_3_4.split' },
      { kind: 'new', text: 'changelog.v0_3_4.practice' },
      { kind: 'new', text: 'changelog.v0_3_4.steps' },
    ],
    action: { to: '/learn', label: 'changelog.v0_3_4.try' },
  },
  {
    version: '0.3.3',
    date: '2026-10-18',
    title: 'changelog.v0_3_3.title',
    changes: [
      { kind: 'better', text: 'changelog.v0_3_3.chapter' },
      { kind: 'better', text: 'changelog.v0_3_3.list' },
    ],
    action: { to: '/learn', label: 'changelog.v0_3_3.try' },
  },
  {
    version: '0.3.2',
    date: '2026-10-18',
    title: 'changelog.v0_3_2.title',
    changes: [{ kind: 'better', text: 'changelog.v0_3_2.whatsNew' }],
  },
  {
    version: '0.3.1',
    date: '2026-10-18',
    title: 'changelog.v0_3_1.title',
    changes: [
      { kind: 'fix', text: 'changelog.v0_3_1.calibrate' },
      { kind: 'fix', text: 'changelog.v0_3_1.touch' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-18',
    title: 'changelog.v0_3_0.title',
    action: { to: '/notes', label: 'changelog.v0_3_0.try' },
    changes: [
      { kind: 'new', text: 'changelog.v0_3_0.readNotes' },
      { kind: 'new', text: 'changelog.v0_3_0.answer' },
      { kind: 'new', text: 'changelog.v0_3_0.roundDone' },
      { kind: 'new', text: 'changelog.v0_3_0.learn' },
      { kind: 'better', text: 'changelog.v0_3_0.homeTiles' },
    ],
  },
  {
    version: '0.2.2',
    date: '2026-10-18',
    title: 'changelog.v0_2_2.title',
    changes: [{ kind: 'better', text: 'changelog.v0_2_2.stars' }],
  },
  {
    version: '0.2.1',
    date: '2026-10-17',
    title: 'changelog.v0_2_1.title',
    changes: [
      { kind: 'fix', text: 'changelog.v0_2_1.pad' },
      { kind: 'better', text: 'changelog.v0_2_1.resume' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-17',
    title: 'changelog.v0_2_0.title',
    changes: [
      { kind: 'new', text: 'changelog.v0_2_0.daily' },
      { kind: 'new', text: 'changelog.v0_2_0.xp' },
      { kind: 'new', text: 'changelog.v0_2_0.codes' },
      { kind: 'new', text: 'changelog.v0_2_0.echo' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-17',
    title: 'changelog.v0_1_0.title',
    changes: [
      { kind: 'new', text: 'changelog.v0_1_0.rhythm' },
      { kind: 'new', text: 'changelog.v0_1_0.calibrate' },
      { kind: 'new', text: 'changelog.v0_1_0.offline' },
      { kind: 'new', text: 'changelog.v0_1_0.analog' },
      { kind: 'fix', text: 'changelog.v0_1_0.layouts' },
    ],
  },
];

/** A bug-fix release (0.x.y with y > 0) rather than a feature release. */
export function isPatch(version: string): boolean {
  return !/\.0$/.test(version);
}

/** How many changes of each kind, in KINDS order, leaving out kinds with none. */
export function countKinds(changes: Change[]): { kind: ChangeKind; count: number }[] {
  return KINDS.map((kind) => ({ kind, count: changes.filter((c) => c.kind === kind).length })).filter((x) => x.count > 0);
}
