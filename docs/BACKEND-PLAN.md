# Accounts and permissions: back-end design

Status: **phases 0 and 1 built.** Phase 0 is the API with `/api/v1/health`, MongoDB and backups, deployed to the test
site. Phase 1, in 0.12.0, is accounts: invite and new-password links, signing in and out, the Account screen, the admin
screens and the privacy statement (§10, [DEPLOY.md](DEPLOY.md) *The API*). Sessions with refresh tokens, which keep
someone signed in for 90 days after they last used the app, came in 0.14.0 (§5.4). Phases 2 to 5 are designed, not
built.

This was written on 2026-10-23, after production moved to our own server. It now describes phase 1 as built. Where the
build differs from the first plan, the section says so. Decisions taken so far:

- **Accounts are invite only** for now: an admin invites people, and open sign-up comes later.
- **No email service** for now: the app sends no email. Where a link is needed (an invite, a new password), the admin
  screen shows it, and the admin sends it by hand (§5.1, §5.3). An email service can come later without changing the
  model.
- **Sign-in is email and password.** The model leaves room for passkeys or Google/Apple later (§5.6).
- **Permissions cover four areas:** admin tools, teachers and classes, editing content, and premium features. They are
  built in that order of need, in phases (§10).
- **MongoDB** is the database: a document database, with the features accounts need (§3.1).
- **Accounts sit in Settings:** an Account section at the top of Settings, on every size, with an Accounts row that only
  admins see. There is no new tab (§10.1).

The app keeps working **without an account and offline**, as DESIGN.md §1 promises. An account is an extra: it is what
roles and permissions hang on, and from phase 2 it keeps progress across devices. No screen needs the server to work,
except the account and admin screens themselves. A site without an API shows no Account section at all.

## 1. Architecture

```
Browser (PWA)
   │  https://vivanova.app
   ▼
Caddy ──────────────► /var/www/muzieklab/current      the app (static, as now)
   │  /api/*
   ▼
API service  127.0.0.1:3000                           Node 22 + TypeScript, systemd, own user
   │
   ▼
MongoDB      127.0.0.1:27017                          auth on, single-node replica set, nightly backups

```

The test site has the same setup: its API listens on 127.0.0.1:3001 and uses the database `muzieklab_test` (§9.3).

- **One domain.** The app calls `/api/…` on the same domain, so there are no CORS rules and the session cookies can be
  locked down tight (§5.4). Caddy sends `/api/*` to the API and everything else to the files, as now.
- **Caddy keeps the request as it came.** It passes the browser's `Host` header on unchanged, which the Origin check
  needs (§5.4). It also passes the visitor's address in `X-Forwarded-For`, which the sign-in limits need (§5.2). The API
  trusts that header only from 127.0.0.1.
- **Nothing is exposed but Caddy.** The API and MongoDB listen on `127.0.0.1` only; the firewall stays at 22, 80, 443.
- **The service worker leaves the API alone.** API calls are `fetch`es, never precached; the PWA config has
  `navigateFallbackDenylist: [/^\/api\//]` so a link to an API address is never answered with the app.

### 1.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Node 22 LTS**, TypeScript | Same language as the app; types shared between them. |
| HTTP | **Fastify** 5, with `@fastify/cookie` | Mature, fast, JSON schemas, and hooks for the permission check (§4.4). |
| Validation | Fastify's **JSON schemas** (Ajv), in the routes (`server/src/routes/schemas.ts`); the contract `shared/api.ts` holds **types only** | The first plan said zod schemas in `shared/`. JSON schemas need no extra package, and with types only in `shared/`, neither side bundles the other's code. Unknown fields and wrong types are refused with 400: `removeAdditional` and `coerceTypes` are off, so nothing is dropped or converted quietly. The content (an email, a name, a password) is checked in code, with its own error codes. |
| Database driver | Official **`mongodb`** driver, typed collections | No ORM layer to learn; the documents are the types. |
| Passwords | **scrypt** from `node:crypto`: N = 2^15, r = 8, p = 3 | OWASP's scrypt option: 32 MiB and about a quarter of a second per hash. The first plan said argon2id (`@node-rs/argon2`), but a native module cannot go into the one-file bundle (§9.1). Each hash carries its settings (§5.5). |
| Bundle | **esbuild** (`server/build.mjs`) → `dist/server.cjs` | One file with every dependency and the common-password list, so the server needs only Node. |
| Tests | **Vitest**, MongoDB in memory (`mongodb-memory-server`, a one-member replica set) | Same test runner as the app; every route tested against a real database. `npm run e2e:real` runs the app in a browser against the bundle and a throwaway MongoDB. |

### 1.2 Code layout

As built in phase 1:

```
server/
  package.json          its own dependencies; the app's package.json is unchanged
  build.mjs             the one-file bundle, dist/server.cjs (§9.1)
  src/
    main.ts             runs the API (indexes first, then listen), or a command: `server.cjs create-admin …`
    app.ts              Fastify, the guard, errors, the request log line, no-store
    config.ts           settings from the environment: PORT, HOST, MONGODB_URI, COOKIE_SECURE, LOG_LEVEL
    log.ts              what a log line may hold (§8)
    db.ts               typed collections (§3), indexes, transactions, the admin lock (§3.6)
    auth/
      passwords.ts      scrypt, the hash queue, the rules (§5.5); common-passwords.txt is the list
      sessions.ts       cookie, create, look up, refresh, replace (§5.4)
      attempts.ts       too many tries: the five counters (§5.2); tries.ts runs one counted try
      links.ts          invite and new-password links (§5.1, §5.3)
      policy.ts         roles → permissions, can() (§4)
      guard.ts          deny by default: each route is public or needs a permission (§4.4)
      origin.ts         the Origin check (§5.4), and the site's address for links
      device.ts         a device name from the User-Agent ("Safari on iPhone")
    accounts/           views (documents → API bodies), validate, premium (§4.3), audit (§3.5), remove
    routes/             health, auth, me, admin; schemas.ts holds the JSON schemas
    commands/
      create-admin.ts   the first admin, run on the server (§5.1)
shared/
  api.ts                the contract: request and response types, error codes, roles, permissions (types only)
src/                    the app: src/api/client.ts, src/ui/account.ts, src/ui/screens/account/ and admin/
```

