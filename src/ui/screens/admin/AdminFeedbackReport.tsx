/**
 * Admin: one feedback report (#/admin/feedback/<id>; docs/FEEDBACK-LOOP.md §3; BACKEND-PLAN.md §7; no board yet). Its
 * title (or one made up from its kind and screen) heads the page, then Settings-style sections, built from the
 * one-account screen's design language:
 * - Report: the kind, and what should change as it was written (its line breaks kept).
 * - Where: the screen, the marked spot (its name, text, selector, an element or a drawn area, the box), and a link that
 *   opens that screen.
 * - Device: the viewport, phone, tablet or desktop, portrait or landscape, touch or mouse, the theme, the language,
 *   the app version and the browser.
 * - Sent: who sent it ("A deleted account" once the account is gone) and when.
 * - Review: the status (New · Accepted · Declined), saved at once, with who reviewed it last and when; a note for the
 *   team, saved with Save. The author never sees either.
 * - Actions: Copy as Markdown (the GitHub issue the report would become, to make by hand until the API sends accepted
 *   reports to GitHub itself) and Delete report, which goes back to the list with a one-line message.
 * Needs `feedback.review`. A report deleted meanwhile says so, with the way back to the list.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { buildIssue, FEEDBACK_NOTE_MAX, FEEDBACK_STATUSES, showsNothing, type FeedbackDetail, type FeedbackReport, type FeedbackStatus, type FeedbackUpdateRequest } from '../../../../shared/feedback';
import { api } from '../../../api/client';
import { formatDateTime, formatLongDate, hasMessage, LOCALES, t } from '../../../i18n';
import { useAccount } from '../../account';
import { Segmented } from '../../components/Controls';
import { ConfirmAction, CopyField, ErrorRetry, FormDone, FormError, onSubmit, RowButton, SubmitButton, TextAreaField } from '../../components/Form';
import { RowLink, Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { useMounted } from '../../hooks';
import { setListNotice } from '../../lib/admin';
import { announce } from '../../lib/announce';
import { errorMessage, failureOf, type Failure } from '../../lib/apiErrors';
import { leave, Link, parseHash } from '../../router';
import { authorName, kindName, reportTitle } from './AdminFeedback';
import { GateMessage, NoAccess, useAdminGate } from './AdminParts';

/** A note the API refuses: control characters other than line breaks (a pasted tab, say). */
const HIDDEN_CHARACTERS = /(?![\n\r])\p{Cc}/u;

type Load =
  | { state: 'loading' }
  | { state: 'ready'; detail: FeedbackDetail }
  | { state: 'failed'; message: string }
  | { state: 'gone' }
  | { state: 'denied' };

