/**
 * Admin: one account (#/admin/account/<id>; BACKEND-PLAN.md §4, §5.1, §5.3; no board yet). The name and status head the
 * page, then Settings-style sections:
 * - Details: added, last signed in, devices signed in, and for an invite how long its link works.
 * - Name and email: edit and save.
 * - Roles: a switch per role (not for your own account: another admin changes yours).
 * - Premium: a switch, and an optional last day.
 * - Invite or Access, by status: a new invite link and Cancel invite (invited); a new password link and Block (active);
 *   Unblock (blocked); Delete account. A link is shown once, with Copy and a ready-made message.
 * Each part shows only with its permission (the server checks anyway). last_admin, own_account and wrong_status come
 * back as messages; wrong_status also reloads the account, which another admin changed meanwhile.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { INVITE_DAYS, RESET_HOURS, type AccountDetail, type AdminUpdateRequest, type LinkCreated, type Role } from '../../../../shared/api';
import { api } from '../../../api/client';
import { formatDateTime, formatDay, formatLongDate, t } from '../../../i18n';
import { useAccount, type UseAccount } from '../../account';
import { ConfirmAction, ErrorRetry, FormDone, FormError, onSubmit, RowButton, StatusPill, SubmitButton, SwitchRow, TextField } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { RowLink, Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { useMounted } from '../../hooks';
import { dayOfUntil, setListNotice, sortRoles, today, type LinkKind } from '../../lib/admin';
import { announce } from '../../lib/announce';
import { errorMessage, failureOf, fieldError, formError, type Failure } from '../../lib/apiErrors';
import { Link, navigate } from '../../router';
import { GateMessage, LinkResult, NoAccess, RoleSwitches, useAdminGate } from './AdminParts';

const NAME_MAX = 80;
const EMAIL_MAX = 254;

type Load =
  | { state: 'loading' }
  | { state: 'ready'; detail: AccountDetail }
  | { state: 'failed'; message: string }
  | { state: 'gone' }
  | { state: 'denied' };

/** `id`: the account's id (24 hex characters, checked by the router). */
export function AdminAccount({ id }: { id: string }): JSX.Element {
  const account = useAccount();
  const { handleError } = account;
  const gate = useAdminGate(account, 'accounts.read');
  const ok = gate === 'ok';
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const mounted = useMounted();
  const path = `/admin/accounts/${id}`;

  useEffect(() => {
    if (!ok) return;
    const ctrl = new AbortController();
    setLoad({ state: 'loading' });
    api.get<AccountDetail>(path, { signal: ctrl.signal }).then(
      (detail) => {
        if (!ctrl.signal.aborted) setLoad({ state: 'ready', detail });
      },
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        const err = handleError(e);
        setLoad(
          err.code === 'not_found' ? { state: 'gone' } : err.code === 'forbidden' ? { state: 'denied' } : { state: 'failed', message: errorMessage(err) },
        );
      },
    );
    return () => ctrl.abort();
  }, [ok, path, attempt, handleError]);

  /** The account again, without the loading state (another admin changed it, or a new invite link changed its end). */
  const reload = useCallback((): void => {
    api.get<AccountDetail>(path).then(
      (detail) => {
        if (mounted.current) setLoad({ state: 'ready', detail });
      },
      (e: unknown) => {
        if (mounted.current && handleError(e).code === 'not_found') setLoad({ state: 'gone' });
      },
    );
  }, [path, handleError, mounted]);

  /** A failed change: its message (and field), after a 401 signs out, a 404 says the account is gone, a 409 wrong_status reloads. */
  const fail = useCallback(
    (e: unknown): Failure => {
      const f = failureOf(handleError(e));
      if (f.code === 'not_found') setLoad({ state: 'gone' });
      else if (f.code === 'wrong_status') reload();
      return f;
    },
    [handleError, reload],
  );

  const self = load.state === 'ready' && load.detail.id === account.me?.id;
  const { refresh } = account;
  const onChange = useCallback(
    (detail: AccountDetail): void => {
      setLoad({ state: 'ready', detail });
      // Your own name or email changed here: Settings → Account shows the new one.
      if (detail.id === account.me?.id) void refresh();
    },
    [account.me?.id, refresh],
  );

  const detail = load.state === 'ready' ? load.detail : null;
  return (
    <SubPage title={detail?.name ?? t('admin.accountTitle')} back="/admin" backLabel={t('admin.backToList')} className="admin-account"
      sub={
        detail ? (
          <span className="acct-sub-row">
            <StatusPill status={detail.status} />
            <span>{detail.email}</span>
          </span>
        ) : undefined
      }>
      {!ok ? (
        <GateMessage gate={gate} />
      ) : load.state === 'loading' ? (
        <p className="acct-wait">{t('admin.loadingAccount')}</p>
      ) : load.state === 'failed' ? (
        <ErrorRetry error={load.message} onRetry={() => setAttempt((n) => n + 1)} />
      ) : load.state === 'denied' ? (
        <NoAccess />
      ) : load.state === 'gone' ? (
        <div className="acct-message">
          <FormError error={t('admin.gone')} />
          <Link to="/admin" className="btn btn--accent">
            {t('admin.backToList')}
          </Link>
        </div>
      ) : (
        <Cards detail={load.detail} self={self} account={account} onChange={onChange} fail={fail} reload={reload} />
      )}
    </SubPage>
  );
}

