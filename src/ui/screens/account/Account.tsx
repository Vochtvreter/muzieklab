/**
 * Settings → Account (#/account; BACKEND-PLAN.md §5, §8; no board yet): a Settings sub-page with Settings' sections.
 * - Profile: the name (edit and save), the email (Change email asks for the password), the roles and premium.
 * - Password: the current one and a new one; the other devices are signed out.
 * - Devices: Sign out everywhere (confirmed).
 * - Your data: Download my data (the export) and Delete account (confirmed with the password).
 * Signed out: Sign in instead. No answer from the API with a cached account: the profile, and a note that it cannot be
 * changed now, with Try again.
 */
import { useEffect, useRef, useState } from 'react';
import { PASSWORD_MIN, type Me } from '../../../../shared/api';
import { api, downloadExport, EXPORT_FILE } from '../../../api/client';
import { formatDay, t } from '../../../i18n';
import { useAccount, type UseAccount } from '../../account';
import { ConfirmAction, ErrorRetry, FormDone, FormError, HiddenUsername, onSubmit, PasswordField, RowButton, SubmitButton, TextField } from '../../components/Form';
import { Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { useMounted } from '../../hooks';
import { errorMessage, failureOf, fieldError, formError, passwordLengthFailure, type Failure } from '../../lib/apiErrors';
import { navigate } from '../../router';
import { OfflineNote, useRefocus } from './AccountSection';

const NAME_MAX = 80;

export function AccountScreen(): JSX.Element {
  const account = useAccount();
  const { me, api: reach } = account;
  useEffect(() => {
    if (reach === 'reachable' && !me) navigate('/signin', { replace: true });
  }, [reach, me]);
  const offline = reach === 'unreachable';
  // After Try again found the API: the start of the profile, which can be changed again.
  const refocus = useRefocus(() => document.getElementById('h-profile'));

  return (
    <SubPage title={t('account.title')} back="/settings" backLabel={t('account.back')}>
      {!me && offline ? (
        // No account cached and no answer: nothing to show until the API answers.
        <ErrorRetry error={t('apiError.unavailable')} onRetry={() => void account.refresh()} />
      ) : !me ? (
        <p className="acct-wait">{t('account.loading')}</p>
      ) : (
        <>
          {offline && <OfflineNote account={account} className="hint-box" onBack={refocus} />}
          <Section id="profile" title={t('account.profile')} focusable>
            {offline ? <Info label={t('account.name')} value={me.name} /> : <NameForm me={me} account={account} />}
            <EmailRow me={me} account={account} offline={offline} />
            <Facts me={me} />
          </Section>
          {!offline && (
            <>
              <Section id="password" title={t('account.password')}>
                <PasswordForm me={me} account={account} />
              </Section>
              <Section id="devices" title={t('account.devices')}>
                <SignOutEverywhere account={account} />
              </Section>
              <Section id="data" title={t('account.data')}>
                <Download account={account} />
                <DeleteAccount account={account} />
              </Section>
            </>
          )}
        </>
      )}
    </SubPage>
  );
}

interface Part {
  account: UseAccount;
}

function Info({ label, value, children }: { label: string; value: string; children?: JSX.Element }): JSX.Element {
  return (
    <div className="info-row">
      <span className="info-row-text">
        <span className="row-sub">{label}</span>
        <b>{value}</b>
      </span>
      {children}
    </div>
  );
}

/**
 * The name, saved with its own Save button (PATCH /me). Only an empty name is the field's error; a request that fails
 * (no answer, a server error) is the form's, so a valid name is never marked invalid.
 */
function NameForm({ me, account }: Part & { me: Me }): JSX.Element {
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();
  const changed = name.trim() !== me.name;
  // The name as saved (the server trims it), or as another screen changed it.
  useEffect(() => setName(me.name), [me.name]);

  const submit = async (): Promise<void> => {
    setSaved(false);
    setFail(null);
    setEmpty(!name.trim());
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    if (!changed) return;
    setBusy(true);
    try {
      const next = await api.patch<Me>('/me', { name: name.trim() });
      account.setMe(next);
      if (mounted.current) setSaved(true);
    } catch (e) {
      if (mounted.current) setFail(failureOf(account.handleError(e)));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <form className="card-pad" noValidate onSubmit={onSubmit(() => void submit(), busy)}>
      <TextField label={t('account.name')} autoComplete="name" name="name" value={name} onChange={(v) => {
        setName(v);
        setSaved(false);
      }} maxLength={NAME_MAX} inputRef={nameRef} error={empty ? t('account.nameEmpty') : null} />
      <FormError error={fail?.message} />
      <div className="form-actions">
        {saved && <FormDone>{t('account.nameSaved')}</FormDone>}
        <SubmitButton variant="tonal" label={t('form.save')} busyLabel={t('form.saving')} busy={busy} disabled={!changed} />
      </div>
    </form>
  );
}

/** The email, and Change email: the new address and the current password (POST /me/email). */
function EmailRow({ me, account, offline }: Part & { me: Me; offline: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);
  const [empty, setEmpty] = useState<{ email?: boolean; password?: boolean }>({});
  const [saved, setSaved] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();

  const close = (): void => {
    setOpen(false);
    setEmail('');
    setPassword('');
    setFail(null);
    setEmpty({});
    requestAnimationFrame(() => opener.current?.focus());
  };
  const submit = async (): Promise<void> => {
    // An empty field says what is missing, as Sign in does.
    const missing = { email: !email.trim(), password: !password };
    setEmpty(missing);
    setFail(null);
    if (missing.email || missing.password) {
      (missing.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      const next = await api.post<Me>('/me/email', { email: email.trim(), password });
      account.setMe(next);
      if (!mounted.current) return;
      setOpen(false);
      setEmail('');
      setPassword('');
      setSaved(true);
    } catch (e) {
      if (!mounted.current) return;
      const f = failureOf(account.handleError(e));
      setFail(f);
      if (f.field === 'email') emailRef.current?.focus();
      else if (f.field === 'currentPassword') passwordRef.current?.focus();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div>
      <Info label={t('account.email')} value={me.email}>
        {!offline && !open ? (
          <button type="button" ref={opener} className="ghost-btn" onClick={() => {
            setSaved(false);
            setOpen(true);
          }}>
            {t('account.changeEmail')}
          </button>
        ) : undefined}
      </Info>
      {saved && (
        <div className="row-pad">
          <FormDone>{t('account.emailSaved')}</FormDone>
        </div>
      )}
      {open && (
        <form className="card-pad m-in" noValidate onSubmit={onSubmit(() => void submit(), busy)} onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) close();
        }}>
          <TextField label={t('account.newEmail')} type="email" autoComplete="email" inputMode="email" name="email" value={email} onChange={setEmail}
            inputRef={emailRef} autoFocus error={empty.email ? t('form.emailEmpty') : fieldError(fail, 'email')} />
          <PasswordField label={t('account.currentPassword')} autoComplete="current-password" name="password" value={password} onChange={setPassword}
            inputRef={passwordRef} error={empty.password ? t('form.passwordEmpty') : fieldError(fail, 'currentPassword')} />
          <FormError error={formError(fail)} />
          <div className="form-actions">
            <button type="button" className="small-btn" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </button>
            <SubmitButton variant="tonal" label={t('account.saveEmail')} busyLabel={t('form.saving')} busy={busy} />
          </div>
        </form>
      )}
    </div>
  );
}

/** The roles ("Admin · Teacher") and premium, as a muted line, when there are any. */
function Facts({ me }: { me: Me }): JSX.Element | null {
  const parts = me.roles.map((r) => t('accountRole.' + r));
  if (me.premium.active) parts.push(me.premium.until ? t('account.premiumUntil', { date: formatDay(me.premium.until) }) : t('account.premium'));
  if (!parts.length) return null;
  return <p className="row-note">{parts.reduce((a, b) => t('common.join', { a, b }))}</p>;
}

/** Change password: the current one and a new one (POST /me/password); the other devices are signed out. */
function PasswordForm({ me, account }: Part & { me: Me }): JSX.Element {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);
  const [empty, setEmpty] = useState(false);
  const [done, setDone] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();

  const submit = async (): Promise<void> => {
    setFail(null);
    setDone(false);
    setEmpty(!current);
    if (!current) {
      currentRef.current?.focus();
      return;
    }
    const short = passwordLengthFailure(next);
    if (short) {
      setFail(short);
      nextRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await api.post<void>('/me/password', { currentPassword: current, newPassword: next });
      if (!mounted.current) return;
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (e) {
      if (!mounted.current) return;
      const f = failureOf(account.handleError(e));
      setFail(f);
      if (f.field === 'currentPassword') currentRef.current?.focus();
      else if (f.field === 'password') nextRef.current?.focus();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <form className="card-pad" noValidate onSubmit={onSubmit(() => void submit(), busy)}>
      <HiddenUsername email={me.email} />
      <PasswordField label={t('account.currentPassword')} autoComplete="current-password" name="current-password" value={current} onChange={setCurrent}
        inputRef={currentRef} error={empty ? t('form.passwordEmpty') : fieldError(fail, 'currentPassword')} />
      <PasswordField label={t('account.newPassword')} autoComplete="new-password" name="new-password" value={next} onChange={setNext} inputRef={nextRef}
        hint={t('form.passwordRules', { min: PASSWORD_MIN })} error={fieldError(fail, 'password')} />
      <FormError error={formError(fail)} />
      {done && <FormDone>{t('account.passwordChanged')}</FormDone>}
      <div className="form-actions">
        <SubmitButton variant="tonal" label={t('account.changePassword')} busyLabel={t('account.changingPassword')} busy={busy} />
      </div>
    </form>
  );
}

/** Sign out everywhere, confirmed; then Settings says so. */
function SignOutEverywhere({ account }: Part): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmAction label={t('account.signOutEverywhere')} sub={t('account.signOutEverywhereSub')} icon="quit" tone="plain"
      question={t('account.signOutEverywhereQuestion')} detail={t('account.signOutEverywhereDetail')} confirmLabel={t('account.signOutEverywhereConfirm')}
      busyLabel={t('account.signingOut')} error={error} onCancel={() => setError(null)}
      onConfirm={async () => {
        setError(null);
        try {
          await account.signOutEverywhere();
          navigate('/settings', { replace: true });
          return true;
        } catch (e) {
          setError(errorMessage(e));
          return false;
        }
      }} />
  );
}

