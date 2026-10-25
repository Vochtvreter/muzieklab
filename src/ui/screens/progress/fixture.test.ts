/**
 * The Progress seed for e2e and the screen tests (e2e/progressFixture.ts) stays what the store keeps and what the boards
 * show, so it never drifts silently when the data layer changes.
 */
import { describe, expect, it } from 'vitest';
import { emptyProgress, PROGRESS_DAY, richProgress } from '../../../../e2e/progressFixture';
import { awardAchievements, streakDay } from '../../../game/achievements';
import { progressView } from '../../../game/progressView';
import { passSkills } from '../../../game/skills';
import { isEmptyProgress, sanitizeProgress } from '../../../game/storage';

describe('the Progress seed', () => {
  it('reads back unchanged: sanitizeProgress (after a JSON round trip) gives the same progress', () => {
    const p = richProgress();
    expect(sanitizeProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(sanitizeProgress(JSON.parse(JSON.stringify(emptyProgress())))).toEqual(emptyProgress());
    expect(isEmptyProgress(emptyProgress())).toBe(true);
  });

  it("is what the store keeps: its start-up check passes no level and earns no achievement", () => {
    const p = richProgress();
    expect(passSkills(p, PROGRESS_DAY).added).toEqual([]);
    expect(awardAchievements(p, PROGRESS_DAY).added).toEqual([]);
    expect(streakDay(p.practiceDays)).toBe(p.achievements.streak7);
  });

  it("shows the boards' sample on Thursday 15 October 2026", () => {
    const v = progressView(richProgress(), PROGRESS_DAY);
    expect(v.header).toMatchObject({ streak: 12, level: 7, rank: 'measure', total: 1445, nextLevelAt: 1750, toNext: 305 });
    expect(v.calendar).toMatchObject({ first: '2026-09-14', last: '2026-10-18', practised: 28, elapsed: 32, streakStart: '2026-10-04' });
    expect(v.calendar.missed).toEqual(['2026-09-16', '2026-09-20', '2026-09-25', '2026-10-03']);
    expect(v.accuracy.days.map((d) => d.value)).toEqual([76, null, 79, 81, 78, 83, 84, 82, 85, 86, 84, 87, 88, 80]);
    expect(v.accuracy).toMatchObject({ mean: 83, today: 80, peak: { date: '2026-10-14', value: 88 } });
    expect(v.timing.days.map((d) => d.value)).toEqual([-52, null, -49, -46, -44, -41, -38, -37, -33, -31, -29, -26, -24, -22]);
    expect(v.timing).toMatchObject({ tendency: 'steady', firstTendency: 'rushing' });
    expect(v.minutes.days.map((d) => d.minutes)).toEqual([14, 9, 17, 11, null, null, null]);
    expect(v.minutes.total).toBe(51);
    expect(v.cells.map((c) => c.accuracy)).toEqual([96, 97, 89, 86, 78, 91, 72, null]);
    expect(v.cells.filter((c) => c.weak).map((c) => c.id)).toEqual(['ties', 'dottedQE']);
    expect(v.cells[7]).toMatchObject({ id: 'sixteenths', locked: true });
    expect(v.achievements.earned).toBe(3);
    expect(v.notes.clefs.map((c) => c.accuracy)).toEqual([88, 74]);
    expect(v.notes.slowest.map((n) => [n.letter, n.alter, n.clef, n.seconds])).toEqual([
      ['E', 0, 'treble', 3.1],
      ['F', 1, 'treble', 2.6],
      ['C', 0, 'bass', 2.4],
    ]);
    expect(v.notes.lastKey).toEqual({ key: 'G', clef: 'treble' });
    expect(v.scales.majors.map((m) => m.stars)).toEqual([3, 3, 2, 1, 0, 0, 0, 0, 3, 2, 1, 0, 0, 0, 0]);
    expect(v.scales).toMatchObject({ majorsDone: 5, minorsStarted: 4 });
    expect(v.scales.minors.map((m) => [m.natural, m.harmonic, m.melodic])).toEqual([[3, 2, 1], [2, 1, 0], [2, 0, 0], [1, 0, 0]]);
    expect(v.skills.skills.map((s) => s.level)).toEqual([6, 4, 5, 3, 3, 4]);
    expect(v.skills).toMatchObject({ total: 25, gained: 4, reviewDue: ['theory'] });
    expect(v.skills.skills.map((s) => s.history)).toEqual([
      [3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6],
      [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4],
      [2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5],
      [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3],
      [0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3],
      [1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4],
    ]);
    expect(v.skills.skills.find((s) => s.id === 'theory')?.review).toEqual({ due: true, days: 16 });
  });
});
