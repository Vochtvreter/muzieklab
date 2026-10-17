import { checkSettings } from '../core/feasibility';
import { generateExercise } from '../core/generator';
import { dailyChallenge } from './daily';

describe('dailyChallenge', () => {
  it('is the same for everyone on a date, and changes with the date', () => {
    expect(dailyChallenge('2026-10-17')).toEqual(dailyChallenge('2026-10-17'));
    const days = Array.from({ length: 30 }, (_, i) => dailyChallenge(`2026-11-${String(i + 1).padStart(2, '0')}`).seed);
    expect(new Set(days).size).toBe(30);
  });

  it('is always a playable tap exercise', () => {
    for (let i = 1; i <= 60; i++) {
      const day = `2027-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      const { settings, seed } = dailyChallenge(day);
      expect(settings.mode).toBe('tap');
      expect(checkSettings(settings).ok).toBe(true);
      expect(generateExercise(settings, seed).bars).toHaveLength(settings.bars);
    }
  });
});
