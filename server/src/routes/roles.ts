import type { FastifyPluginAsync } from 'fastify';
import {
  BUILT_IN_ROLES,
  PERMISSIONS,
  ROLE_ID_PATTERN,
  isBuiltInRole,
  type CreateRoleRequest,
  type Permission,
  type RoleInfo,
  type RoleListResponse,
  type UpdateRoleRequest,
} from '../../../shared/api.js';
import { writeAudit } from '../accounts/audit.js';
import { assertHolds, rolePermissions, toRoleInfo } from '../accounts/roles.js';
import { validName } from '../accounts/validate.js';
import { signedIn } from '../auth/guard.js';
import { sortPermissions, stillHeld } from '../auth/policy.js';
import type { AppContext } from '../context.js';
import { inTransaction, isDuplicateKey, type RoleDoc } from '../db.js';
import { ApiError } from '../errors.js';
import * as s from './schemas.js';

// Roles as data (BACKEND-PLAN.md §4, §7): which permissions each role has. Listing them needs accounts.read (the
// account screens show what each role does); changing them needs roles.manage, and only with permissions the admin
// has. The built-in roles stay: admin with every permission, editor and teacher with what admins give them.

const DESCRIPTION_MAX = 200;

const notFound = () => new ApiError('not_found', 'No such role');

const permissions = { type: 'array', items: { enum: PERMISSIONS }, uniqueItems: true, maxItems: PERMISSIONS.length } as const;
const description = { type: 'string', maxLength: 1000 } as const;
const roleParams = {
  type: 'object',
  properties: { id: { type: 'string', maxLength: 64 } },
  required: ['id'],
} as const;

/** A trimmed description of at most 200 characters, without control characters other than line breaks. */
function validDescription(value: string): string {
  const text = value.trim();
  if ([...text].length > DESCRIPTION_MAX || /[^\P{Cc}\n]/u.test(text)) {
    throw new ApiError('bad_request', `A description has at most ${DESCRIPTION_MAX} characters`);
  }
  return text;
}

