import { parseArgs } from 'node:util';
import type { Db } from 'mongodb';
import { ROLES } from '../../../shared/api.js';
import { writeAudit } from '../accounts/audit.js';
import { normalizeEmail, validName } from '../accounts/validate.js';
import { createLink } from '../auth/links.js';
import { originFromUrl } from '../auth/origin.js';
import { collections, ensureIndexes, inTransaction, type AccountDoc } from '../db.js';
import { ApiError } from '../errors.js';

// The first admin (BACKEND-PLAN.md §5.1), run on the server:
//   sudo node --env-file=/etc/muzieklab-api/test.env /srv/muzieklab-api/test/current/server.cjs \
//     create-admin --email ann@example.com --name Ann --url https://test.vivanova.app
// It prints a link for the person to choose a password with; no email is sent. Audit entries name no actor (null).

export const USAGE =
  'Usage: server.cjs create-admin --email <email> --name <name> --url <https://site> [--reset]\n' +
  '  Makes the account an admin. A new account (or one still invited) gets an invite link;\n' +
  '  an active one gets a new-password link only with --reset.';

export interface CommandIo {
  out: (line: string) => void;
  err: (line: string) => void;
  now?: () => Date;
}

/** Runs the command with `args` (after "create-admin") and returns the exit code. */
export async function createAdmin(db: Db, args: string[], io: CommandIo): Promise<number> {
  let options: { email?: string; name?: string; url?: string; reset?: boolean };
  try {
    ({ values: options } = parseArgs({
      args,
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        url: { type: 'string' },
        reset: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    io.err(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  if (!options.email || !options.url) {
    io.err(`--email and --url are needed.\n${USAGE}`);
    return 2;
  }
  const origin = originFromUrl(options.url);
  if (!origin) {
    io.err(`--url must be the site's https address, such as https://vivanova.app (got ${options.url}).`);
    return 2;
  }
  let email: string;
  let name: string | undefined;
  try {
    email = normalizeEmail(options.email);
    name = options.name === undefined ? undefined : validName(options.name);
  } catch (err) {
    io.err(err instanceof ApiError && err.code === 'email_invalid' ? `Not an email address: ${options.email}` : 'The name must have 1 to 80 characters.');
    return 2;
  }

  await ensureIndexes(db);
  const c = collections(db);
  const now = (io.now ?? (() => new Date()))();

  // The transaction may run more than once (on a write conflict), so it returns what to print instead of printing.
  const result = await inTransaction(db, async (session): Promise<{ code: number; out?: string; err?: string }> => {
    const existing = await c.accounts.findOne({ email }, { session });

    if (!existing) {
      if (!name) {
        return { code: 2, err: `No account has ${email} yet: --name is needed to make one.` };
      }
      const doc: Omit<AccountDoc, '_id'> = {
        email,
        name,
        passwordHash: null,
        status: 'invited',
        roles: ['admin'],
        premium: null,
        locale: null,
        passwordChangedAt: null,
        lastSignInAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const { insertedId } = await c.accounts.insertOne(doc as AccountDoc, { session });
      const link = await createLink(c, { kind: 'invite', accountId: insertedId, createdBy: null, now, origin }, session);
      await writeAudit(
        c,
        now,
        { actorId: null, action: 'account.invite', targetId: insertedId, details: { email, name, roles: ['admin'] } },
        session,
      );
      return { code: 0, out: `Invited ${email} as an admin. Send them this link (it works until ${link.expiresAt}):\n${link.link}` };
    }

    if (existing.status === 'blocked') {
      return { code: 1, err: `${email} is blocked; nothing changed. Another admin can unblock it first.` };
    }

    const granted = !existing.roles.includes('admin');
    if (granted) {
      await c.accounts.updateOne(
        { _id: existing._id },
        { $set: { roles: ROLES.filter((r) => r === 'admin' || existing.roles.includes(r)), updatedAt: now } },
        { session },
      );
      await writeAudit(c, now, { actorId: null, action: 'role.grant', targetId: existing._id, details: { roles: ['admin'] } }, session);
    }
    const role = granted ? 'is an admin now' : 'was an admin already';

    if (existing.status === 'invited') {
      const link = await createLink(c, { kind: 'invite', accountId: existing._id, createdBy: null, now, origin }, session);
      await writeAudit(
        c,
        now,
        { actorId: null, action: 'account.invite_link', targetId: existing._id, details: { expiresAt: link.expiresAt } },
        session,
      );
      return {
        code: 0,
        out: `${email} was invited already and ${role}. A new invite link (the old one no longer works; this one works until ${link.expiresAt}):\n${link.link}`,
      };
    }

    // Active.
    if (!options.reset) {
      return { code: 0, out: `${email} is active and ${role}. Add --reset to print a new-password link.` };
    }
    const link = await createLink(c, { kind: 'reset', accountId: existing._id, createdBy: null, now, origin }, session);
    await writeAudit(
      c,
      now,
      { actorId: null, action: 'account.reset_link', targetId: existing._id, details: { expiresAt: link.expiresAt } },
      session,
    );
    return { code: 0, out: `${email} is active and ${role}. A new-password link (it works until ${link.expiresAt}):\n${link.link}` };
  });
  if (result.out) io.out(result.out);
  if (result.err) io.err(result.err);
  return result.code;
}