/** `id`: the report's id (24 hex characters, checked by the router). */
export function AdminFeedbackReport({ id }: { id: string }): JSX.Element {
  const account = useAccount();
  const { handleError } = account;
  const gate = useAdminGate(account, 'feedback.review');
  const ok = gate === 'ok';
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const path = `/admin/feedback/${id}`;

  useEffect(() => {
    if (!ok) return;
    const ctrl = new AbortController();
    setLoad({ state: 'loading' });
    api.get<FeedbackDetail>(path, { signal: ctrl.signal }).then(
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

  /** A failed change: its message, after a 401 signs out and a 404 says the report is gone (another admin deleted it). */
  const fail = useCallback(
    (e: unknown): Failure => {
      const f = failureOf(handleError(e));
      if (f.code === 'not_found') setLoad({ state: 'gone' });
      return f;
    },
    [handleError],
  );
  const onChange = useCallback((detail: FeedbackDetail): void => setLoad({ state: 'ready', detail }), []);

  const detail = load.state === 'ready' ? load.detail : null;
  return (
    <SubPage title={detail ? reportTitle(detail) : t('feedbackReview.reportTitle')} back="/admin/feedback" backLabel={t('feedbackReview.backToList')}>
      {!ok ? (
        <GateMessage gate={gate} sub={t('feedbackReview.noAccessSub')} />
      ) : load.state === 'loading' ? (
        <p className="acct-wait">{t('feedbackReview.loadingReport')}</p>
      ) : load.state === 'failed' ? (
        <ErrorRetry error={load.message} onRetry={() => setAttempt((n) => n + 1)} />
      ) : load.state === 'denied' ? (
        <NoAccess sub={t('feedbackReview.noAccessSub')} />
      ) : load.state === 'gone' ? (
        <div className="acct-message">
          <FormError error={t('feedbackReview.gone')} />
          <Link to="/admin/feedback" className="btn btn--accent">
            {t('feedbackReview.backToList')}
          </Link>
        </div>
      ) : (
        <>
          <ReportCard detail={load.detail} />
          <WhereCard report={load.detail.report} />
          <DeviceCard report={load.detail.report} />
          <SentCard detail={load.detail} />
          <ReviewCard detail={load.detail} onChange={onChange} fail={fail} />
          <ActionsCard detail={load.detail} fail={fail} />
        </>
      )}
    </SubPage>
  );
}

interface Fact {
  label: string;
  value: ReactNode;
  /** A long value (the marked text, the selector): under its label, read from the left. */
  long?: boolean;
  /** Code (a selector, a route): in the mono face. */
  mono?: boolean;
}

/** Facts as the one-account screen's Details: the label on the left, the value on the right (or under it). */
function Facts({ rows }: { rows: (Fact | null | false)[] }): JSX.Element {
  return (
    <dl className="facts">
      {rows.filter((r): r is Fact => !!r).map((r) => (
        <div key={r.label} className={'fact-row' + (r.long ? ' fact-row--long' : '')}>
          <dt>{r.label}</dt>
          <dd className={r.mono ? 'fact-mono' : undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A value the app names (`feedbackReview.<group>.<value>`), or the value itself when the report holds another one. */
function named(group: string, value: string): string {
  const key = `feedbackReview.${group}.${value}`;
  return hasMessage(key) ? t(key) : value;
}

/** The kind, and what should change, as it was written. */
function ReportCard({ detail }: { detail: FeedbackDetail }): JSX.Element {
  const text = detail.report.description;
  return (
    <Section id="report" title={t('feedbackReview.report')}>
      <Facts rows={[{ label: t('feedbackReview.kind'), value: kindName(detail.kind) }]} />
      <div className="report-text">
        <b>{t('feedbackReview.description')}</b>
        {showsNothing(text) ? <p className="row-sub">{t('feedbackReview.noDescription')}</p> : <p className="report-quote">{text}</p>}
      </div>
    </Section>
  );
}

/** The screen and the marked spot, and the way to that screen. */
function WhereCard({ report }: { report: FeedbackReport }): JSX.Element {
  const { target: tg, context: cx } = report;
  const r = tg.rect;
  const box = t('feedbackReview.boxValue', { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
  const scroll = { x: Math.round(tg.scroll.x), y: Math.round(tg.scroll.y) };
  // Only a screen the app has: the route is what the report says, not something to follow blindly.
  const route = parseHash('#' + cx.route);
  return (
    <Section id="where" title={t('feedbackReview.where')}>
      <Facts rows={[
        { label: t('feedbackReview.screen'), value: '#' + cx.route, mono: true },
        { label: t('feedbackReview.marked'), value: tg.label, long: true },
        !!tg.text && { label: t('feedbackReview.text'), value: tg.text, long: true },
        { label: t('feedbackReview.selector'), value: tg.selector, long: true, mono: true },
        { label: t('feedbackReview.mode'), value: named('modeValue', tg.mode) },
        {
          label: t('feedbackReview.box'),
          value: scroll.x || scroll.y ? t('feedbackReview.boxScrolled', { box, ...scroll }) : box,
        },
      ]} />
      {route === cx.route && <RowLink to={route} title={t('feedbackReview.openScreen')} />}
    </Section>
  );
}

/** The device and the app as they were when the spot was marked. */
function DeviceCard({ report }: { report: FeedbackReport }): JSX.Element {
  const cx = report.context;
  const shown = named('themeValue', cx.theme.shown);
  const language = LOCALES.find((l) => l.code === cx.locale)?.name ?? cx.locale;
  return (
    <Section id="device" title={t('feedbackReview.device')}>
      <Facts rows={[
        { label: t('feedbackReview.viewport'), value: t('feedbackReview.viewportValue', { width: cx.viewport.width, height: cx.viewport.height, dpr: cx.viewport.dpr }) },
        { label: t('feedbackReview.size'), value: named('sizeValue', cx.breakpoint) },
        { label: t('feedbackReview.orientation'), value: named('orientationValue', cx.orientation) },
        { label: t('feedbackReview.pointer'), value: named('pointerValue', cx.pointer) },
        { label: t('feedbackReview.theme'), value: cx.theme.setting === 'system' ? t('feedbackReview.themeFromSystem', { theme: shown }) : shown },
        { label: t('feedbackReview.language'), value: language },
        { label: t('feedbackReview.version'), value: cx.version, mono: true },
        !!cx.userAgent && { label: t('feedbackReview.browser'), value: cx.userAgent, long: true, mono: true },
      ]} />
    </Section>
  );
}

/** Who sent it, and when. */
function SentCard({ detail }: { detail: FeedbackDetail }): JSX.Element {
  return (
    <Section id="sent" title={t('feedbackReview.sent')}>
      <Facts rows={[
        { label: t('feedbackReview.from'), value: authorName(detail.author) },
        { label: t('feedbackReview.date'), value: formatDateTime(detail.createdAt) },
      ]} />
    </Section>
  );
}

interface ChangeProps {
  detail: FeedbackDetail;
  /** The report as a change answered with. */
  onChange(detail: FeedbackDetail): void;
  fail(e: unknown): Failure;
}

/** The status, saved at once, and the note for the team, saved with Save (PATCH, feedback.review). */
function ReviewCard({ detail, onChange, fail }: ChangeProps): JSX.Element {
  const path = `/admin/feedback/${detail.id}`;
  // The status being saved, shown on the control until the answer comes.
  const [pending, setPending] = useState<FeedbackStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [note, setNote] = useState(detail.note);
  // What the field holds now, also for an answer that comes after more typing.
  const typed = useRef(detail.note);
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [badNote, setBadNote] = useState(false);
  const [saved, setSaved] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // The changes sent, one after another: the status and the note can be changed while the other is saving.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useMounted();
  const noteChanged = note.trim() !== detail.note;

  const type = (text: string): void => {
    typed.current = text;
    setNote(text);
  };
  /**
   * One change, sent after the ones before it have answered, so each answer holds them and the last answer is the
   * newest: an answer that overtook another could otherwise put an older status or note back.
   */
  const send = (body: FeedbackUpdateRequest): Promise<FeedbackDetail> => {
    const run = queue.current.then(() => api.patch<FeedbackDetail>(path, body));
    queue.current = run.catch(() => undefined);
    return run;
  };
  /**
   * An answer: the report as it is now. Its note (as stored: trimmed) goes into the field only when the field still
   * holds `was`, the note it was sent with; typing that went on meanwhile stays, to be saved. True when it went in.
   */
  const take = (next: FeedbackDetail, was: string): boolean => {
    onChange(next);
    if (!mounted.current || typed.current.trim() !== was) return false;
    type(next.note);
    return true;
  };
  const pick = async (next: FeedbackStatus): Promise<void> => {
    if (pending || next === detail.status) return;
    setPending(next);
    setStatusError(null);
    try {
      take(await send({ status: next }), detail.note);
    } catch (e) {
      if (mounted.current) setStatusError(fail(e).message);
    } finally {
      if (mounted.current) setPending(null);
    }
  };
  const saveNote = async (): Promise<void> => {
    setSaved(false);
    setNoteError(null);
    const bad = HIDDEN_CHARACTERS.test(note);
    setBadNote(bad);
    if (bad) {
      noteRef.current?.focus();
      return;
    }
    if (!noteChanged) return;
    const text = note.trim();
    setBusy(true);
    try {
      // Saved, unless more was typed meanwhile: that is still to be saved.
      if (take(await send({ note: text }), text)) setSaved(true);
    } catch (e) {
      if (mounted.current) setNoteError(fail(e).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const reviewed = !detail.reviewedAt
    ? t('feedbackReview.notReviewed')
    : detail.reviewer
      ? t('feedbackReview.reviewedBy', { name: detail.reviewer.name, date: formatLongDate(detail.reviewedAt) })
      : t('feedbackReview.reviewedByGone', { date: formatLongDate(detail.reviewedAt) });
  return (
    <Section id="review" title={t('feedbackReview.review')}>
      <div className="card-pad">
        <div className="review-choice">
          <b className="tfield-label" aria-hidden="true">
            {t('feedbackReview.status')}
          </b>
          <Segmented<FeedbackStatus> label={t('feedbackReview.status')} className="review-seg" value={pending ?? detail.status} onChange={(s) => void pick(s)}
            options={FEEDBACK_STATUSES.map((s) => ({ value: s, label: t('feedbackStatus.' + s) }))} />
          <span aria-live="polite" className="tfield-hint">
            {reviewed}
          </span>
        </div>
        <FormError error={statusError} />
      </div>
      <form className="card-pad" noValidate onSubmit={onSubmit(() => void saveNote(), busy)}>
        <TextAreaField label={t('feedbackReview.note')} name="note" value={note} maxLength={FEEDBACK_NOTE_MAX} inputRef={noteRef}
          hint={t('feedbackReview.noteHint', { max: FEEDBACK_NOTE_MAX })} error={badNote ? t('form.hiddenCharacters') : null} onChange={(v) => {
            type(v);
            setSaved(false);
            setBadNote(false);
          }} />
        <FormError error={noteError} />
        <div className="form-actions">
          {saved && <FormDone>{t('admin.saved')}</FormDone>}
          <SubmitButton variant="tonal" label={t('feedbackReview.saveNote')} busyLabel={t('form.saving')} busy={busy} disabled={!noteChanged} />
        </div>
      </form>
    </Section>
  );
}

/** Copy as Markdown, and Delete report. */
function ActionsCard({ detail, fail }: { detail: FeedbackDetail; fail(e: unknown): Failure }): JSX.Element {
  const [copied, setCopied] = useState(false);
  // No clipboard (an old browser, or not allowed): the Markdown is shown to copy by hand.
  const [byHand, setByHand] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const mounted = useMounted();
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const issue = buildIssue(detail.report);
  const markdown = `# ${issue.title}\n\n${issue.body}`;

  const copy = (): void => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip?.writeText) {
      setByHand(true);
      return;
    }
    clip.writeText(markdown).then(
      () => {
        if (!mounted.current) return;
        setCopied(true);
        announce(t('form.copied'));
      },
      () => {
        if (mounted.current) setByHand(true);
      },
    );
  };
  const remove = async (): Promise<boolean> => {
    setRemoveError(null);
    try {
      await api.del<void>(`/admin/feedback/${detail.id}`);
      setListNotice(t('feedbackReview.deleted'));
      // Back to the list it was opened from, if it was (leave): Back then goes on to the screen before the list.
      leave('/admin/feedback');
      return true;
    } catch (e) {
      if (mounted.current) setRemoveError(fail(e).message);
      return false;
    }
  };

  return (
    <Section id="actions" title={t('feedbackReview.actions')}>
      <RowButton icon={copied ? 'check' : 'copy'} label={t(copied ? 'form.copied' : 'feedbackReview.copy')} sub={t('feedbackReview.copySub')} onClick={copy} />
      {byHand && (
        <div className="card-pad">
          <CopyField label={t('feedbackReview.markdown')} value={markdown} multiline />
        </div>
      )}
      <ConfirmAction label={t('feedbackReview.delete')} icon="trash" question={t('feedbackReview.deleteQuestion')} detail={t('feedbackReview.deleteDetail')}
        confirmLabel={t('admin.deleteConfirm')} busyLabel={t('admin.deleting')} error={removeError} onCancel={() => setRemoveError(null)} onConfirm={remove} />
    </Section>
  );
}
