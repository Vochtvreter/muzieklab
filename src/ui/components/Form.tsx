/**
 * Form controls for the account and admin screens. No board draws them yet (map-designs: none on either canvas); they
 * take the foundations' field vocabulary: a paper field with a 1.5 px border, radius 14, at least 48 px tall, a
 * 14.5 px bold label above, a 12.5 px muted hint under it, and errors in the miss ink with an icon. The border is
 * --field-line (tokens.css), not the foundations' --line: --line is 1.2–1.4:1, under WCAG 1.4.11's 3:1. Text is 16 px so
 * iOS does not zoom in on focus; the gold focus ring is base.css's `:focus-visible` rule.
 *
 * Forms are real <form onSubmit> elements, so Enter submits. The submit button (SubmitButton) shows a busy label and
 * does nothing while the request runs. A field error goes in the field's `error` (only what is wrong with what was typed
 * there); anything else, a network or server failure too, in a FormError. Both are announced (role="alert"), and a
 * field's error is also its description (aria-describedby, with aria-invalid), read again when the field gets focus.
 *
 * A button here that is busy, or has nothing to do, is aria-disabled, not disabled: a disabled button that has the focus
 * drops it to the page (Chromium), where a screen reader loses its place and Escape reaches no confirm.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import type { AccountStatus } from '../../../shared/api';
import { t } from '../../i18n';
import { useMounted } from '../hooks';
import { announce } from '../lib/announce';
import { focusHeading, focusLost } from '../lib/screenFocus';
import { SwitchTrack } from './Controls';
import { Icon, type IconName } from './Icon';

interface FieldProps {
  /** The label above the field; also its accessible name. */
  label: string;
  /** A help line under the field (12.5 px, muted): the password rules, a format. Linked with aria-describedby. */
  hint?: ReactNode;
  /**
   * What is wrong with what was typed here (miss ink, with an icon): announced when it appears (role="alert"), and read
   * with the field (aria-describedby, aria-invalid). Not for a failed request: that is the form's FormError.
   */
  error?: string | null;
  /** The input's id; a generated one by default. */
  id?: string;
  /** An extra class on the field's wrapper (`.tfield`). */
  className?: string;
}

/** The label, the control, the hint and the error, wired with ids. */
function FieldShell({ id, label, hint, error, className, children }: FieldProps & { id: string; children(describedBy: string | undefined): ReactNode }): JSX.Element {
  const hintId = hint ? id + '-hint' : undefined;
  const errorId = error ? id + '-error' : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={'tfield' + (className ? ' ' + className : '')}>
      <label htmlFor={id} className="tfield-label">
        {label}
      </label>
      {children(describedBy)}
      {error && (
        <span id={errorId} className="tfield-error m-in" role="alert">
          <Icon name="alert" size={16} strokeWidth={2.2} />
          <span>{error}</span>
        </span>
      )}
      {hint && (
        <span id={hintId} className="tfield-hint">
          {hint}
        </span>
      )}
    </div>
  );
}

