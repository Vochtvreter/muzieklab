# Accounts and permissions: back-end design

Status: **design, nothing built.** Written on 2026-10-23, after production moved to our own server
([DEPLOY.md](DEPLOY.md)). Decisions taken so far:

- **Accounts are invite only** for now: an admin invites people by email. Open sign-up comes later.
- **Sign-in is email and password.** The model leaves room for passkeys or Google/Apple later (§5.6).
- **Permissions cover four areas:** admin tools, teachers and classes, editing content, and premium features. They are
  built in that order of need, in phases (§10).
- **MongoDB** is the database: a document database, with the features accounts need (§3.1).

The app keeps working **without an account and offline**, as DESIGN.md §1 promises. An account is an extra: it keeps
progress across devices, and it is what roles and permissions hang on. No screen needs the server to work, except
the account and admin screens themselves.

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

API ──► email service (invites, password resets, email changes)
```

- **One domain.** The app calls `/api/…` on the same domain, so there are no CORS rules and the session cookie can be
  locked down tight (§5.4). Caddy sends `/api/*` to the API and everything else to the files, as now.
- **Nothing is exposed but Caddy.** The API and MongoDB listen on `127.0.0.1` only; the firewall stays at 22, 80, 443.
- **The service worker leaves the API alone.** API calls are `fetch`es, never precached; the PWA config gets
  `navigateFallbackDenylist: [/^\/api\//]` so a link to an API address is never answered with the app.

### 1.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Node 22 LTS**, TypeScript | Same language as the app; types shared between them. |
| HTTP | **Fastify** | Mature, fast, schema validation and hooks for the permission check (§4.4). |
| Validation | **zod** schemas in `shared/` | One schema validates the request on the server and types it in the app. |
| Database driver | Official **`mongodb`** driver, typed collections | No ORM layer to learn; the documents are the types. |
| Passwords | **argon2id** (`@node-rs/argon2`) | The current recommendation (OWASP: 19 MiB, 2 iterations, 1 lane); prebuilt for x64 and arm64. |
| Tests | **Vitest**, MongoDB in memory (`mongodb-memory-server`) | Same test runner as the app; every route tested against a real database. |

### 1.2 Code layout

```
server/
  package.json          its own dependencies; the app's package.json is unchanged
  src/
    main.ts             starts Fastify, connects to MongoDB, creates indexes
    db.ts               typed collections (§3)
    auth/
      passwords.ts      hash, verify, rules (§5.5)
      sessions.ts       create, look up, revoke (§5.4)
      policy.ts         roles → permissions, can() (§4)
    routes/             one file per area: auth, me, progress, admin, classes, content
    email/              templates (en, nl) and sending
  migrations/           numbered scripts, run before a release switches (§9.2)
  scripts/
    create-admin.ts     the first admin, run once on the server (§5.1)
shared/
  api.ts                request and response schemas (zod), imported by server and app
  merge.ts              how local and account progress merge (§6), with property tests
src/                    the app, as now; new: src/api/ (client) and the account screens
```

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

Field names are as stored. `_id` is an `ObjectId` unless shown otherwise. Every collection has `createdAt`; documents
that change also have `updatedAt`.

### 3.1 accounts

```js
{
  _id: ObjectId("…"),
  email: "ann@example.com",            // lower-cased; unique index
  name: "Ann",
  passwordHash: "$argon2id$v=19$…",    // null until the invite is accepted
  status: "invited",                   // "invited" | "active" | "blocked"
  roles: ["teacher"],                  // global roles (§4.1)
  entitlements: {                      // what the account has access to (§4.3)
    premium: { until: ISODate("2027-10-23"), source: "admin" }
  },
  locale: "nl",                        // for emails
  passwordChangedAt: ISODate("…"),
  lastSignInAt: ISODate("…"),
  createdAt: ISODate("…"), updatedAt: ISODate("…"),
}
```

### 3.2 sessions and one-time tokens

```js
// sessions: one per signed-in device
{ _id: "<sha256 of the cookie token>", accountId, createdAt, lastSeenAt, expiresAt, device: "Safari on iPhone" }

// tokens: invites, password resets, email changes
{ _id: "<sha256 of the emailed token>", kind: "invite" | "reset" | "email", accountId, email, expiresAt, usedAt }
```

Only the **hash** of a token is stored, so a copy of the database cannot be used to sign in. A **TTL index** on
`expiresAt` deletes old sessions and tokens by itself.

### 3.3 progress

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

### 3.5 content (phase 4) and audit

```js
// content: an edited Learn chapter or Path unit (§10, phase 4)
{ _id: "learn:11", locale: "nl", draft: {…}, published: {…}, version: 7, updatedBy, updatedAt }

// audit: every change to accounts, roles, entitlements, classes and content
{ _id, at, actorId, action: "role.grant", target: { type: "account", id }, details: { role: "teacher" } }
```

Audit entries are kept for two years (TTL index). When an account is deleted, its entries keep the action but lose
the name and email (§8).

## 4. Permissions

### 4.1 Roles

Two kinds of role, and entitlements beside them:

- **Global roles**, in `accounts.roles`: what someone may do anywhere.
  - `admin`: accounts, roles and entitlements, and everything else.
  - `editor`: edit and publish learning content.
  - `teacher`: create classes. Inside a class, the class's own roles apply.
- **Class roles**, in `memberships`: `teacher` (the owner, and co-teachers) and `pupil`. They count only inside that
  class.
- **Entitlements**, in `accounts.entitlements`: features an account has, for a time (premium). They are not roles,
  because they are bought or given, they expire, and a payment provider will set them later (§10, phase 5).

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

Guard rails, enforced in a transaction:

- The **last admin** cannot lose the role, be blocked or be deleted.
- An admin cannot **change their own roles or block themselves**; another admin does that.
- A pupil sees **their own** progress and the class's assignments, never other pupils.

### 4.3 Premium

Premium is a feature check, not a permission: `hasEntitlement(account, 'premium')` is true while `until` is in the
future (or `until` is null). Which features are premium is an open question (§11). Until a payment provider exists,
admins set it by hand (`source: "admin"`), and the audit log records it.

### 4.4 How the check works

```ts
// server/src/auth/policy.ts
can(actor, 'class.progress.read', { classId })   // → true or false
```

- `can()` looks up the actor's global roles, and for a class permission, their membership in that class.
- **Deny by default:** every route declares its permission in its route options, and a test fails when a route has
  none (public routes declare `public: true`, which is only sign-in, password reset and accepting an invite).
- The table in §4.2 is the policy, written once in `policy.ts` and tested row by row.
- `GET /api/me` returns the account's permissions and entitlements, so the app shows only what someone may use. The
  server checks every request anyway; hiding a button is not security.

## 5. Signing in

### 5.1 The first admin and invites

1. On the server, `node scripts/create-admin.js ann@example.com` creates the first admin and prints a one-time link.
2. An admin invites someone: email, name and roles. The account is `invited`, and an email goes out with a link to
   `https://vivanova.app/#/invite/<token>`, valid for 7 days.
3. The person opens the link, chooses a password, and is signed in. The account is now `active`.

An admin can resend or cancel an invite. An expired invite can be sent again.

### 5.2 Sign in, sign out

- **Sign in** with email and password. A wrong email and a wrong password get the same answer ("Email or password is
  not right"), so the form does not tell anyone who has an account.
- **Too many tries** slow down rather than lock: after 5 failed tries for an email or from an address in 15 minutes,
  each next try waits longer. A hard lockout would let anyone lock someone else out.
- **Sign out** deletes the session. **Sign out everywhere** (Account) deletes all of the account's sessions.
- A **blocked** account cannot sign in, and its sessions are deleted when it is blocked.

### 5.3 Forgotten password, new email

- **Forgot password:** always answers "If there is an account for this email, we've sent a link", and sends a link
  valid for 1 hour, usable once. Setting a new password signs out all other devices.
- **Changing the password** asks for the current one. **Changing the email** sends a confirmation link to the new
  address, and a notice to the old one.

### 5.4 Sessions

- The session token is 32 random bytes, in a cookie: `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`. JavaScript cannot read it, and it is only sent to vivanova.app over HTTPS.
- A session lasts **30 days after the last use**, so someone who practises weekly stays signed in. Signing in always
  makes a new token.
- **Forged requests** from other sites are stopped twice: `SameSite=Lax`, and every request that changes something
  must be JSON and come from `https://vivanova.app` (the `Origin` header).

### 5.5 Passwords

- At least **10 characters**, at most 128; any characters, no rules about digits or symbols (NIST SP 800-63B).
- Refused when it is on a list of the 100,000 most common passwords, or contains the email address.
- Stored only as an **argon2id** hash.

### 5.6 Later: passkeys, Google or Apple, two-step sign-in

The account does not assume a password: a later `credentials` list (password, passkey, Google) can sit beside it
without changing the rest. Two-step sign-in for admins is an open question (§11).

## 6. Progress on the account

Without an account nothing changes: progress stays in the browser. Signing in adds a copy on the server.

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

JSON over HTTPS, under `/api/v1`. Every response that is not public sends `Cache-Control: no-store`.

| Area | Requests |
|---|---|
| Health | `GET /health` (public: is the API up, and can it reach the database) |
| Sign in | `POST /auth/sign-in`, `POST /auth/sign-out`, `POST /auth/sign-out-everywhere`, `POST /auth/reset/request`, `POST /auth/reset/confirm`, `POST /auth/invite/accept`, `POST /auth/email/confirm` |
| Own account | `GET /me` (account, permissions, entitlements), `PATCH /me` (name, locale), `POST /me/password`, `POST /me/email`, `GET /me/export`, `DELETE /me` |
| Progress | `GET /progress`, `PUT /progress` (with `rev`; 409 with the server copy on a conflict) |
| Admin | `GET /admin/accounts` (search, filter by role or status), `POST /admin/invites`, `GET /admin/accounts/:id`, `PATCH /admin/accounts/:id` (roles, status, entitlements), `DELETE /admin/accounts/:id`, `GET /admin/audit` |
| Classes (phase 3) | `POST /classes`, `GET /classes`, `GET /classes/:id`, `PATCH /classes/:id`, `POST /classes/join`, `GET /classes/:id/progress`, `DELETE /classes/:id/members/:accountId` |
| Content (phase 4) | to be designed with phase 4 (§10) |

Errors are `{ "error": "code", "message": "…" }` with a stable `code` the app translates (`invalid_credentials`,
`forbidden`, `rev_conflict`, …), so every message can be shown in English and Dutch.

## 8. Privacy and security

**Personal data we keep:** email, name, password hash, progress, sessions (device name, last use) and the audit log.
No IP addresses are stored, except briefly in memory for the sign-in limits.

GDPR (in the Netherlands: AVG) needs, before the first invite goes out:

- A **privacy statement** in the app (Settings → About, and on the sign-in screen): what is stored, why, for how long,
  and who processes it (Hetzner for the server, in Helsinki, EU; the email service).
- A **data processing agreement** with Hetzner (they offer one in the console) and with the email service.
- **Export** (`GET /me/export`, everything about the account as JSON) and **delete** (account, sessions, tokens,
  memberships and progress go; audit entries lose the name and email) from the Account screen, without asking an admin.
- **Children:** in the Netherlands, under-16s need a parent's consent for an account. While accounts are invite only,
  admins invite only adults; teachers and pupils (phase 3) need a decision first (§11).

Security:

- MongoDB listens on `127.0.0.1` only, with authentication on and its own user for the API, allowed only the
  `muzieklab` database.
- The API runs as its own system user, `muzieklab-api`, with systemd hardening (`NoNewPrivileges`, `ProtectSystem`,
  `PrivateTmp`). Its secrets (database password, email key) are in `/etc/muzieklab-api/env`, readable only by it.
- Logs never contain passwords, tokens or cookies.
- Dependabot keeps both the app's and the server's dependencies current; `npm audit` runs in CI.
- **Backups:** every night `mongodump` writes a compressed, encrypted archive; 14 are kept on the server and copied to
  a Hetzner Storage Box (off the server). Hetzner's own server backups are turned on as well. DEPLOY.md gets the
  restore steps, and a restore is tested once before the first invite.

## 9. Hosting

### 9.1 On the server

- **MongoDB 8.0 Community.** It supports Ubuntu 22.04 and 24.04 LTS on x64 and arm64; on a newer, non-LTS Ubuntu it
  runs in Docker (the official image) instead. The server's Ubuntu version and processor decide this (§11).
- **Memory:** the server has 4 GB. MongoDB would take about 1.5 GB for its cache by default; `cacheSizeGB: 0.5` is
  plenty for this data and leaves room for the API and Caddy.
- **The API** is a systemd service, `muzieklab-api`, started from `/srv/muzieklab-api/current`. Releases sit in
  `releases/<commit>/`, as the app's do.
- **Caddy** gets one block more:

  ```
  vivanova.app {
  	handle /api/* {
  		reverse_proxy 127.0.0.1:3000
  	}
  	handle {
  		root * /var/www/muzieklab/current
  		file_server
  		# …the headers as now
  	}
  }
  ```

### 9.2 Deploying

The existing *Deploy to production* workflow gets a second part:

1. Test and build the server (with the database tests) next to the app.
2. Upload it to `/srv/muzieklab-api/releases/<commit>/` with its production dependencies.
3. Run new **migrations** (`server/migrations/`, each run once, recorded in a `migrations` collection), then switch
   `current` and restart the service. The `deploy` user may run exactly one command with sudo,
   `systemctl restart muzieklab-api`, and nothing else.
4. Check `/api/health`. If it fails, switch back to the previous release and restart, so the API is never left down.

Migrations only **add** (a new field with a default, a new index); they never rename or drop in the same release, so
the previous release still works against the database if the deploy has to switch back.

### 9.3 A test site first

With a database, changes need a place to try them that is not real people's accounts. **test.vivanova.app** comes
before accounts go live: its own copy of the app, its own API on port 3001, its own database `muzieklab_test`, and
emails only to us. It deploys on every push to a `test` branch (or by hand from a pull request).

## 10. Phases

| Phase | What | Visible in the app | Version |
|---|---|---|---|
| **0 · Groundwork** | test.vivanova.app; MongoDB with backups; the API with `/api/health`, deployed by the workflow; the Caddy `/api` block | Nothing | none (no app change) |
| **1 · Accounts** | Create-admin script, invites, sign in and out, forgotten password, Account screen (name, email, password, sign out everywhere, export, delete), Admin: accounts, invite, roles, block; privacy statement | Settings → Account; Admin for admins | minor |
| **2 · Progress on the account** | Sync and merge (§6) | Progress on every device; sync status in Settings → Account | minor |
| **3 · Teachers and classes** | Classes, join codes, the class view of pupils' progress, assignments | Teacher screens; Join a class | minor |
| **4 · Editing content** | Editors change Learn chapters and Path units | Editor screens | minor |
| **5 · Premium** | Premium features, then a payment provider (for example Mollie, which is Dutch) | Premium badge and upgrade screen | minor |

Phases 1 and 2 are the core; 3 to 5 each need their own design pass before building (§11).

**Editing content (phase 4)** is the biggest change of approach: today chapters and units are data in the code
(`src/ui/learn/chapters.ts`, `src/game/path.ts`, `src/i18n/en.json`), built into the app and available offline. Two
ways are open: content from the database (the app downloads and caches it), or an editor screen that turns an edit
into a pull request on GitHub, so content stays in the code, reviewed and offline. The second keeps more of what works
today, and needs no content collection at all.

### 10.1 Screens to design first

Per CLAUDE.md, every screen is designed on the canvases first (phone, tablet and desktop, light and dark). None of
these has a board yet:

| Phase | Screens |
|---|---|
| 1 | Sign in · Forgot password · New password · Accept invite (choose a password) · Settings → Account, signed out and signed in · Account details (name, email, password, sign out everywhere, export, delete) · Admin: accounts list, invite, an account (roles, status, premium) · Privacy statement |
| 2 | Sync status and "first sign-in on a device with progress" · Signing out: keep or clear this device |
| 3 | Join a class · Teacher: classes, a class (pupils, progress, assignments) · Pupil: assignments |
| 4 | Content editor (depends on the approach above) |
| 5 | Premium badge · Upgrade |

**Where accounts sit in the shell** is a design question for the canvases: the shell has no sidebar (bottom tab bar
on phone, top header on tablet and desktop). The proposal is a new **Account** section at the top of Settings, on
every size, with **Admin** as a row in it that only admins see, and no new tab.

## 11. Open questions

1. **Email service.** Invites and password resets need one, ideally in the EU: for example Brevo (France), Mailjet
   (France) or Scaleway (France); Postmark (US) is known for reliable delivery. All need SPF, DKIM and DMARC records on
   vivanova.app.
2. **The server's Ubuntu version and processor.** `lsb_release -ds; uname -m` on the server decides MongoDB from apt
   or in Docker (§9.1), and how the server's dependencies are built.
3. **Children's accounts** (before phase 3): pupils under 16 need a parent's consent, or the school is responsible for
   its pupils' accounts under its own agreement with us. Which way, or teachers and pupils 16 and over only at first?
4. **Two-step sign-in for admins** (an authenticator app code): in phase 1, or later?
5. **Editing content:** from the database, or as pull requests (§10)?
6. **Premium:** which features or content, and at what price?
7. **Account in the shell:** Settings → Account with Admin inside it, as proposed in §10.1, or something else?
