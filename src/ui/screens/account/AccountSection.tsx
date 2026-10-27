/**
 * Settings → Account, the first section of Settings (BACKEND-PLAN.md §10.1: an Account section at the top of Settings
 * on every size, with the admin row only admins see; no board yet).
 *
 * It shows only once the API answered, or when an account is cached, so a site without an API (production today)
 * looks exactly as before: no section at all.
 * - Signed out: Sign in.
 * - Signed in: the account (name and email) → Account; whether the progress is saved to it (§6, ui/sync.ts); Accounts →
 *   the admin screens, with `accounts.read`; Feedback → the feedback reports to review, with `feedback.review`; the
 *   Feedback button switch for this device, with `feedback.give` while feedback mode is on (docs/FEEDBACK-LOOP.md §3);
 *   Sign out, which asks whether this device keeps its progress (a shared device removes it). The last change is saved
 *   first.
 * - No answer from the API with a cached account: the account, and a note that it cannot be changed now, with Try again.
 * After a change that ends here (signed out, the account deleted…) a one-line status says what happened. It was read
 * out when it happened (useAccount announces it), so showing it again after the language switch says nothing new.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { NOTICE_TEXT, useAccount, type UseAccount } from '../../account';
import { Segmented } from '../../components/Controls';
import { ConfirmAction, SwitchRow } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { RowLink, Section } from '../../components/Rows';
import { useMounted } from '../../hooks';
import { announce } from '../../lib/announce';
import { errorMessage } from '../../lib/apiErrors';
import { parseHash } from '../../router';
import { useStore, type SyncStatus } from '../../store';
import { progressSync } from '../../sync';

/** Try again shows "Checking…" at least this long, so a quick "still no answer" is seen to happen. */
export const CHECKING_MIN_MS = 600;
/** The Account section's rows that take focus (the first one is the account, or Sign in). */
const ACCOUNT_ROWS = '[aria-labelledby="h-account"] .set-card a, [aria-labelledby="h-account"] .set-card button';

