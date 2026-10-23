// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { ConfirmAction, CopyField, FormError, PasswordField, StatusPill, SubmitButton, SwitchRow, TextField } from './Form';

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
    // No capital letter or spelling fixes in an email address.
    expect(input.getAttribute('autocapitalize')).toBe('none');
  });

  it('is not invalid without an error', () => {
    render(<TextField label="Name" value="Ann" onChange={() => undefined} />);
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
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

  it('SubmitButton shows its busy label and is disabled while busy', () => {
    const { rerender } = render(<SubmitButton label="Sign in" busyLabel="Signing in…" busy={false} />);
    const button = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement;
    expect(button.type).toBe('submit');
    expect(button.className).toContain('btn--accent');
    rerender(<SubmitButton label="Sign in" busyLabel="Signing in…" busy />);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Signing in…');
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

  it('selects the text when there is no clipboard', () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    document.execCommand = vi.fn(() => false);
    render(<CopyField label="Message" value={'Hi Lies,\nopen this link.'} multiline />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const area = screen.getByLabelText('Message') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(document.activeElement).toBe(area);
    expect(area.selectionEnd - area.selectionStart).toBe(area.value.length);
    expect(screen.getByRole('status').textContent).toMatch(/^Selected/);
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

  it('closes when it is done', async () => {
    render(<ConfirmAction {...props} onConfirm={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
