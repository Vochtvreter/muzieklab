import { DEFAULT_SETTINGS } from '../core/defaults';
import { NOTE_VALUES, type MeterId, type NoteValue, type Settings } from '../core/types';
import { UNITS, findLesson, isUnlocked, lessonSettings, nextLesson, pathStars, recordLessonResult, unitStars } from './path';
import { defaultProgress, type LessonProgress, type Progress } from './storage';

const allIds = UNITS.flatMap((u) => u.lessons.map((l) => l.id));

function progressWith(stars: Record<string, LessonProgress['stars']>): Progress {
  const lessons: Progress['lessons'] = {};
  for (const [id, s] of Object.entries(stars)) lessons[id] = { stars: s, bestAccuracy: 80 };
  return { ...defaultProgress(), lessons };
}
const starsUpTo = (lastId: string, s: LessonProgress['stars'] = 2) =>
  Object.fromEntries(allIds.slice(0, allIds.indexOf(lastId) + 1).map((id) => [id, s]));

const TICKS: Record<NoteValue, number> = { whole: 192, half: 96, quarter: 48, eighth: 24, sixteenth: 12 };
const BAR: Record<MeterId, number> = { '2/4': 96, '3/4': 144, '4/4': 192 };

/** Independent DP check (§5.6): can the bar be filled with the enabled values? */
function canFill(s: Settings, meter: MeterId): boolean {
  const bar = BAR[meter];
  const values = [...s.notes, ...s.rests].map((v) => TICKS[v]);
  if (s.dotted) values.push(...s.notes.map((v) => TICKS[v] * 1.5));
  const reach = new Array<boolean>(bar + 1).fill(false);
  reach[0] = true;
  for (let t = 1; t <= bar; t++) reach[t] = values.some((d) => d <= t && reach[t - d]);
  const fullBarRest = s.rests.includes('whole');
  return reach[bar] || fullBarRest;
}

