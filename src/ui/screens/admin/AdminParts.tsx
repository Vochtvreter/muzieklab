/**
 * What the three admin screens share (no board yet; built from Settings' design language):
 * - useAdminGate: whether the signed-in account may open the screen, and GateMessage for when it may not (still
 *   checking, no answer from the API, or no access, with the way back to Settings). Signed out goes to Sign in.
 * - LinkResult: a link shown once (an invite or a new password), with Copy, when it stops working, and a ready-made
 *   message to paste into an email or chat.
 * - RoleSwitches: Admin, Editor and Teacher as switch rows, each with what it lets someone do.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { ROLES, type Permission, type Role } from '../../../../shared/api';
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

/** Why the screen shows nothing else: still checking, no answer (Try again), or no access (back to Settings). */
export function GateMessage({ gate }: { gate: Exclude<Gate, 'ok'> }): JSX.Element {
  const account = useAccount();
  if (gate === 'wait') return <p className="acct-wait">{t('admin.checking')}</p>;
  if (gate === 'offline') return <ErrorRetry error={t('apiError.unavailable')} onRetry={() => void account.refresh()} />;
  return <NoAccess />;
}

/** "You don't have access to this page", and the way back to Settings. */
export function NoAccess(): JSX.Element {
  return (
    <div className="acct-message">
      <div className="acct-note" role="status">
        <Icon name="lock" size={22} />
        <p>
          <b>{t('admin.noAccess')}</b>
          <span>{t('admin.noAccessSub')}</span>
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
}

/**
 * A new link, shown once: the link with Copy, when it stops working, and the message to send with it (in the admin's
 * app language) with its own Copy.
 */
export function LinkResult({ kind, name, link, expiresAt, announce, stale = false }: LinkResultProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // React 18 has no `inert` prop: set the attribute on the element.
  useLayoutEffect(() => {
    ref.current?.toggleAttribute('inert', stale);
  }, [stale]);
  return (
    <div ref={ref} className={'link-result m-in' + (stale ? ' link-result--stale' : '')}>
      {announce && <FormDone>{t('admin.linkReady')}</FormDone>}
      <CopyField label={t(kind === 'invite' ? 'admin.inviteLink' : 'admin.resetLink')} value={link} copyLabel={t('admin.copyLink')}
        hint={
          <>
            {t('admin.worksUntil', { date: formatDateTime(expiresAt) })} <b>{t('admin.shownOnce')}</b>
          </>
        } />
      <CopyField label={t('admin.message')} value={linkMessage(kind, name, link, expiresAt)} multiline copyLabel={t('admin.copyMessage')} />
    </div>
  );
}

export interface RoleSwitchesProps {
  /** The roles switched on. */
  roles: readonly Role[];
  onChange(role: Role, on: boolean): void;
  disabled?: boolean;
}

/** One switch row per role, with what it lets someone do ("(coming later)" for what is not built yet). */
export function RoleSwitches({ roles, onChange, disabled }: RoleSwitchesProps): JSX.Element {
  return (
    <>
      {ROLES.map((role) => (
        <SwitchRow key={role} label={t('accountRole.' + role)} description={t('admin.role.' + role)} on={roles.includes(role)}
          onChange={(on) => onChange(role, on)} disabled={disabled} />
      ))}
    </>
  );
}
