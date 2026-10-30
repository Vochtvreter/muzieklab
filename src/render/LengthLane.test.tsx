// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { DEMO_44, DEMO_LESSON, demoTimeline } from './demoFixtures';
import { LengthLane } from './LengthLane';

const timeline = demoTimeline(DEMO_44, DEMO_LESSON, 80);
const lane = (hold?: boolean): void => {
  render(<LengthLane timeline={timeline} barTicks={DEMO_44.barTicks} barsPerRow={4} taps={[]} hold={hold} />);
};

afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('LengthLane', () => {
  it('is named for what it compares: note lengths with holds, or with tap only note starts with taps', () => {
    lane();
    expect(screen.getByRole('img', { name: 'Note lengths compared with how long each note was held' })).toBeTruthy();
    cleanup();
    // Tap only judges no hold, and draws a press as a mark where it landed.
    lane(false);
    expect(screen.getByRole('img', { name: 'When each note starts compared with when you tapped' })).toBeTruthy();
    cleanup();
    setLocale('nl');
    lane(false);
    expect(screen.getByRole('img', { name: 'Het begin van elke noot naast wanneer je tikte' })).toBeTruthy();
  });
});
