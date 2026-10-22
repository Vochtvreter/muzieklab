import { ALL_LESSONS } from './path';
import { INTRO_IDS, introId, introsOf, lessonIntros, unseenIntros } from './intro';

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