Not built yet: `server/migrations/` (§9.2), `shared/merge.ts` (phase 2, §6) and the routes for progress, classes and
content.

## 2. What a document database is good for here

The app already keeps its data as JSON documents: `Prefs` and `Progress` in `src/game/storage.ts`, saved to
`localStorage` and checked with `sanitizePrefs` and `sanitizeProgress` on every read. An account's progress is the
same document, stored on the server. It changes shape with every release (new lessons, Read notes, Scales), and a
document database stores the new shape without a migration; the app's sanitize functions keep doing the checking.

Accounts and permissions are the part that is usually done with tables, because they need unique emails and changes
that happen together or not at all. MongoDB covers both: **unique indexes** for emails and join codes, and
**transactions** for a check and a change that must happen together, such as "never remove the last admin".
Transactions need a replica set, so MongoDB runs as a single-node replica set (`rs0`) from the start.

## 3. Data model

Field names are as stored (`server/src/db.ts`). `_id` is an `ObjectId` unless shown otherwise; the API sends ids as
hex strings and dates as ISO strings. Phase 1 has five collections: `accounts`, `sessions`, `tokens`, `audit` and
`locks`. `progress` (phase 2), `classes` and `memberships` (phase 3) and `content` (phase 4) come later. The indexes
are made when the API starts (§9.2).

### 3.1 accounts

```js
{
  _id: ObjectId("…"),
  email: "ann@example.com",            // trimmed and lower-cased; unique index
  name: "Ann",                         // 1 to 80 characters
  passwordHash: "scrypt$32768$8$3$<salt>$<hash>",  // null until the invite is accepted (§5.5)
  status: "invited",                   // "invited" | "active" | "blocked"
  roles: ["teacher"],                  // global roles (§4.1), kept in the order admin, editor, teacher
  premium: { until: "2027-10-31" },    // null: off; { until: null }: on with no end; else the last day (§4.3)
  locale: "nl",                        // the account's language, or null
  passwordChangedAt: ISODate("…"),
  lastSignInAt: ISODate("…"),
  createdAt: ISODate("…"), updatedAt: ISODate("…"),
}
```

The first plan put premium in an `entitlements` object with a `source`. Phase 1 has only premium, and only admins set
it, so it is a field of its own; the audit log says who set it. A payment provider (phase 5) can add a source then.
Premium's last day is a calendar day (`YYYY-MM-DD`), not a moment (§4.3). Accounts saved by the first test-site release
hold a Date there, which reads as its UTC calendar day.

### 3.2 sessions and one-time tokens

```js
// sessions: one per signed-in device, at most 20 per account (§5.4)
{
  _id: "<random id>", accountId, device: "Safari on iPhone", createdAt,
  accessHash: "<sha256 of the session cookie's token>", accessExpiresAt,    // the session token: one hour
  refreshHash: "<sha256 of the refresh cookie's token>",                    // swapped on every refresh
  retired: ["<sha256 of a refresh token swapped before>", …],               // the last 50, oldest first
  refreshedAt, lastSeenAt, expiresAt,                                        // expiresAt: 90 days after lastSeenAt
}

// tokens: invite and new-password links, which the admin sends by hand (§5.1, §5.3)
{ _id: "<sha256 of the link's token>", kind: "invite" | "reset", accountId, createdBy, createdAt, expiresAt, usedAt }
```

Only the **hash** of a token is stored, so a copy of the database cannot be used to sign in. A session's `_id` is a
random id of its own, as both its tokens change on every refresh. A **TTL index** on `expiresAt` deletes old sessions
and tokens by itself. MongoDB does that about once a minute, so the API also treats an
expired session or link as gone at once. `createdBy` is the admin who made the link, or null for the create-admin
command.

### 3.3 progress (phase 2)

```js
{
  _id: ObjectId("…"),                  // the account's _id: one document per account
  schema: 1,
  prefs: { language: "nl", theme: "dark", noteNames: "solfege", … },   // Prefs, minus device settings (§6)
  progress: { lessons: { "7.3": { stars: 3, bestAccuracy: 0.94 } }, xp: 1840, … },  // Progress
  rev: 42,                             // goes up by one on every save (§6.2)
  updatedAt: ISODate("…"),
}
```

A full progress document is a few tens of kB; MongoDB's limit is 16 MB.

### 3.4 classes and memberships (phase 3)

```js
// classes
{ _id, name: "Groep 7 · Tuesday", joinCode: "K7Q-2MX", ownerId, archived: false, createdAt }

// memberships: who has which role in which class
{ _id, accountId, scope: { type: "class", id: ObjectId("…") }, role: "teacher" | "pupil", createdAt }
```

Memberships are their own collection, not a list inside the class or the account: a class can have many pupils, and
both "my classes" and "this class's pupils" are needed. A unique index on `(accountId, scope.type, scope.id)` keeps one
role per person per class. `scope` has a `type` so that other scopes (a school, say) can follow without a new
collection.

### 3.5 audit, and content (phase 4)

```js
// audit: every change to an account, its roles and premium (phase 1); classes and content later
{ _id, at, actorId, action: "role.grant", targetId, details: { roles: ["teacher"] } }

// content: an edited Learn chapter or Path unit (§10, phase 4)
{ _id: "learn:11", locale: "nl", draft: {…}, published: {…}, version: 7, updatedBy, updatedAt }
```

- `actorId` is who did it: an account, or null for the create-admin command.
- `targetId` is the account it is about. The first plan had `target: { type, id }`; phase 1 has only accounts as
  targets, so it is one id. A later kind of target (a class) gets a field of its own.
- The actions (`AUDIT_ACTIONS` in `shared/api.ts`): `account.invite`, `account.invite_link`, `account.reset_link`,
  `account.update`, `account.block`, `account.unblock`, `account.delete`, `account.accept_invite`,
  `account.reset_password`, `account.change_password`, `account.change_email`, `account.delete_self`, `role.grant`,
  `role.revoke`, `premium.grant` and `premium.revoke`.
- `details` never hold a password or a token. Personal data goes only under the keys `email`, `name`, `previousEmail`
  and `previousName`.