export const roleRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { c } = ctx;

  async function info(doc: RoleDoc): Promise<RoleInfo> {
    return toRoleInfo(doc, await c.accounts.countDocuments({ roles: doc._id }));
  }

  app.get('/admin/roles', { config: { permission: 'accounts.read' } }, async (): Promise<RoleListResponse> => {
    const [docs, counts] = await Promise.all([
      c.roles.find().toArray(),
      c.accounts.aggregate<{ _id: string; n: number }>([{ $unwind: '$roles' }, { $group: { _id: '$roles', n: { $sum: 1 } } }]).toArray(),
    ]);
    const count = new Map(counts.map((x) => [x._id, x.n]));
    const builtIn = BUILT_IN_ROLES.flatMap((id) => docs.filter((d) => d._id === id));
    // Custom roles by name, as people read them; the id breaks a tie.
    const custom = docs.filter((d) => !isBuiltInRole(d._id)).sort((a, b) => a.name.localeCompare(b.name) || a._id.localeCompare(b._id));
    return { roles: [...builtIn, ...custom].map((d) => toRoleInfo(d, count.get(d._id) ?? 0)) };
  });

  app.post<{ Body: CreateRoleRequest }>(
    '/admin/roles',
    {
      config: { permission: 'roles.manage' },
      schema: {
        body: s.body(
          { id: { type: 'string', pattern: ROLE_ID_PATTERN }, name: s.name, description, permissions },
          ['id', 'name', 'permissions'],
        ),
      },
    },
    async (request): Promise<RoleInfo> => {
      const actor = signedIn(request).account;
      const { id } = request.body;
      if (isBuiltInRole(id)) throw new ApiError('role_exists', 'A built-in role has this id');
      const name = validName(request.body.name);
      const text = validDescription(request.body.description ?? '');
      const granted = sortPermissions(request.body.permissions);
      const now = ctx.now();
      try {
        const doc = await inTransaction(ctx.db, async (session) => {
          const held = await stillHeld(c, actor._id, ['roles.manage'], session);
          assertHolds(held, granted);
          const role: RoleDoc = { _id: id, name, description: text, permissions: granted, builtIn: false, createdAt: now, updatedAt: now };
          await c.roles.insertOne(role, { session });
          await writeAudit(c, now, { actorId: actor._id, action: 'role.create', targetId: null, details: { role: id, name, permissions: granted } }, session);
          return role;
        });
        return toRoleInfo(doc, 0);
      } catch (err) {
        if (isDuplicateKey(err)) throw new ApiError('role_exists', 'A role with this id exists already');
        throw err;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateRoleRequest }>(
    '/admin/roles/:id',
    {
      config: { permission: 'roles.manage' },
      schema: { params: roleParams, body: s.body({ name: s.name, description, permissions }) },
    },
    async (request): Promise<RoleInfo> => {
      const actor = signedIn(request).account;
      const body = request.body;
      const name = body.name === undefined ? undefined : validName(body.name);
      const text = body.description === undefined ? undefined : validDescription(body.description);
      const now = ctx.now();
      const updated = await inTransaction(ctx.db, async (session) => {
        const held = await stillHeld(c, actor._id, ['roles.manage'], session);
        const role = await c.roles.findOne({ _id: request.params.id }, { session });
        if (!role) throw notFound();
        const set: Partial<RoleDoc> = {};
        const details: Record<string, string | string[]> = { role: role._id };

        // A built-in role keeps its name and description: the app names it in its own language.
        if ((name !== undefined && name !== role.name) || (text !== undefined && text !== role.description)) {
          if (role.builtIn) throw new ApiError('built_in_role', 'A built-in role keeps its name and description');
          if (name !== undefined && name !== role.name) set.name = details.name = name;
          if (text !== undefined && text !== role.description) set.description = details.description = text;
        }

        if (body.permissions !== undefined) {
          const next = sortPermissions(body.permissions);
          const before = rolePermissions(role);
          const added = next.filter((p) => !before.includes(p));
          const removed = before.filter((p) => !next.includes(p));
          if (added.length > 0 || removed.length > 0) {
            if (role._id === 'admin') throw new ApiError('built_in_role', 'Admin always has every permission');
            assertHolds(held, [...added, ...removed]);
            set.permissions = next;
            if (added.length > 0) details.added = added;
            if (removed.length > 0) details.removed = removed;
          }
        }

        if (Object.keys(set).length === 0) return role;
        const doc = await c.roles.findOneAndUpdate({ _id: role._id }, { $set: { ...set, updatedAt: now } }, { session, returnDocument: 'after' });
        await writeAudit(c, now, { actorId: actor._id, action: 'role.update', targetId: null, details }, session);
        return doc ?? role;
      });
      return info(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/roles/:id',
    { config: { permission: 'roles.manage' }, schema: { params: roleParams } },
    async (request, reply) => {
      const actor = signedIn(request).account;
      const now = ctx.now();
      await inTransaction(ctx.db, async (session) => {
        const held = await stillHeld(c, actor._id, ['roles.manage'], session);
        const role = await c.roles.findOne({ _id: request.params.id }, { session });
        if (!role) throw notFound();
        if (role.builtIn) throw new ApiError('built_in_role', 'A built-in role cannot be deleted');
        // Every permission in it, as for changing it; and taking it from the accounts that have it is revoking it,
        // which needs roles.grant.
        const holders = await c.accounts.countDocuments({ roles: role._id }, { session });
        const needs: Permission[] = [...(holders > 0 ? (['roles.grant'] as const) : []), ...rolePermissions(role)];
        assertHolds(held, needs);
        const { modifiedCount } = await c.accounts.updateMany(
          { roles: role._id },
          { $pull: { roles: role._id }, $set: { updatedAt: now } },
          { session },
        );
        await c.roles.deleteOne({ _id: role._id }, { session });
        await writeAudit(
          c,
          now,
          { actorId: actor._id, action: 'role.delete', targetId: null, details: { role: role._id, name: role.name, accounts: modifiedCount } },
          session,
        );
      });
      return reply.code(204).send();
    },
  );
};