export interface TextFieldProps extends FieldProps {
  value: string;
  onChange?(value: string): void;
  /** text (default), email, search or date (yyyy-mm-dd, e.g. premium's end). */
  type?: 'text' | 'email' | 'search' | 'date';
  /** The browser's autofill hint: 'name', 'email', 'username', 'off'… */
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  enterKeyHint?: HTMLAttributes<HTMLInputElement>['enterKeyHint'];
  name?: string;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  /** For type date: the earliest and latest day (yyyy-mm-dd). */
  min?: string;
  max?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/** A labelled one-line text field (text, email, search or date). */
export function TextField(props: TextFieldProps): JSX.Element {
  const auto = useId();
  const { id = auto, value, onChange, type = 'text', autoComplete, inputMode, enterKeyHint, name, placeholder, readOnly, disabled, required, autoFocus, maxLength, min, max, inputRef, error } = props;
  // Email addresses: no capital at the start, no spelling fixes.
  const plain = type === 'email' || autoComplete === 'username' || autoComplete === 'email';
  return (
    <FieldShell {...props} id={id}>
      {(describedBy) => (
        <input id={id} ref={inputRef} className="tfield-input" type={type} value={value}
          onChange={(e) => onChange?.(e.target.value)} autoComplete={autoComplete} inputMode={inputMode} enterKeyHint={enterKeyHint} name={name}
          placeholder={placeholder} readOnly={readOnly} disabled={disabled} required={required} autoFocus={autoFocus} maxLength={maxLength} min={min} max={max}
          autoCapitalize={plain ? 'none' : undefined} autoCorrect={plain ? 'off' : undefined} spellCheck={plain ? false : undefined}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      )}
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends FieldProps {
  value: string;
  onChange(value: string): void;
  name?: string;
  /** In UTF-16 units, as the browser counts; the API counts characters, so it never refuses what fits here. */
  maxLength?: number;
  /** The rows it shows before it scrolls (3 by default); it can be made taller by hand. */
  rows?: number;
  disabled?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
}

/** A labelled text area: text over several lines, such as feedback (Delete account). */
export function TextAreaField(props: TextAreaFieldProps): JSX.Element {
  const auto = useId();
  const { id = auto, value, onChange, name, maxLength, rows = 3, disabled, inputRef, error } = props;
  return (
    <FieldShell {...props} id={id}>
      {(describedBy) => (
        <textarea id={id} ref={inputRef} className="tfield-input tfield-input--area" value={value} onChange={(e) => onChange(e.target.value)} name={name}
          maxLength={maxLength} rows={rows} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      )}
    </FieldShell>
  );
}

export interface PasswordFieldProps extends FieldProps {
  value: string;
  onChange(value: string): void;
  /** current-password to sign in or confirm a change; new-password to choose one (password managers offer to save it). */
  autoComplete: 'current-password' | 'new-password';
  name?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

/** A password field with a Show / Hide button inside it (its name says what it does: "Show password"). */
export function PasswordField(props: PasswordFieldProps): JSX.Element {
  const auto = useId();
  const { id = auto, value, onChange, autoComplete, name, required, disabled, autoFocus, inputRef, error } = props;
  const [shown, setShown] = useState(false);
  return (
    <FieldShell {...props} id={id}>
      {(describedBy) => (
        <span className="tfield-box">
          <input id={id} ref={inputRef} className="tfield-input tfield-input--password" type={shown ? 'text' : 'password'} value={value}
            onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} name={name} required={required} disabled={disabled} autoFocus={autoFocus}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
          <button type="button" className="tfield-toggle" aria-controls={id} disabled={disabled} onClick={() => setShown((s) => !s)}
            aria-label={t(shown ? 'form.hidePassword' : 'form.showPassword')}>
            {t(shown ? 'form.hide' : 'form.show')}
          </button>
        </span>
      )}
    </FieldShell>
  );
}

/**
 * The hidden username a new-password form carries, so a password manager saves the new password for the right
 * account (the email is shown in the form's text; this field is not focusable or announced).
 */
export function HiddenUsername({ email }: { email: string }): JSX.Element {
  return <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />;
}

/** A message for the whole form (role="alert", miss colours, fades in like other feedback). Renders nothing for null. */
export function FormError({ error, id }: { error: string | null | undefined; id?: string }): JSX.Element | null {
  if (!error) return null;
  return (
    <div id={id} className="form-error m-in" role="alert">
      <Icon name="alert" size={18} strokeWidth={2.2} />
      <span>{error}</span>
    </div>
  );
}

/**
 * A request that found nothing to show (no answer, a server error): the message and Try again. Try again is the screen's
 * filled button, unless `quiet` (another filled button is on the screen). What Try again brings (a loading line, then
 * the screen) takes this one's place, and its button the focus with it: the screen's heading takes the focus then, as on
 * a new screen, unless what came took it (a field).
 */
export function ErrorRetry({ error, onRetry, quiet }: { error: string; onRetry(): void; quiet?: boolean }): JSX.Element {
  const pressed = useRef(false);
  useEffect(
    () => () => {
      if (pressed.current && focusLost()) focusHeading();
    },
    [],
  );
  return (
    <div className="acct-message">
      <FormError error={error} />
      <button type="button" className={'btn ' + (quiet ? 'btn--outline' : 'btn--accent')} onClick={() => {
        pressed.current = true;
        onRetry();
      }}>
        {t('common.tryAgain')}
      </button>
    </div>
  );
}

/**
 * A done message (a green check): "Password changed. …". Renders nothing without a text. It is read out once, when it
 * appears, by the app's one live region (ui/lib/announce.ts), not as a role="status" of its own: one inserted already
 * holding its text is not read by every screen reader, and the button that was pressed is somewhere else or gone.
 * `live={false}` where the screen announces it itself (the accounts list's line after Cancel invite).
 */
export function FormDone({ children, live = true }: { children: string | null | undefined; live?: boolean }): JSX.Element | null {
  useEffect(() => {
    if (live && children) announce(children);
  }, [children, live]);
  if (!children) return null;
  return (
    <div className="form-done m-in">
      <Icon name="check" size={18} strokeWidth={2.6} className="tone-good" />
      <span>{children}</span>
    </div>
  );
}

export interface SubmitButtonProps {
  /** The verb ("Sign in"). */
  label: string;
  /** Shown while `busy` ("Signing in…"). */
  busyLabel: string;
  busy: boolean;
  /** accent: the screen's one filled button (default); tonal: a soft accent button for a card's own small form;
   * outline: a secondary button. */
  variant?: 'accent' | 'tonal' | 'outline';
  disabled?: boolean;
  className?: string;
}

/**
 * The submit button of a form: labelled busy while the request runs. Busy or disabled (a Save once saved), it sends
 * nothing, also for Enter in a field, which presses it.
 */
export function SubmitButton({ label, busyLabel, busy, variant = 'accent', disabled, className }: SubmitButtonProps): JSX.Element {
  const look = variant === 'accent' ? 'btn btn--accent' : variant === 'outline' ? 'btn btn--outline' : 'small-btn small-btn--tonal';
  const off = busy || !!disabled;
  return (
    <button type="submit" className={look + (className ? ' ' + className : '')} aria-disabled={off || undefined} aria-busy={busy || undefined}
      onClick={(e) => {
        if (off) e.preventDefault();
      }}>
      {busy ? busyLabel : label}
    </button>
  );
}

/** Calls `fn` on submit without the page reload, unless `busy`. */
export function onSubmit(fn: () => void, busy = false): (e: FormEvent) => void {
  return (e) => {
    e.preventDefault();
    if (!busy) fn();
  };
}

export interface CopyFieldProps {
  /** The label above the value ("Invite link", "Message"). */
  label: string;
  /** What is shown and copied. */
  value: string;
  /** A message over several lines (a read-only text area) instead of a one-line link. */
  multiline?: boolean;
  /** The button's words ("Copy link"); "Copy" by default. They change to "Copied" with a check for 2 s. */
  copyLabel?: string;
  hint?: ReactNode;
  id?: string;
}

/**
 * A read-only value (a link, a ready-made message) with a Copy button, like Results' Copy code. Without the clipboard
 * API (an old browser, or not allowed), the text is selected instead, and a line says to copy it by hand.
 */
export function CopyField({ label, value, multiline, copyLabel, hint, id: given }: CopyFieldProps): JSX.Element {
  const auto = useId();
  const id = given ?? auto;
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'selected'>('idle');
  useEffect(() => {
    if (state !== 'copied') return;
    const timer = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => setState('idle'), [value]);
  // "Selected. Copy it …" is read out as the focus lands on the selected text, through the app's one live region
  // (ui/lib/announce.ts): a role="status" put in already holding its text is not read by every screen reader, and the
  // field's description is its own hint.
  useEffect(() => {
    if (state === 'selected') announce(t('form.selected'));
  }, [state]);

  // A message is shown whole: the text area grows to its text, again when the width changes or the font arrives.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!multiline || !el) return;
    const fit = (): void => {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + 'px';
    };
    fit();
    let width = el.clientWidth;
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            fit();
          });
    ro?.observe(el);
    void document.fonts?.ready.then(fit);
    return () => ro?.disconnect();
  }, [multiline, value]);