- Entries are kept for two years (a TTL index on `at`).
- **Scrubbing:** when an account is deleted, every entry about it (its `targetId`) that holds one of those keys gets
  `details: { deleted: true }`. The action, the time and the ids stay. The deletion's own entry names no one:
  `account.delete` with `{ status }` (so a cancelled invite can be told from a deleted account), or
  `account.delete_self`.

### 3.6 locks

```js
{ _id: "admins", rev: 12 }
```

One document, new in phase 1 (the first plan did not have it). MongoDB transactions work on a snapshot. Two admins who
demote each other at the same moment would each still see the other as an admin, and both would commit, leaving no
admin. So every transaction that could remove an admin writes this document first: `PATCH` and `DELETE
/admin/accounts/:id`, and `DELETE /me`. The second transaction then conflicts, and the driver runs it again; on the new
run it sees the first one's change. The document is made when the API starts.

## 4. Permissions

### 4.1 Roles

Two kinds of role, and entitlements beside them:

- **Global roles**, in `accounts.roles`: what someone may do anywhere.
  - `admin`: accounts, roles and entitlements, and everything else.
  - `editor`: edit and publish learning content.
  - `teacher`: create classes. Inside a class, the class's own roles apply.
- **Class roles**, in `memberships` (phase 3): `teacher` (the owner, and co-teachers) and `pupil`. They count only
  inside that class.
- **Entitlements**: features an account has, for a time. Phase 1 has one, premium (`accounts.premium`, §4.3). They are
  not roles, because they are bought or given, they expire, and a payment provider will set them later (§10, phase 5).

Every signed-in account, whatever its roles, can manage its own account and progress, and join a class with a code.

### 4.2 Permissions per role

Code checks **permissions**, never role names, so a role can change without hunting through the code.

| Permission | admin | editor | teacher (global) | teacher (in the class) | pupil (in the class) | every account |
|---|---|---|---|---|---|---|
| `self.manage`: own account, password, export, delete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `progress.own`: read and save own progress | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `class.join` (with a code) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `accounts.read`, `accounts.invite`, `accounts.block`, `accounts.delete` | ✓ | | | | | |
| `roles.grant`, `entitlements.grant` | ✓ | | | | | |
| `audit.read` | ✓ | | | | | |
| `class.create` | ✓ | | ✓ | | | |
| `class.manage`: rename, new join code, remove pupils, archive | ✓ | | | ✓ | | |
| `class.progress.read`: pupils' progress | ✓ | | | ✓ | | |
| `class.assign`: set lessons for the class | ✓ | | | ✓ | | |
| `class.read`: name, teachers, own assignments | ✓ | | | ✓ | ✓ | |
| `content.edit`, `content.publish` | ✓ | ✓ | | | | |

Phase 1 built the global columns: the 13 permissions in `PERMISSIONS` (`shared/api.ts`), given out in
`server/src/auth/policy.ts`. Admin has all of them; editor has `content.edit` and `content.publish`; teacher has
`class.create`; every account has `self.manage`, `progress.own` and `class.join`. Only an `active` account has any
permission at all. The class permissions (`class.manage`, `class.progress.read`, `class.assign`, `class.read`) come
with phase 3.

Guard rails, enforced in a transaction:

- The **last active admin** cannot lose the role, be blocked or be deleted, not even by deleting their own account
  (409 `last_admin`).
- An admin cannot **change their own roles or status**, or delete themselves from the admin screens; another admin
  does that (409 `own_account`). They delete their own account from the Account screen. They may change their own
  name, email and premium from the admin screens.
- An **invited** account cannot be blocked or unblocked (409 `wrong_status`): it becomes active by accepting the
  invite, and Cancel invite deletes it.
- Inside each admin transaction, the API checks again that the admin still has the permissions the change needs. The
  guard checked them when the request came in, but another admin may have changed them since.
- A pupil sees **their own** progress and the class's assignments, never other pupils (phase 3).

### 4.3 Premium

Premium is a feature check, not a permission (`server/src/accounts/premium.ts`). It is on with no end (`until` null),
or through a **last day**, a calendar date `YYYY-MM-DD`. The day reads the same in every time zone, and premium stays
on through that whole day anywhere in the world: until the next day at 12:00 UTC, when the day ends at UTC−12. An
admin sets it by hand; the day must be a real date that is not over yet (else 400 `bad_request`). The audit log records
`premium.grant` with the day, or `premium.revoke`. Which features are premium is an open question (§11); until then
the admin screen says "coming later".

### 4.4 How the check works

```ts
// server/src/auth/policy.ts
can(account, 'accounts.invite')   // → true or false; class permissions take the class with phase 3
```

- `can()` looks up the account's global roles (and, from phase 3, its membership in the class).
- **Deny by default:** every route declares in its options either `{ public: true }` or `{ permission }`. A route with
  neither, or both, stops the server from starting, and a test checks every registered route and its permission
  against the table in §7.
  The public routes are health, sign-in, refresh (§5.4: it checks the refresh cookie itself), the invite check and
  accept, and the new-password check and confirm.
- A route's `permission` is what it needs at least. A request that does more checks more in the handler: inviting with
  a role also needs `roles.grant`, and each field of an admin change needs its own permission (§7).
- The table in §4.2 is the policy, written once in `policy.ts` and tested row by row.
- `GET /api/v1/me` returns the account's permissions and premium, so the app shows only what someone may use. The
  server checks every request anyway; hiding a button is not security.

## 5. Signing in

### 5.1 The first admin and invites

1. On the server, the create-admin command makes the first admin and prints a one-time link (DEPLOY.md, *The first
   admin*, has the exact command for each site):

   ```sh
   node server.cjs create-admin --email ann@example.com --name Ann --url https://vivanova.app [--reset]
   ```

   - It reads `MONGODB_URI` from the environment, so on the server it runs with the site's settings file loaded.
   - A new email makes an invited admin and prints an invite link (7 days); `--name` is needed only then.
   - An invited account is made admin and gets a new invite link; the old one stops working.
   - An active account is made admin. With `--reset` it gets a new-password link (24 hours); without it, nothing else
     happens.
   - A blocked account exits with 1, and nothing changes.
   - Bad arguments exit with 2: a missing `--email` or `--url`, a `--url` that is not https (http only on localhost),
     or a new email without `--name`.
   - The audit entries it writes have no actor (`actorId` null).
