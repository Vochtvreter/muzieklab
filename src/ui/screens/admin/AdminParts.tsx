/**
 * What the admin screens share (no board yet; built from Settings' design language):
 * - useAdminGate: whether the signed-in account may open the screen, and GateMessage for when it may not (still
 *   checking, no answer from the API, or no access, with the way back to Settings). Signed out goes to Sign in.
 * - LinkResult: a link shown once (an invite or a new password), with Copy, when it stops working, and a ready-made
 *   message to paste into an email or chat.
 * - useRoleList: the roles from GET /admin/roles, with their names.
 * - RoleSwitches: a switch row per role, each with what it lets someone do: the built-in ones (Admin, Editor, Teacher),
 *   then the custom roles admins made.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BUILT_IN_ROLES, isBuiltInRole, type Permission, type Role, type RoleInfo, type RoleListResponse } from '../../../../shared/api';
import { api } from '../../../api/client';
import { formatDateTime, t } from '../../../i18n';
import { useAccount, type UseAccount } from '../../account';
import { CopyField, ErrorRetry, FormDone, SwitchRow } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { linkMessage, type LinkKind } from '../../lib/admin';
import { Link, navigate } from '../../router';

export type Gate = 'ok' | 'wait' | 'offline' | 'denied';

/**
 * Whether this screen can show its content: 'ok' when the account has `permission`. Until GET /me answered, a cached
 * account counts (a request that finds the session ended signs out). Signed out: Sign in instead.
 */
export function useAdminGate(account: UseAccount, permission: Permission): Gate {
  const { me, api: reach } = account;
  useEffect(() => {
    if (reach === 'reachable' && !me) navigate('/signin', { replace: true });
  }, [reach, me]);
  if (reach === 'unreachable') return 'offline';
  if (!me) return 'wait';
  return me.permissions.includes(permission) ? 'ok' : 'denied';
}

/**
 * Why the screen shows nothing else: still checking, no answer (Try again), or no access (back to Settings). `sub`: who
 * may open it (NoAccess).
 */
export function GateMessage({ gate, sub }: { gate: Exclude<Gate, 'ok'>; sub?: string }): JSX.Element {
  const account = useAccount();
  if (gate === 'wait') return <p className="acct-wait">{t('admin.checking')}</p>;
  if (gate === 'offline') return <ErrorRetry error={t('apiError.unavailable')} onRetry={() => void account.refresh()} />;
  return <NoAccess sub={sub} />;
}

/**
 * "You don't have access to this page", and the way back to Settings. `sub`: the line under it, who may open the page
 * ("Only admins manage accounts." by default).
 */
export function NoAccess({ sub }: { sub?: string }): JSX.Element {
  return (
    <div className="acct-message">
      <div className="acct-note" role="status">
        <Icon name="lock" size={22} />
        <p>
          <b>{t('admin.noAccess')}</b>
          <span>{sub ?? t('admin.noAccessSub')}</span>
        </p>
      </div>
      <Link to="/settings" className="btn btn--accent">
        {t('account.back')}
      </Link>
    </div>
  );
}

export interface LinkResultProps {
  kind: LinkKind;
  /** The account's name, for the message ("Hi Lies Bakker, …"). */
  name: string;
  link: string;
  expiresAt: string;
  /** Starts with "New link ready. Send it yourself." (read out, as a FormDone), where nothing else says so. */
  announce?: boolean;
  /** A newer link is being made: this one is dimmed and cannot be copied (inert), but keeps its place and height. */
  stale?: boolean;
  /**
   * Making a newer link failed: why (a FormError) takes the place of "New link ready…", and this link and its message
   * stay in their place, dimmed and not usable (inert), as they may no longer work, until a new link replaces them.
   */
  failed?: ReactNode;
}

/**
 * A new link, shown once: the link with Copy, when it stops working, and the message to send with it (in the admin's
 * app language) with its own Copy.
 */
export function LinkResult({ kind, name, link, expiresAt, announce, stale = false, failed }: LinkResultProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const old = !!failed;
  // React 18 has no `inert` prop: set the attribute on the element.
  useLayoutEffect(() => {
    ref.current?.toggleAttribute('inert', stale);
  }, [stale]);
  useLayoutEffect(() => {
    body.current?.toggleAttribute('inert', old);
  }, [old]);
  return (
    <div ref={ref} className={'link-result m-in' + (stale ? ' link-stale' : '') + (old ? ' link-result--old' : '')}>
      {old ? failed : announce && <FormDone>{t('admin.linkReady')}</FormDone>}
      <div ref={body} className="link-result-body">
        <CopyField label={t(kind === 'invite' ? 'admin.inviteLink' : 'admin.resetLink')} value={link} copyLabel={t('admin.copyLink')}
          hint={
            <>
              {t('admin.worksUntil', { date: formatDateTime(expiresAt) })} <b>{t('admin.shownOnce')}</b>
            </>
          } />
        <CopyField label={t('admin.message')} value={linkMessage(kind, name, link, expiresAt)} multiline copyLabel={t('admin.copyMessage')} />
      </div>
    </div>
  );
}

/** The last list GET /admin/roles answered with: a screen opened again shows it at once, and asks again. */
let knownRoles: RoleInfo[] | null = null;

/**
 * The roles admins can give (GET /admin/roles), or null until it answered. When it does not answer, the screens keep
 * the built-in roles, which the app knows itself; custom roles then show by id.
 */
export function useRoleList(): RoleInfo[] | null {
  const [roles, setRoles] = useState(knownRoles);
  useEffect(() => {
    const ctrl = new AbortController();
    api.get<RoleListResponse>('/admin/roles', { signal: ctrl.signal }).then(
      (res) => {
        if (ctrl.signal.aborted || !Array.isArray(res?.roles)) return;
        knownRoles = res.roles;
        setRoles(res.roles);
      },
      () => undefined,
    );
    return () => ctrl.abort();
  }, []);
  return roles;
}

/** The names of the custom roles, by id (rolesText, roleName). */
export function roleNames(roles: readonly RoleInfo[] | null): Record<Role, string> {
  return Object.fromEntries((roles ?? []).map((r) => [r.id, r.name]));
}

export interface RoleSwitchesProps {
  /** The roles switched on. */
  roles: readonly Role[];
  onChange(role: Role, on: boolean): void;
  disabled?: boolean;
}

/**
 * One switch row per role, with what it lets someone do ("(coming later)" for what is not built yet): the built-in
 * roles in the app's words, then the custom ones as admins named and described them. A custom role the account has
 * that the list does not (yet) hold shows by its id, so it can still be switched off.
 */
export function RoleSwitches({ roles, onChange, disabled }: RoleSwitchesProps): JSX.Element {
  const list = useRoleList();
  const custom = (list ?? []).filter((r) => !isBuiltInRole(r.id));
  const unlisted = roles.filter((r) => !isBuiltInRole(r) && !custom.some((c) => c.id === r));
  return (
    <>
      {BUILT_IN_ROLES.map((role) => (
        <SwitchRow key={role} label={t('accountRole.' + role)} description={t('admin.role.' + role)} on={roles.includes(role)}
          onChange={(on) => onChange(role, on)} disabled={disabled} />
      ))}
      {custom.map((role) => (
        <SwitchRow key={role.id} label={role.name} description={role.description || undefined} on={roles.includes(role.id)}
          onChange={(on) => onChange(role.id, on)} disabled={disabled} />
      ))}
      {unlisted.map((role) => (
        <SwitchRow key={role} label={role} on onChange={(on) => onChange(role, on)} disabled={disabled} />
      ))}
    </>
  );
}