  const select = (): void => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, value.length);
  };
  const fallback = (): void => {
    select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    setState(ok ? 'copied' : 'selected');
  };
  const copy = (): void => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip?.writeText) return fallback();
    clip.writeText(value).then(() => setState('copied'), fallback);
  };

  const hintId = id + '-hint';
  const field = multiline ? (
    <textarea id={id} ref={ref} className="tfield-input copy-value copy-value--text" value={value} readOnly rows={2}
      aria-describedby={hint ? hintId : undefined} onFocus={(e) => e.currentTarget.select()} />
  ) : (
    <input id={id} ref={ref} className="tfield-input copy-value" value={value} readOnly aria-describedby={hint ? hintId : undefined} onFocus={(e) => e.currentTarget.select()} />
  );
  return (
    <div className={'tfield copy-field' + (multiline ? ' copy-field--text' : '')}>
      <label htmlFor={id} className="tfield-label">
        {label}
      </label>
      <div className="copy-row">
        {field}
        <button type="button" className={'small-btn copy-btn' + (state === 'copied' ? ' is-copied' : '')} onClick={copy}>
          {state === 'copied' ? <Icon name="check" size={18} strokeWidth={2.6} className="m-in" /> : <Icon name="copy" size={18} />}
          <span aria-live="polite">{state === 'copied' ? t('form.copied') : (copyLabel ?? t('form.copy'))}</span>
        </button>
      </div>
      {state === 'selected' && (
        <span className="tfield-hint m-in">
          {t('form.selected')}
        </span>
      )}
      {hint && (
        <span id={hintId} className="tfield-hint">
          {hint}
        </span>
      )}
    </div>
  );
}

