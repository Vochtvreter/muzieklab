// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Changelog } from './Changelog';

afterEach(cleanup);

const release = (version: string): HTMLElement => screen.getByRole('button', { name: new RegExp('^' + version.replace(/\./g, '\\.')) });

describe("What's new", () => {
  it('shows the latest release with its changes grouped, and a link to try it', () => {
    render(<Changelog />);
    expect(screen.getByRole('heading', { level: 1, name: "What's new" })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Read notes' })).toBeTruthy();
    expect(screen.getByText('Oct 18 · 4 new · 1 better')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Try Read notes' }).getAttribute('href')).toBe('#/notes');
    expect(screen.getByRole('link', { name: 'Back to settings' }).getAttribute('href')).toBe('#/settings');
  });

  it('opens one earlier release at a time', () => {
    render(<Changelog />);
    expect(release('0.2.2').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(release('0.2.0'));
    expect(release('0.2.0').getAttribute('aria-expanded')).toBe('true');
    expect(release('0.2.2').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(release('0.2.0'));
    expect(release('0.2.0').getAttribute('aria-expanded')).toBe('false');
  });

  it('Fixes keeps only releases with fixes, and only their fixes', () => {
    render(<Changelog />);
    fireEvent.click(screen.getByRole('button', { name: 'Fixes' }));
    expect(screen.queryByRole('heading', { name: 'Read notes' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^0\.2\.2/ })).toBeNull();
    expect(release('0.2.1').textContent).toContain('Oct 17 · 1 fixed');
    expect(release('0.1.0').textContent).toContain('Oct 17 · 1 fixed');
  });
});
