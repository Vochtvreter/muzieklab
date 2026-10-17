import { describe, expect, it } from 'vitest';
import { checkSettings, DEFAULT_SETTINGS, type Feasibility, type Settings, type Timeline } from '../../core/api';
import { defaultProgress } from '../../game/storage';
import { UNITS } from '../../game/path';
import { difficultyLevel, lastTimeChips, metersLabel, orList, signed, signedMs, starsText, tempoWordKey } from './format';
import { continueLesson, lessonPreview, newFeatures, tileStates, unitStates } from './lessons';
import { exerciseView } from '../exerciseView';
import { beatAt, cursorAt, holdProgress, liveAccuracy, pressFeedback, sliceTimeline, tapsBeforeBar, windowStart } from './playMath';
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
    expect(starsText(2)).toBe('★★☆☆');
    expect(starsText(0)).toBe('☆☆☆☆');
    expect(starsText(4)).toBe('★★★★');
    expect(starsText(5)).toBe('★★★★');
    expect(difficultyLevel(0)).toBe(1);
    expect(difficultyLevel(5)).toBe(3);
    expect(difficultyLevel(10)).toBe(5);
  });
  it('lists meters in order and builds the last-time chips', () => {
    expect(metersLabel(['4/4', '3/4'])).toBe('3/4 · 4/4');
    const s: Settings = { ...DEFAULT_SETTINGS, meters: ['4/4', '3/4'], bars: 4, tempo: 88 };
    expect(lastTimeChips(s)).toEqual(['3/4 · 4/4', '4 bars', '88 BPM']);
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

describe('learning path view', () => {
  it('starts at lesson 1.1 with unit 1 current and the rest locked', () => {
    const p = defaultProgress();
    expect(continueLesson(p)?.lesson.id).toBe('1.1');
    const states = unitStates(p);
    expect(states[0]).toBe('current');
    expect(states.slice(1).every((s) => s === 'locked')).toBe(true);
  });

  it('continues with the first lesson without two stars', () => {
    const p = defaultProgress();
    for (const u of UNITS.slice(0, 6)) for (const l of u.lessons) p.lessons[l.id] = { stars: 2, bestAccuracy: 80 };
    p.lessons['7.1'] = { stars: 3, bestAccuracy: 97 };
    p.lessons['7.2'] = { stars: 2, bestAccuracy: 85 };
    const c = continueLesson(p);
    expect(c?.lesson.id).toBe('7.3');
    expect(unitStates(p)[6]).toBe('current');
    expect(tileStates(p, UNITS[6], '7.3')).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
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
});
