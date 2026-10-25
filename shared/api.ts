/**
 * The API's contract (docs/BACKEND-PLAN.md §7): every request and response body under /api/v1, shared by the server
 * (server/src) and the app (src/api). Types only, so neither side bundles the other's code.
 *
 * Dates are ISO 8601 strings. Every error is an ApiErrorBody with a stable `error` code the app translates.
 */

// --- roles, permissions, entitlements (BACKEND-PLAN.md §4) ------------------------------------------------------

/**
 * The built-in roles (BACKEND-PLAN.md §4.1), in the order lists show them. They always exist and cannot be deleted;
 * admin always has every permission. Admins can make more roles (custom roles), and change the permissions of editor,
 * teacher and the custom ones. Class roles (teacher, pupil in one class) come with phase 3.
 */
export const BUILT_IN_ROLES = ['admin', 'editor', 'teacher'] as const;
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

/** A role's id: a built-in one, or a custom one (2 to 32 lower-case letters, digits and dashes, starting with a letter). */
export type Role = string;
export const ROLE_ID_PATTERN = '^[a-z][a-z0-9-]{1,31}$';
export const isBuiltInRole = (id: string): id is BuiltInRole => (BUILT_IN_ROLES as readonly string[]).includes(id);

export const ACCOUNT_STATUSES = ['invited', 'active', 'blocked'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** What code checks: never role names (BACKEND-PLAN.md §4.2). */
export const PERMISSIONS = [
  'self.manage',
  'progress.own',
  'class.join',
  'accounts.read',
  'accounts.invite',
  'accounts.block',
  'accounts.delete',
  'roles.grant',
  'roles.manage',
  'entitlements.grant',
  'audit.read',
  'class.create',
  'content.edit',
  'content.publish',
  'feedback.give',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Premium (BACKEND-PLAN.md §4.3): on with no end (`until` null), or through a last day.
 *
 * The last day is a calendar date (YYYY-MM-DD), not a moment, so it reads the same in every time zone. It counts as
 * on through that whole day anywhere in the world: until the day after it, 12:00 UTC (the end of the day at UTC−12).
 */
export interface Premium {
  active: boolean;
  /** The last day it is on (YYYY-MM-DD), or null for no end. Null too when not active. */
  until: string | null;
}

// --- the signed-in account ------------------------------------------------------------------------------------------

export const LOCALES = ['en', 'nl'] as const;
export type AccountLocale = (typeof LOCALES)[number];

/** GET /me, and the answer to every request that signs someone in or changes their account. */
export interface Me {
  id: string;
  email: string;
  name: string;
  locale: AccountLocale | null;
  roles: Role[];
  /** The names of the account's custom roles, by id (built-in roles are named by the app, in its language). */
  roleNames: Record<Role, string>;
  /** Everything this account may do: the app shows only what is allowed (the server checks anyway). */
  permissions: Permission[];
  premium: Premium;
  createdAt: string;
}

// --- sign in, invites, new passwords (BACKEND-PLAN.md §5) -----------------------------------------------------------

/** POST /auth/sign-in → Me, and the session cookies (a session token for an hour, and a refresh token). */
export interface SignInRequest {
  email: string;
  password: string;
}

/** POST /auth/invite/check and /auth/reset/check: is the link from the hash still good, and whose is it? */
export interface LinkCheckRequest {
  token: string;
}
export interface LinkCheckResponse {
  email: string;
  name: string;
  expiresAt: string;
}

/** POST /auth/invite/accept → Me, and the session cookies. The account becomes active. */
export interface InviteAcceptRequest {
  token: string;
  password: string;
  /** The name to use, if the person changes the one the admin typed. */
  name?: string;
}

/** POST /auth/reset/confirm → Me, and the session cookies. Every other session of the account is signed out. */
export interface ResetConfirmRequest {
  token: string;
  password: string;
}

// POST /auth/refresh → 204 and new session cookies, from the refresh cookie (BACKEND-PLAN.md §5.4); 401 when the
// session ended. POST /auth/sign-out → 204 (this device). POST /auth/sign-out-everywhere → 204 (every session of the
// account).

// --- own account ----------------------------------------------------------------------------------------------------

/** PATCH /me → Me */
export interface UpdateMeRequest {
  name?: string;
  locale?: AccountLocale | null;
}

/** POST /me/password → 204. Signs out every other session; this one stays. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** POST /me/email → Me. The new address is the sign-in name from then on (no email is sent: none is set up). */
export interface ChangeEmailRequest {
  password: string;
  email: string;
}

/**
 * DELETE /me with this body → 204 (BACKEND-PLAN.md §3.7). The account, its sessions and links go, and audit entries
 * lose its name and email. Its saved progress and prefs go too with `removeData`; without it they are archived as an
 * anonymous copy (ClosureArchive). Either way a Closure says that an account was deleted, with the feedback.
 */
export interface DeleteMeRequest {
  password: string;
  /**
   * true: nothing of the account is kept. false: an anonymous copy of its progress and prefs is kept. When it is not
   * sent, true: what apps before 0.16.0 told the person (everything is deleted).
   */
  removeData?: boolean;
  /** Why they leave, if they want to say (at most FEEDBACK_MAX characters): kept with the Closure, without a name. */
  feedback?: string;
}

/** The longest feedback DELETE /me takes, in characters (code points). */
export const FEEDBACK_MAX = 1000;

/** GET /me/export: everything stored about the account, as a download (Content-Disposition: attachment). */
export interface AccountExport {
  exportedAt: string;
  account: Omit<Me, 'permissions' | 'roleNames'> & { status: AccountStatus; lastSignInAt: string | null; passwordChangedAt: string | null };
  sessions: { device: string; createdAt: string; lastSeenAt: string }[];
  /** What admins changed about this account, and what it changed itself. */
  audit: AuditEntry[];
  /** The progress and prefs saved on the account (BACKEND-PLAN.md §6). */
  progress: SavedProgress;
}

// --- progress on the account (progress.own; BACKEND-PLAN.md §6) ------------------------------------------------------

/**
 * What syncs (BACKEND-PLAN.md §6.1): the app's Progress, and the prefs that follow the account, as the app saves them
 * (src/game/sync.ts). The server keeps them as they come, checked for size and shape only (no key starts with `$`);
 * the app checks them with sanitizeProgress and sanitizePrefs on every read, as it does what it reads from storage.
 */
export interface SyncedData {
  prefs: Record<string, unknown>;
  progress: Record<string, unknown>;
}

/** GET /progress, and the answer to every save: the account's copy. */
export interface SavedProgress {
  /** Goes up by one on every save; 0 before the first. */
  rev: number;
  /** null before the first save. */
  data: SyncedData | null;
  /**
   * When the progress was last reset (DELETE /progress), or null. A device that last saw another value drops its own
   * progress for the account's, so a reset on one device is not undone by another device's older copy.
   */
  resetAt: string | null;
  updatedAt: string | null;
}

/**
 * PUT /progress → SavedProgress. `rev` is the one this device last saw (0: it has seen none). When the account has
 * moved on since (another device saved), it is refused with 409 rev_conflict and the account's copy in `current`; the
 * app merges the two and saves again with the copy's rev.
 */
export interface SaveProgressRequest extends SyncedData {
  rev: number;
}

// DELETE /progress → SavedProgress: Settings → Reset progress on a signed-in device. The progress is emptied (the prefs
// stay), `resetAt` is now, and `rev` goes up. Without a saved copy there is nothing to reset: the answer is rev 0.

/** The largest progress document the API keeps (BACKEND-PLAN.md §3.3: a full one is a few tens of kB). */
export const PROGRESS_MAX_BYTES = 200 * 1024;

// --- admin (accounts.*, roles.grant, entitlements.grant) ------------------------------------------------------------

export interface AccountSummary {
  id: string;
  email: string;
  name: string;
  status: AccountStatus;
  roles: Role[];
  premium: Premium;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface AccountDetail extends AccountSummary {
  /** While invited: when the newest invite link stops working (null: there is none, or it was used). */
  inviteExpiresAt: string | null;
  /** How many devices are signed in. */
  sessions: number;
}

/** GET /admin/accounts?q=&status= → { accounts }, newest first. `q` matches name or email. */
export interface AccountListResponse {
  accounts: AccountSummary[];
}

/** POST /admin/invites → InviteCreated. */
export interface InviteRequest {
  email: string;
  name: string;
  roles: Role[];
}

/**
 * A link for the admin to send by hand (BACKEND-PLAN.md §5.1, §5.3). Shown once: only its hash is stored, and a new
 * link cancels the one before.
 */
export interface LinkCreated {
  link: string;
  expiresAt: string;
}

export interface InviteCreated extends LinkCreated {
  account: AccountDetail;
}

/**
 * PATCH /admin/accounts/:id → AccountDetail. Only the fields sent change. An admin cannot change their own roles or
 * status, and the last active admin cannot lose the role or be blocked.
 */
export interface AdminUpdateRequest {
  name?: string;
  email?: string;
  roles?: Role[];
  /** Block or unblock. An invited account cannot be set to active here: it becomes active by accepting the invite. */
  status?: 'active' | 'blocked';
  /** Premium on (through a last day, YYYY-MM-DD, or null for no end) or off. A last day already over is refused. */
  premium?: { active: true; until: string | null } | { active: false };
}

// POST /admin/accounts/:id/invite-link → LinkCreated (an invited account: a new invite link, the old one stops).
// POST /admin/accounts/:id/reset-link → LinkCreated (an active account: a new-password link valid for 24 hours).
// DELETE /admin/accounts/:id?expect=<status> → 204 (cancels an invite, or deletes an account with all of its data, and
// adds a Closure of kind admin; never yourself or the last admin). With `expect` (invited, active or blocked), it is refused with 409 wrong_status when the account's
// status is another one, so "Cancel invite" cannot delete an account whose invite was accepted meanwhile.

/**
 * A deleted account, for the admin screen Deleted accounts (BACKEND-PLAN.md §3.7). Nothing in it says whose it was: no
 * name, email or account id, and no time of day (an id or a moment would match it to the audit log's entry).
 * - archived: deleted by its owner, who let an anonymous copy of the progress and prefs be kept (`archive`);
 * - removed: deleted by its owner with all of its data (`archive` is null);
 * - admin: deleted by an admin (no feedback, no archive). A cancelled invite is not an account and has no Closure.
 */
export const CLOSURE_KINDS = ['archived', 'removed', 'admin'] as const;
export type ClosureKind = (typeof CLOSURE_KINDS)[number];

export interface Closure {
  /** A random id, only to tell entries apart. */
  id: string;
  /** The day it was deleted (YYYY-MM-DD, UTC). */
  day: string;
  kind: ClosureKind;
  /** What its owner wrote when deleting it, or null. */
  feedback: string | null;
  archive: ClosureArchive | null;
}

/** The anonymous copy an archived account leaves. */
export interface ClosureArchive {
  /** The month the account was made (YYYY-MM): how long it was used, without a day to match. */
  joined: string;
  /** The saved progress and prefs (SyncedData), as the account last saved them; null when it never saved any. */
  data: SyncedData | null;
}

/** GET /admin/closures → { closures }, newest day first, at most 500. */
export interface ClosureListResponse {
  closures: Closure[];
}

// --- roles (accounts.read to list them; roles.manage to change them; BACKEND-PLAN.md §4) ------------------------------

/** A role and what it lets an account do. */
export interface RoleInfo {
  id: Role;
  /** As stored. The app names built-in roles itself, in its language. */
  name: string;
  description: string;
  /** In the order of PERMISSIONS. Admin's are always all of them. */
  permissions: Permission[];
  builtIn: boolean;
  /** How many accounts have it. */
  accounts: number;
}

/** GET /admin/roles → { roles }: the built-in roles first, then the custom ones by name. */
export interface RoleListResponse {
  roles: RoleInfo[];
}

/**
 * POST /admin/roles → RoleInfo. Nobody gives out more than they have: every permission in the role must be one the
 * admin has.
 */
export interface CreateRoleRequest {
  id: Role;
  name: string;
  description?: string;
  permissions: Permission[];
}

/**
 * PATCH /admin/roles/:id → RoleInfo. Only the fields sent change. A built-in role keeps its name and description, and
 * admin keeps every permission (409 built_in_role). Permissions added or removed must be ones the admin has.
 */
export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: Permission[];
}

// DELETE /admin/roles/:id → 204: a custom role only; every account that had it loses it. The admin must have every
// permission in it.

// --- feedback (feedback.give; docs/FEEDBACK-LOOP.md) ----------------------------------------------------------------

/** POST /feedback with a FeedbackReport (shared/feedback.ts) → the GitHub issue the server opened for it. */
export interface FeedbackSent {
  number: number;
  url: string;
}

/** GET /admin/audit?limit=&before= → { entries }, newest first. */
export interface AuditEntry {
  id: string;
  at: string;
  /** Who did it: an account id, or null for the server's create-admin command. */
  actorId: string | null;
  action: AuditAction;
  /** The account it was about, if any. */
  targetId: string | null;
  details: Record<string, string | number | boolean | null | string[]>;
}
export interface AuditListResponse {
  entries: AuditEntry[];
}

export const AUDIT_ACTIONS = [
  'account.invite',
  'account.invite_link',
  'account.reset_link',
  'account.update',
  'account.block',
  'account.unblock',
  'account.delete',
  'account.accept_invite',
  'account.reset_password',
  'account.change_password',
  'account.change_email',
  'account.delete_self',
  'role.grant',
  'role.revoke',
  'premium.grant',
  'premium.revoke',
  'role.create',
  'role.update',
  'role.delete',
  'feedback.send',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// --- health ---------------------------------------------------------------------------------------------------------

/** GET /health: public. 200 with db 'ok', 503 when MongoDB cannot be reached. */
export interface Health {
  status: 'ok' | 'degraded';
  commit: string;
  db: 'ok' | 'unreachable';
}

// --- errors ---------------------------------------------------------------------------------------------------------

export const ERROR_CODES = [
  /** 400: the body or a parameter is not what this route takes. */
  'bad_request',
  /** 401: no session, or it ended. */
  'unauthenticated',
  /** 401: sign-in with an email or password that is not right (the same answer for both). */
  'invalid_credentials',
  /** 403: signed in, but this account may not do this. */
  'forbidden',
  /** 403: a request that changes something came without an Origin header from this site. */
  'bad_origin',
  /** 404 */
  'not_found',
  /** 409: another account has this email. */
  'email_taken',
  /** 409: this would leave no active admin. */
  'last_admin',
  /** 409: admins cannot change their own roles or status, or delete themselves from the admin screens. */
  'own_account',
  /** 409: the action does not fit the account's status (e.g. a new-password link for an invited account). */
  'wrong_status',
  /** 409: PUT /progress with a rev the account has moved on from: `current` holds the account's copy. */
  'rev_conflict',
  /** 401: the current password given to change something is not right. */
  'wrong_password',
  /** 409: a role with this id exists already. */
  'role_exists',
  /** 409: a built-in role cannot be deleted or renamed, and admin always has every permission. */
  'built_in_role',
  /** 410: an invite or new-password link that is unknown, used, cancelled or expired. */
  'link_invalid',
  /** 422: the new password is too short (under 10 characters) or too long (over 128). */
  'password_length',
  /** 422: the new password is one of the most common passwords. */
  'password_common',
  /** 422: the new password contains the email address (or the part before the @). */
  'password_has_email',
  /** 422: not an email address. */
  'email_invalid',
  /** 429: too many tries; `retryAfter` says how many seconds to wait. */
  'too_many_attempts',
  /** 429: the password-check queue is full; no try was counted. `retryAfter: 1`. */
  'busy',
  /** 500 */
  'internal',
  /** 502: GitHub did not take the feedback (the token was refused, or GitHub is down). */
  'feedback_failed',
  /** 503: this server has no GitHub token, so it cannot send feedback (docs/DEPLOY.md, The API). */
  'feedback_unavailable',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: ErrorCode;
  /** For people reading logs; the app shows its own translated text for the code. */
  message: string;
  /** With too_many_attempts and busy: seconds until the next try (also the Retry-After header). */
  retryAfter?: number;
  /** With rev_conflict: the account's copy, to merge with. */
  current?: SavedProgress;
}

/** Password rules, the same on both sides (BACKEND-PLAN.md §5.5). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** How long links work (BACKEND-PLAN.md §5.1, §5.3). */
export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;