/** Download my data: GET /me/export, saved as a file. */
function Download({ account }: Part): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mounted = useMounted();
  const run = async (): Promise<void> => {
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await downloadExport();
      if (mounted.current) setDone(true);
    } catch (e) {
      if (mounted.current) setError(errorMessage(account.handleError(e)));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  // Rows of the card itself (not wrapped), so the button takes the card's corners.
  return (
    <>
      <RowButton icon="download" label={t('account.download')} sub={t('account.downloadSub')} busy={busy} busyLabel={t('account.downloading')} onClick={() => void run()} />
      {(error || done) && (
        <div className="row-pad">
          <FormError error={error} />
          {done && <FormDone>{t('account.downloaded', { file: EXPORT_FILE })}</FormDone>}
        </div>
      )}
    </>
  );
}

/** Delete account, confirmed with the password (DELETE /me); then Settings says so. */
function DeleteAccount({ account }: Part): JSX.Element {
  const [password, setPassword] = useState('');
  const [fail, setFail] = useState<Failure | null>(null);
  const [empty, setEmpty] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <ConfirmAction label={t('account.delete')} icon="trash" question={t('account.deleteQuestion')} detail={t('account.deleteDetail')}
      confirmLabel={t('account.deleteConfirm')} busyLabel={t('account.deleting')} error={formError(fail)}
      onCancel={() => {
        setPassword('');
        setFail(null);
        setEmpty(false);
      }}
      onConfirm={async () => {
        setFail(null);
        setEmpty(!password);
        if (!password) {
          ref.current?.focus();
          return false;
        }
        try {
          await api.del<void>('/me', { password });
          account.setSignedOut('deleted');
          navigate('/settings', { replace: true });
          return true;
        } catch (e) {
          const f = failureOf(account.handleError(e));
          setFail(f);
          if (f.field) ref.current?.focus();
          return false;
        }
      }}>
      <PasswordField label={t('account.deletePassword')} autoComplete="current-password" name="password" value={password} onChange={setPassword} inputRef={ref}
        autoFocus error={empty ? t('form.passwordEmpty') : fieldError(fail, 'currentPassword')} />
    </ConfirmAction>
  );
}
