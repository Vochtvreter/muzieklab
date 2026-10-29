import { describe, expect, it } from 'vitest';
import { checkSettings, DEFAULT_SETTINGS, type Feasibility, type NotatedSymbol, PPQ, type Settings, type Stars, type Tap, type Timeline, type TimedNote } from '../../core/api';
import { introId, lessonIntros } from '../../game/intro';
import { ALL_LESSONS } from '../../game/path';
import { defaultProgress, type Progress } from '../../game/storage';
import { PATH_UNITS } from '../../game/tracks';
import { difficultyLevel, metersLabel, orList, signed, signedMs, starsLabel, starsText, tempoWordKey } from './format';
import { barFeatures, continueLesson, lessonOutcome, lessonPreview, newFeatures, noteLessonPreview, previewFeatures, tileStates, unitStates } from './lessons';
import { exerciseView } from '../exerciseView';
import { barAt, beatAt, cursorAt, holdProgress, liveAccuracy, pressFeedback, replayedWindows, sliceTimeline, tapsBeforeBar, windowStart } from './playMath';
import { setupHints, startBlockedKey } from './setupHints';
import { describeBars } from './notation';

describe('tempo word', () => {
  it('maps BPM ranges to the classical words', () => {
    expect(tempoWordKey(40)).toBe('tempo.largo');
    expect(tempoWordKey(59)).toBe('tempo.largo');
    expect(tempoWordKey(60)).toBe('tempo.larghetto');
    expect(tempoWordKey(70)).toBe('tempo.adagio');
    expect(tempoWordKey(80)).toBe('tempo.andante');
    expect(tempoWordKey(88)).toBe('tempo.andante');
    expect(tempoWordKey(112)).toBe('tempo.moderato');
    expect(tempoWordKey(132)).toBe('tempo.allegro');
    expect(tempoWordKey(160)).toBe('tempo.vivace');
    expect(tempoWordKey(200)).toBe('tempo.presto');
  });
});

describe('formatting', () => {
  it('signs offsets with a typographic minus', () => {
    expect(signed(38)).toBe('+38');
    expect(signed(-12.4)).toBe('−12');
    expect(signed(0.2)).toBe('0');
    expect(signedMs(38)).toBe('+38 ms');
  });
  it('draws stars and the difficulty meter', () => {
    // Three slots; the 4th star only shows once it is earned.
    expect(starsText(2)).toBe('★★☆');
    expect(starsText(0)).toBe('☆☆☆');
    expect(starsText(3)).toBe('★★★');
    expect(starsText(4)).toBe('★★★★');
    expect(starsText(5)).toBe('★★★★');
    expect(starsLabel(2)).toBe('2 of 3 stars');
    expect(starsLabel(4)).toBe('3 of 3 stars and the bonus 4th star');
    expect(starsLabel(5)).toBe('Diamond: every note perfect');
    expect(difficultyLevel(0)).toBe(1);
    expect(difficultyLevel(5)).toBe(3);
    expect(difficultyLevel(10)).toBe(5);
  });
  it('lists meters in order', () => {
    expect(metersLabel(['4/4', '3/4'])).toBe('3/4 · 4/4');
  });
  it('joins message keys as "a, b or c"', () => {
    expect(orList(['value.quarter'])).toBe('quarter note');
    expect(orList(['value.quarter', 'rest.quarter', 'value.dottedHalf'])).toBe('quarter note, quarter rest or dotted half');
  });
});

