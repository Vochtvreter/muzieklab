import { DEFAULT_SETTINGS } from '../core/defaults';
import { generateExercise } from '../core/generator';
import { PPQ, type Bar, type Exercise } from '../core/types';
import { ALL_LESSONS, lessonSettings } from './path';
import { exerciseHas, INTRO_IDS, introId, introsOf, lessonIntros, unseenIntros } from './intro';

const ids = (lessonId: string): string[] => lessonIntros(lessonId).map(introId);

describe('lessonIntros', () => {
  it('the first lesson introduces nothing to show: How to play covers it', () => {
    expect(lessonIntros('1.1')).toEqual([]);
  });

  it('lists what no earlier lesson of the path used, on the real path', () => {
    expect(ids('1.2')).toEqual(['note:half']);
    expect(ids('1.3')).toEqual([]);
    // 2.1 is about holding, without rests: the quarter rest arrives in 2.2.
    expect(ids('2.1')).toEqual([]);
    expect(ids('2.2')).toEqual(['rest:quarter']);
    expect(ids('2.3')).toEqual(['rest:half']);
    expect(ids('3.1')).toEqual(['meter:3/4']);
    expect(ids('3.3')).toEqual(['note:whole']);
    expect(ids('3.4')).toEqual(['rest:whole']);
    expect(ids('4.1')).toEqual(['note:eighth']);
    expect(ids('5.1')).toEqual(['meter:2/4']);
    expect(ids('5.2')).toEqual(['rest:eighth']);
    expect(ids('6.1')).toEqual(['ties']);
    expect(ids('7.1')).toEqual(['dotted']);
    expect(ids('8.1')).toEqual(['note:sixteenth']);
  });

  it('introduces each symbol once, and only known ids', () => {
    const all = ALL_LESSONS.flatMap(({ lesson }) => ids(lesson.id));
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(INTRO_IDS).toContain(id);
    expect(INTRO_IDS).toEqual(expect.arrayContaining(['triplets', 'rest:sixteenth', 'meter:4/4']));
  });

  it('an unknown lesson introduces nothing', () => {
    expect(lessonIntros('9.9')).toEqual([]);
    expect(lessonIntros('notes:1.2')).toEqual([]);
  });
});

describe('unseenIntros and introsOf', () => {
  it('leaves out what the player was shown', () => {
    expect(unseenIntros('1.2', [])).toEqual([{ kind: 'note', value: 'half' }]);
    expect(unseenIntros('1.2', ['note:half'])).toEqual([]);
  });

  it('collects the intros of the lessons played, ignoring other paths', () => {
    expect(introsOf(['1.1', '1.2', '1.3', 'notes:2.1']).sort()).toEqual(['note:half']);
    expect(introsOf(['2.2', '2.3']).sort()).toEqual(['rest:half', 'rest:quarter']);
  });
});

describe('exerciseHas', () => {
  /** A 4/4 exercise of the bars given, spelled with dots. */
  const exercise = (bars: Bar[]): Exercise => {
    const ex = generateExercise({ ...DEFAULT_SETTINGS, dotted: true, bars: bars.length }, 1);
    return { ...ex, bars };
  };
  const q = PPQ;
  const note = (start: number, duration: number, extra = {}) => ({ kind: 'note' as const, start, duration, ...extra });
  const rest = (start: number, duration: number) => ({ kind: 'rest' as const, start, duration });

  it('reads the staff: values, rests, a whole-bar rest as the whole rest, dots, ties and the time signature', () => {
    const ex = exercise([
      { events: [note(0, 2 * q), rest(2 * q, q), note(3 * q, q)] },
      { events: [rest(0, 4 * q)] },
      { events: [note(0, 3 * q), note(3 * q, q)] },
    ]);
    expect(exerciseHas(ex, [])).toBe(true);
    expect(exerciseHas(ex, ['meter:4/4', 'note:half', 'rest:quarter', 'note:quarter', 'rest:whole', 'dotted'])).toBe(true);
    for (const id of ['meter:3/4', 'note:whole', 'rest:half', 'note:eighth', 'ties', 'triplets']) expect(exerciseHas(ex, [id]), id).toBe(false);
    const tied = exercise([{ events: [note(0, 2 * q), note(2 * q, 2 * q)] }, { events: [note(0, 2 * q, { tieFromPrev: true }), note(2 * q, 2 * q)] }]);
    expect(exerciseHas(tied, ['ties'])).toBe(true);
  });

  it('tells one dotted value from another: a dotted half is no dotted quarter', () => {
    const ex = exercise([{ events: [note(0, 3 * q), note(3 * q, q)] }, { events: [note(0, 4 * q)] }]);
    expect(exerciseHas(ex, ['dotted', 'dotted:half'])).toBe(true);
    expect(exerciseHas(ex, ['dotted:quarter'])).toBe(false);
    const dq = exercise([{ events: [note(0, 1.5 * q), note(1.5 * q, q / 2), note(2 * q, 2 * q)] }]);
    expect(exerciseHas(dq, ['dotted:quarter', 'note:eighth'])).toBe(true);
    expect(exerciseHas(dq, ['dotted:half'])).toBe(false);
  });

  it('finds what a lesson introduces in an exercise that has it', () => {
    // 1.2 (the half note) has it in every exercise; 3.4's whole rest needs a seed that has one.
    for (let seed = 1; seed <= 20; seed++) expect(exerciseHas(generateExercise(lessonSettings('1.2'), seed), ids('1.2'))).toBe(true);
    const wholeRests = Array.from({ length: 200 }, (_, seed) => exerciseHas(generateExercise(lessonSettings('3.4'), seed), ids('3.4')));
    expect(wholeRests).toContain(true);
    expect(wholeRests).toContain(false);
  });
});
