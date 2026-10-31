// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { listenToAnnouncements, spoken } from '../lib/announce';
import { ConfirmAction, CopyField, ErrorRetry, FormDone, FormError, PasswordField, RowButton, StatusPill, SubmitButton, SwitchRow, TextField } from './Form';

afterEach(() => {
  cleanup();
  setLocale('en');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TextField', () => {
  it('labels the input, and links the hint and the error to it', () => {
    render(<TextField label="Email" type="email" value="" onChange={() => undefined} hint="The one you were invited with." error="Type an email address." />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(['Type an email address.', 'The one you were invited with.']);
    // The error is announced when it appears, not only read once the field gets focus.
    expect(screen.getByRole('alert').id).toBe(ids[0]);
    // No capital letter or spelling fixes in an email address.
    expect(input.getAttribute('autocapitalize')).toBe('none');
  });

  it('is not invalid without an error', () => {
    render(<TextField label="Name" value="Ann" onChange={() => undefined} />);
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('PasswordField', () => {
  it('shows and hides the password with a button named for what it does', () => {
    function Box(): JSX.Element {
      const [v, setV] = useState('secret password');
      return <PasswordField label="Password" autoComplete="current-password" value={v} onChange={setV} />;
    }
    render(<Box />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('current-password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).textContent).toBe('Hide');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.type).toBe('password');
  });
});

describe('FormError and SubmitButton', () => {
  it('FormError is an alert, and nothing without a message', () => {
    const { rerender } = render(<FormError error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<FormError error="Email or password is not right." />);
    expect(screen.getByRole('alert').textContent).toBe('Email or password is not right.');
  });

  it('SubmitButton shows its busy label; busy or disabled, it sends nothing but keeps the focus (aria-disabled, not disabled)', () => {
    const sent = vi.fn();
    const Box = ({ busy, disabled }: { busy: boolean; disabled?: boolean }): JSX.Element => (
      <form onSubmit={(e) => {
        e.preventDefault();
        sent();
      }}>
        <SubmitButton label="Sign in" busyLabel="Signing in…" busy={busy} disabled={disabled} />
      </form>
    );
    const { rerender } = render(<Box busy={false} />);
    const button = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement;
    expect(button.type).toBe('submit');
    expect(button.className).toContain('btn--accent');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    button.focus();
    fireEvent.click(button);
    expect(sent).toHaveBeenCalledTimes(1);
    rerender(<Box busy />);
    expect(button.textContent).toBe('Signing in…');
    // A disabled button that has the focus drops it to the page (Chromium): this one stays focusable.
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(sent).toHaveBeenCalledTimes(1);
    // Nothing to save (a Save after saving): the same.
    rerender(<Box busy={false} disabled />);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });

  it('RowButton, busy, does nothing when pressed again, and keeps the focus', () => {
    const onClick = vi.fn();
    const { rerender } = render(<RowButton label="Download my data" busyLabel="Downloading…" onClick={onClick} />);
    const row = screen.getByRole('button', { name: 'Download my data' }) as HTMLButtonElement;
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<RowButton label="Download my data" busyLabel="Downloading…" onClick={onClick} busy />);
    expect(row.textContent).toBe('Downloading…');
    expect(row.disabled).toBe(false);
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ErrorRetry: what Try again brings takes its place, and the screen\'s heading takes the focus, not the page', () => {
    function Screen(): JSX.Element {
      const [failed, setFailed] = useState(true);
      return (
        <main>
          <h1>Accounts</h1>
          {failed ? <ErrorRetry error="Can't reach Muzieklab right now." onRetry={() => setFailed(false)} /> : <p>Loading…</p>}
        </main>
      );
    }
    render(<Screen />);
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Accounts' }));
  });
});

describe('CopyField', () => {
  it('copies the value and says Copied for 2 seconds', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<CopyField label="Invite link" value="https://vivanova.app/#/invite/abc" copyLabel="Copy link" />);
    expect((screen.getByLabelText('Invite link') as HTMLInputElement).readOnly).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    });
    expect(writeText).toHaveBeenCalledWith('https://vivanova.app/#/invite/abc');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  it("selects the text when there is no clipboard, and says to copy it through the app's live region", () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    document.execCommand = vi.fn(() => false);
    const said: string[] = [];
    const stop = listenToAnnouncements((text) => said.push(spoken(text)));
    render(<CopyField label="Message" value={'Hi Lies,\nopen this link.'} multiline />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const area = screen.getByLabelText('Message') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(document.activeElement).toBe(area);
    expect(area.selectionEnd - area.selectionStart).toBe(area.value.length);
    // The line under it, not a status inserted with its text: the focus is on the text area, which it does not describe.
    expect(screen.getByText("Selected. Copy it with your device's copy command.")).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(said).toEqual(["Selected. Copy it with your device's copy command."]);
    stop();
  });
});

describe('StatusPill and SwitchRow', () => {
  it('names the status, in the app language', () => {
    render(<StatusPill status="blocked" />);
    expect(screen.getByText('Blocked').className).toContain('is-blocked');
    cleanup();
    setLocale('nl');
    render(<StatusPill status="invited" />);
    expect(screen.getByText('Uitgenodigd')).toBeTruthy();
  });

  it('is a switch named by its label and described by its line', () => {
    const onChange = vi.fn();
    render(<SwitchRow label="Admin" description="Invites people and manages accounts and roles." on={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Admin' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(document.getElementById(sw.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Invites people and manages accounts and roles.');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a disabled switch does not change', () => {
    const onChange = vi.fn();
    render(<SwitchRow label="Admin" on onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch', { name: 'Admin' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ConfirmAction', () => {
  const props = { label: 'Delete account', question: 'Delete your account?', detail: 'No undo.', confirmLabel: 'Delete', busyLabel: 'Deleting…' };

  it('asks first, and Cancel goes back without doing it', () => {
    const onConfirm = vi.fn();
    render(<ConfirmAction {...props} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete your account?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('confirms with the red button, and stays open when told to (an error)', async () => {
    const onConfirm = vi.fn(() => Promise.resolve(false));
    render(<ConfirmAction {...props} onConfirm={onConfirm} error="That's not your current password." />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe("That's not your current password.");
  });

  it('is red for what deletes (danger, the default), and not for what loses nothing (plain: Sign out everywhere)', () => {
    render(<ConfirmAction {...props} onConfirm={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('small-btn--danger');
    expect(screen.getByText('Delete your account?').closest('p')?.className).toBe('reset-text');
    cleanup();
    render(<ConfirmAction {...props} label="Sign out everywhere" question="Sign out everywhere?" confirmLabel="Sign out" tone="plain" onConfirm={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    const confirm = screen.getByRole('button', { name: 'Sign out' });
    expect(confirm.className).not.toContain('danger');
    expect(confirm.className).toContain('small-btn--tonal');
    expect(screen.getByText('Sign out everywhere?').closest('p')?.className).toBe('reset-text is-plain');
  });

  it('keeps the focus on the pressed button while it runs and after it failed, so Escape still closes it (DESIGN.md, Destructive confirm)', async () => {
    let settle: (keep: boolean) => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<boolean>((done) => (settle = done)));
    render(<ConfirmAction {...props} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const confirm = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    confirm.focus();
    fireEvent.click(confirm);
    expect(confirm.textContent).toBe('Deleting…');
    // Not disabled, which drops the focus to the page (Chromium), where Escape never reaches the confirm.
    for (const b of [confirm, cancel]) {
      expect(b.disabled).toBe(false);
      expect(b.getAttribute('aria-disabled')).toBe('true');
    }
    // While it runs, a second press, Cancel and Escape do nothing.
    fireEvent.click(confirm);
    fireEvent.click(cancel);
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await act(async () => settle(false));
    expect(confirm.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete account' }));
  });

  it('closes when it is done', async () => {
    render(<ConfirmAction {...props} onConfirm={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('FormDone', () => {
  it('is read out once when it appears, by the app\'s live region, not as an inserted role="status"', () => {
    const said: string[] = [];
    const stop = listenToAnnouncements((text) => said.push(spoken(text)));
    const { rerender } = render(<FormDone>Saved.</FormDone>);
    expect(screen.getByText('Saved.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(said).toEqual(['Saved.']);
    // A re-render with the same text (the form typed in again, a parent update) says nothing new.
    rerender(<FormDone>Saved.</FormDone>);
    expect(said).toEqual(['Saved.']);
    // Gone, and back after the next save: said again.
    rerender(<FormDone>{null}</FormDone>);
    expect(screen.queryByText('Saved.')).toBeNull();
    rerender(<FormDone>Saved.</FormDone>);
    expect(said).toEqual(['Saved.', 'Saved.']);
    stop();
  });

  it('says nothing itself where the screen announces it (live={false})', () => {
    const said: string[] = [];
    const stop = listenToAnnouncements((text) => said.push(spoken(text)));
    render(<FormDone live={false}>The invite for Lies Bakker was canceled.</FormDone>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('The invite for Lies Bakker was canceled.')).toBeTruthy();
    expect(said).toEqual([]);
    stop();
  });
});