describe('setup hints', () => {
  const base: Settings = { ...DEFAULT_SETTINGS };

  it('shows nothing and enables Start for playable settings', () => {
    const feas = checkSettings(base);
    expect(setupHints(base, feas)).toEqual([]);
    expect(startBlockedKey(base, feas)).toBeNull();
  });

  it('asks for a note value when none is on', () => {
    const s = { ...base, notes: [] };
    const feas = checkSettings(s);
    expect(setupHints(s, feas)).toEqual([{ id: 'meter-hint-notes', text: 'Turn on at least one note value to play' }]);
    expect(startBlockedKey(s, feas)).toBe('setup.blockedNoNotes');
  });

  it('names what a blocked meter needs, one line per chosen meter', () => {
    const feas: Feasibility = {
      playable: [],
      ok: false,
      blocked: { '3/4': { key: 'setup.needs', params: { meter: '3/4', values: 'value.quarter,rest.quarter,value.dottedHalf' }, values: ['value.quarter', 'rest.quarter', 'value.dottedHalf'] } },
    };
    const s = { ...base, meters: ['3/4' as const], notes: ['half' as const], rests: [] };
    expect(setupHints(s, feas)).toEqual([{ id: 'meter-hint-3-4', text: '3/4 needs a quarter note, quarter rest or dotted half' }]);
    expect(startBlockedKey(s, feas)).toBe('setup.blockedUnfillable');
  });

  it('only half notes in 3/4 is blocked by the real feasibility check', () => {
    const s = { ...base, meters: ['3/4' as const], notes: ['half' as const], rests: [], dotted: false };
    const feas = checkSettings(s);
    expect(feas.ok).toBe(false);
    const hints = setupHints(s, feas);
    expect(hints).toHaveLength(1);
    expect(hints[0].text.startsWith('3/4 needs')).toBe(true);
  });

  it('asks for a time signature when none is picked', () => {
    const s = { ...base, meters: [] };
    expect(startBlockedKey(s, checkSettings(s))).toBe('setup.blockedNoMeter');
  });
});

const TL: Timeline = {
  beatSeconds: 0.5,
  totalSeconds: 4,
  notes: [
    { index: 0, bar: 0, tick: 0, onset: 0, end: 1, durationTicks: 96, next: 'note' },
    { index: 1, bar: 0, tick: 96, onset: 1, end: 2, durationTicks: 96, next: 'note' },
    { index: 2, bar: 1, tick: 192, onset: 2, end: 2.5, durationTicks: 48, next: 'rest' },
    { index: 3, bar: 1, tick: 288, onset: 3, end: 4, durationTicks: 96, next: 'end' },
  ],
};

