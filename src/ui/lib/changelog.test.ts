import { describe, expect, it } from 'vitest';
import { hasMessage } from '../../i18n';
import pkg from '../../../package.json';
import { countKinds, isPatch, RELEASES } from './changelog';

const parts = (v: string): number[] => v.split('.').map(Number);
const newer = (a: string, b: string): boolean => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

describe('changelog', () => {
  it('starts with the version in package.json, so a version bump comes with its release notes', () => {
    expect(RELEASES[0].version).toBe(pkg.version);
  });

  it('lists releases newest first, with real dates that never go forward', () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(newer(RELEASES[i - 1].version, RELEASES[i].version), RELEASES[i].version).toBe(true);
      expect(RELEASES[i - 1].date >= RELEASES[i].date, RELEASES[i].version).toBe(true);
    }
    for (const r of RELEASES) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has a message for every title, change and action', () => {
    for (const r of RELEASES) {
      expect(r.changes.length, r.version).toBeGreaterThan(0);
      for (const key of [r.title, ...r.changes.map((c) => c.text), ...(r.action ? [r.action.label] : [])]) {
        expect(hasMessage(key), key).toBe(true);
      }
    }
  });

  it('tells fix releases from feature releases and counts changes by kind', () => {
    expect(isPatch('0.2.1')).toBe(true);
    expect(isPatch('0.3.0')).toBe(false);
    expect(countKinds(RELEASES.find((r) => r.version === '0.2.1')!.changes)).toEqual([
      { kind: 'better', count: 1 },
      { kind: 'fix', count: 1 },
    ]);
  });
});
