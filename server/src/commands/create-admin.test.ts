import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collections } from '../db.js';
import { freshDb, seedAccount, startMongo, stopMongo, type Mongo } from '../test/helpers.js';
import { createAdmin } from './create-admin.js';

let mongo: Mongo;
beforeAll(async () => {
  mongo = await startMongo();
});
afterAll(async () => {
  await stopMongo(mongo);
});

async function run(db: Db, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await createAdmin(db, args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const URL_ARGS = ['--url', 'https://test.vivanova.app/'];

describe('create-admin', () => {
  it('invites a new admin and prints the link', async () => {
    const db = await freshDb(mongo);
    const res = await run(db, ['--email', 'Ann@Example.com', '--name', 'Ann', ...URL_ARGS]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^Invited ann@example.com as an admin\..*\nhttps:\/\/test\.vivanova\.app\/#\/invite\/[A-Za-z0-9_-]{43}$/s);
    const c = collections(db);
    const account = await c.accounts.findOne({ email: 'ann@example.com' });
    expect(account).toMatchObject({ name: 'Ann', status: 'invited', roles: ['admin'], passwordHash: null });
    expect(await c.tokens.countDocuments({ accountId: account!._id, kind: 'invite', createdBy: null })).toBe(1);
    const audit = await c.audit.findOne({ targetId: account!._id });
    expect(audit).toMatchObject({ actorId: null, action: 'account.invite' });
  });

  it('gives an invited account admin and a new link, cancelling the old one', async () => {
    const db = await freshDb(mongo);
    const cy = await seedAccount(db, { email: 'cy@example.com', status: 'invited', password: null, roles: ['teacher'] });
    await run(db, ['--email', 'cy@example.com', ...URL_ARGS]);
    const first = await collections(db).tokens.findOne({ accountId: cy._id });
    const res = await run(db, ['--email', 'cy@example.com', ...URL_ARGS]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^cy@example.com was invited already and was an admin already\. A new invite link/);
    const tokens = await collections(db).tokens.find({ accountId: cy._id }).toArray();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]._id).not.toBe(first?._id);
    expect((await collections(db).accounts.findOne({ _id: cy._id }))?.roles).toEqual(['admin', 'teacher']);
  });

  it('makes an active account an admin, and prints a new-password link only with --reset', async () => {
    const db = await freshDb(mongo);
    const ann = await seedAccount(db, { email: 'ann@example.com', roles: ['editor'] });
    const res = await run(db, ['--email', 'ann@example.com', ...URL_ARGS]);
    expect(res).toEqual({ code: 0, out: 'ann@example.com is active and is an admin now. Add --reset to print a new-password link.', err: '' });
    const c = collections(db);
    expect((await c.accounts.findOne({ _id: ann._id }))?.roles).toEqual(['admin', 'editor']);
    expect(await c.audit.findOne({ targetId: ann._id })).toMatchObject({ actorId: null, action: 'role.grant', details: { roles: ['admin'] } });
    expect(await c.tokens.countDocuments()).toBe(0);

    const reset = await run(db, ['--email', 'ann@example.com', '--reset', ...URL_ARGS]);
    expect(reset.code).toBe(0);
    expect(reset.out).toMatch(/was an admin already\. A new-password link .*\nhttps:\/\/test\.vivanova\.app\/#\/reset\/[A-Za-z0-9_-]{43}$/s);
    expect(await c.tokens.countDocuments({ kind: 'reset', accountId: ann._id })).toBe(1);
  });

  it('changes nothing for a blocked account', async () => {
    const db = await freshDb(mongo);
    const bob = await seedAccount(db, { email: 'bob@example.com', status: 'blocked' });
    const res = await run(db, ['--email', 'bob@example.com', ...URL_ARGS]);
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/is blocked; nothing changed/);
    expect((await collections(db).accounts.findOne({ _id: bob._id }))?.roles).toEqual([]);
  });

  it.each([
    [[], /--email and --url are needed/],
    [['--email', 'ann@example.com'], /--email and --url are needed/],
    [['--email', 'ann@example.com', '--url', 'http://vivanova.app'], /--url must be the site's https address/],
    [['--email', 'ann@example.com', '--url', 'nonsense'], /--url must be/],
    [['--email', 'not-an-email', '--name', 'X', ...URL_ARGS], /Not an email address/],
    [['--email', 'ann@example.com', '--name', '', ...URL_ARGS], /The name must have 1 to 80 characters/],
    [['--email', 'ann@example.com', ...URL_ARGS], /--name is needed/],
    [['--email', 'ann@example.com', '--name', 'Ann', '--colour', 'red', ...URL_ARGS], /Unknown option '--colour'/],
    [['--email', 'ann@example.com', '--name', 'Ann', 'extra', ...URL_ARGS], /Usage/],
  ])('refuses bad arguments: %j', async (args, message) => {
    const db = await freshDb(mongo);
    const res = await run(db, args as string[]);
    expect(res.code).toBe(2);
    expect(res.err).toMatch(message);
    expect(await collections(db).accounts.countDocuments()).toBe(0);
  });

  it('accepts http only for localhost, for development', async () => {
    const db = await freshDb(mongo);
    const res = await run(db, ['--email', 'dev@example.com', '--name', 'Dev', '--url', 'http://localhost:5173']);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/\nhttp:\/\/localhost:5173\/#\/invite\//);
  });
});