describe('play maths', () => {
  it('slices a timeline from a bar and re-bases it', () => {
    const { timeline, firstIndex } = sliceTimeline(TL, 1, 192, 2);
    expect(firstIndex).toBe(2);
    expect(timeline.totalSeconds).toBe(2);
    expect(timeline.notes.map((n) => [n.index, n.bar, n.tick, n.onset, n.end])).toEqual([
      [0, 0, 0, 0, 0.5],
      [1, 0, 96, 1, 2],
    ]);
    expect(sliceTimeline(TL, 0, 192, 2).timeline).toBe(TL);
  });

  it('keeps taps before the replayed bar and ends a hold at the pause', () => {
    const taps = [
      { down: 0.01, up: 0.9 },
      { down: 1.0, up: null },
      { down: 2.02, up: 2.4 },
    ];
    expect(tapsBeforeBar(taps, 1, 2, 2.6)).toEqual([
      { down: 0.01, up: 0.9 },
      { down: 1.0, up: 2 },
    ]);
  });

  it('drops the presses that played the replayed bar by their note, also one made just before its bar line', () => {
    const second = { down: 1.0, up: 1.9 };
    const early = { down: 1.98, up: 2.3 }; // the replayed bar's first note, a little early
    const extraBefore = { down: 1.9, up: 1.92 };
    const extraAfter = { down: 2.6, up: 2.7 };
    const late = { down: 2.03, up: 2.2 }; // a late press for the note before the bar line (as if bar 1 began with a rest)
    const noteOf = new Map<Tap, TimedNote>([
      [second, TL.notes[1]],
      [early, TL.notes[2]],
      [late, TL.notes[1]],
    ]);
    expect(tapsBeforeBar([second, extraBefore, early, late, extraAfter], 1, 2, 2.8, { noteOf: (tp) => noteOf.get(tp) })).toEqual([second, extraBefore, late]);
  });

  it('drops an extra tap in the window of a replayed note too: judged again, it would take that note', () => {
    const replayed = replayedWindows(TL, 1, 'normal');
    // The final judge's Good windows, 120 ms here: bar 1's notes at 2 s and 3 s, not bar 0's at 1 s.
    expect([1.87, 1.88, 2.12, 2.13, 2.95, 0.95].map(replayed)).toEqual([false, true, true, false, true, false]);
    expect(replayedWindows(TL, 1, 'relaxed')(1.85)).toBe(true);
    const played = { down: 1.9, up: 1.92 }; // bar 1's first note, a little early
    const bounce = { down: 1.93, up: 2.3 }; // a second press in its window: an extra tap
    const extra = { down: 1.5, up: 1.6 }; // an extra tap away from the replayed notes
    const noteOf = new Map<Tap, TimedNote>([[played, TL.notes[2]]]);
    expect(tapsBeforeBar([extra, played, bounce], 1, 2, 2.5, { noteOf: (tp) => noteOf.get(tp), inReplayedWindow: replayed })).toEqual([extra]);
  });

  it('a hold the pause cut short, on a note tied into the replayed bar, counts as held to the note’s end', () => {
    // Tied over the bar line at 2 s and followed by a rest: the replay from bar 1 does not play it again.
    const tied = { index: 1, bar: 0, tick: 96, onset: 1, end: 2.75, durationTicks: 168, next: 'rest' as const };
    const held = { down: 1.0, up: 2.3 };
    expect(tapsBeforeBar([held], 1, 2, 2.3, { noteOf: () => tied, held })).toEqual([{ down: 1.0, up: 2.75 }]);
    // Still held when the note had ended: held too long, as played.
    const over = { down: 1.0, up: 2.9 };
    expect(tapsBeforeBar([over], 1, 2, 2.9, { noteOf: () => tied, held: over })).toEqual([over]);
    // Paused again in the count-in before the replay: the hold keeps that end.
    expect(tapsBeforeBar([{ down: 1.0, up: 2.75 }], 1, 2, 2, { noteOf: () => tied })).toEqual([{ down: 1.0, up: 2.75 }]);
  });

  it('finds the beat, including the count-in', () => {
    expect(beatAt(-2, 0.5, 4, 4, 4)).toEqual({ inBar: 0, countIn: true });
    expect(beatAt(-0.1, 0.5, 4, 4, 4)).toEqual({ inBar: 3, countIn: true });
    expect(beatAt(0, 0.5, 4, 4, 4)).toEqual({ inBar: 0, countIn: false });
    expect(beatAt(2.6, 0.5, 4, 4, 4)).toEqual({ inBar: 1, countIn: false });
    expect(beatAt(-3, 0.5, 4, 4, 4).inBar).toBeNull();
    expect(beatAt(4, 0.5, 4, 4, 4).inBar).toBeNull();
  });

  it('fills the ring over the held note and moves the cursor', () => {
    expect(holdProgress(TL.notes[0], 0.5)).toBe(0.5);
    expect(holdProgress(TL.notes[0], 3)).toBe(1);
    expect(holdProgress(null, 1)).toBe(0);
    expect(cursorAt(TL.notes, 0.2, 4)).toBe(0);
    expect(cursorAt(TL.notes, 0.97, 4)).toBe(1);
    expect(cursorAt(TL.notes, 4.1, 4)).toBeNull();
  });

  it('keeps the current row on top of the staff window', () => {
    expect(windowStart(0, 2, 2, 4)).toBe(0);
    expect(windowStart(3, 2, 2, 4)).toBe(0);
    expect(windowStart(2, 2, 2, 8)).toBe(2);
    expect(windowStart(7, 2, 2, 8)).toBe(4);
    expect(windowStart(5, 4, 2, 16)).toBe(4);
  });

  it('names the bar a count-in leads into, also after a pause, where the clock is still in the bar before', () => {
    expect(barAt(-1.5, 2, 0)).toBe(0);
    expect(barAt(3.9, 2, 0)).toBe(1);
    // Resumed at bar 2 (from 4 s): the count-in still runs at 2.4 s, then bar 2 is played.
    expect(barAt(2.4, 2, 2)).toBe(2);
    expect(barAt(4, 2, 2)).toBe(2);
    expect(barAt(6.1, 2, 2)).toBe(3);
  });

  it('scores the starts so far and words the judgement', () => {
    expect(liveAccuracy([], 0)).toBeNull();
    expect(liveAccuracy([], 2)).toBe(0);
    expect(liveAccuracy(['perfect', 'great', 'good', 'miss'], 0)).toBe(65);
    expect(liveAccuracy(['perfect'], 1)).toBe(75);
    expect(pressFeedback({ index: 0, judgement: 'good', offsetMs: 90 })).toEqual({ key: 'judge.goodLate', tone: 'gold' });
    expect(pressFeedback({ index: 0, judgement: 'good', offsetMs: -90 }).key).toBe('judge.goodEarly');
    expect(pressFeedback({ index: null, judgement: 'extra', offsetMs: null }).key).toBe('judge.extra');
  });
});

