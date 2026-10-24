/**
 * The two links an admin sends by hand (BACKEND-PLAN.md §5.1, §5.3; no board yet), forms on their own like Calibrate:
 * - Accept invite (#/invite/<token>): "Welcome, Ann", the name (editable) and a new password → signed in.
 * - New password (#/reset/<token>): a new password → signed in, and every other device signed out.
 * The link is checked first, so a used or expired one says so before anyone types a password. On success the token
 * leaves the history (replace), and Settings says what happened.
 */
import { useEffect, useRef, useState } from 'react';
import { PASSWORD_MIN, type LinkCheckResponse, type Me } from '../../../../shared/api';
import { api, asApiError } from '../../../api/client';
import { t } from '../../../i18n';
import { useAccount } from '../../account';
import { ErrorRetry, FormError, HiddenUsername, onSubmit, PasswordField, SubmitButton, TextField } from '../../components/Form';
import { FocusedPage } from '../../components/SubPage';
import { useMounted } from '../../hooks';
import { errorMessage, failureOf, fieldError, formError, passwordLengthFailure, type Failure } from '../../lib/apiErrors';
import { Link, navigate } from '../../router';

type Kind = 'invite' | 'reset';

type Check = { state: 'checking' } | { state: 'good'; link: LinkCheckResponse } | { state: 'bad' } | { state: 'failed'; message: string };

/** Names are 1–80 characters on the server (code points). */
const NAME_MAX = 80;

export function AcceptInvite({ token }: { token: string }): JSX.Element {
  return <LinkPassword kind="invite" token={token} />;
}

export function NewPassword({ token }: { token: string }): JSX.Element {
  return <LinkPassword kind="reset" token={token} />;
}

function LinkPassword({ kind, token }: { kind: Kind; token: string }): JSX.Element {
  const account = useAccount();
  const [check, setCheck] = useState<Check>({ state: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);
  const [nameEmpty, setNameEmpty] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();

  useEffect(() => {
    let live = true;
    setCheck({ state: 'checking' });
    api.post<LinkCheckResponse>(`/auth/${kind}/check`, { token }).then(
      (link) => {
        if (!live) return;
        setCheck({ state: 'good', link });
        setName(link.name);
      },
      (e: unknown) => {
        if (!live) return;
        const err = asApiError(e);
        setCheck(err.code === 'link_invalid' || err.code === 'bad_request' ? { state: 'bad' } : { state: 'failed', message: errorMessage(err) });
      },
    );
    return () => {
      live = false;
    };
  }, [kind, token, attempt]);

  const title = t(kind === 'invite' ? 'invite.title' : 'reset.title');
  const back = { back: '/' as const, backLabel: t('invite.back') };

  if (check.state !== 'good') {
    return (
      <FocusedPage title={title} {...back}>
        {check.state === 'checking' && <p className="acct-wait">{t('invite.checking')}</p>}
        {check.state === 'bad' && (
          <div className="acct-message">
            <FormError error={t('apiError.link_invalid')} />
            <Link to="/" className="btn btn--accent">
              {t('invite.home')}
            </Link>
          </div>
        )}
        {check.state === 'failed' && <ErrorRetry error={check.message} onRetry={() => setAttempt((n) => n + 1)} />}
      </FocusedPage>
    );
  }

  const { link } = check;
  const submit = async (): Promise<void> => {
    setFail(null);
    const noName = kind === 'invite' && !name.trim();
    setNameEmpty(noName);
    if (noName) {
      nameRef.current?.focus();
      return;
    }
    const short = passwordLengthFailure(password);
    if (short) {
      setFail(short);
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const me =
        kind === 'invite'
          ? await api.post<Me>('/auth/invite/accept', { token, password, ...(name.trim() !== link.name ? { name: name.trim() } : {}) })
          : await api.post<Me>('/auth/reset/confirm', { token, password });
      account.setMe(me, kind === 'invite' ? 'welcome' : 'passwordReset');
      // The token leaves the history: Back does not come back to a used link.
      navigate('/settings', { replace: true });
    } catch (e) {
      if (!mounted.current) return;
      setBusy(false);
      const f = failureOf(e);
      if (f.code === 'link_invalid') {
        setCheck({ state: 'bad' });
        return;
      }
      setFail(f);
      if (f.field === 'password') passwordRef.current?.focus();
    }
  };

  return (
    <FocusedPage title={kind === 'invite' ? t('invite.welcome', { name: link.name }) : title} docTitle={title}
      sub={t(kind === 'invite' ? 'invite.choose' : 'reset.choose', { email: link.email })} {...back}>
      <form className="acct-form" noValidate onSubmit={onSubmit(() => void submit(), busy)}>
        <HiddenUsername email={link.email} />
        {kind === 'invite' && (
          <TextField label={t('invite.name')} autoComplete="name" name="name" value={name} onChange={setName} maxLength={NAME_MAX} inputRef={nameRef}
            error={nameEmpty ? t('account.nameEmpty') : null} />
        )}
        <PasswordField label={t(kind === 'invite' ? 'invite.password' : 'reset.password')} autoComplete="new-password" name="new-password" value={password}
          onChange={setPassword} inputRef={passwordRef} hint={t('form.passwordRules', { min: PASSWORD_MIN })} error={fieldError(fail, 'password')} />
        {kind === 'reset' && <p className="tfield-hint">{t('reset.note')}</p>}
        <FormError error={formError(fail)} />
        <SubmitButton label={t(kind === 'invite' ? 'invite.submit' : 'reset.submit')} busyLabel={t(kind === 'invite' ? 'invite.busy' : 'reset.busy')} busy={busy} />
      </form>
    </FocusedPage>
  );
}
