/**
 * Admin: Accounts (#/admin; BACKEND-PLAN.md §5.1, §7; no board yet): every account, newest first, to search by name or
 * email and filter by status, with Invite someone as the screen's one filled button. A row opens the account.
 * Needs `accounts.read`; without it the screen says so, with the way back to Settings.
 */
import { useEffect, useState } from 'react';
import type { AccountListResponse, AccountStatus, AccountSummary } from '../../../../shared/api';
import { api } from '../../../api/client';
import { t } from '../../../i18n';
import { useAccount } from '../../account';
import { Chip } from '../../components/Controls';
import { ErrorRetry, FormDone, onSubmit, StatusPill, TextField } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { RowLink, Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { useBreakpoint } from '../../hooks';
import { clearListNotice, peekListNotice, rolesText } from '../../lib/admin';
import { errorMessage } from '../../lib/apiErrors';
import { Link } from '../../router';
import { GateMessage, NoAccess, useAdminGate } from './AdminParts';

/** How long typing has to pause before the list is asked again. */
export const SEARCH_DELAY_MS = 250;

type Filter = 'all' | AccountStatus;
const FILTERS: Filter[] = ['all', 'invited', 'active', 'blocked'];

type List =
  | { state: 'loading' }
  | { state: 'ready'; accounts: AccountSummary[]; busy: boolean }
  | { state: 'failed'; message: string }
  | { state: 'denied' };

export function AdminAccounts(): JSX.Element {
  const account = useAccount();
  const gate = useAdminGate(account, 'accounts.read');
  const bp = useBreakpoint();
  // The one filled button: in the title row from 700 px up, under it on a phone.
  const invite = account.can('accounts.invite') ? (
    <Link to="/admin/invite" className="btn btn--accent admin-invite">
      <Icon name="plus" size={20} strokeWidth={2.4} />
      {t('admin.invite')}
    </Link>
  ) : null;
  const inHead = bp !== 'phone';
  return (
    <SubPage title={t('admin.title')} back="/settings" backLabel={t('account.back')} action={gate === 'ok' && inHead ? invite : undefined}>
      {gate === 'ok' ? <AccountList invite={inHead ? null : invite} quiet={!!invite} /> : <GateMessage gate={gate} />}
    </SubPage>
  );
}

/** `invite`: the button, when it goes above the list (phone). `quiet`: Invite someone is on the screen (Try again is not filled). */
function AccountList({ invite, quiet }: { invite: JSX.Element | null; quiet: boolean }): JSX.Element {
  const { handleError, me } = useAccount();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Filter>('all');
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<List>({ state: 'loading' });
  // A message from the one-account screen ("…'s account was deleted."), shown once.
  const [notice] = useState(peekListNotice);
  useEffect(() => clearListNotice(), []);

  // The search, once typing pauses.
  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const timer = window.setTimeout(() => setQ(next), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, q]);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status !== 'all') params.set('status', status);
    const query = params.toString();
    // A new search keeps the rows it has until the answer comes; only the first load says it is loading.
    setList((l) => (l.state === 'ready' ? { ...l, busy: true } : { state: 'loading' }));
    api.get<AccountListResponse>('/admin/accounts' + (query ? '?' + query : ''), { signal: ctrl.signal }).then(
      (res) => {
        if (!ctrl.signal.aborted) setList({ state: 'ready', accounts: res.accounts, busy: false });
      },
      (e: unknown) => {
        // Typed over, or the screen was left: a newer request (or none) answers instead.
        if (ctrl.signal.aborted) return;
        const err = handleError(e);
        setList(err.code === 'forbidden' ? { state: 'denied' } : { state: 'failed', message: errorMessage(err) });
      },
    );
    return () => ctrl.abort();
  }, [q, status, attempt, handleError]);

  if (list.state === 'denied') return <NoAccess />;
  const filtered = !!q || status !== 'all';

  return (
    <>
      {invite}
      {notice && (
        <div className="acct-card acct-card--status">
          <FormDone>{notice}</FormDone>
        </div>
      )}
      <div className="admin-tools">
        <form role="search" className="admin-search" onSubmit={onSubmit(() => setQ(text.trim()))}>
          <TextField type="search" label={t('admin.search')} placeholder={t('admin.searchPlaceholder')} value={text} onChange={setText} autoComplete="off"
            enterKeyHint="search" name="q" maxLength={200} />
        </form>
        <div role="group" aria-label={t('admin.statusGroup')} className="filter-chips">
          {FILTERS.map((f) => (
            <Chip key={f} on={status === f} onToggle={() => setStatus(f)}>
              {t(f === 'all' ? 'admin.all' : 'accountStatus.' + f)}
            </Chip>
          ))}
        </div>
      </div>
      {list.state === 'loading' && <p className="acct-wait">{t('admin.loading')}</p>}
      {list.state === 'failed' && <ErrorRetry error={list.message} onRetry={() => setAttempt((n) => n + 1)} quiet={quiet} />}
      {list.state === 'ready' &&
        (list.accounts.length ? (
          <Section id="accounts" title={t(filtered ? 'admin.countFound' : 'admin.count', { count: list.accounts.length })} className={list.busy ? 'is-busy' : undefined}>
            {list.accounts.map((a) => (
              <RowLink key={a.id} to={`/admin/account/${a.id}`} className="acct-row" title={a.id === me?.id ? t('admin.you', { name: a.name }) : a.name} sub={a.email}
                meta={
                  <>
                    <StatusPill status={a.status} />
                    {a.roles.length > 0 && <span className="row-sub">{rolesText(a.roles)}</span>}
                  </>
                } />
            ))}
          </Section>
        ) : (
          <p className="acct-empty" role="status">
            {t('admin.empty')}
          </p>
        ))}
    </>
  );
}