/** Progress with two stars on every Learning path lesson up to `id` (its number in the path). */
function withPath(id: string): Progress {
  const p = defaultProgress();
  const all = PATH_UNITS.flatMap((u) => u.lessons);
  for (const l of all.slice(0, all.findIndex((x) => x.id === id) + 1)) p.lessons[l.key] = { stars: 2, bestAccuracy: 80 };
  return p;
}

describe('learning path view', () => {
  it('starts at lesson 1.1 (sol) with unit 1 current and the rest locked', () => {
    const p = defaultProgress();
    expect(continueLesson(p)?.lesson).toMatchObject({ id: '1.1', track: 'pitch' });
    const states = unitStates(p);
    expect(states[0]).toBe('current');
    expect(states.slice(1).every((s) => s === 'locked')).toBe(true);
  });

  it('continues with the first lesson without two stars, across notes and rhythm', () => {
    const p = withPath('14.2');
    p.lessons[PATH_UNITS[13].lessons[0].key] = { stars: 3, bestAccuracy: 97 };
    const c = continueLesson(p);
    expect(c?.lesson).toMatchObject({ id: '14.3', track: 'rhythm', ref: '7.3' });
    expect(unitStates(p)[13]).toBe('current');
    expect(tileStates(p, PATH_UNITS[13], '14.3')).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
  });
});

describe('lesson outcome on Results', () => {
  const withStars = (stars: Record<string, number>): Progress => {
    const p = defaultProgress();
    for (const [id, n] of Object.entries(stars)) p.lessons[id] = { stars: n as Stars, bestAccuracy: 80 };
    return p;
  };
  /** Progress keys of every path lesson up to `id` (its number in the path), at `n` stars. */
  const pathUpTo = (id: string, n = 2): Record<string, number> => {
    const all = PATH_UNITS.flatMap((u) => u.lessons);
    return Object.fromEntries(all.slice(0, all.findIndex((l) => l.id === id) + 1).map((l) => [l.key, n]));
  };

  it('a first pass opens the next lesson, and the main button goes there (by its number in the path)', () => {
    const o = lessonOutcome(withStars({ ...pathUpTo('1.5'), '1.1': 2 }), '1.1', 0);
    expect(o).toMatchObject({ kind: 'unlocked', continueId: '2.2' });
    expect(o?.next?.id).toBe('2.2');
  });

  it('under two stars names the lesson two stars would open, and keeps the player on this lesson', () => {
    expect(lessonOutcome(withStars({ ...pathUpTo('1.5'), '1.1': 1 }), '1.1', 0)).toMatchObject({ kind: 'needStars', continueId: null, next: { id: '2.2' } });
    // The last lesson of a rhythm unit opens the next note unit.
    expect(lessonOutcome(withStars({ ...pathUpTo('2.4'), '1.5': 1 }), '1.5', 1)?.next).toMatchObject({ id: '3.1', track: 'pitch' });
  });

  it('playing an earlier lesson again continues the path where it is, not with the lesson after the replayed one', () => {
    const o = lessonOutcome(withStars({ ...pathUpTo('4.2'), '1.2': 3 }), '1.2', 2);
    expect(o).toMatchObject({ kind: 'passed', continueId: '4.3' });
  });

  it('the last lesson to two stars finishes the path; after that Next stays on the same lesson', () => {
    const last = PATH_UNITS[PATH_UNITS.length - 1].lessons[4].id;
    const all = pathUpTo(last);
    expect(lessonOutcome(withStars(all), '8.5', 1)).toMatchObject({ kind: 'pathDone', continueId: null });
    expect(lessonOutcome(withStars(all), '3.2', 2)).toMatchObject({ kind: 'passed', continueId: null });
    expect(lessonOutcome(withStars({ ...all, '8.5': 1 }), '8.5', 0)).toMatchObject({ kind: 'needStars', next: { id: '17.1' } });
  });

  it('is null for a lesson id the path does not have', () => {
    expect(lessonOutcome(defaultProgress(), '99.1', 0)).toBeNull();
  });
});

