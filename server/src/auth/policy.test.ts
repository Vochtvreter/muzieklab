import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../../shared/api.js';
import { can, permissionsFor } from './policy.js';

// The table of BACKEND-PLAN.md §4.2 (global roles), row by row.
describe('permissionsFor', () => {
  it('gives every account its own account, progress and joining a class', () => {
    expect(permissionsFor([])).toEqual(['self.manage', 'progress.own', 'class.join']);
  });

  it('gives admin everything', () => {
    expect(permissionsFor(['admin'])).toEqual([...PERMISSIONS]);
  });

  it('gives editor content, and teacher class.create', () => {
    expect(permissionsFor(['editor'])).toEqual(['self.manage', 'progress.own', 'class.join', 'content.edit', 'content.publish']);
    expect(permissionsFor(['teacher'])).toEqual(['self.manage', 'progress.own', 'class.join', 'class.create']);
    expect(permissionsFor(['teacher', 'editor'])).toEqual([
      'self.manage',
      'progress.own',
      'class.join',
      'class.create',
      'content.edit',
      'content.publish',
    ]);
  });

  it.each(PERMISSIONS.filter((p) => p.startsWith('accounts.') || p.endsWith('.grant') || p === 'audit.read'))(
    'only admin has %s',
    (permission) => {
      expect(can({ roles: ['admin'], status: 'active' }, permission)).toBe(true);
      expect(can({ roles: ['editor', 'teacher'], status: 'active' }, permission)).toBe(false);
    },
  );
});

describe('can', () => {
  it('allows nothing to an account that is not active', () => {
    expect(can({ roles: ['admin'], status: 'blocked' }, 'self.manage')).toBe(false);
    expect(can({ roles: ['admin'], status: 'invited' }, 'accounts.read')).toBe(false);
    expect(can({ roles: [], status: 'active' }, 'self.manage')).toBe(true);
  });
});