interface CardProps {
  detail: AccountDetail;
  /** The signed-in admin's own account. */
  self: boolean;
  account: UseAccount;
  /** The account as a change answered with. */
  onChange(detail: AccountDetail): void;
  fail(e: unknown): Failure;
  reload(): void;
}

function Cards(props: CardProps): JSX.Element {
  return (
    <>
      <Facts detail={props.detail} account={props.account} />
      <ProfileCard {...props} />
      <RolesCard {...props} />
      <PremiumCard {...props} />
      <AccessCard {...props} />
    </>
  );
}

/** Added, last signed in, devices signed in, and for an invite how long its link works. */
function Facts({ detail, account }: { detail: AccountDetail; account: UseAccount }): JSX.Element {
  const rows: [string, string][] = [
    [t('admin.added'), formatLongDate(detail.createdAt)],
    [t('admin.lastSignIn'), detail.lastSignInAt ? formatLongDate(detail.lastSignInAt) : t('admin.never')],
    [t('admin.devices'), t('admin.deviceCount', { count: detail.sessions })],
  ];
  if (detail.status === 'invited') {
    // No link that works (it expired, or the email was changed): an admin who may invite makes a new one under Invite.
    const none = t(account.can('accounts.invite') ? 'admin.noLinkMake' : 'admin.noLink');
    rows.push([t('admin.inviteLink'), detail.inviteExpiresAt ? t('admin.until', { date: formatDateTime(detail.inviteExpiresAt) }) : none]);
  }
  return (
    <Section id="details" title={t('admin.details')}>
      <dl className="facts">
        {rows.map(([label, value]) => (
          <div key={label} className="fact-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Name and email, saved together (PATCH, accounts.invite); read only without that permission. */
function ProfileCard({ detail, account, onChange, fail }: CardProps): JSX.Element {
  const canEdit = account.can('accounts.invite');
  const [name, setName] = useState(detail.name);
  const [email, setEmail] = useState(detail.email);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [empty, setEmpty] = useState<{ name?: boolean; email?: boolean }>({});
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();
  // As saved (trimmed, the email in lower case), or as a reload found them.
  useEffect(() => setName(detail.name), [detail.name]);
  useEffect(() => setEmail(detail.email), [detail.email]);
  const nameChanged = name.trim() !== detail.name;
  const emailChanged = email.trim().toLowerCase() !== detail.email;

  const submit = async (): Promise<void> => {
    setSaved(false);
    setFailure(null);
    const missing = { name: !name.trim(), email: !email.trim() };
    setEmpty(missing);
    if (missing.name || missing.email) {
      (missing.name ? nameRef : emailRef).current?.focus();
      return;
    }
    if (!nameChanged && !emailChanged) return;
    setBusy(true);
    try {
      const body: AdminUpdateRequest = { ...(nameChanged ? { name: name.trim() } : {}), ...(emailChanged ? { email: email.trim() } : {}) };
      onChange(await api.patch<AccountDetail>(`/admin/accounts/${detail.id}`, body));
      if (mounted.current) setSaved(true);
    } catch (e) {
      if (!mounted.current) return;
      const f = fail(e);
      setFailure(f);
      if (f.field === 'email') emailRef.current?.focus();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setSaved(false);
  };

  return (
    <Section id="profile" title={t('admin.profile')}>
      <form className="card-pad" noValidate onSubmit={onSubmit(() => void submit(), busy)}>
        <TextField label={t('admin.name')} autoComplete="off" name="account-name" value={name} onChange={edit(setName)} maxLength={NAME_MAX} readOnly={!canEdit}
          inputRef={nameRef} error={empty.name ? t('admin.nameEmpty') : null} />
        <TextField label={t('admin.email')} type="email" autoComplete="off" inputMode="email" name="account-email" value={email} onChange={edit(setEmail)}
          maxLength={EMAIL_MAX} readOnly={!canEdit} inputRef={emailRef} error={empty.email ? t('admin.emailEmpty') : fieldError(failure, 'email')} />
        <FormError error={formError(failure)} />
        {canEdit && (
          <div className="form-actions">
            {saved && <FormDone>{t('admin.saved')}</FormDone>}
            <SubmitButton variant="tonal" label={t('form.save')} busyLabel={t('form.saving')} busy={busy} disabled={!nameChanged && !emailChanged} />
          </div>
        )}
      </form>
    </Section>
  );
}

/** A switch per role, saved at once (roles.grant). Not for your own account. */
function RolesCard({ detail, self, account, onChange, fail }: CardProps): JSX.Element {
  const canGrant = account.can('roles.grant');
  // The roles being saved, shown on the switches until the answer comes.
  const [pending, setPending] = useState<Role[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useMounted();

  const toggle = async (role: Role, on: boolean): Promise<void> => {
    if (pending) return;
    const next = sortRoles(on ? [...detail.roles, role] : detail.roles.filter((r) => r !== role));
    setPending(next);
    setError(null);
    try {
      onChange(await api.patch<AccountDetail>(`/admin/accounts/${detail.id}`, { roles: next }));
    } catch (e) {
      if (mounted.current) setError(fail(e).message);
    } finally {
      if (mounted.current) setPending(null);
    }
  };

  return (
    <Section id="roles" title={t('admin.roles')}>
      <RoleSwitches roles={pending ?? detail.roles} onChange={(role, on) => void toggle(role, on)} disabled={self || !canGrant} />
      {self && <p className="row-note">{t('admin.ownRoles')}</p>}
      {error && (
        <div className="row-pad">
          <FormError error={error} />
        </div>
      )}
    </Section>
  );
}

/**
 * Premium on or off (entitlements.grant), and when on, an optional last day: a calendar day (yyyy-mm-dd), sent as the
 * date field has it and shown as that day, so it reads the same in every time zone.
 */
function PremiumCard({ detail, account, onChange, fail }: CardProps): JSX.Element {
  const canGrant = account.can('entitlements.grant');
  const savedDay = dayOfUntil(detail.premium.until);
  const [day, setDay] = useState(savedDay);
  const [pendingOn, setPendingOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState(false);
  const [done, setDone] = useState(false);
  const dayRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();
  useEffect(() => setDay(savedDay), [savedDay]);
  const on = pendingOn ?? detail.premium.active;

  const send = async (premium: NonNullable<AdminUpdateRequest['premium']>): Promise<boolean> => {
    setError(null);
    setDone(false);
    try {
      onChange(await api.patch<AccountDetail>(`/admin/accounts/${detail.id}`, { premium }));
      return true;
    } catch (e) {
      if (mounted.current) setError(fail(e).message);
      return false;
    }
  };
  const toggle = async (next: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setPendingOn(next);
    setPast(false);
    // Switched on: with the day in the field, if it is one premium can end on; else no end.
    await send(next ? { active: true, until: day && day >= today() ? day : null } : { active: false });
    if (!mounted.current) return;
    setPendingOn(null);
    setBusy(false);
  };
  const saveDay = async (): Promise<void> => {
    if (busy) return;
    // A day already over is refused here, before anything is sent; the field says so and gets focus.
    const tooEarly = !!day && day < today();
    setPast(tooEarly);
    if (tooEarly) {
      dayRef.current?.focus();
      return;
    }
    setBusy(true);
    const ok = await send({ active: true, until: day || null });
    if (!mounted.current) return;
    setBusy(false);
    setDone(ok);
  };

  const status = !on
    ? t('admin.premiumOff')
    : detail.premium.active && detail.premium.until
      ? t('admin.premiumUntil', { date: formatDay(detail.premium.until) })
      : t('admin.premiumNoEnd');
  return (
    <Section id="premium" title={t('admin.premium')}>
      <SwitchRow label={t('admin.premium')} description={status} on={on} onChange={(v) => void toggle(v)} disabled={!canGrant} />
      {on && canGrant && (
        <form className="card-pad" noValidate onSubmit={onSubmit(() => void saveDay(), busy)}>
          <TextField label={t('admin.premiumDay')} type="date" name="premium-until" value={day} min={today()} inputRef={dayRef} onChange={(v) => {
            setDay(v);
            setDone(false);
            setPast(false);
          }} hint={t('admin.premiumDayHint')} error={past ? t('admin.premiumPast') : null} />
          <div className="form-actions">
            {done && <FormDone>{t('admin.saved')}</FormDone>}
            <SubmitButton variant="tonal" label={t('admin.saveDay')} busyLabel={t('form.saving')} busy={busy && pendingOn === null} disabled={day === savedDay} />
          </div>
        </form>
      )}
      {error && (
        <div className="row-pad">
          <FormError error={error} />
        </div>
      )}
    </Section>
  );
}

/** The actions an account's status allows, and Delete account. Your own account: a way to Account instead. */
function AccessCard({ detail, self, account, onChange, fail, reload }: CardProps): JSX.Element | null {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A refusal because the account changed meanwhile (409 wrong_status): the account reloads and the row that was pressed
  // goes away, so its message is shown here, and focus (which was on the gone button) moves to it.
  const [changedMeanwhile, setChangedMeanwhile] = useState<string | null>(null);
  const changedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (changedMeanwhile) changedRef.current?.focus();
  }, [changedMeanwhile]);
  const mounted = useMounted();
  const { can } = account;
  const { status, name } = detail;
  const path = `/admin/accounts/${detail.id}`;

  if (self) {
    return (
      <Section id="access" title={t('admin.access')}>
        <RowLink to="/account" title={t('admin.selfTitle')} sub={t('admin.selfSub')} />
      </Section>
    );
  }

  const setStatus = async (next: 'active' | 'blocked', onError: (m: string) => void): Promise<boolean> => {
    setDone(null);
    try {
      onChange(await api.patch<AccountDetail>(path, { status: next }));
      const message = t(next === 'blocked' ? 'admin.blockedDone' : 'admin.unblockedDone');
      announce(message);
      if (mounted.current) setDone(message);
      return true;
    } catch (e) {
      if (mounted.current) onError(fail(e).message);
      return false;
    }
  };
  const unblock = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    await setStatus('active', setError);
    if (mounted.current) setBusy(false);
  };
  const remove = async (): Promise<boolean> => {
    setRemoveError(null);
    setError(null);
    const invited = status === 'invited';
    try {
      // Cancel invite deletes only an account that is still invited: one whose invite was accepted meanwhile is
      // refused (409 wrong_status) instead of deleted.
      await api.del<void>(invited ? `${path}?expect=invited` : path);
      setListNotice(t(invited ? 'admin.inviteCancelled' : 'admin.deleted', { name }));
      navigate('/admin', { replace: true });
      return true;
    } catch (e) {
      if (!mounted.current) return false;
      const f = fail(e);
      if (invited && f.code === 'wrong_status') {
        // The account is reloaded (fail): it shows as active now, with this message instead of the question.
        setChangedMeanwhile(t('admin.inviteAccepted', { name }));
        return true;
      }
      setRemoveError(f.message);
      return false;
    }
  };

  const rows: JSX.Element[] = [];
  if (status === 'invited' && can('accounts.invite')) {
    rows.push(<LinkMaker key="invite" kind="invite" detail={detail} fail={fail} onMade={reload}
      onChangedMeanwhile={() => setChangedMeanwhile(t('admin.inviteAcceptedNoLink', { name }))} />);
  }
  if (status === 'active' && can('accounts.invite')) {
    rows.push(<LinkMaker key="reset" kind="reset" detail={detail} fail={fail}
      onChangedMeanwhile={() => setChangedMeanwhile(t('admin.notActiveNoLink', { name }))} />);
  }
  if (status === 'active' && can('accounts.block')) {
    rows.push(
      <ConfirmAction key="block" label={t('admin.block')} sub={t('admin.blockSub')} icon="lock" question={t('admin.blockQuestion', { name })}
        detail={t('admin.blockDetail', { name })} confirmLabel={t('admin.blockConfirm')} busyLabel={t('admin.blocking')} error={blockError}
        onCancel={() => setBlockError(null)} onConfirm={() => {
          setBlockError(null);
          setError(null);
          return setStatus('blocked', setBlockError);
        }} />,
    );
  }
  if (status === 'blocked' && can('accounts.block')) {
    rows.push(<RowButton key="unblock" icon="unlock" label={t('admin.unblock')} sub={t('admin.unblockSub')} busy={busy} busyLabel={t('admin.unblocking')}
      onClick={() => void unblock()} />);
  }
  if (can('accounts.delete')) {
    rows.push(
      status === 'invited' ? (
        <ConfirmAction key="cancel-invite" label={t('admin.cancelInvite')} sub={t('admin.cancelInviteSub')} icon="close" question={t('admin.cancelInviteQuestion', { name })}
          detail={t('admin.cancelInviteDetail')} confirmLabel={t('admin.cancelInvite')} cancelLabel={t('admin.keepInvite')} busyLabel={t('admin.cancelling')}
          error={removeError} onCancel={() => setRemoveError(null)} onConfirm={remove} />
      ) : (
        <ConfirmAction key="delete" label={t('admin.delete')} icon="trash" question={t('admin.deleteQuestion', { name })} detail={t('admin.deleteDetail')}
          confirmLabel={t('admin.deleteConfirm')} busyLabel={t('admin.deleting')} error={removeError} onCancel={() => setRemoveError(null)} onConfirm={remove} />
      ),
    );
  }
  if (!rows.length) return null;

  return (
    <Section id="access" title={t(status === 'invited' ? 'admin.inviteSection' : 'admin.access')}>
      {changedMeanwhile && (
        <div ref={changedRef} tabIndex={-1} className="row-pad">
          <FormError error={changedMeanwhile} />
        </div>
      )}
      {rows}
      {error && (
        <div className="row-pad">
          <FormError error={error} />
        </div>
      )}
      {done && (
        <div className="row-status m-in">
          <Icon name="check" size={18} strokeWidth={2.6} className="tone-good" />
          {done}
        </div>
      )}
    </Section>
  );
}

/**
 * The answer to a press (under its button), brought into view when what it says ("New link ready…", or why it failed)
 * is below the screen's edge while the button is on screen, as when the button sat at the bottom of the screen: the
 * whole answer where it fits, else its top. Not when the admin has scrolled away from the button meanwhile.
 */
function reveal(answer: HTMLElement): void {
  const port = answer.closest('.page')?.getBoundingClientRect();
  const top = Math.max(0, port?.top ?? 0);
  const bottom = Math.min(window.innerHeight, port?.bottom ?? Infinity);
  const button = answer.previousElementSibling?.getBoundingClientRect();
  const line = (answer.querySelector('.form-done, .form-error') ?? answer).getBoundingClientRect();
  if (button && button.bottom > top && button.top < bottom && line.bottom > bottom) answer.scrollIntoView?.({ block: 'nearest' });
}

/**
 * New invite link or New password link: makes one (the earlier one stops working) and shows it once. Each answer stays
 * where it is until the next one takes its place, so the page keeps its height and nothing above or below it moves (the
 * admin is usually scrolled down to it): while a press runs, the earlier answer is dimmed; if it fails, why takes the
 * place of "New link ready…" and the earlier link stays dimmed and not usable, as it may no longer work.
 */
function LinkMaker({ kind, detail, fail, onMade, onChangedMeanwhile }: {
  kind: LinkKind;
  detail: AccountDetail;
  fail(e: unknown): Failure;
  onMade?(): void;
  /** Refused because the account's status changed meanwhile: the account reloads and this row goes away. */
  onChangedMeanwhile(): void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts failed presses: each failure is a new alert, read out again even with the same words.
  const [failures, setFailures] = useState(0);
  const [made, setMade] = useState<LinkCreated | null>(null);
  const answer = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  // A new link or a failure is in view (nothing is shown before the first press).
  useLayoutEffect(() => {
    if (answer.current) reveal(answer.current);
  }, [made, failures]);
  const make = async (): Promise<void> => {
    setBusy(true);
    try {
      const link = await api.post<LinkCreated>(`/admin/accounts/${detail.id}/${kind}-link`);
      if (!mounted.current) return;
      setMade(link);
      setError(null);
      onMade?.();
    } catch (e) {
      if (!mounted.current) return;
      const f = fail(e);
      if (f.code === 'wrong_status') {
        onChangedMeanwhile();
        return;
      }
      setError(f.message);
      setFailures((n) => n + 1);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const invite = kind === 'invite';
  return (
    <>
      <RowButton icon={invite ? 'link' : 'key'} label={t(invite ? 'admin.newInviteLink' : 'admin.newResetLink')}
        sub={t(invite ? 'admin.newInviteLinkSub' : 'admin.newResetLinkSub', { days: INVITE_DAYS, hours: RESET_HOURS })} busy={busy}
        busyLabel={t('admin.making')} onClick={() => void make()} />
      {(made || error) && (
        <div ref={answer} className="card-pad">
          {/* A new link is a new result (keyed by the link): its "New link ready" line is read out again, and Copy starts
              over. The server may have made a link before an answer was lost, so after a failure the earlier one may
              not work anymore. */}
          {made ? (
            <LinkResult key={made.link} kind={kind} name={detail.name} link={made.link} expiresAt={made.expiresAt} announce stale={busy}
              failed={error && <FormError key={failures} error={`${error} ${t('admin.linkMayNotWork')}`} />} />
          ) : (
            <div className={busy ? 'link-stale' : undefined}>
              <FormError key={failures} error={error} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
