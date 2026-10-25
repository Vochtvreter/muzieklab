/**
 * The feedback tool (docs/FEEDBACK-LOOP.md, step 1), for an account with feedback.give: a Feedback button floats over
 * every screen. It marks a part of the screen (tap or click an element, or drag a box), then a sheet (dialog on desktop)
 * takes the kind, a title and what should change, and sends it to the API (POST /feedback), which opens the GitHub
 * issue with its own token. FeedbackTool.tsx loads it.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import pkg from '../../../package.json';
import type { FeedbackSent } from '../../../shared/api';
import { buildIssue, FEEDBACK_KINDS, newIssueUrl, type FeedbackKind, type FeedbackReport, type FeedbackTarget, type Rect } from '../../../shared/feedback';
import { api, type ApiError } from '../../api/client';
import { boxFrom, captureContext, elementAt, targetFor, TOOL_ATTR } from '../../feedback/dom';
import { getLocale, t } from '../../i18n';
import { useAccount } from '../account';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useBreakpoint, useLingering, useMediaQuery, useMounted } from '../hooks';
import { errorMessage } from '../lib/apiErrors';
import { useRoute } from '../router';
import { useStore } from '../store';

const tool = { [TOOL_ATTR]: '' };

/** A drag shorter than this is a tap or click on one element. */
const DRAG_PX = 8;

type Step = 'idle' | 'marking' | 'form';

/** `onHide`: the account turns the button off on this device (Settings → Account turns it on again). */
export function FeedbackOn({ onHide }: { onHide(): void }): JSX.Element {
  const [step, setStep] = useState<Step>('idle');
  const [target, setTarget] = useState<FeedbackTarget | null>(null);
  // Each mark gets a fresh form.
  const [marks, setMarks] = useState(0);
  const bp = useBreakpoint();
  const { shown, closing } = useLingering(step === 'form' ? target : null, 240);
  // The desktop dialog stands beside the marked spot, on the side with more room, so the spot stays in view.
  // Esc closes the tool, also when focus has left it (the form's button went away after sending).
  useEffect(() => {
    if (step === 'idle') return;
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setStep('idle');
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [step]);
  const side = shown && bp === 'desktop' ? (shown.rect.x + shown.rect.width / 2 > window.innerWidth / 2 ? ' fb-root--left' : ' fb-root--right') : '';

  return (
    // Keys typed in the tool stay in it: exercise screens take letters and Space from the window (the pad, the piano).
    // Esc closes the tool.
    <div className={'fb-root' + side} {...tool} onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape') setStep('idle');
    }}>
      {step === 'idle' && (
        <button type="button" className={'fb-fab fb-fab--' + bp} aria-label={t('feedback.openLabel')} onClick={() => setStep('marking')}>
          <Icon name="feedback" size={20} />
          {/* Phone: the icon alone, so it hides less of the screen under it. */}
          {bp !== 'phone' && <span>{t('feedback.open')}</span>}
        </button>
      )}
      {step === 'marking' && (
        <MarkLayer
          onCancel={() => setStep('idle')}
          onMark={(tg) => {
            setTarget(tg);
            setMarks((n) => n + 1);
            setStep('form');
          }}
        />
      )}
      {shown && (
        <>
          <div className={'fb-spot' + (closing ? ' m-fade-out' : '')} style={boxStyle(shown.rect)} aria-hidden="true" />
          <Sheet variant={bp === 'desktop' ? 'dialog' : 'sheet'} closing={closing} panelKey="feedback" labelledBy="fb-title" maxWidth={bp === 'desktop' ? 480 : undefined}>
            <FeedbackForm key={marks} target={shown} onClose={() => setStep('idle')} onRemark={() => setStep('marking')} onHide={onHide} />
          </Sheet>
        </>
      )}
    </div>
  );
}

const boxStyle = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.width, height: r.height });

/** The marking layer over the whole screen: a mouse shows what a click would mark; a drag draws a box. */
function MarkLayer({ onMark, onCancel }: { onMark(t: FeedbackTarget): void; onCancel(): void }): JSX.Element {
  const [hover, setHover] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const coarse = useMediaQuery('(pointer: coarse)');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
  }, []);

  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    start.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const a = start.current;
    const p = { x: e.clientX, y: e.clientY };
    if (a && Math.hypot(p.x - a.x, p.y - a.y) >= DRAG_PX) {
      setDrag(boxFrom(a, p));
      setHover(null);
    } else if (!a && e.pointerType === 'mouse') {
      const el = elementAt(p.x, p.y);
      setHover(el ? el.getBoundingClientRect() : null);
    }
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const a = start.current;
    start.current = null;
    if (!a) return;
    const box = boxFrom(a, { x: e.clientX, y: e.clientY });
    if (box.width >= DRAG_PX || box.height >= DRAG_PX) {
      const el = elementAt(box.x + box.width / 2, box.y + box.height / 2) ?? document.querySelector('main') ?? document.body;
      onMark(targetFor(el, box));
      return;
    }
    const el = elementAt(e.clientX, e.clientY);
    if (el) onMark(targetFor(el));
    else setDrag(null);
  };

  const box = drag ?? hover;
  return (
    <div className="fb-layer" role="dialog" aria-modal="true" aria-labelledby="fb-hint" onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerLeave={() => !start.current && setHover(null)}>
      <div className="fb-bar m-in" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <span id="fb-hint" className="fb-bar-text">{t(coarse ? 'feedback.markHintTouch' : 'feedback.markHint')}</span>
        <button ref={cancelRef} type="button" className="small-btn" onClick={onCancel}>
          {t('feedback.cancel')}
        </button>
      </div>
      {box && <div className={'fb-box' + (drag ? ' fb-box--drag' : '')} style={boxStyle(box)} aria-hidden="true" />}
    </div>
  );
}

