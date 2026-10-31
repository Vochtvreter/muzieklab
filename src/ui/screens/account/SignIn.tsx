/**
 * Sign in (#/signin; BACKEND-PLAN.md §5.2, no board yet): email and password, a form on its own like Calibrate.
 * A wrong email and a wrong password get the same answer. There is no "forgot password" flow: the person who invited
 * you makes a new-password link (§5.3). Signed in already: Account instead. Sent here because a request found the
 * session ended (another device set a new password, say): a line over the form says nothing was changed.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { useAccount } from '../../account';
import { FormError, onSubmit, PasswordField, SubmitButton, TextField } from '../../components/Form';
import { FocusedPage } from '../../components/SubPage';
import { useMounted } from '../../hooks';
import { failureOf, fieldError, formError, type Failure } from '../../lib/apiErrors';
import { leave, Link, navigate } from '../../router';

export function SignIn(): JSX.Element {
  const account = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);
  const [empty, setEmpty] = useState<{ email?: boolean; password?: boolean }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();
  // Set while this form signs in, so the redirect below does not race the form's own navigation.
  const submitting = useRef(false);
  // The screen whose request was refused is gone (Delete account's confirm said "you're signed out"): why the person is
  // here, for this visit only. It was read out when it happened. Also when that refusal comes after Sign in is here: the
  // progress sync found the session ended first, and the screen gave way to this one while its own request was out.
  const [ended, setEnded] = useState(() => account.notice === 'sessionEnded');
  const { notice, setNotice } = account;
  useEffect(() => {
    if (notice !== 'sessionEnded') return;
    setEnded(true);
    setNotice(null);
  }, [notice, setNotice]);

  useEffect(() => {
    if (account.api === 'reachable' && account.me && !submitting.current) navigate('/account', { replace: true });
  }, [account.api, account.me]);

  const submit = async (): Promise<void> => {
    const missing = { email: !email.trim(), password: !password };
    setEmpty(missing);
    setFail(null);
    if (missing.email || missing.password) {
      (missing.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    submitting.current = true;
    try {
      await account.signIn(email.trim(), password);
      // Back to Settings, if it was opened from there (leave): Back then goes on to the screen before Settings.
      leave('/settings');
    } catch (e) {
      submitting.current = false;
      if (!mounted.current) return;
      const f = failureOf(e);
      setFail(f);
      setBusy(false);
      if (f.field === 'email') emailRef.current?.focus();
      else if (f.code === 'invalid_credentials') {
        passwordRef.current?.focus();
        passwordRef.current?.select();
      }
    }
  };

  return (
    <FocusedPage title={t('signIn.title')} back="/settings" backLabel={t('signIn.back')}>
      {ended && <p className="hint-box">{t('signIn.sessionEnded')}</p>}
      <form className="acct-form" noValidate onSubmit={onSubmit(() => void submit(), busy)}>
        <TextField label={t('signIn.email')} type="email" autoComplete="username" inputMode="email" name="email" value={email} onChange={setEmail}
          inputRef={emailRef} error={empty.email ? t('form.emailEmpty') : fieldError(fail, 'email')} />
        <PasswordField label={t('signIn.password')} autoComplete="current-password" name="password" value={password} onChange={setPassword}
          inputRef={passwordRef} error={empty.password ? t('form.passwordEmpty') : null} />
        <FormError error={formError(fail)} />
        <SubmitButton label={t('signIn.submit')} busyLabel={t('signIn.busy')} busy={busy} />
      </form>
      <div className="acct-foot">
        <p>{t('signIn.forgot')}</p>
        <Link to="/privacy" query="from=signin" className="text-btn text-btn--link">
          {t('signIn.privacy')}
        </Link>
      </div>
    </FocusedPage>
  );
}