/** An account's status as a small pill: Invited (gold), Active (green), Blocked (red); AA contrast in both themes. */
export function StatusPill({ status, className }: { status: AccountStatus; className?: string }): JSX.Element {
  return <span className={'status-pill is-' + status + (className ? ' ' + className : '')}>{t('accountStatus.' + status)}</span>;
}

export interface SwitchRowProps {
  /** The bold label ("Admin"); the switch's accessible name. */
  label: string;
  /** One line under it ("Invites people and manages accounts and roles."); read as the switch's description. */
  description?: ReactNode;
  on: boolean;
  onChange(on: boolean): void;
  disabled?: boolean;
  className?: string;
}

/**
 * A card row that is one big switch: the label and a description on the left, Settings' switch on the right
 * (role="switch", aria-checked). For roles and premium on the admin screens.
 */
export function SwitchRow({ label, description, on, onChange, disabled, className }: SwitchRowProps): JSX.Element {
  const id = useId();
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={id + '-l'} aria-describedby={description ? id + '-d' : undefined} disabled={disabled}
      className={'toggle-row' + (className ? ' ' + className : '')} onClick={() => onChange(!on)}>
      <span className="toggle-row-text">
        <b id={id + '-l'}>{label}</b>
        {description && (
          <span id={id + '-d'} className="row-sub">
            {description}
          </span>
        )}
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}

export interface RowButtonProps {
  /** The row's words ("Sign out", "Download my data"). */
  label: string;
  /** A muted line under them. */
  sub?: ReactNode;
  icon?: IconName;
  /** danger: red words, for what deletes (Delete account). plain (default): ink. */
  tone?: 'plain' | 'danger';
  onClick(): void;
  busy?: boolean;
  /** Shown instead of the label while busy. */
  busyLabel?: string;
  disabled?: boolean;
}

/** A card row that is a button (Settings' Reset progress row; plain or red). Busy or disabled, it does nothing (aria-disabled). */
export function RowButton({ label, sub, icon, tone = 'plain', onClick, busy, busyLabel, disabled }: RowButtonProps): JSX.Element {
  const off = !!(disabled || busy);
  return (
    <button type="button" className={'row-btn' + (tone === 'danger' ? ' is-danger' : '')} aria-disabled={off || undefined} aria-busy={busy || undefined}
      onClick={() => {
        if (!off) onClick();
      }}>
      {icon && <Icon name={icon} size={20} />}
      <span className="row-btn-text">
        <b>{busy && busyLabel ? busyLabel : label}</b>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
    </button>
  );
}