describe('staff text alternative', () => {
  it('reads the bars in words', () => {
    const label = describeBars(
      [
        {
          symbols: [
            { value: 'quarter', dots: 1, kind: 'note', tieToNext: false, start: 0, duration: 72, onsetIndex: 0 },
            { value: 'eighth', dots: 0, kind: 'note', tieToNext: false, start: 72, duration: 24, onsetIndex: 1 },
            { value: 'half', dots: 0, kind: 'rest', tieToNext: false, start: 96, duration: 96, onsetIndex: -1 },
          ],
        },
      ],
      '4/4',
    );
    expect(label).toBe('Rhythm in 4/4. Bar 1: dotted quarter note, eighth note, half rest.');
  });

  it('reads a rest inside a triplet as a triplet rest, as the bracket over it draws it', () => {
    const tuplet = { num: 3, den: 2, id: 0 } as const;
    const label = describeBars(
      [
        {
          symbols: [
            { value: 'eighth', dots: 0, kind: 'note', tieToNext: false, start: 0, duration: 16, onsetIndex: 0, tuplet },
            { value: 'eighth', dots: 0, kind: 'rest', tieToNext: false, start: 16, duration: 16, onsetIndex: -1, tuplet },
            { value: 'eighth', dots: 0, kind: 'note', tieToNext: false, start: 32, duration: 16, onsetIndex: 1, tuplet },
            { value: 'eighth', dots: 0, kind: 'rest', tieToNext: false, start: 48, duration: 24, onsetIndex: -1 },
            { value: 'eighth', dots: 0, kind: 'note', tieToNext: false, start: 72, duration: 24, onsetIndex: 2 },
            { value: 'half', dots: 0, kind: 'note', tieToNext: false, start: 96, duration: 96, onsetIndex: 3 },
          ],
        },
      ],
      '4/4',
    );
    expect(label).toBe('Rhythm in 4/4. Bar 1: triplet eighth note, triplet eighth rest, triplet eighth note, eighth rest, eighth note, half note.');
  });
});

