// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { listenToAnnouncements } from '../lib/announce';
import { PauseContent } from './PlaySheets';

afterEach(cleanup);

describe('the Pause sheet', () => {
  const pause = (interrupted: boolean): JSX.Element => (
    <PauseContent context="Free practice · Bar 2 of 8" interrupted={interrupted} desktop={false} lesson={false}
      onResume={() => undefined} onRestart={() => undefined} onHelp={() => undefined} onSettings={() => undefined} onQuit={() => undefined} />
  );

  it("says why it paused through the app's live region, not as a status inserted with its text", () => {
    const said: string[] = [];
    const stop = listenToAnnouncements((text) => said.push(text));
    render(pause(true));
    stop();
    expect(screen.getByText('The sound was interrupted. Resume to carry on from this bar.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(said).toEqual(['The sound was interrupted. Resume to carry on from this bar.']);
  });

  it('says nothing of its own when the player paused', () => {
    const said: string[] = [];
    const stop = listenToAnnouncements((text) => said.push(text));
    render(pause(false));
    stop();
    expect(screen.getByText('The count-in plays again when you resume.')).toBeTruthy();
    expect(said).toEqual([]);
  });
});
