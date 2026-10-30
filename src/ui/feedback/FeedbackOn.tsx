/**
 * The feedback tool (docs/FEEDBACK-LOOP.md, step 1), for an account with feedback.give: a Feedback button floats over
 * every screen. It marks a part of the screen (tap or click an element, or drag a box), then a sheet (dialog on desktop)
 * takes the kind, a title and what should change, and sends it to the API (POST /feedback), which saves it for an admin
 * to review in Settings → Account → Feedback (feedback.review). Nothing goes to GitHub from here: an admin picks what
 * does. FeedbackTool.tsx loads it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import pkg from '../../../package.json';
import { buildIssue, FEEDBACK_DESCRIPTION_MAX, FEEDBACK_KINDS, showsNothing, type FeedbackKind, type FeedbackReport, type FeedbackSaved, type FeedbackTarget, type Rect } from '../../../shared/feedback';
import { api, type ApiError } from '../../api/client';
import { boxFrom, captureContext, describeElement, markableParts, partAt, targetFor, TOOL_ATTR } from '../../feedback/dom';
import { getLocale, hasMessage, t } from '../../i18n';
import { useAccount } from '../account';
import { Segmented } from '../components/Controls';
import { CopyField } from '../components/Form';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useBreakpoint, useLingering, useMediaQuery, useMounted } from '../hooks';
import { announce } from '../lib/announce';
import { errorMessage } from '../lib/apiErrors';
import { focusLost } from '../lib/screenFocus';
import { Link, useRoute, type Route } from '../router';
import { useStore } from '../store';

const tool = { [TOOL_ATTR]: '' };

/** A drag shorter than this is a tap or click on one element. */
const DRAG_PX = 8;

/**
 * Where the button's tab sits on a screen without the tab bar or header (feedback.css): higher up the edge while an
 * exercise is played, whose answers take the lower half of the screen and, on Scales, its middle; lower on a form on
 * its own, which sits at the top; else halfway down.
 */
function tabPlace(route: Route): string {
  if (route === '/play' || route === '/notes/play' || route === '/scales/play' || route === '/calibrate') return ' fb-fab--high';
  if (route === '/signin' || route.startsWith('/invite/') || route.startsWith('/reset/')) return ' fb-fab--low';
  return '';
}

type Step = 'idle' | 'marking' | 'form';

/**
 * A marked part: the target the report keeps, and its name as the form shows it, with the role in the language shown
 * (the report keeps it in English, as the issue it becomes is).
 */
interface Marked {
  target: FeedbackTarget;
  name: string;
}

/** A part's role in the language shown (feedback.role.*); one without a word of its own keeps the report's. */
const roleWord = (role: string): string => (hasMessage('feedback.role.' + role) ? t('feedback.role.' + role) : role);

/** An element marked (or a drawn box with it under its centre): the report's target, and the name the form shows. */
const markOf = (el: Element, area?: Rect): Marked => ({ target: targetFor(el, area), name: describeElement(el, roleWord) });

/** What the form holds as it is filled in. */
interface Draft {
  kind: FeedbackKind;
  title: string;
  description: string;
}
const EMPTY: Draft = { kind: 'change', title: '', description: '' };

/**
 * `onHide`: the account turns the button off on this device (Settings → Account turns it on again). `onOpen`: whether
 * the tool is open (marking, or the sheet), so FeedbackTool keeps it until it is closed.
 */
