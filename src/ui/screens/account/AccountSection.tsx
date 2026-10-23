/**
 * Settings → Account, the first section of Settings (BACKEND-PLAN.md §10.1: an Account section at the top of Settings
 * on every size, with the admin row only admins see; no board yet).
 *
 * It shows only once the API answered, or when an account is cached, so a site without an API (production today)
 * looks exactly as before: no section at all.
 * - Signed out: Sign in.
 * - Signed in: the account (name and email) → Account; Accounts → the admin screens, with `accounts.read`; Sign out.
 * - No answer from the API with a cached account: the account, and a note that it cannot be changed now, with Try again.
 * After a change that ends here (signed out, the account deleted…) a one-line status says what happened; it is also
 * announced (ui/lib/announce.ts), as the screen it came from is gone.
 */
import { useEffect, useState } from 'react';
import { t } from '../../../i18n';
import { useAccount, type UseAccount } from '../../account';
import { FormError, RowButton } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { RowLink, Section } from '../../components/Rows';
import { useMounted } from '../../hooks';
import { announce } from '../../lib/announce';
import { errorMessage } from '../../lib/apiErrors';
import { parseHash } from '../../router';
import type { AccountNotice } from '../../store';

const NOTICE: Record<AccountNotice, string> = {
  signedOut: 'settings.noticeSignedOut',
  signedOutEverywhere: 'settings.noticeSignedOutEverywhere',
  deleted: 'settings.noticeDeleted',
  welcome: 'settings.noticeWelcome',
  passwordReset: 'settings.noticePasswordReset',
};

export function AccountSection(): JSX.Element | null {
  const account = useAccount();
  const { me, api: reach, notice, setNotice } = account;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The notice is for this visit of Settings: it goes once Settings is left (not on the language switch's remount, or
  // React's development double mount, after which the route is still Settings).
  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (parseHash(window.location.hash) !== '/settings') setNotice(null);
      }, 0);
    },
    [setNotice],
  );
  // Read out: the button that led here is gone (Delete account, Sign out everywhere) or replaced (Sign out).
  useEffect(() => {
    if (notice) announce(t(NOTICE[notice]));
  }, [notice]);

  if (!me && reach !== 'reachable') return null;
  const offline = reach === 'unreachable';

  const signOut = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await account.signOut();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="account" title={t('settings.account')}>
      {me ? (
        <>
          <RowLink to="/account" title={me.name} sub={me.email} />
          {account.can('accounts.read') && <RowLink to="/admin" title={t('settings.accounts')} sub={t('settings.accountsSub')} />}
          {reach === 'reachable' && <RowButton icon="quit" label={t('settings.signOut')} busy={busy} busyLabel={t('settings.signingOut')} onClick={() => void signOut()} />}
          {offline && <OfflineNote account={account} className="row-note" />}
        </>
      ) : (
        <RowLink to="/signin" title={t('settings.signIn')} sub={t('settings.signInSub')} />
      )}
      {error && (
        <div className="row-pad">
          <FormError error={error} />
        </div>
      )}
      {notice && (
        <div className="row-status m-in">
          <Icon name="check" size={18} strokeWidth={2.6} className="tone-good" />
          {t(NOTICE[notice])}
        </div>
      )}
    </Section>
  );
}

/** The note an account screen shows while the API does not answer, with Try again (GET /me now). */
export function OfflineNote({ account, className }: { account: UseAccount; className: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const mounted = useMounted();
  const retry = async (): Promise<void> => {
    setBusy(true);
    await account.refresh();
    // An answer replaces the note; no answer leaves it, and the button is ready again.
    if (mounted.current) setBusy(false);
  };
  return (
    <div className={'offline-note ' + className}>
      <p>{t('account.offline')}</p>
      <button type="button" className="small-btn" disabled={busy} aria-busy={busy || undefined} onClick={() => void retry()}>
        {busy ? t('account.checking') : t('common.tryAgain')}
      </button>
    </div>
  );
}