/** Codes for which GitHub's own new-issue page is the way out: the server cannot send now, but the admin can. */
const LINK_INSTEAD = new Set(['feedback_unavailable', 'feedback_failed', 'unavailable', 'internal']);

function FeedbackForm({ target, onClose, onRemark, onHide }: {
  target: FeedbackTarget;
  onClose(): void;
  onRemark(): void;
  onHide(): void;
}): JSX.Element {
  const account = useAccount();
  const { state } = useStore();
  const route = useRoute();
  const [kind, setKind] = useState<FeedbackKind>('change');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sent, setSent] = useState<FeedbackSent | null>(null);
  const [copied, setCopied] = useState(false);
  // The screen as it was when the spot was marked, not as it is once the sheet is open.
  const [context] = useState(() =>
    captureContext({ version: pkg.version, route, themeSetting: state.prefs.theme, locale: getLocale(), prefs: state.prefs }),
  );
  const report: FeedbackReport = { kind, title, description, target, context };
  const ready = description.trim().length > 0;
  const mounted = useMounted();

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<FeedbackSent>('/feedback', report);
      if (mounted.current) setSent(res);
    } catch (e) {
      if (mounted.current) setError(account.handleError(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const copy = (): void => {
    const d = buildIssue(report);
    navigator.clipboard
      ?.writeText(`# ${d.title}\n\n${d.body}`)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  if (sent) {
    return (
      <>
        <div className="sheet-head">
          <h2 id="fb-title" className="sheet-title">
            {t('feedback.sent', { number: sent.number })}
          </h2>
          <p className="sheet-text muted-text">{t('feedback.sentText')}</p>
        </div>
        <a className="btn btn--outline" href={sent.url} target="_blank" rel="noopener noreferrer">
          {t('feedback.view')}
        </a>
        <div className="fb-actions">
          <button type="button" className="btn btn--outline" onClick={onRemark}>
            {t('feedback.another')}
          </button>
          {/* The sheet stays open, so its first focus does not run again: Close takes the focus from the gone Send. */}
          <button type="button" className="btn btn--accent" autoFocus onClick={onClose}>
            {t('feedback.close')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="sheet-head fb-head">
        <h2 id="fb-title" className="sheet-title">
          {t('feedback.title')}
        </h2>
        <button type="button" className="icon-btn fb-close" aria-label={t('feedback.close')} onClick={onClose}>
          <Icon name="close" size={22} />
        </button>
      </div>
      <div className="fb-marked">
        <span className="fb-marked-text">
          <b>{t(target.mode === 'area' ? 'feedback.markedArea' : 'feedback.marked')}</b>
          <span className="mono-muted">{target.label}</span>
        </span>
        <button type="button" className="small-btn" onClick={onRemark}>
          {t('feedback.markAgain')}
        </button>
      </div>
      <Segmented<FeedbackKind> label={t('feedback.kindGroup')} value={kind} onChange={setKind} options={FEEDBACK_KINDS.map((k) => ({ value: k, label: t('feedback.kind.' + k) }))} />
      <label className="field">
        <span className="fb-label">{t('feedback.descLabel')}</span>
        <textarea className="fb-input fb-input--area" rows={4} value={description} data-autofocus placeholder={t('feedback.descPlaceholder')}
          onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        <span className="fb-label">{t('feedback.titleLabel')}</span>
        <input className="fb-input" type="text" value={title} maxLength={120} placeholder={t('feedback.titlePlaceholder')} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <p className="sheet-note">{t('feedback.attached')}</p>
      {error && (
        <div className="fb-error" role="alert">
          <p>{errorMessage(error)}</p>
          {LINK_INSTEAD.has(error.code) && (
            // Opens GitHub's own new-issue page, filled in: the admin presses Create there, signed in to GitHub.
            <a href={newIssueUrl(report)} target="_blank" rel="noopener noreferrer">
              {t('feedback.openGithub')}
            </a>
          )}
        </div>
      )}
      <div className="fb-actions">
        <button type="button" className="btn btn--outline" disabled={!ready} onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
          {t(copied ? 'feedback.copied' : 'feedback.copy')}
        </button>
        {!ready ? (
          <button type="button" className="btn btn--blocked" disabled>
            {t('feedback.send')}
          </button>
        ) : (
          <button type="button" className="btn btn--accent" disabled={busy} onClick={() => void send()}>
            {t(busy ? 'feedback.sending' : 'feedback.send')}
          </button>
        )}
      </div>
      <button type="button" className="fb-off" onClick={onHide}>
        {t('feedback.hide')}
      </button>
    </>
  );
}
