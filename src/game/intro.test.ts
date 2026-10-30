import { DEFAULT_SETTINGS } from '../core/defaults';
import { generateExercise } from '../core/generator';
import { PPQ, type Bar, type Exercise } from '../core/types';
import { ALL_LESSONS, lessonSettings } from './path';
import { exerciseHas, INTRO_IDS, introId, introsOf, lessonIntros, SHOW_IDS, showScore, unseenIntros } from './intro';

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

  it('every id a start can ask for is known (SHOW_IDS): the intro ids, any rest, each dotted value and the figures', () => {
    expect(SHOW_IDS).toEqual(expect.arrayContaining([...INTRO_IDS, 'rest', 'dotted:eighth', 'dotted:quarter', 'figure:eighth-pair', 'figure:eighth-sixteenths']));
    for (const { lesson } of ALL_LESSONS) for (const id of lesson.preview ?? []) expect(SHOW_IDS, lesson.id).toContain(id);
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

  it("finds any rest as 'rest', the whole-bar rest too, as 'dotted' is any dotted value", () => {
    expect(exerciseHas(exercise([{ events: [note(0, 2 * q), rest(2 * q, q), note(3 * q, q)] }]), ['rest'])).toBe(true);
    expect(exerciseHas(exercise([{ events: [note(0, 4 * q)] }, { events: [rest(0, 4 * q)] }, { events: [note(0, 4 * q)] }]), ['rest'])).toBe(true);
    expect(exerciseHas(exercise([{ events: [note(0, 2 * q), note(2 * q, 2 * q)] }]), ['rest'])).toBe(false);
  });

  it('scores how close an exercise comes to showing it all, each symbol before all the ones after it', () => {
    const ex = exercise([{ events: [note(0, 2 * q), rest(2 * q, q), note(3 * q, q)] }]);
    expect(showScore(ex, ['note:half', 'rest:quarter'])).toBe(3);
    expect(showScore(ex, [])).toBe(0);
    expect(showScore(ex, ['note:eighth', 'rest:whole'])).toBe(0);
    // The first one shown counts for more than both after it.
    expect(showScore(ex, ['note:half', 'note:eighth', 'rest:whole'])).toBeGreaterThan(showScore(ex, ['note:eighth', 'note:half', 'rest:quarter']));
  });

  it('tells one dotted value from another: a dotted half is no dotted quarter', () => {
    const ex = exercise([{ events: [note(0, 3 * q), note(3 * q, q)] }, { events: [note(0, 4 * q)] }]);
    expect(exerciseHas(ex, ['dotted', 'dotted:half'])).toBe(true);
    expect(exerciseHas(ex, ['dotted:quarter'])).toBe(false);
    const dq = exercise([{ events: [note(0, 1.5 * q), note(1.5 * q, q / 2), note(2 * q, 2 * q)] }]);
    expect(exerciseHas(dq, ['dotted:quarter', 'note:eighth'])).toBe(true);
    expect(exerciseHas(dq, ['dotted:half'])).toBe(false);
  });

  it("finds the skill map's cells, which Practice weak spots asks for: a dotted half tied on counts for ties, and is no half", () => {
    const threeFour = (bars: Bar[]): Exercise => ({ ...generateExercise({ ...DEFAULT_SETTINGS, meters: ['3/4'], dotted: true, ties: true, bars: bars.length }, 1), bars });
    const tied = threeFour([{ events: [note(0, 3 * q)] }, { events: [note(0, q, { tieFromPrev: true }), note(q, 2 * q)] }]);
    expect(exerciseHas(tied, ['dotted:half', 'ties', 'note:half'])).toBe(true);
    expect(exerciseHas(tied, ['cell:ties', 'cell:half'])).toBe(true);
    expect(exerciseHas(tied, ['cell:dottedHalf'])).toBe(false);
    const dotted = threeFour([{ events: [note(0, 3 * q)] }, { events: [rest(0, q), note(q, 2 * q)] }]);
    expect(exerciseHas(dotted, ['cell:dottedHalf', 'cell:rests', 'cell:half'])).toBe(true);
    expect(exerciseHas(threeFour([{ events: [note(0, 3 * q)] }, { events: [note(0, 3 * q)] }]), ['cell:half'])).toBe(false);
    expect(SHOW_IDS).toEqual(expect.arrayContaining(['cell:dottedHalf', 'cell:dottedQE', 'cell:rests']));
  });

  it('finds an eighth and two sixteenths only where they fill one beat (8.3)', () => {
    const fig = ['figure:eighth-sixteenths'];
    // Beat 2: "2 & a".
    const on = exercise([{ events: [note(0, q / 4), note(q / 4, q / 4), note(q / 2, q / 2), note(q, q / 2), note(1.5 * q, q / 4), note(1.75 * q, q / 4), note(2 * q, 2 * q)] }]);
    expect(exerciseHas(on, [...fig, 'note:eighth', 'note:sixteenth'])).toBe(true);
    // The eighth on the "&" of beat 1, its sixteenths on beat 2; two sixteenths and an eighth; a dotted eighth.
    const across = exercise([{ events: [note(0, q / 2), note(q / 2, q / 2), note(q, q / 4), note(1.25 * q, q / 4), note(1.5 * q, q / 2), note(2 * q, 2 * q)] }]);
    const reversed = exercise([{ events: [note(0, q / 4), note(q / 4, q / 4), note(q / 2, q / 2), note(q, 3 * q)] }]);
    const dotted = exercise([{ events: [note(0, 0.75 * q), note(0.75 * q, q / 4), note(q, 3 * q)] }]);
    for (const ex of [across, reversed, dotted]) expect(exerciseHas(ex, fig)).toBe(false);
    expect(exerciseHas(across, ['note:eighth', 'note:sixteenth'])).toBe(true);
  });

  it("finds the other figures a lesson's title names, each from a beat: 4.1's, 7.3's and 8.1's", () => {
    const figs = ['figure:eighth-pair', 'figure:dotted-quarter-eighth', 'figure:four-sixteenths'];
    // "1 &", a quarter, "3 (4) &"; then "1 e & a".
    const on = exercise([
      { events: [note(0, q / 2), note(q / 2, q / 2), note(q, q), note(2 * q, 1.5 * q), note(3.5 * q, q / 2)] },
      { events: [note(0, q / 4), note(q / 4, q / 4), note(q / 2, q / 4), note(0.75 * q, q / 4), note(q, q), note(2 * q, 2 * q)] },
    ]);
    expect(exerciseHas(on, figs)).toBe(true);
    // The same values, not in those figures: an eighth and an eighth rest, an eighth and two sixteenths, a dotted
    // quarter and an eighth rest; three sixteenths and a sixteenth rest, a dotted eighth and a sixteenth.
    const off = exercise([
      { events: [note(0, q / 2), rest(q / 2, q / 2), note(q, q / 2), note(1.5 * q, q / 4), note(1.75 * q, q / 4), note(2 * q, 1.5 * q), rest(3.5 * q, q / 2)] },
      { events: [note(0, q / 4), note(q / 4, q / 4), note(q / 2, q / 4), rest(0.75 * q, q / 4), note(q, 0.75 * q), note(1.75 * q, q / 4), note(2 * q, 2 * q)] },
    ]);
    expect(exerciseHas(off, ['note:eighth', 'dotted:quarter', 'note:sixteenth'])).toBe(true);
    for (const id of figs) expect(exerciseHas(off, [id]), id).toBe(false);
  });

  it('finds what a lesson introduces in an exercise that has it', () => {
    // 1.2 (the half note) has it in every exercise; 3.4's whole rest needs a seed that has one.
    for (let seed = 1; seed <= 20; seed++) expect(exerciseHas(generateExercise(lessonSettings('1.2'), seed), ids('1.2'))).toBe(true);
    const wholeRests = Array.from({ length: 200 }, (_, seed) => exerciseHas(generateExercise(lessonSettings('3.4'), seed), ids('3.4')));
    expect(wholeRests).toContain(true);
    expect(wholeRests).toContain(false);
  });
});