export function FeedbackOn({ onHide, onOpen }: { onHide(): void; onOpen?(open: boolean): void }): JSX.Element {
  const [step, setStep] = useState<Step>('idle');
  // Before the browser draws: closed once the account has gone, the tool goes without showing its button again.
  useLayoutEffect(() => onOpen?.(step !== 'idle'), [step]);
  const [marked, setMarked] = useState<Marked | null>(null);
  // Each mark gets a fresh form (the screen captured again, nothing sent yet); what was typed stays through Mark again,
  // and only a new report (the Feedback button, Mark another) starts empty.
  const [marks, setMarks] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // Marking again for the form being filled in: Cancel and Esc go back to it, with the spot it had.
  const [again, setAgain] = useState(false);
  const bp = useBreakpoint();
  const place = tabPlace(useRoute());
  const { shown, closing } = useLingering(step === 'form' ? marked : null, 240);
  // Closing the tool takes away the control that had the focus (Cancel, the form), and the Feedback button comes back
  // as a new element: the focus goes to it, so the keyboard and a screen reader keep their place. Only closing an open
  // tool asks for that: Esc on the button itself closes nothing, and a request left by it would move the focus after
  // Review it, which leaves the focus to the report.
  const fabRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const close = (): void => {
    if (step === 'marking' && again) {
      setStep('form');
      return;
    }
    if (step !== 'idle') refocus.current = true;
    setStep('idle');
  };
  const startMarking = (report: 'new' | 'same'): void => {
    if (report === 'new') setDraft(EMPTY);
    setAgain(report === 'same');
    setStep('marking');
  };
  useEffect(() => {
    if (step !== 'idle' || !refocus.current) return;
    refocus.current = false;
    fabRef.current?.focus({ preventScroll: true });
  }, [step]);
  // The desktop dialog stands beside the marked spot, on the side with more room, so the spot stays in view.
  // Esc closes the tool, also when focus has left it (the form's button went away after sending).
  useEffect(() => {
    if (step === 'idle') return;
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [step, again]);
  const spot = shown?.target.rect;
  const side = spot && bp === 'desktop' ? (spot.x + spot.width / 2 > window.innerWidth / 2 ? ' fb-root--left' : ' fb-root--right') : '';

  return (
    // Keys typed in the tool stay in it: exercise screens take letters and Space from the window (the pad, the piano).
    // Esc closes the tool.
    <div className={'fb-root' + side} {...tool} onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    }}>
      {step === 'idle' && (
        <button ref={fabRef} type="button" className={'fb-fab fb-fab--' + bp + place} aria-label={t('feedback.openLabel')} onClick={() => startMarking('new')}>
          <Icon name="feedback" size={20} />
          {/* Phone: the icon alone, so it hides less of the screen under it. */}
          {bp !== 'phone' && <span>{t('feedback.open')}</span>}
        </button>
      )}
      {step === 'marking' && (
        <MarkLayer
          onCancel={close}
          onMark={(m) => {
            setMarked(m);
            setMarks((n) => n + 1);
            setStep('form');
          }}
        />
      )}
      {shown && (
        <>
          <div className={'fb-spot' + (closing ? ' m-fade-out' : '')} style={boxStyle(shown.target.rect)} aria-hidden="true" />
          <Sheet variant={bp === 'desktop' ? 'dialog' : 'sheet'} closing={closing} panelKey="feedback" labelledBy="fb-title" maxWidth={bp === 'desktop' ? 480 : undefined}>
            <FeedbackForm key={marks} target={shown.target} name={shown.name} draft={draft} onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))} onClose={close}
              onLeave={() => setStep('idle')} onRemark={() => startMarking('same')} onAnother={() => startMarking('new')} onHide={onHide} />
          </Sheet>
        </>
      )}
    </div>
  );
}

const boxStyle = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.width, height: r.height });

/** How long after a drag its click may still come: a touch screen sends one for a drag shorter than its tap slop. */
const CLICK_AFTER_MS = 350;

/** Arrow keys and the way they step through the parts of the screen. */
const ARROWS: Record<string, 1 | -1> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/**
 * The marking layer over the whole screen: a mouse shows what a click would mark; a drag draws a box. The arrow keys
 * pick a part instead, which the hint bar names, and Enter marks it. The layer is modal: Tab keeps to Cancel and the
 * picked part. A tap on the hint bar moves it to the other edge, off what it was over.
 */
