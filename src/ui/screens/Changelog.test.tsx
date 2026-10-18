// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RELEASES } from '../lib/changelog';
import { Changelog } from './Changelog';

afterEach(cleanup);

const release = (version: string): HTMLElement => screen.getByRole('button', { name: new RegExp('^' + version.replace(/\./g, '\\.')) });
const readNotes = RELEASES.find((r) => r.version === '0.3.0')!;

describe("What's new", () => {
  it('shows the latest release on its own card, and a way back to Settings', () => {
    render(<Changelog />);
    expect(screen.getByRole('heading', { level: 1, name: "What's new" })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Three chapters on reading notes' })).toBeTruthy();
    expect(within(screen.getByRole('article')).getByText('Oct 18 · 2 new · 1 better')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to settings' }).getAttribute('href')).toBe('#/settings');
  });

  it('opens one earlier release at a time; an opened release keeps its Try link', () => {
    render(<Changelog />);
    expect(release(RELEASES[1].version).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(release('0.3.0'));
    expect(release('0.3.0').getAttribute('aria-expanded')).toBe('true');
    expect(release(RELEASES[1].version).getAttribute('aria-expanded')).toBe('false');
    expect(release('0.3.0').textContent).toContain('Oct 18 · 4 new · 1 better');
    expect(screen.getByRole('link', { name: 'Try Read notes' }).getAttribute('href')).toBe('#' + readNotes.action!.to);
    fireEvent.click(release('0.2.0'));
    expect(release('0.2.0').getAttribute('aria-expanded')).toBe('true');
    expect(release('0.3.0').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(release('0.2.0'));
    expect(release('0.2.0').getAttribute('aria-expanded')).toBe('false');
  });

  it('Fixes keeps only releases with fixes, and only their fixes', () => {
    render(<Changelog />);
    fireEvent.click(screen.getByRole('button', { name: 'Fixes' }));
    expect(screen.queryByRole('heading', { name: 'Three chapters on reading notes' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^0\.3\.0/ })).toBeNull();
    expect(release('0.3.1').textContent).toContain('Oct 18 · 2 fixed');
    expect(release('0.2.1').textContent).toContain('Oct 17 · 1 fixed');
    expect(release('0.1.0').textContent).toContain('Oct 17 · 1 fixed');
  });
});