export interface ConfirmActionProps {
  /** The row button that opens the confirm ("Delete account"). */
  label: string;
  sub?: ReactNode;
  icon?: IconName;
  /**
   * danger (default), for what deletes or blocks: the row's words, the question and the confirm button are red.
   * plain, for what loses nothing (Sign out everywhere): ink words and a soft accent confirm button.
   */
  tone?: 'plain' | 'danger';
  /** The question ("Delete your account?"); red with the danger tone. */
  question: string;
  /** One line on what it does ("… No undo."). */
  detail: string;
  /** The confirm button's verb ("Delete"). */
  confirmLabel: string;
  /** Shown on the confirm button while `onConfirm` runs ("Deleting…"). */
  busyLabel: string;
  /**
   * Runs on the confirm button, or Enter in a field of the confirm. Return false (or a promise of false) to keep the
   * confirm open, e.g. after an error the caller shows with `error`.
   */
  onConfirm(): boolean | void | Promise<boolean | void>;
  /** Fields the confirm asks for (the password to delete an account): give the first one autoFocus. */
  children?: ReactNode;
  /** A message for the confirm as a whole (a FormError inside it). */
  error?: string | null;
  /** Cancel closed it: clear a typed password and an error. */
  onCancel?(): void;
  /** The words of the button that closes it without acting; "Cancel" by default ("Keep invite" when the verb is Cancel). */
  cancelLabel?: string;
  disabled?: boolean;
}

/**
 * An action confirmed in place (Settings → Reset progress, DESIGN.md: red words, and the red fill only on the confirm
 * step): the row button turns into the question, one line on what happens, optional fields, then Cancel and the verb.
 * It is a form (Enter confirms from a field), with role="alertdialog". Red only for the danger tone.
 */
export function ConfirmAction(props: ConfirmActionProps): JSX.Element {
  const { label, sub, icon = 'trash', tone = 'danger', question, detail, confirmLabel, busyLabel, onConfirm, children, error, onCancel, cancelLabel, disabled } = props;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useMounted();
  const opener = useRef<HTMLDivElement>(null);

  const confirm = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    let keep = true;
    try {
      keep = (await onConfirm()) === false;
    } catch (e) {
      // The caller shows its own errors; a throw it did not catch keeps the confirm open too.
      console.error(e);
    } finally {
      if (alive.current) {
        setBusy(false);
        if (!keep) setOpen(false);
      }
    }
  };
  const cancel = (): void => {
    if (busy) return;
    setOpen(false);
    onCancel?.();
    // Back to the row button that opened it.
    requestAnimationFrame(() => opener.current?.querySelector('button')?.focus());
  };

  return (
    <div className="confirm-row" ref={opener}>
      {!open && <RowButton label={label} sub={sub} icon={icon} tone={tone} onClick={() => setOpen(true)} disabled={disabled} />}
      {open && (
        <form className="confirm m-in" role="alertdialog" aria-labelledby={id + '-q'} aria-describedby={id + '-d'} onSubmit={onSubmit(() => void confirm(), busy)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel();
          }}>
          <p className={'reset-text' + (tone === 'plain' ? ' is-plain' : '')}>
            <b id={id + '-q'}>{question}</b>
            <span id={id + '-d'}>{detail}</span>
          </p>
          {children}
          <FormError error={error} />
          {/* While it runs, the buttons do nothing, and the pressed one keeps the focus, also after a failure. */}
          <div className="confirm-actions">
            <button type="button" className="small-btn" autoFocus={!children} onClick={cancel} aria-disabled={busy || undefined}>
              {cancelLabel ?? t('common.cancel')}
            </button>
            <button type="submit" className={'small-btn ' + (tone === 'plain' ? 'small-btn--tonal' : 'small-btn--danger')} aria-disabled={busy || undefined}
              aria-busy={busy || undefined}>
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