2. An admin invites someone: email, name and roles. The account is `invited`, and the admin screen shows a link,
   `https://vivanova.app/#/invite/<token>`, valid for 7 days, with a **Copy** button and a ready-made message to
   paste into an email or chat. The admin sends it themselves. The token comes after the `#`, so it never reaches a
   server log or a Referer header.
3. The person opens the link, chooses a password (and may correct their name), and is signed in. The account is now
   `active`.

The link is shown **once**: only its hash is stored (§3.2). An admin can cancel an invite (Cancel invite deletes the
invited account), or make a new link, which cancels the old one. Anyone with the link can claim the account, so it goes
only to that person. When links stop working is in §5.3.

### 5.2 Sign in, sign out

- **Sign in** with email and password. A wrong email and a wrong password get the same answer ("Email or password is
  not right"), and so do a blocked and an invited account. An email without an account is checked against a dummy
  hash, so the time taken does not tell either. What is not an email address at all is refused at once, without a
  hash and without counting.
- **Sign out** deletes the session. **Sign out everywhere** (Account) deletes all of the account's sessions and its
  new-password links.
- A **blocked** account cannot sign in, and its sessions are deleted when it is blocked.

**Too many tries** slow down rather than lock: a hard lockout would let anyone lock someone else out. The first plan
had one rule, 5 failures per email and per address. The test site showed that one school or office network, where
many people sign in from one address, then slows everyone on it after a few mistyped passwords. Phase 1 has four
counters for a password try, and one for link tokens. A password try must pass the first three; the fourth, the
network, never makes a try wait:

| Counter | Free failures in 15 minutes | Then | Against |
|---|---|---|---|
| **The pair**: one email from one address | 5 | each further try waits: 2 s, 4 s, 8 s… up to 15 minutes. The waits go on doubling until the pair has been quiet for 15 minutes after its last wait. | guessing one account's password. It slows down the person guessing, not the account's owner on another network. |
| **The address**, for all emails | 50 | the same doubling waits, counting only the failures of the last 15 minutes, so the waits stop soon after the failures do | one address trying many accounts |
| **The email**, from all addresses | 50 | the same, counting only the last 15 minutes | guessing spread over many addresses. Keeping someone's account waiting takes dozens of tries every 15 minutes, not a handful. |
| **The network**: the IPv4 /24 or IPv6 /48 the address is in, for all emails | 200 | no wait: the network only loses the hash queue's shared places (below), counting only the last 15 minutes | one network filling the hash queue with failures from many of its addresses (a /48 holds 65,536 /64s, and anyone can get one free from a tunnel broker). It never makes anyone wait, because a network is not one person's: an ISP may give each home a /56 or /60, so one /48 holds hundreds or thousands of homes; a mobile carrier gives each phone a /64 from /48s that thousands share; carrier NAT puts thousands of phones in one IPv4 /24. A wait for the network would let one of them keep all the others out. |
| **Links**: wrong invite or new-password link tokens from one address | 50 | the address's waits, counting only the last 15 minutes. Its own counter, apart from the address's sign-ins (below). | one address trying many tokens. A link (256 bits) cannot be guessed, so this only keeps a flood of link checks slow. |

- **An address** is an IPv4 address, or the **/64** an IPv6 address belongs to: one home, phone or server gets a whole
  /64, so counting each IPv6 address apart would count nothing. An IPv4 address written as IPv6 (`::ffff:…`) counts as
  the IPv4 address. It comes from Caddy's `X-Forwarded-For` (§1).
- A try that must wait is refused with 429 `too_many_attempts` and `retryAfter` (seconds; also the `Retry-After`
  header). It is not checked, and it does not count or make the wait longer.
- A try counts as a failure from the moment it starts, and is taken back if it was right. Otherwise many tries sent at
  once would all be checked before the first failure counted. A class signing in at once is fine: ten right passwords
  from one address at the same moment all get in, because the address allows 50.
- A good sign-in clears that pair's counter, not the address's, the network's or the email's. So does setting a new
  password from a link.
- Entering the current password to change it, to change the email or to delete the account goes through the same four
  counters, so a borrowed session cannot be used to guess the password quickly.
- The link routes (check, accept and confirm) count wrong tokens per address, on the link counter. There is no email
  to count against, and not the network: a wrong token costs no hash and a link (256 bits) cannot be guessed, so
  counting it there would only let one address slow everyone on its network. Not the address's own counter either: a
  flood of wrong tokens from many addresses would then push out the address entries that say who is clean (the
  places kept for clean tries, below). So wrong tokens from a school's address also leave its sign-ins their 50 free
  failures.
- **The hash queue:** at most 4 password hashes run at once (each takes 32 MiB, and the service has 512 MB). The others
  wait in one line per network (as above), and the lines take turns: a free slot goes to the line whose turn it is,
  which then goes to the back. So a try waits behind at most one try of every other network that has some waiting,
  however many each sends: a few seconds with 45 networks flooding. Any network may add to the waiting while fewer
  than 32 wait in all (a class signing in at once); past that, each network may still have 2 waiting, so no flood can
  keep another network out. A network past its 200 free failures gets only its 2, never the shared places. At most
  512 wait in all (a backstop for memory: 256 networks). A try that may not wait gets 429 **`busy`** with
  `retryAfter: 1` (also the `Retry-After` header), and it is not counted as a failure. It is not `too_many_attempts`:
  whoever gets it may have typed their password once (someone on a network a flood has used up), so the app says
  *Muzieklab is busy. Try again in a moment.*, not that they tried too often. A counter's wait in its last second also
  says `retryAfter: 1`, so only the code tells the two apart. Every hash goes through the queue, also those of a new
  password: Sign in, Accept invite, New password, and the current password on Account can all get `busy`.
- **Places kept for clean tries.** A network's 2 places are first come, first served for everyone in it. Someone with
  a few of its addresses (a /60 of an ISP's /48) could keep them full: a refused try costs nothing, so they take a
  freed place again within milliseconds, and everyone else in that network would be turned away. So each network's
  line also keeps **4 places for clean tries**: tries from an address that has made no other try in the last 15
  minutes. An address is unclean for 15 minutes after any try: a password, wrong or right (signing in to an account
  of one's own again and again does not stay clean), or a wrong link token. Wrong link tokens from other addresses
  cannot make it clean again sooner, as they are kept apart (the last bullet). A clean try waits there while one of
  the 4 is free, whether or not its network is past its 200, and when the line's turn comes, its clean tries go
  first. Each address is clean for one try in 15 minutes, so a /60 has 16 such tries in 15 minutes and a /56 256
  (0.3 a second). That is too few to keep the 4 places full while the line is served: about 16 times a second shared
  by the lines that have tries waiting. A /56 manages it only if more than about 55 other networks keep tries waiting
  at the same time. Where many share one address (a school's IPv4 address, carrier NAT), only its first try in 15
  minutes is clean; the others wait as above. At most 512 wait in the kept places in all; past that, a clean try waits
  as any other. The 32 shared places and the 512 above count only the other places, so filling the kept places takes
  no network's 2.
- The counters are in memory. A restart forgets them, which only helps whoever was waiting, and they work for one
  process (the API runs as one). Old entries are dropped every minute. Each counter keeps its own entries, at most
  100,000 (the network 10,000, as each may hold the times of hundreds of failures); past that its oldest go. So a flood
  of one kind cannot push out another kind's. Wrong link tokens cost no hash, so a flood of them from many addresses
  can fill the link counter within seconds, but it pushes out only link entries, which forgets only wrong tokens:
  never the address entries that say who is clean, nor the pair and email entries that keep a guesser waiting. Those
  grow only from password tries that get a hash (a try refused as `busy` is taken back), about 16 a second, so 15
  minutes hold far fewer than 100,000 (§8, residual risk).

### 5.3 Forgotten password, new email

- **Forgot password:** the sign-in screen says to ask the person who invited you. An admin opens the account and
  chooses **New password link**: a link valid for 24 hours, usable once, shown once to copy and send by hand. Setting
  the new password signs out every device and signs this one in. The admin never sees or chooses the password.
- **Changing the password** asks for the current one, and signs out every other device; this one stays.
- **Changing the email** asks for the current password, and the new address is the sign-in name from then on. Nothing
  is sent to check it, because the app sends no email; an admin can correct a mistyped address.

**When a link stops working.** A link works while it is unused, not expired, and the account still has the status the
link is for: `invited` for an invite, `active` for a new password. An account has at most one link of each kind. A link
stops working when:

- it is used, or it expires (7 days for an invite, 24 hours for a new password);
- a new link of the same kind is made for the account;
- the account is deleted, or the invite is cancelled;
- for a new-password link: the password is changed, the account's own email is changed, Sign out everywhere is used,
  or an admin corrects the email;
- for an invite: an admin corrects the email of the invited account. The account then shows that no link works, and
  the admin makes a new one for the corrected address.

While an account is blocked, its new-password link does not work. If it is unblocked before the link expires, the link
works again (a known gap, §11).

### 5.4 Sessions

Until 0.14.0 a session was one cookie that lasted 30 days after the last use, and the use moved on only when an
account screen asked the API something. The app is offline first, so someone who practised every day but never opened
Settings → Account was signed out after 30 days. Now a session has **two tokens**, a short one that goes with every
request and a long one that only keeps the session going, and the app renews the session by itself:

- **The session token** is 32 random bytes, in a cookie: `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`, `Max-Age` one hour. It works for **one hour**; using it moves nothing. JavaScript cannot read it, and it is
  only sent over HTTPS to the site that set it. The `__Host-` prefix makes the browser insist on Secure, `Path=/` and
  no Domain, so no other site or subdomain can set or read it.
- **The refresh token** is 32 random bytes too, in `__Secure-refresh`: `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/api/v1/auth`, `Max-Age` 90 days, and no Domain, so only this host gets it. Its path keeps it off every other
  request: the browser sends it only to the sign-in routes. (Not `__Host-`, which allows only `Path=/`.)
- **`POST /auth/refresh` swaps the refresh token for a new pair** (rotation): a new session token for an hour and a new
  refresh token, and the session lasts **90 days from then**, so someone back from the summer holidays is still signed
  in. The swap matches the current refresh token in one update, so of two requests with one token only one swaps.
- **A refresh token works once.** A session remembers the last 50 it swapped. One that comes back later was copied:
  whoever has the session now, its owner or whoever copied the token, the session ends for both, and the API logs it
  (the account's id, never the token). The exception is a race: the token swapped less than **a minute** ago, as when
  two tabs refresh at once. That answers 204 without cookies, as the browser has the new ones from the first answer.
  A blocked or deleted account's session ends at its next refresh, and the cookies are cleared on every refusal.
- **The app renews by itself** (`src/api/client.ts`): when a request answers 401 `unauthenticated` on a device where
  someone is signed in, it calls `POST /auth/refresh` once (one call for all the requests waiting) and sends the
  request again; a screen never sees the swap. It also renews when the app starts and when it comes back into view,
  at most every 12 hours (`keepSignedIn`, `src/ui/account.ts`). That is the one request the app sends before an
  account screen opens, and only while someone is signed in on the device. If the renewal gets no answer (offline),
  the account stays as it was cached; if it is refused, the next account screen shows Sign in.
- **For development only,** `COOKIE_SECURE=false` makes them plain `session` and `refresh` cookies without Secure,
  because browsers drop Secure cookies over plain http and refuse the prefixes there. Every other value, or none, keeps
  `__Host-session` and `__Secure-refresh` with Secure. It is never set on a server (DEPLOY.md).
- **Signing in always makes a new pair and a new session.** Signing in, accepting an invite and setting a new password
  from a link each end the session the browser had first, whoever it belonged to, found by either cookie (the session
  token may have run out), so no session is left behind that no device holds.
- An account has **at most 20 sessions**. A new one past that ends the ones used longest ago (signed in or refreshed),
  so a loop of sign-ins cannot fill the database. The Account screen's Sign out everywhere ends them all.
- Sign-out, Sign out everywhere, a new password and blocking end sessions at once, as before: the session token is
  checked in the database on every request, so an hour-long token is never a way in after its session ended.
- Sessions saved before 0.14.0 have neither hash, so no cookie can use them: the API deletes them when it starts, and
  everyone on the test site signs in once more. (Production had no accounts yet.) A rollback to an older API finds no
  session either, so everyone would sign in again after one.
- **Forged requests** from other sites are stopped twice: `SameSite=Lax`, and every request that changes something
  (anything but GET, HEAD and OPTIONS) must have an `Origin` header with the same host and port as its `Host` header
  (else 403 `bad_origin`). Bodies must be JSON: a `text/plain` body, which a form on another site can send, gets 415.

### 5.5 Passwords

- At least **10 characters**, at most 128, counted as people count them (an emoji is one). Any characters, and no rules
  about digits or symbols (NIST SP 800-63B). The app checks the length before sending; the server checks everything.
- Refused when it is on the common-password list, or contains the email address (or the part before the @, from 4
  characters). The list is the NCSC's 100,000 most used passwords, keeping only those of 10 or more characters: 9,126
  entries (`server/src/auth/common-passwords.txt`), compared without case.
- Stored only as a **scrypt** hash: `scrypt$<N>$<r>$<p>$<salt>$<hash>`, base64, with a 16-byte salt and a 64-byte key.
  The settings are in each hash, so they can change later and old hashes still verify. A hash is not made again with
  new settings yet (§11).
- The password is Unicode-normalised (NFC) before hashing, so the same password typed with composed or decomposed
  accents matches.

### 5.6 Later: passkeys, Google or Apple, two-step sign-in

The account does not assume a password: a later `credentials` list (password, passkey, Google) can sit beside it
without changing the rest. Phase 1 has no two-step sign-in; for admins it is an open question (§11).

## 6. Progress on the account

Phase 2; not built yet. Without an account nothing changes: progress stays in the browser. Signing in adds a copy on
the server.

### 6.1 What syncs

| Synced to the account | Stays on the device |
|---|---|
| Progress: lessons, stars, XP, streak days, daily challenge, Read notes and Scales results, Learn sections read | Calibration (`calibrationMs`, `calibratedAt`): each device has its own delay |
| Prefs: language, theme, note names, piano labels, metronome look, input mode, the path last picked | Volumes, and the How to play and intro flags already seen on this device |

### 6.2 How it syncs

- The app saves to the account **after each finished exercise**, on start, and when the device comes back online; it
  sends the `rev` it last saw.
- If the account has moved on (another device saved meanwhile), the server answers with its copy, the app **merges**
  the two and saves again.
- **Merging never loses progress:** the best stars and accuracy per lesson, all practice days from both, the higher
  XP, all Learn sections read from both, the newer daily challenge. The rules live in `shared/merge.ts`, with property
  tests (fast-check) that merging is order-independent and never lowers a result.
- **First sign-in on a device that already has progress:** merged the same way, so nobody loses what they did before
  they had an account.
- **Signing out** asks whether to keep this device's progress or clear it (for a shared computer).

## 7. API

JSON over HTTPS, under `/api/v1`. The types of every body are in `shared/api.ts`. Every response sends `Cache-Control:
no-store`, as answers hold someone's own data. Bodies are at most 256 KiB.

As built in phase 1 (*public*: anyone; otherwise signed in, with that permission):

| Request | Who | What |
|---|---|---|
| `GET /health` | public | Is the API up, and can it reach the database: 200, or 503 with `db: "unreachable"`. Also the running commit, which the deploy waits for. |
| `POST /auth/sign-in` | public | Email and password → `Me`, and the session cookies. |
| `POST /auth/refresh` | public | The refresh cookie → 204 and a new pair of cookies (§5.4); 204 without cookies when the same token was swapped less than a minute ago; else 401 `unauthenticated`, and the cookies are cleared. A swapped token that comes back ends its session. |
| `POST /auth/invite/check`, `POST /auth/reset/check` | public | Is the link still good, and whose is it: email, name and when it stops working. |
| `POST /auth/invite/accept` | public | The token, a password and optionally a name → `Me`, and the cookies. The account becomes active. |
| `POST /auth/reset/confirm` | public | The token and a password → `Me`, and the cookies. Every other session ends. |
| `POST /auth/sign-out` | `self.manage` | Ends this session. |
| `POST /auth/sign-out-everywhere` | `self.manage` | Ends every session of the account, and its new-password links. |
| `GET /me` | `self.manage` | `Me`: the account, its roles, permissions and premium. |
| `PATCH /me` | `self.manage` | Name and locale. |
| `POST /me/password` | `self.manage` | The current and a new password. Other sessions and new-password links end. |
| `POST /me/email` | `self.manage` | The current password and a new email. New-password links end. |
| `GET /me/export` | `self.manage` | Everything about the account as a download (`muzieklab-account.json`): the account, its sessions and the audit entries about it. What it did to other accounts is left out, so other people's data stays out. |
| `DELETE /me` | `self.manage` | With the current password: the account, its sessions and links go, and audit entries about it are scrubbed (§3.5). |
| `GET /admin/accounts?q=&status=` | `accounts.read` | Newest first, at most 500. `q` matches name or email as plain text, without case; `status` is invited, active or blocked. There is no role filter (the first plan had one). |
| `POST /admin/invites` | `accounts.invite`, plus `roles.grant` when roles are given | Email, name and roles → the invited account and its link. |
| `GET /admin/accounts/:id` | `accounts.read` | The account, how many devices are signed in, and while invited, when its link stops working (null when none works). |
| `PATCH /admin/accounts/:id` | `accounts.read`, plus per field: name and email `accounts.invite`, roles `roles.grant`, status `accounts.block`, premium `entitlements.grant` | Only the fields sent change. Status is block or unblock; premium is `{ active: true, until: "YYYY-MM-DD" \| null }` (until must be sent) or `{ active: false }`. |
| `POST /admin/accounts/:id/invite-link` | `accounts.invite` | An invited account only: a new invite link; the old one stops working. |
| `POST /admin/accounts/:id/reset-link` | `accounts.invite` | An active account only: a new-password link for 24 hours. It lets its holder into the account, as an invite does, hence the same permission. |
| `DELETE /admin/accounts/:id?expect=` | `accounts.delete` | Cancels an invite or deletes an account (never yourself, never the last admin). With `expect` (a status), it is refused with 409 `wrong_status` when the account has another status: Cancel invite sends `expect=invited`, so an invite accepted meanwhile is not deleted. |
| `GET /admin/audit?limit=&before=` | `audit.read` | Newest first: 100 by default, at most 500. `before` is the last id of the previous page. No screen shows it yet. |

Planned: `GET /progress` and `PUT /progress` (with `rev`; 409 with the server copy on a conflict) in phase 2; `POST
/classes`, `GET /classes`, `GET /classes/:id`, `PATCH /classes/:id`, `POST /classes/join`, `GET /classes/:id/progress`
and `DELETE /classes/:id/members/:accountId` in phase 3; content in phase 4, designed with it (§10).

Errors are `{ "error": "code", "message": "…" }`, plus `retryAfter` with `too_many_attempts` and `busy`. The `code` is
stable, and the app shows its own English or Dutch text for it. The codes are in `ERROR_CODES` (`shared/api.ts`):
`bad_request` (400), `unauthenticated`, `invalid_credentials` and `wrong_password` (401), `forbidden` and `bad_origin`
(403), `not_found` (404), `email_taken`, `last_admin`, `own_account` and `wrong_status` (409), `link_invalid` (410),
`password_length`, `password_common`, `password_has_email` and `email_invalid` (422), `too_many_attempts` (a counter's
wait) and `busy` (the hash queue is full, §5.2) (429), and `internal` (500). Fastify's own refusals (a body that is
broken, too big, or not JSON) keep their status (400, 413, 415) with the code `bad_request`. Phase 2 adds
`rev_conflict`. When the API does not answer at all, the app uses its own code, `unavailable`.

## 8. Privacy and security

**Personal data we keep:** email, name, password hash, roles and premium, sessions (device name, when signed in and
last used) and the audit log. Progress joins in phase 2. No IP addresses are stored: an address is kept only briefly in
memory for the sign-in limits (§5.2), and the log has none (below).

GDPR (in the Netherlands: AVG) needs, before the first invite goes out:

- A **privacy statement** in the app: built in 0.12.0, under Settings → About → Privacy and linked from Sign in. It
  says what stays on the device, what an account stores, why, where (Hetzner in Helsinki, EU), for how long and what
  you can do yourself. The text is a draft (marked `LEGAL REVIEW` in `src/ui/screens/account/Privacy.tsx`). It needs a
  legal check, and a contact address for privacy questions, before the first real invite.
- A **data processing agreement** with Hetzner (they offer one in the console).
- **Export** (`GET /me/export`, everything about the account as JSON) and **delete** (the account, its sessions and
  links go, and audit entries about it lose the name and email) from the Account screen, without asking an admin:
  built. Progress and memberships join the export and the delete in phases 2 and 3.
- **Children:** in the Netherlands, under-16s need a parent's consent for an account. While accounts are invite only,
  admins invite only people of 16 and over, as the privacy statement says. Teachers and pupils (phase 3) need a
  decision first (§11).

Security:

- MongoDB listens on `127.0.0.1` only, with authentication on and its own user per site, allowed only that site's
  database (`muzieklab`, `muzieklab_test`).
- The API runs as its own system user, `muzieklab-api`, with systemd hardening (`NoNewPrivileges`, `ProtectSystem`,
  `PrivateTmp` and more). Its settings, the database password among them, are in `/etc/muzieklab-api/<site>.env`,
  readable by root only; systemd reads the file before it starts the service as that user.
- **The log** (JSON lines to the journal, `server/src/log.ts`) has one line per request. That line holds the method,
  the route's pattern (`/api/v1/admin/accounts/:id`, so no ids), the status and the response time. It has no IP
  address, no Host, no query string (an admin's search holds names and emails), no cookie and no body. Fastify's own
  request lines are off for this reason. Besides these lines, the log has the start and stop of the service, warnings
  when MongoDB cannot be reached, and the error of a request that failed with a 500. Logs never contain passwords,
  tokens or cookies.
- Dependabot keeps both the app's and the server's dependencies current; `npm audit` runs in CI.
- **Backups:** every night a script writes a compressed `mongodump` of all databases to `/var/backups/muzieklab/`,
  and 14 are kept on the server (DEPLOY.md). Hetzner's own server backups, which DEPLOY.md says to turn on, cover a
  lost server. A copy to a Hetzner Storage Box (off the server) is not set up yet. DEPLOY.md has the restore steps; a
  restore is tested once before the first invite.

**Residual risk.** Floods from many networks (dozens of IPv6 /48s, or many IPv4 /24s) can still slow sign-in for
everyone: one small server checks only about 16 passwords a second, so such a flood can make everyone wait or get
`busy`. The defence in the API is the limits per pair, address, network and email, and the bounded hash queue (§5.2):
nobody is locked out for good, one network cannot keep the others out, and the server does not run out of memory.
Nothing more is built in the API against many networks at once: a real flood would be handled at the network edge
(Caddy, or the hosting provider), not in the API. The same goes for tens of thousands of tries in flight at the same
moment, the only way left to push out a password counter's oldest entries (§5.2).

## 9. Hosting

### 9.1 On the server

The server runs Ubuntu 26.04 LTS on x86_64, with 3.7 GB of memory.

- **MongoDB 9.0 in Docker** (the official image, `deploy/mongo/compose.yaml`): MongoDB publishes no packages for
  Ubuntu 26.04 yet, and Docker works on any version. It is pinned to **9.0.4**. MongoDB 8.0 and later crash on Linux
  6.19 to 7.0.13, and refuse to start there (SERVER-121912), so the kernel must be upstream 7.0.14 or newer (Ubuntu
  26.04's 7.0.0-38 and later; its first kernels were older). 9.0.4 is the first release that recognises Ubuntu's
  patched kernels (SERVER-136272). It listens on `127.0.0.1` only.
- **Memory:** MongoDB would take about 1.4 GB for its cache by default; `--wiredTigerCacheSizeGB=0.5` is plenty for
  this data and leaves room for the API and Caddy.
- **The API** is one bundled file (`server/build.mjs`), so the server needs only Node (Ubuntu's own package) and
  nothing is installed there at deploy time. It is a systemd service per site, `muzieklab-api@test` and
  `muzieklab-api@production` (`deploy/api/`), started from `/srv/muzieklab-api/<site>/current`. Releases sit in
  `releases/<commit>/`, as the app's do.
- **Caddy** gets one block more per site. `deploy/Caddyfile` has it for both: production's API on port 3000, the test
  site's on 3001.

  ```
  vivanova.app {
  	handle /api/* {
  		reverse_proxy 127.0.0.1:3000
  	}
  	handle {
  		root * /var/www/muzieklab/current
  		import muzieklab      # the files and their headers, as before
  	}
  }
  ```

### 9.2 Deploying

Built in phase 0 (`deploy-site.yml`, run for a site once its `TEST_API_PATH` or `API_PATH` variable is set):

1. Test and build the server (with the database tests) next to the app.
2. Upload the bundle to `/srv/muzieklab-api/<site>/releases/<commit>/`.
3. Switch `current` and restart the service. The `deploy` user may run exactly that restart with sudo, and nothing
   else. When the API starts, it makes its indexes (and the lock document, §3.6) before it answers. That step does no
   harm when run again, and it is tried again with a growing wait while MongoDB does not answer, so systemd does not
   give up on restarts.
4. Wait for `/api/v1/health` to answer with this commit and the database reachable. If it does not within a minute,
   switch back to the previous release and restart, so the API is never left down; the deploy fails and the app is
   not switched.

**Migrations:** there is no migrations runner yet, because phase 1 needs none: making the indexes at startup is enough.
The first schema change that needs one brings it. The plan for it: numbered scripts in `server/migrations/`, each run
once, recorded in a `migrations` collection, run when the API starts and before it answers. Migrations only **add** (a
new field with a default, a new index); they never rename or drop in the same release, so the previous release still
works against the database if the deploy has to switch back.

### 9.3 A test site first

With a database, changes need a place to try them that is not real people's accounts. **test.vivanova.app** is set
up for the app ([DEPLOY.md](DEPLOY.md), *The test site*): it deploys on every push to the `test` branch, or any branch
by hand. Its API is on port 3001, with its own database `muzieklab_test`.

## 10. Phases

| Phase | What | Visible in the app | Version |
|---|---|---|---|
| **0 · Groundwork** (built) | test.vivanova.app; MongoDB with backups; the API with `/api/v1/health`, deployed by the workflow with a rollback; the Caddy `/api` block | Nothing | none (no app change) |
| **1 · Accounts** (built) | The create-admin command, invite and new-password links, sign in and out, the Account screen (name, email, password, sign out everywhere, export, delete), Admin: accounts, invite, roles, block, premium; the privacy statement | Settings → Account; Accounts for admins; Settings → About → Privacy | 0.12.0 |
| **2 · Progress on the account** | Sync and merge (§6) | Progress on every device; sync status in Settings → Account | minor |
| **3 · Teachers and classes** | Classes, join codes, the class view of pupils' progress, assignments | Teacher screens; Join a class | minor |
| **4 · Editing content** | Editors change Learn chapters and Path units | Editor screens | minor |
| **5 · Premium** | Premium features, then a payment provider (for example Mollie, which is Dutch) | Premium badge and upgrade screen | minor |

Phases 1 and 2 are the core; 3 to 5 each need their own design pass before building (§11). Production gets its API
before the release with phase 1 is merged (DEPLOY.md, *Production's API*), so the Account section exists there too.

**Editing content (phase 4)** is the biggest change of approach: today chapters and units are data in the code
(`src/ui/learn/chapters.ts`, `src/game/path.ts`, `src/i18n/en.json`), built into the app and available offline. Two
ways are open: content from the database (the app downloads and caches it), or an editor screen that turns an edit
into a pull request on GitHub, so content stays in the code, reviewed and offline. The second keeps more of what works
today, and needs no content collection at all.

### 10.1 Screens to design first

Per CLAUDE.md, every screen is designed on the canvases first (phone, tablet and desktop, light and dark). None of
these has a board yet. Phase 1's screens were built in 0.12.0 without boards, from Settings' design language; DESIGN.md
§9 (*Account and admin screens*) describes them as built. Their boards are still to be drawn on both canvases.

| Phase | Screens |
|---|---|
| 1 (built) | Sign in (with "Forgot your password? Ask the person who invited you") · Accept invite (choose a password) · New password (from a link) · Settings → Account, signed out and signed in · Account details (name, email, password, sign out everywhere, export, delete) · Admin: accounts list, invite (with the link to copy), an account (roles, status, premium, new password link) · Privacy statement |
| 2 | Sync status and "first sign-in on a device with progress" · Signing out: keep or clear this device |
| 3 | Join a class · Teacher: classes, a class (pupils, progress, assignments) · Pupil: assignments |
| 4 | Content editor (depends on the approach above) |
| 5 | Premium badge · Upgrade |

**Where accounts sit in the shell:** decided, and built as proposed. The shell has no sidebar (bottom tab bar on
phone, top header on tablet and desktop), and there is no new tab. Accounts sit in a new **Account** section at the
top of Settings, on every size. It holds the account, an **Accounts** row that only admins see (`accounts.read`), and
Sign out; signed out, it holds Sign in. The section shows only once the API has answered, or when an account is cached
on the device, so a site without an API looks exactly as before.

## 11. Open questions

1. **Email service:** decided: none for now; admins send invite and new-password links by hand (§5.1, §5.3). Later,
   an EU service (Brevo, Mailjet or Scaleway) can send them; it needs SPF, DKIM and DMARC records on vivanova.app.
2. **The server's Ubuntu version and processor:** decided: Ubuntu 26.04 LTS on x86_64, so MongoDB runs in Docker and
   the API is one bundled file (§9.1).
3. **Children's accounts** (before phase 3): pupils under 16 need a parent's consent, or the school is responsible for
   its pupils' accounts under its own agreement with us. Which way, or teachers and pupils 16 and over only at first?
   For now accounts are for people of 16 and over (§8).
4. **Two-step sign-in for admins** (an authenticator app code): not in phase 1. When, or before which phase?
5. **Editing content:** from the database, or as pull requests (§10)?
6. **Premium:** which features or content, and at what price?
7. **Account in the shell:** decided: Settings → Account, with Accounts inside it for admins, built in 0.12.0
   (§10.1). Its boards are still to be drawn.

Known gaps in phase 1, for a later release:

- A new-password link made before an account was blocked works again if the account is unblocked before the link
  expires (§5.3).
- A stored hash is not made again when the scrypt settings change (§5.5).
- The sign-in counters are in memory: a restart forgets them, and they would not be shared by a second process (§5.2).
- The accounts list shows at most 500 accounts, without pages, and no screen shows the audit log yet (§7).
