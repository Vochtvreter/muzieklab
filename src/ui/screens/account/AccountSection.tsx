/**
 * Settings → Account, the first section of Settings (BACKEND-PLAN.md §10.1: an Account section at the top of Settings
 * on every size, with the admin row only admins see; no board yet).
 *
 * It shows only once the API answered, or when an account is cached, so a site without an API (production today)
 * looks exactly as before: no section at all.
 * - Signed out: Sign in.
 * - Signed in: the account (name and email) → Account; Accounts → the admin screens, with `accounts.read`; Sign out.
 * - No answer from the API with a cached account: the account, and a note that it cannot be changed now, with Try again.
 * After a change that ends here (signed out, the account deleted…) a one-line status says what happened. It was read
 * out when it happened (useAccount announces it), so showing it again after the language switch says nothing new.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { NOTICE_TEXT, useAccount, type UseAccount } from '../../account';
import { FormError, RowButton } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { RowLink, Section } from '../../components/Rows';
import { useMounted } from '../../hooks';
import { announce } from '../../lib/announce';
import { errorMessage } from '../../lib/apiErrors';
import { parseHash } from '../../router';

/** Try again shows "Checking…" at least this long, so a quick "still no answer" is seen to happen. */
export const CHECKING_MIN_MS = 600;
/** The Account section's rows that take focus (the first one is the account, or Sign in). */
const ACCOUNT_ROWS = '[aria-labelledby="h-account"] .set-card a, [aria-labelledby="h-account"] .set-card button';

export function AccountSection(): JSX.Element | null {
  const account = useAccount();
  const { me, api: reach, notice, setNotice } = account;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After Try again found the API: the section's first row (the account, or Sign in).
  const refocus = useRefocus(() => document.querySelector<HTMLElement>(ACCOUNT_ROWS));

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
          {offline && <OfflineNote account={account} className="row-note" onBack={refocus} />}
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
          {t(NOTICE_TEXT[notice])}
        </div>
      )}
    </Section>
  );
}

/**
 * Focus for after Try again found the API: the note and its button are gone, so focus goes to `target` (what the note
 * stood for) once the screen shows the answer, not to the page. Returns the function that asks for it.
 */
export function useRefocus(target: () => HTMLElement | null | undefined): () => void {
  const [asked, setAsked] = useState(0);
  const latest = useRef(target);
  latest.current = target;
  // After the render that shows the answer (it is dispatched before this is asked for, so it is in that render), and
  // only while focus is lost with the button: focus that was moved on meanwhile stays where it is.
  useEffect(() => {
    if (asked && (!document.activeElement || document.activeElement === document.body)) latest.current()?.focus();
  }, [asked]);
  return useRef(() => setAsked((n) => n + 1)).current;
}

/**
 * The note an account screen shows while the API does not answer, with Try again (GET /me now). The button keeps its
 * focus while it checks (aria-disabled, not disabled, which would drop focus to the page), shows "Checking…" long
 * enough to be seen, and the outcome is read out: still no answer (the button is ready again), or the API is back
 * (the note goes, and `onBack` puts focus on what replaced it).
 */
export function OfflineNote({ account, className, onBack }: { account: UseAccount; className: string; onBack(): void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useMounted();
  const retry = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const started = Date.now();
    const reach = await account.refresh();
    if (reach !== 'unreachable') {
      running.current = false;
      announce(t('account.backOnline'));
      onBack();
      return;
    }
    await new Promise((done) => window.setTimeout(done, Math.max(0, CHECKING_MIN_MS - (Date.now() - started))));
    running.current = false;
    if (!mounted.current) return;
    setBusy(false);
    announce(t('account.stillOffline'));
  };
  return (
    <div className={'offline-note ' + className}>
      <p>{t('account.offline')}</p>
      <button type="button" className="small-btn" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void retry()}>
        {busy ? t('account.checking') : t('common.tryAgain')}
      </button>
    </div>
  );
}