function MarkLayer({ onMark, onCancel }: { onMark(m: Marked): void; onCancel(): void }): JSX.Element {
  const [hover, setHover] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [picked, setPicked] = useState<Element | null>(null);
  const [low, setLow] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // A tap or click that went down and up on the layer itself: its click marks the spot.
  const tapped = useRef(false);
  // A drag's box, waiting for the end of its gesture.
  const dragged = useRef<{ marked: Marked; timer: number } | null>(null);
  const coarse = useMediaQuery('(pointer: coarse)');
  const layerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
    return () => window.clearTimeout(dragged.current?.timer);
  }, []);

  // A tap, a click or a drag marks once its gesture is over, on its click: marked as the pointer goes up, the form
  // would open under the finger, and the click that comes after it would press what lies there (its X, Bug, Hide the
  // feedback button) or take the focus from the description. A mouse sends that click after a drag too, and a touch
  // screen after one shorter than its tap slop; after a longer one, which has none, the box is marked a moment later.
  const markDragged = (): void => {
    const d = dragged.current;
    if (!d) return;
    dragged.current = null;
    window.clearTimeout(d.timer);
    onMark(d.marked);
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    // Another press while a box waits: its click marks the box.
    if (dragged.current) return;
    start.current = { x: e.clientX, y: e.clientY };
    tapped.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const a = start.current;
    const p = { x: e.clientX, y: e.clientY };
    if (a && Math.hypot(p.x - a.x, p.y - a.y) >= DRAG_PX) {
      setDrag(boxFrom(a, p));
      setHover(null);
    } else if (!a && e.pointerType === 'mouse') {
      const el = partAt(p.x, p.y);
      setHover(el ? el.getBoundingClientRect() : null);
      setPicked(null);
    }
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const a = start.current;
    start.current = null;
    if (!a) return;
    const box = boxFrom(a, { x: e.clientX, y: e.clientY });
    if (box.width >= DRAG_PX || box.height >= DRAG_PX) {
      const el = partAt(box.x + box.width / 2, box.y + box.height / 2) ?? document.querySelector('main') ?? document.body;
      setDrag(box);
      dragged.current = { marked: markOf(el, box), timer: window.setTimeout(markDragged, CLICK_AFTER_MS) };
      return;
    }
    tapped.current = true;
  };
  const click = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (dragged.current) {
      markDragged();
      return;
    }
    if (!tapped.current) return;
    tapped.current = false;
    const el = partAt(e.clientX, e.clientY);
    if (el) onMark(markOf(el));
    else setDrag(null);
  };

  const pick = (by: 1 | -1): void => {
    const parts = markableParts();
    if (parts.length === 0) return;
    const i = picked ? parts.indexOf(picked) : -1;
    const next = parts[i < 0 ? (by > 0 ? 0 : parts.length - 1) : (i + by + parts.length) % parts.length];
    next.scrollIntoView?.({ block: 'nearest' });
    const r = next.getBoundingClientRect();
    // The bar goes to the other edge when it is over the part.
    const bar = barRef.current?.getBoundingClientRect();
    if (bar && r.bottom > bar.top && r.top < bar.bottom) setLow((v) => !v);
    setPicked(next);
    setHover(r);
    layerRef.current?.focus({ preventScroll: true });
  };
  const keys = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const toLayer = picked && document.activeElement === cancelRef.current;
      (toLayer ? layerRef.current : cancelRef.current)?.focus({ preventScroll: true });
    } else if (ARROWS[e.key]) {
      e.preventDefault();
      pick(ARROWS[e.key]);
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === layerRef.current && picked) {
      e.preventDefault();
      onMark(markOf(picked));
    }
  };

  const box = drag ?? hover;
  return (
    <div ref={layerRef} className="fb-layer" role="dialog" aria-modal="true" aria-labelledby="fb-hint" tabIndex={-1} onPointerDown={down}
      onPointerMove={move} onPointerUp={up} onClick={click} onKeyDown={keys} onPointerLeave={() => !start.current && setHover(null)}>
      <div ref={barRef} className={'fb-bar m-in' + (low ? ' fb-bar--low' : '')} onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()} onClick={(e) => !(e.target as Element).closest('button') && setLow((v) => !v)}>
        <span className="fb-bar-text">
          <span id="fb-hint">{t(coarse ? 'feedback.markHintTouch' : 'feedback.markHint')}</span>
          <span className="fb-bar-pick" aria-live="polite">
            {picked ? describeElement(picked, roleWord) : ''}
          </span>
        </span>
        <button ref={cancelRef} type="button" className="small-btn" onClick={onCancel}>
          {t('feedback.cancel')}
        </button>
      </div>
      {box && <div className={'fb-box' + (drag ? ' fb-box--drag' : '')} style={boxStyle(box)} aria-hidden="true" />}
    </div>
  );
}