export function AccountSection(): JSX.Element | null {
  const account = useAccount();
  const { me, api: reach, notice, setNotice } = account;
  const { state, dispatch } = useStore();
  // After the button that had the focus went (Try again found the API or saved the progress, signed out): the section's
  // first row (the account, or Sign in).
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

  return (
    <Section id="account" title={t('settings.account')}>
      {me ? (
        <>
          <RowLink to="/account" title={me.name} sub={me.email} />
          {!offline && <SyncLine status={state.account.sync} onDone={refocus} />}
          {account.can('accounts.read') && <RowLink to="/admin" title={t('settings.accounts')} sub={t('settings.accountsSub')} />}
          {account.can('feedback.review') && <RowLink to="/admin/feedback" title={t('settings.feedbackReports')} sub={t('settings.feedbackReportsSub')} />}
          {me.feedbackMode && account.can('feedback.give') && (
            <SwitchRow label={t('settings.feedbackButton')} description={t('settings.feedbackButtonSub')} on={state.prefs.feedbackButton}
              onChange={(on) => dispatch({ type: 'prefs', patch: { feedbackButton: on } })} />
          )}
          {reach === 'reachable' && <SignOut account={account} onSignedOut={refocus} />}
          {offline && <OfflineNote account={account} className="row-note" onBack={refocus} />}
        </>
      ) : (
        <RowLink to="/signin" title={t('settings.signIn')} sub={t('settings.signInSub')} />
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
 * Sign out on this device, confirmed, with the choice of what happens to this device's progress: kept (the default), or
 * removed, for a shared device. The last change is saved first. In Settings, and on a link (an invite, a new password)
 * opened while someone else is signed in; `onSignedOut` runs once they are. There the device is shared, and progress
 * kept on it goes to the link's account at its first sign-in here, so the confirm opens on Remove (`removeFirst`).
 */
export function SignOut({ account, removeFirst = false, onSignedOut }: { account: UseAccount; removeFirst?: boolean; onSignedOut?(): void }): JSX.Element {
  const { dispatch } = useStore();
  const [keep, setKeep] = useState(!removeFirst);
  const [error, setError] = useState<string | null>(null);

  // Keeps the confirm open with the error when signing out failed; false closes it.
  const signOut = async (): Promise<boolean> => {
    setError(null);
    // What is not saved yet goes to the account first, so removing it from this device loses nothing. When it could not
    // be saved (a server error, no API, a save still on its way), Remove is refused. In Settings the line offers Keep,
    // which loses nothing either, as this account's next sign-in here adds the device's progress again. Not on a link:
    // there the next sign-in is the link's account, which Keep would hand this one's progress to.
    const saved = (await progressSync()?.flush()) ?? true;
    if (!keep && !saved) {
      setError(t(removeFirst ? 'settings.signOutNotSavedLink' : 'settings.signOutNotSaved'));
      return false;
    }
    try {
      await account.signOut();
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
    if (!keep) dispatch({ type: 'resetProgress' });
    setKeep(!removeFirst);
    onSignedOut?.();
    return true;
  };

  // The chosen one takes the focus when the confirm opens (the row button that had it is gone), as Delete account's
  // does, so a screen reader reads the confirm out and Escape reaches it.
  return (
    <ConfirmAction label={t('settings.signOut')} icon="quit" tone="plain" question={t('settings.signOutQuestion')} detail={t('settings.signOutDetail')}
      confirmLabel={t('settings.signOut')} busyLabel={t('settings.signingOut')} error={error} onConfirm={async () => (await signOut()) ? undefined : false}
      onCancel={() => {
        setError(null);
        setKeep(!removeFirst);
      }}>
      <Segmented label={t('settings.signOutChoice')} className="confirm-seg" value={keep ? 'keep' : 'clear'} onChange={(v) => setKeep(v === 'keep')} autoFocus
        options={[
          { value: 'keep', label: t('settings.signOutKeep') },
          { value: 'clear', label: t('settings.signOutClear') },
        ]} />
    </ConfirmAction>
  );
}

const SYNC_TEXT: Record<Exclude<SyncStatus, 'idle'>, string> = {
  saved: 'settings.syncSaved',
  saving: 'settings.syncSaving',
  pending: 'settings.syncPending',
  failed: 'settings.syncFailed',
};

/**
 * Whether the progress is on the account: saved, saving, waiting for the connection, or failed with Try again. Not a
 * live region: it changes after every exercise, and a screen reader would hear it each time. Try again's outcome is read
 * out, though, as OfflineNote's is: the button keeps its focus while it saves (aria-disabled, also while the line says
 * Saving…), and is ready again if that failed too; else it goes, and `onDone` puts the focus on the account row.
 */
function SyncLine({ status, onDone }: { status: SyncStatus; onDone(): void }): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  // Counts the tries that ended: the effect below then reads the status they ended on, which is in that same render.
  const [ended, setEnded] = useState(0);
  const mounted = useMounted();
  useEffect(() => {
    if (!ended) return;
    setBusy(false);
    if (status === 'idle') return;
    announce(t(SYNC_TEXT[status]));
    if (status !== 'failed') onDone();
  }, [ended]);
  if (status === 'idle') return null;
  const failed = status === 'failed';
  const retry = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    await progressSync()?.request('retry');
    if (mounted.current) setEnded((n) => n + 1);
  };
  return (
    <div className={'sync-line is-' + status}>
      <Icon name={status === 'saved' ? 'check' : failed ? 'alert' : 'clock'} size={18} strokeWidth={status === 'saved' ? 2.6 : 2}
        className={status === 'saved' ? 'tone-good' : failed ? 'tone-miss' : 'tone-muted'} />
      <span className="sync-line-text">{t(SYNC_TEXT[status])}</span>
      {(failed || busy) && (
        <button type="button" className="small-btn" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void retry()}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  );
}

/**
 * Focus for after the element that had it is gone (Try again's note once the API answers, a form that closed on save,
 * Sign out on a link page): focus goes to `target`, what replaced it, once the render that shows that is done, not to
 * the page. Returns the function that asks for it.
 */
export function useRefocus(target: () => HTMLElement | null | undefined): () => void {
  const [asked, setAsked] = useState(0);
  const latest = useRef(target);
  latest.current = target;
  // After the render that shows what replaced it (that change is made before this is asked for, so it is in that
  // render), and only while focus is lost with the element: focus that was moved on meanwhile stays where it is.
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
