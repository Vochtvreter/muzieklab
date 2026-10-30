/**
 * Admin: Feedback (#/admin/feedback; docs/FEEDBACK-LOOP.md §3; BACKEND-PLAN.md §3.9, §7; no board yet): the feedback
 * reports sent from the app with the feedback tool, newest first, to review before anything goes on to GitHub. Opened
 * from Settings → Account. A status filter with how many there are of each (New, the ones nobody looked at yet, first);
 * a row opens the report (AdminFeedbackReport) and shows its title (or one made up from its kind and screen), its kind,
 * the marked spot, who sent it and the day. Built from Deleted accounts' design language. A filter whose list does not
 * come keeps the chips, with the counts they had, so another one can be chosen. Above the list, the Feedback mode
 * switch: only while it is on does anyone see the Feedback button (PUT /admin/feedback-mode, for everyone).
 * Needs `feedback.review`; without it the screen says so, with the way back to Settings. A filter's result, and the
 * message from the report screen ("The report was deleted."), are announced (ui/lib/announce.ts).
 * (Not the feedback someone leaves when deleting their account: that is in Accounts → Deleted accounts.)
 */
import { useEffect, useRef, useState } from 'react';
import { FEEDBACK_STATUSES, showsNothing, type FeedbackListResponse, type FeedbackMode, type FeedbackStatus, type FeedbackSummary } from '../../../../shared/feedback';
import { api } from '../../../api/client';
import { formatLongDate, t } from '../../../i18n';
import { useAccount } from '../../account';
import { Chip } from '../../components/Controls';
import { ErrorRetry, FormDone, FormError, SwitchRow } from '../../components/Form';
import { RowLink, Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { useMounted } from '../../hooks';
import { clearListNotice, peekListNotice } from '../../lib/admin';
import { announce } from '../../lib/announce';
import { errorMessage } from '../../lib/apiErrors';
import { GateMessage, NoAccess, useAdminGate } from './AdminParts';

type Filter = 'all' | FeedbackStatus;
/** In two pairs, as the other admin filters: a line breaks only between them. New first, the reports to look at. */
const FILTER_PAIRS: [Filter, Filter][] = [
  ['new', 'accepted'],
  ['declined', 'all'],
];

/** The heading over the list, by filter. */
const COUNT_KEY: Record<Filter, string> = {
  all: 'feedbackReview.count',
  new: 'feedbackReview.countNew',
  accepted: 'feedbackReview.countAccepted',
  declined: 'feedbackReview.countDeclined',
};

/** The filter the list showed last: coming back from a report keeps it. */
let lastFilter: Filter = 'new';

/** The list starts on New again (tests). */
export function resetFeedbackFilter(): void {
  lastFilter = 'new';
}

type List =
  | { state: 'loading' }
  | { state: 'ready'; reports: FeedbackSummary[]; busy: boolean }
  | { state: 'failed'; message: string }
  | { state: 'denied' };

/** How many reports there are of each status, as the last answer said; `unknown` when no answer came yet. */
type Counts = Record<FeedbackStatus, number> | 'unknown';

/**
 * A report's title as written, or, when its author left it empty (or it shows nothing, as a zero-width space), one made
 * up in the app's language from its kind and screen: "Bug on #/settings".
 */
export function reportTitle(r: Pick<FeedbackSummary, 'title' | 'kind' | 'route'>): string {
  return showsNothing(r.title) ? t('feedbackReview.untitled', { kind: kindName(r.kind), route: '#' + r.route }) : r.title.trim();
}

/** Bug, Change or Idea, as the feedback tool names them. */
export const kindName = (kind: string): string => t('feedback.kind.' + kind);

/** The author's name, or "A deleted account" once their account is gone. */
export const authorName = (author: FeedbackSummary['author']): string => author?.name ?? t('feedbackReview.deletedAccount');

/** Where a report stands as a small pill: New (gold, waiting), Accepted (green), Declined (grey). */
export function FeedbackPill({ status }: { status: FeedbackStatus }): JSX.Element {
  return <span className={'status-pill is-' + status}>{t('feedbackStatus.' + status)}</span>;
}

export function AdminFeedback(): JSX.Element {
  const account = useAccount();
  const gate = useAdminGate(account, 'feedback.review');
  return (
    <SubPage title={t('feedbackReview.title')} back="/settings" backLabel={t('account.back')}>
      {gate === 'ok' ? <ReportList /> : <GateMessage gate={gate} sub={t('feedbackReview.noAccessSub')} />}
    </SubPage>
  );
}

function ReportList(): JSX.Element {
  const { handleError } = useAccount();
  const [status, setStatus] = useState<Filter>(lastFilter);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<List>({ state: 'loading' });
  // What the filter chips count. Kept while another filter loads or fails, so the chips stay, the one just pressed
  // keeps the focus, and another filter can be chosen; unknown (chips without counts) when the first answer failed.
  // Null before any answer: the chips come with the first list, unless it says there are no reports at all.
  const [counts, setCounts] = useState<Counts | null>(null);
  // The first list is not read out (the screen's heading covers it); one that a filter or Try again brings is.
  const loaded = useRef(false);
  // A message from the report screen ("The report was deleted."), shown once.
  const [notice] = useState(peekListNotice);
  useEffect(() => {
    clearListNotice();
    // Read out: the screen it came from (and its button) is gone.
    if (notice) announce(notice);
  }, [notice]);

  useEffect(() => {
    lastFilter = status;
    const ctrl = new AbortController();
    // Another filter keeps the rows it has until the answer comes; only the first load says it is loading.
    setList((l) => (l.state === 'ready' ? { ...l, busy: true } : { state: 'loading' }));
    api.get<FeedbackListResponse>('/admin/feedback' + (status === 'all' ? '' : '?status=' + status), { signal: ctrl.signal }).then(
      (res) => {
        if (ctrl.signal.aborted) return;
        setList({ state: 'ready', reports: res.reports, busy: false });
        setCounts(res.counts);
        // The list's heading is not a live region.
        const n = res.reports.length;
        if (loaded.current) announce(n ? t(COUNT_KEY[status], { count: n }) : t(total(res.counts) ? 'feedbackReview.emptyStatus' : 'feedbackReview.empty'));
        loaded.current = true;
      },
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        // The list that Try again brings replaces the focused button: it is read out.
        loaded.current = true;
        const err = handleError(e);
        setList(err.code === 'forbidden' ? { state: 'denied' } : { state: 'failed', message: errorMessage(err) });
        setCounts((c) => c ?? 'unknown');
      },
    );
    return () => ctrl.abort();
  }, [status, attempt, handleError]);

  if (list.state === 'denied') return <NoAccess sub={t('feedbackReview.noAccessSub')} />;
  const known = counts === 'unknown' ? null : counts;
  // No reports at all: nothing to filter.
  const none = known !== null && total(known) === 0;
  // How many the filter holds: more than the list brings (the newest 500) is said under it.
  const held = known ? (status === 'all' ? total(known) : known[status]) : 0;

  return (
    <>
      <p className="acct-lead">{t('feedbackReview.lead')}</p>
      {notice && (
        <div className="acct-card acct-card--status">
          <FormDone live={false}>{notice}</FormDone>
        </div>
      )}
      <ModeCard />
      {counts !== null && !none && (
        <div role="group" aria-label={t('admin.statusGroup')} className="filter-chips">
          {FILTER_PAIRS.map((pair) => (
            <span key={pair[0]} className="chip-pair">
              {pair.map((f) => (
                <Chip key={f} on={status === f} onToggle={() => setStatus(f)}>
                  {t(f === 'all' ? 'admin.all' : 'feedbackStatus.' + f)}
                  {known && (
                    <>
                      {' '}
                      <span className="chip-count">{f === 'all' ? total(known) : (known[f] ?? 0)}</span>
                    </>
                  )}
                </Chip>
              ))}
            </span>
          ))}
        </div>
      )}
      {list.state === 'loading' && <p className="acct-wait">{t('feedbackReview.loading')}</p>}
      {list.state === 'failed' && <ErrorRetry error={list.message} onRetry={() => setAttempt((n) => n + 1)} />}
      {list.state === 'ready' &&
        (none ? (
          <p className="acct-empty">{t('feedbackReview.empty')}</p>
        ) : list.reports.length ? (
          <Section id="reports" title={t(COUNT_KEY[status], { count: list.reports.length })} className={list.busy ? 'is-busy' : undefined}>
            {list.reports.map((r) => (
              <RowLink key={r.id} to={`/admin/feedback/${r.id}`} className="acct-row report-row" title={reportTitle(r)} sub={rowLine(r)}
                meta={status === 'all' ? <FeedbackPill status={r.status} /> : undefined} />
            ))}
            {held > list.reports.length && <p className="row-note">{t('feedbackReview.newest', { count: list.reports.length })}</p>}
          </Section>
        ) : (
          <p className="acct-empty">{t('feedbackReview.emptyStatus')}</p>
        ))}
    </>
  );
}