describe('lesson preview', () => {
  it('knows what a lesson adds over the one before', () => {
    expect(newFeatures('2.3')).toContain('rest:half');
    expect(newFeatures('1.2')).toContain('note:half');
  });

  it('shows a bar with what the lesson adds: a half rest in "Half rests"', () => {
    const p = lessonPreview('2.3')!;
    const bar = exerciseView(p.run.exercise)!.bars[p.bar];
    expect(bar.symbols.some((s) => s.kind === 'rest' && s.value === 'half')).toBe(true);
  });

  it('is the same every visit', () => {
    expect(lessonPreview('4.1')!.run.exercise.seed).toBe(lessonPreview('4.1')!.run.exercise.seed);
  });

  // A phone shows that one bar: it has what the title names, not just something new over the lesson before (3.4's half
  // rest is new over 3.3 too, 7.2 adds no symbol, 4.3 adds half rests as well as half notes, 2.4 only quarter rests,
  // and 3.2's half rest never fits a three-four exercise).
  const is = (kind: NotatedSymbol['kind'], value: NotatedSymbol['value'], dots = 0) => (s: NotatedSymbol) =>
    s.kind === kind && s.value === value && s.dots === dots;
  const tie = (s: NotatedSymbol): boolean => s.tieToNext;
  const rest = (s: NotatedSymbol): boolean => s.kind === 'rest';
  it.each([
    ['2.4', 'Quarter and half rests', [is('rest', 'quarter'), is('rest', 'half')]],
    ['3.2', 'Rests in three-four', [rest]],
    ['3.4', 'Whole rests', [is('rest', 'whole')]],
    ['4.3', 'Eighths with half notes', [is('note', 'eighth'), is('note', 'half')]],
    ['5.3', 'Eighth rests in two-four', [is('rest', 'eighth')]],
    ['6.3', 'Ties in three-four', [tie]],
    ['6.4', 'Ties and rests', [tie, rest]],
    ['7.2', 'Dotted halves in four-four', [is('note', 'half', 1)]],
    ['7.3', 'Dotted quarter + eighth', [is('note', 'quarter', 1), is('note', 'eighth')]],
    ['7.4', 'Dotted quarters in three-four', [is('note', 'quarter', 1)]],
  ])('%s %s: its bar shows what the lesson is about', (id, _title, checks) => {
    const p = lessonPreview(id)!;
    const bar = exerciseView(p.run.exercise)!.bars[p.bar];
    for (const check of checks) expect(bar.symbols.some(check)).toBe(true);
  });

  it('8.3 Eighth and two sixteenths: its bar has an eighth and two sixteenths that fill a beat', () => {
    const p = lessonPreview('8.3')!;
    const s = exerciseView(p.run.exercise)!.bars[p.bar].symbols;
    const figure = [is('note', 'eighth'), is('note', 'sixteenth'), is('note', 'sixteenth')];
    expect(s.some((x, i) => x.start % PPQ === 0 && figure.every((check, k) => s[i + k] !== undefined && check(s[i + k])))).toBe(true);
  });

  // A unit review names nothing: its bar shows what it can of the unit's symbols. Every other lesson's shows all of
  // what it is about, so a lesson that adds what its exercises never have (3.2's half rest in three-four) says so in
  // `preview`.
  it('every lesson but the unit reviews shows all of what it is about', () => {
    for (const { lesson } of ALL_LESSONS.filter(({ lesson }) => !lesson.id.endsWith('.5'))) {
      const p = lessonPreview(lesson.id)!;
      const shown = barFeatures(exerciseView(p.run.exercise)!.bars[p.bar]);
      expect(previewFeatures(lesson.id).filter((k) => !shown.has(k)), lesson.id).toEqual([]);
    }
  });

  it('every lesson shows the symbols it is the first in the path to use (game/intro.ts)', () => {
    for (const { lesson } of ALL_LESSONS) {
      const ids = lessonIntros(lesson.id).map(introId).filter((x) => !x.startsWith('meter:'));
      const p = lessonPreview(lesson.id)!;
      const shown = new Set(
        exerciseView(p.run.exercise)!.bars[p.bar].symbols.flatMap((s) => [s.kind + ':' + s.value, ...(s.dots ? ['dotted'] : []), ...(s.tieToNext ? ['ties'] : [])]),
      );
      expect(ids.filter((x) => !shown.has(x)), lesson.id).toEqual([]);
    }
  });
});

describe('note lesson preview', () => {
  // Home draws the notes on one staff: a round that starts in another clef or key than the lesson's first (18.2 starts
  // in bass clef, 26.3 in E♭ major) drew bass notes under a treble staff, and a B♭ with no flat as a B.
  const lessons = PATH_UNITS.flatMap((u) => u.lessons).filter((l) => l.track === 'notes' || l.track === 'keys');
  it.each([4, 6])('draws up to %i notes, at least 4, each in the clef and key of its staff', (count) => {
    for (const lesson of lessons) {
      const p = noteLessonPreview(lesson, count)!;
      expect(p.notes.length, lesson.id).toBeGreaterThanOrEqual(4);
      expect(p.notes.length, lesson.id).toBeLessThanOrEqual(count);
      for (const n of p.notes) expect([n.clef, n.key], lesson.id).toEqual([p.clef, p.key]);
    }
  });

  it('is the first notes of the round, the same every visit', () => {
    const lesson = lessons.find((l) => l.id === '18.2')!;
    expect(noteLessonPreview(lesson, 4)!.notes).toEqual(noteLessonPreview(lesson, 6)!.notes.slice(0, 4));
    expect(noteLessonPreview(lesson, 4)!.clef).toBe('bass');
    expect(noteLessonPreview(PATH_UNITS[0].lessons[0], 4)).toBeNull();
  });
});
