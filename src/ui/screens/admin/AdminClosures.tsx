/**
 * Admin: Deleted accounts (#/admin/deleted; BACKEND-PLAN.md §3.7; no board yet): every account that was deleted, newest
 * day first, so the history can be used to improve the app. Opened from Accounts. Each entry: the day, how it went
 * (Archived: its owner kept an anonymous copy; Data deleted: its owner deleted everything; By an admin), the owner's
 * feedback, and for an archived one what its copy holds in one line (joined, level, XP, lessons, days practised).
 * A filter by kind, and Download as a file (every entry, the archived progress too, as JSON). Nothing on the screen
 * says whose an account was: the API keeps no name, email, id or time of day for them.
 * Needs `accounts.read`, as Accounts does.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Closure, ClosureKind, ClosureListResponse } from '../../../../shared/api';
import { api, saveBlob } from '../../../api/client';
import { readSynced } from '../../../game/merge';
import { levelInfo } from '../../../game/xp';
import { formatDay, formatMonth, t } from '../../../i18n';
import { useAccount } from '../../account';
import { Chip } from '../../components/Controls';
import { ErrorRetry, RowButton } from '../../components/Form';
import { Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { announce } from '../../lib/announce';
import { errorMessage } from '../../lib/apiErrors';
import { GateMessage, NoAccess, useAdminGate } from './AdminParts';

/** The name the list is saved under. */
export const CLOSURES_FILE = 'muzieklab-deleted-accounts.json';

type Filter = 'all' | ClosureKind;
/** In two pairs, as the accounts list's status filter: a line breaks only between them. */
const FILTER_PAIRS: [Filter, Filter][] = [
  ['all', 'archived'],
  ['removed', 'admin'],
];

type List = { state: 'loading' } | { state: 'ready'; closures: Closure[] } | { state: 'failed'; message: string } | { state: 'denied' };

export function AdminClosures(): JSX.Element {
  const account = useAccount();
  const gate = useAdminGate(account, 'accounts.read');
  return (
    <SubPage title={t('closures.title')} back="/admin" backLabel={t('admin.backToList')}>
      {gate === 'ok' ? <ClosureList /> : <GateMessage gate={gate} />}
    </SubPage>
  );
}

function ClosureList(): JSX.Element {
  const { handleError } = useAccount();
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<List>({ state: 'loading' });
  const [kind, setKind] = useState<Filter>('all');
  // The first list is not read out (the screen's heading covers it); one that Try again or a filter brings is.
  const loaded = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setList({ state: 'loading' });
    api.get<ClosureListResponse>('/admin/closures', { signal: ctrl.signal }).then(
      (res) => {
        if (ctrl.signal.aborted) return;
        setList({ state: 'ready', closures: res.closures });
        if (loaded.current) announce(t('closures.count', { count: res.closures.length }));
        loaded.current = true;
      },
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        loaded.current = true;
        const err = handleError(e);
        setList(err.code === 'forbidden' ? { state: 'denied' } : { state: 'failed', message: errorMessage(err) });
      },
    );
    return () => ctrl.abort();
  }, [attempt, handleError]);

  const all = list.state === 'ready' ? list.closures : [];
  const shown = useMemo(() => (kind === 'all' ? all : all.filter((c) => c.kind === kind)), [all, kind]);

  if (list.state === 'denied') return <NoAccess />;
  const pick = (next: Filter): void => {
    setKind(next);
    const n = next === 'all' ? all.length : all.filter((c) => c.kind === next).length;
    announce(n ? t(next === 'all' ? 'closures.count' : 'closures.countFound', { count: n }) : t('closures.emptyKind'));
  };

  return (
    <>
      <p className="acct-lead">{t('closures.lead')}</p>
      {list.state === 'loading' && <p className="acct-wait">{t('closures.loading')}</p>}
      {list.state === 'failed' && <ErrorRetry error={list.message} onRetry={() => setAttempt((n) => n + 1)} />}
      {list.state === 'ready' &&
        (all.length === 0 ? (
          <p className="acct-empty">{t('closures.empty')}</p>
        ) : (
          <>
            <div role="group" aria-label={t('closures.kindGroup')} className="filter-chips">
              {FILTER_PAIRS.map((pair) => (
                <span key={pair[0]} className="chip-pair">
                  {pair.map((f) => (
                    <Chip key={f} on={kind === f} onToggle={() => pick(f)}>
                      {t(f === 'all' ? 'admin.all' : 'closureKind.' + f)}
                    </Chip>
                  ))}
                </span>
              ))}
            </div>
            {shown.length ? (
              <Section id="closures" title={t(kind === 'all' ? 'closures.count' : 'closures.countFound', { count: shown.length })}>
                {shown.map((c) => (
                  <ClosureRow key={c.id} closure={c} />
                ))}
              </Section>
            ) : (
              <p className="acct-empty">{t('closures.emptyKind')}</p>
            )}
            <Section id="closures-file" title={t('closures.file')}>
              <RowButton icon="download" label={t('closures.download')} sub={t('closures.downloadSub')}
                onClick={() => saveBlob(new Blob([JSON.stringify({ closures: all }, null, 2)], { type: 'application/json' }), CLOSURES_FILE)} />
            </Section>
          </>
        ))}
    </>
  );
}

/** One deleted account: the day and its kind, the feedback, and what an archived one's copy holds. */
function ClosureRow({ closure }: { closure: Closure }): JSX.Element {
  const facts = closure.archive ? archiveFacts(closure.archive) : null;
  return (
    <article className="closure-row" aria-label={t('closures.rowLabel', { day: formatDay(closure.day), kind: t('closureKind.' + closure.kind) })}>
      <div className="closure-row-head">
        <b>{formatDay(closure.day)}</b>
        <span className={'status-pill is-' + closure.kind}>{t('closureKind.' + closure.kind)}</span>
      </div>
      {closure.kind !== 'admin' &&
        (closure.feedback ? <blockquote className="closure-feedback">{closure.feedback}</blockquote> : <p className="row-sub">{t('closures.noFeedback')}</p>)}
      {facts && <p className="row-sub">{facts}</p>}
    </article>
  );
}

/** "Joined March 2026 · Level 4 · 1840 XP · 12 lessons · 23 days practiced", from the copy as the app reads it. */
export function archiveFacts(archive: NonNullable<Closure['archive']>): string {
  const parts = [t('closures.joined', { month: formatMonth(archive.joined) })];
  const synced = readSynced(archive.data);
  if (!synced) parts.push(t('closures.noProgress'));
  else {
    const p = synced.progress;
    const lessons = Object.values(p.lessons).filter((l) => l.stars > 0).length;
    parts.push(
      t('closures.level', { level: levelInfo(p.xp).level }),
      t('closures.xp', { xp: p.xp }),
      t('closures.lessons', { count: lessons }),
      t('closures.days', { count: p.practiceDays.length }),
    );
  }
  return parts.reduce((a, b) => t('common.join', { a, b }));
}