/**
 * Feedback mode, for everyone: while it is off nobody sees the Feedback button. The switch shows what it is changing to
 * until the answer comes; a failure puts it back and says why. Others pick the change up on their next GET /me.
 */
function ModeCard(): JSX.Element | null {
  const account = useAccount();
  const { me, setMe, handleError } = account;
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useMounted();
  if (!me) return null;
  const on = pending ?? me.feedbackMode;

  const toggle = async (next: boolean): Promise<void> => {
    if (pending !== null) return;
    setPending(next);
    setError(null);
    try {
      const res = await api.put<FeedbackMode>('/admin/feedback-mode', { on: next });
      // The account as the app keeps it: its own Feedback button comes or goes at once.
      setMe({ ...me, feedbackMode: res.on });
    } catch (e) {
      if (mounted.current) setError(errorMessage(handleError(e)));
    } finally {
      if (mounted.current) setPending(null);
    }
  };

  return (
    <Section id="mode" title={t('feedbackReview.modeTitle')}>
      <SwitchRow label={t('feedbackReview.modeTitle')} description={t(on ? 'feedbackReview.modeOn' : 'feedbackReview.modeOff')} on={on}
        onChange={(v) => void toggle(v)} />
      {error && (
        <div className="row-pad">
          <FormError error={error} />
        </div>
      )}
    </Section>
  );
}

/** Every report, whatever its status. */
function total(counts: Record<FeedbackStatus, number>): number {
  return FEEDBACK_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0);
}

/** "Bug · button “Start” · Ann de Vries · October 25, 2026". */
function rowLine(r: FeedbackSummary): string {
  return [kindName(r.kind), r.label, authorName(r.author), formatLongDate(r.createdAt)].filter(Boolean).reduce((a, b) => t('common.join', { a, b }));
}