describe('UNITS', () => {
  it('has units 1–8 with five lessons each and ids "u.l"', () => {
    expect(UNITS.map((u) => u.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const u of UNITS) {
      expect(u.lessons).toHaveLength(5);
      u.lessons.forEach((l, i) => expect(l.id).toBe(`${u.id}.${i + 1}`));
      expect(u.titleKey).toBe(`path.u${u.id}.title`);
      u.lessons.forEach((l, i) => expect(l.title).toBe(`path.u${u.id}.l${i + 1}`));
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('every lesson is a valid, playable Tap preset', () => {
    for (const id of allIds) {
      const s = lessonSettings(id);
      expect(s.notes.length, id).toBeGreaterThan(0);
      expect(s.bars).toBeGreaterThanOrEqual(1);
      expect(s.bars).toBeLessThanOrEqual(16);
      expect(s.tempo).toBeGreaterThanOrEqual(40);
      expect(s.tempo).toBeLessThanOrEqual(200);
      expect(s.triplets).toBe(false);
      for (const m of s.meters) expect(canFill(s, m), `${id} ${m}`).toBe(true);
    }
  });

  it('tap only in unit 1, tap & hold from unit 2', () => {
    for (const id of allIds) expect(lessonSettings(id).hold, id).toBe(!id.startsWith('1.'));
  });

  it('introduces material in the order of §8.2', () => {
    const firstUnit = (pred: (s: Settings) => boolean) => {
      const id = allIds.find((x) => pred(lessonSettings(x)));
      return id ? Number(id.split('.')[0]) : null;
    };
    expect(firstUnit((s) => s.rests.length > 0)).toBe(2);
    expect(firstUnit((s) => s.meters.includes('3/4'))).toBe(3);
    expect(firstUnit((s) => s.notes.includes('whole'))).toBe(3);
    expect(firstUnit((s) => s.rests.includes('whole'))).toBe(3);
    expect(firstUnit((s) => s.notes.includes('eighth'))).toBe(4);
    expect(firstUnit((s) => s.meters.includes('2/4'))).toBe(5);
    expect(firstUnit((s) => s.rests.includes('eighth'))).toBe(5);
    expect(firstUnit((s) => s.meters.length > 1)).toBe(5);
    expect(firstUnit((s) => s.ties)).toBe(6);
    expect(firstUnit((s) => s.dotted)).toBe(7);
    expect(firstUnit((s) => s.notes.includes('sixteenth'))).toBe(8);
    // Unit 1 is quarters and halves in 4/4 only.
    for (const l of UNITS[0].lessons) {
      const s = lessonSettings(l.id);
      expect(s.meters).toEqual(['4/4']);
      expect(s.notes.every((v) => v === 'half' || v === 'quarter')).toBe(true);
    }
  });

  it('unit 7 starts with the dotted half and adds the eighth for dotted quarter + eighth (lesson 7.3)', () => {
    expect(lessonSettings('7.1').notes).not.toContain('eighth');
    expect(lessonSettings('7.3')).toMatchObject({ meters: ['4/4'], bars: 4, tempo: 80, dotted: true });
    expect(lessonSettings('7.3').notes).toContain('eighth');
  });

  it('unit 8 starts with four sixteenths (no eighths), then mixes in eighths', () => {
    expect(lessonSettings('8.1').notes).toEqual(['quarter', 'sixteenth']);
    expect(lessonSettings('8.3').notes).toEqual(expect.arrayContaining(['eighth', 'sixteenth']));
  });

  it('only uses known note values', () => {
    for (const id of allIds) {
      const s = lessonSettings(id);
      for (const v of [...s.notes, ...s.rests]) expect(NOTE_VALUES).toContain(v);
    }
  });
});

describe('lessonSettings', () => {
  it('merges defaults, unit base and lesson preset', () => {
    const s = lessonSettings('1.1');
    expect(s).toMatchObject({ hold: false, notes: ['quarter'], rests: [], bars: 2, tempo: 60, countIn: 1 });
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('returns fresh arrays', () => {
    lessonSettings('2.2').notes.push('sixteenth');
    expect(lessonSettings('2.2').notes).toEqual(['half', 'quarter']);
  });

  it('falls back to the defaults for an unknown id', () => {
    expect(lessonSettings('99.1')).toEqual(DEFAULT_SETTINGS);
    expect(findLesson('99.1')).toBeNull();
  });
});

describe('unlocking and progress', () => {
  const empty = progressWith({});

  it('only 1.1 is open at the start', () => {
    expect(isUnlocked(empty, '1.1')).toBe(true);
    expect(isUnlocked(empty, '1.2')).toBe(false);
    expect(isUnlocked(empty, '2.1')).toBe(false);
    expect(isUnlocked(empty, 'nope')).toBe(false);
  });

  it('two stars on a lesson open the next one, one star does not', () => {
    expect(isUnlocked(progressWith({ '1.1': 1 }), '1.2')).toBe(false);
    expect(isUnlocked(progressWith({ '1.1': 2 }), '1.2')).toBe(true);
    expect(isUnlocked(progressWith({ '1.1': 3 }), '1.2')).toBe(true);
  });

  it('a unit opens with two stars on every lesson of the previous unit', () => {
    expect(isUnlocked(progressWith(starsUpTo('1.5')), '2.1')).toBe(true);
    expect(isUnlocked(progressWith({ ...starsUpTo('1.5'), '1.3': 1 }), '2.1')).toBe(false);
  });

  it('nextLesson is the first lesson without two stars', () => {
    expect(nextLesson(empty)?.id).toBe('1.1');
    expect(nextLesson(progressWith({ ...starsUpTo('7.1', 3), '7.2': 2 }))?.id).toBe('7.3');
    expect(nextLesson(progressWith(starsUpTo('8.5')))).toBeNull();
  });

  it('nextLesson is always unlocked', () => {
    for (let i = 0; i < allIds.length; i++) {
      const p = progressWith(starsUpTo(allIds[i]));
      const next = nextLesson(p);
      if (next) expect(isUnlocked(p, next.id)).toBe(true);
    }
  });

  it('counts stars per unit and over the path', () => {
    const p = progressWith({ '7.1': 3, '7.2': 2, '6.5': 1 });
    expect(unitStars(p, 7)).toBe(5);
    expect(unitStars(p, 8)).toBe(0);
    expect(unitStars(p, 42)).toBe(0);
    expect(pathStars(p)).toEqual({ earned: 6, max: 160 });
    // The diamond (all perfect) counts as four.
    expect(unitStars(progressWith({ '7.1': 5, '7.2': 4 }), 7)).toBe(8);
  });

  it('recordLessonResult keeps the best stars and accuracy', () => {
    let p = recordLessonResult(empty, '1.1', 2, 81);
    p = recordLessonResult(p, '1.1', 1, 90);
    expect(p.lessons['1.1']).toEqual({ stars: 2, bestAccuracy: 90 });
    p = recordLessonResult(p, '1.1', 3, 85);
    expect(p.lessons['1.1']).toEqual({ stars: 3, bestAccuracy: 90 });
    p = recordLessonResult(p, '1.1', 4, 100);
    p = recordLessonResult(p, '1.1', 3, 95);
    expect(p.lessons['1.1']).toEqual({ stars: 4, bestAccuracy: 100 });
    expect(empty.lessons).toEqual({});
  });
});