function FeedbackForm({ target, name, draft, onDraft, onClose, onLeave, onRemark, onAnother, onHide }: {
  target: FeedbackTarget;
  /** The marked part's name in the language shown. */
  name: string;
  /** What is typed, kept by the tool so that Mark again keeps it. */
  draft: Draft;
  onDraft(patch: Partial<Draft>): void;
  onClose(): void;
  /** Closes the tool for another screen (Review it, Sign in), which takes the focus itself. */
  onLeave(): void;
  /** Mark again: another spot for this report. */
  onRemark(): void;
  /** Mark another: a new report, once this one is sent. */
  onAnother(): void;
  onHide(): void;
}): JSX.Element {
  const account = useAccount();
  const { state } = useStore();
  const route = useRoute();
  const { kind, title, description } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<FeedbackSaved | null>(null);
  const [copied, setCopied] = useState(false);
  // No clipboard (an old browser, or not allowed): the Markdown is shown to copy by hand.
  const [byHand, setByHand] = useState(false);
  // The screen as it was when the spot was marked, not as it is once the sheet is open.
  const [context] = useState(() =>
    captureContext({ version: pkg.version, route, themeSetting: state.prefs.theme, locale: getLocale(), prefs: state.prefs }),
  );
  const report: FeedbackReport = { kind, title, description, target, context };
  // Only spaces, or a zero-width space pasted in, say nothing: the API refuses that.
  const ready = !showsNothing(description);
  // The session ended meanwhile (a new password on another device) and Send signed out: Send could only fail again, so
  // Sign in takes its place.
  const signedOut = error?.code === 'unauthenticated' && !account.me;
  const actionsRef = useRef<HTMLDivElement>(null);
  // Send took the focus with it: it goes on to Sign in, so it stays in the sheet.
  useEffect(() => {
    if (signedOut && focusLost()) actionsRef.current?.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
  }, [signedOut]);
  const mounted = useMounted();
  const issue = buildIssue(report);
  const markdown = `# ${issue.title}\n\n${issue.body}`;
  // Copied for 2 s, as every Copy in the app; and Copy again as soon as the report changes, which the clipboard does not.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => setCopied(false), [kind, title, description]);

  const send = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<FeedbackSaved>('/feedback', report);
      if (mounted.current) setSaved(res);
    } catch (e) {
      if (mounted.current) setError(account.handleError(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

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
        announce(t('feedback.copied'));
      },
      () => {
        if (mounted.current) setByHand(true);
      },
    );
  };

  if (saved) {
    return (
      <>
        <div className="sheet-head">
          <h2 id="fb-title" className="sheet-title">
            {t('feedback.saved')}
          </h2>
          <p className="sheet-text muted-text">{t('feedback.savedText')}</p>
        </div>
        {/* Someone who reviews feedback too opens it there; the tool closes, as the report's screen replaces this one. */}
        {account.can('feedback.review') && (
          <Link to={`/admin/feedback/${saved.id}`} className="btn btn--outline" onClick={onLeave}>
            {t('feedback.review')}
          </Link>
        )}
        <div className="fb-actions">
          <button type="button" className="btn btn--outline" onClick={onAnother}>
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
          <span className="mono-muted">{name}</span>
        </span>
        <button type="button" className="small-btn" onClick={onRemark}>
          {t('feedback.markAgain')}
        </button>
      </div>
      <Segmented<FeedbackKind> label={t('feedback.kindGroup')} value={kind} onChange={(k) => onDraft({ kind: k })}
        options={FEEDBACK_KINDS.map((k) => ({ value: k, label: t('feedback.kind.' + k) }))} />
      <label className="field">
        <span className="fb-label">{t('feedback.descLabel')}</span>
        <textarea className="fb-input fb-input--area" rows={4} value={description} maxLength={FEEDBACK_DESCRIPTION_MAX} data-autofocus
          placeholder={t('feedback.descPlaceholder')} onChange={(e) => onDraft({ description: e.target.value })} />
      </label>
      <label className="field">
        <span className="fb-label">{t('feedback.titleLabel')}</span>
        <input className="fb-input" type="text" value={title} maxLength={120} placeholder={t('feedback.titlePlaceholder')} onChange={(e) => onDraft({ title: e.target.value })} />
      </label>
      <p className="sheet-note">{t('feedback.attached')}</p>
      {byHand && <CopyField label={t('feedback.markdown')} value={markdown} multiline />}
      {/* The form stays as it is: Send tries again. */}
      {error && (
        <div className="fb-error" role="alert">
          <p>{errorMessage(error)}</p>
        </div>
      )}
      <div className="fb-actions" ref={actionsRef}>
        <button type="button" className="btn btn--outline" disabled={!ready} onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
          {t(copied ? 'feedback.copied' : 'feedback.copy')}
        </button>
        {signedOut ? (
          // The tool closes, as Sign in replaces the screen, and Sign in says nothing was changed: also over Settings,
          // which put that away as the refusal came.
          <Link to="/signin" className="btn btn--accent" onClick={() => {
            account.setNotice('sessionEnded');
            onLeave();
          }}>
            {t('signIn.title')}
          </Link>
        ) : !ready ? (
          <button type="button" className="btn btn--blocked" disabled>
            {t('feedback.send')}
          </button>
        ) : (
          // aria-disabled while it sends, not disabled: that would drop the focus out of the sheet, also after a failure.
          <button type="button" className="btn btn--accent" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void send()}>
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
