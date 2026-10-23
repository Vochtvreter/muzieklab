/**
 * The feedback tool (docs/FEEDBACK-LOOP.md, step 1): in feedback mode a Feedback button floats over every screen. It
 * marks a part of the screen (tap or click an element, or drag a box), then a sheet (dialog on desktop) takes the kind,
 * a title and what should change, and sends it as a GitHub issue: with the device's token, or as a prefilled issue
 * page. Nothing shows until an administrator turns feedback mode on (feedback/admin.ts).
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import pkg from '../../../package.json';
import { createIssue, loadAdmin, saveAdmin, switchFrom, withoutSwitch, type FeedbackAdmin, type SendResult } from '../../feedback/admin';
import { boxFrom, captureContext, elementAt, targetFor, TOOL_ATTR } from '../../feedback/dom';
import { buildIssue, FEEDBACK_KINDS, FEEDBACK_REPO, newIssueUrl, type FeedbackKind, type FeedbackReport, type FeedbackTarget, type Rect } from '../../feedback/report';
import { getLocale, t } from '../../i18n';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useBreakpoint, useLingering, useMediaQuery } from '../hooks';
import { useRoute } from '../router';
import { useStore } from '../store';

const tool = { [TOOL_ATTR]: '' };

/** A drag shorter than this is a tap or click on one element. */
const DRAG_PX = 8;

export function FeedbackTool(): JSX.Element | null {
  const [admin, setAdmin] = useState<FeedbackAdmin>(loadAdmin);

  // ?feedback=on|off switches the mode on this device, then leaves the address.
  useEffect(() => {
    const check = (): void => {
      const on = switchFrom(window.location.search, window.location.hash);
      if (on === null) return;
      setAdmin((a) => {
        const next = { ...a, enabled: on };
        saveAdmin(next);
        return next;
      });
      window.history.replaceState(window.history.state, '', withoutSwitch(window.location.href));
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);

  const update = (next: FeedbackAdmin): void => {
    saveAdmin(next);
    setAdmin(next);
  };
  return admin.enabled ? <FeedbackOn admin={admin} onAdmin={update} /> : null;
}

type Step = 'idle' | 'marking' | 'form';

function FeedbackOn({ admin, onAdmin }: { admin: FeedbackAdmin; onAdmin(a: FeedbackAdmin): void }): JSX.Element {
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
            <FeedbackForm key={marks} target={shown} admin={admin} onAdmin={onAdmin} onClose={() => setStep('idle')} onRemark={() => setStep('marking')} />
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

type Sent = { via: 'api'; number: number; url: string } | { via: 'link' };

function FeedbackForm({ target, admin, onAdmin, onClose, onRemark }: {
  target: FeedbackTarget;
  admin: FeedbackAdmin;
  onAdmin(a: FeedbackAdmin): void;
  onClose(): void;
  onRemark(): void;
}): JSX.Element {
  const { state } = useStore();
  const route = useRoute();
  const [kind, setKind] = useState<FeedbackKind>('change');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Extract<SendResult, { ok: false }>['reason'] | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);
  // The screen as it was when the spot was marked, not as it is once the sheet is open.
  const [context] = useState(() =>
    captureContext({ version: pkg.version, route, themeSetting: state.prefs.theme, locale: getLocale(), prefs: state.prefs }),
  );
  const report: FeedbackReport = { kind, title, description, target, context: { ...context, url: withoutSwitch(context.url) } };
  const ready = description.trim().length > 0;

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await createIssue(buildIssue(report), admin.token);
    setBusy(false);
    if (res.ok) setSent({ via: 'api', number: res.number, url: res.url });
    else setError(res.reason);
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
            {sent.via === 'api' ? t('feedback.sent', { number: sent.number }) : t('feedback.linkOpened')}
          </h2>
          <p className="sheet-text muted-text">{t(sent.via === 'api' ? 'feedback.sentText' : 'feedback.linkText')}</p>
        </div>
        {sent.via === 'api' && (
          <a className="btn btn--outline" href={sent.url} target="_blank" rel="noopener noreferrer">
            {t('feedback.view')}
          </a>
        )}
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
        <p className="fb-error" role="alert">
          {t('feedback.error.' + error)}
        </p>
      )}
      <div className="fb-actions">
        <button type="button" className="btn btn--outline" disabled={!ready} onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
          {t(copied ? 'feedback.copied' : 'feedback.copy')}
        </button>
        {!ready ? (
          <button type="button" className="btn btn--blocked" disabled>
            {t(admin.token ? 'feedback.send' : 'feedback.openGithub')}
          </button>
        ) : admin.token ? (
          <button type="button" className="btn btn--accent" disabled={busy} onClick={() => void send()}>
            {t(busy ? 'feedback.sending' : 'feedback.send')}
          </button>
        ) : (
          <a className="btn btn--accent" href={newIssueUrl(report)} target="_blank" rel="noopener noreferrer" onClick={() => setSent({ via: 'link' })}>
            {t('feedback.openGithub')}
          </a>
        )}
      </div>
      <TokenBox admin={admin} onAdmin={onAdmin} />
    </>
  );
}

/** Send straight from the app: the GitHub token, kept on this device; and turning feedback mode off. */
function TokenBox({ admin, onAdmin }: { admin: FeedbackAdmin; onAdmin(a: FeedbackAdmin): void }): JSX.Element {
  const [token, setToken] = useState('');
  return (
    <details className="fb-more">
      <summary>{t('feedback.connection')}</summary>
      <div className="fb-more-body">
        {admin.token ? (
          <div className="fb-marked">
            <span className="fb-marked-text">{t('feedback.tokenSaved')}</span>
            <button type="button" className="small-btn" onClick={() => onAdmin({ ...admin, token: '' })}>
              {t('feedback.forget')}
            </button>
          </div>
        ) : (
          <label className="field">
            <span className="fb-label">{t('feedback.tokenLabel')}</span>
            <span className="fb-token">
              <input className="fb-input" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
              <button type="button" className="small-btn" disabled={!token.trim()} onClick={() => onAdmin({ ...admin, token: token.trim() })}>
                {t('feedback.save')}
              </button>
            </span>
            <span className="sheet-note">{t('feedback.tokenHint', { repo: FEEDBACK_REPO })}</span>
          </label>
        )}
        <button type="button" className="fb-off" onClick={() => onAdmin({ ...admin, enabled: false })}>
          {t('feedback.turnOff')}
        </button>
      </div>
    </details>
  );
}
