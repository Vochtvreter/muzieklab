import { DEFAULT_SETTINGS } from '../core/defaults';
import { generateExercise } from '../core/generator';
import { DEFAULT_NOTE_SETTINGS, generateRound, type NoteAnswer, type NoteSettings } from '../core/noteRound';
import { buildTimeline } from '../core/timeline';
import type { JudgeResult, NoteResult } from '../core/types';
import { cellPoints, materialLevel } from './cells';
import {
  cellAccuracy,
  cellTotals,
  markSeen,
  minutesOf,
  playedSeconds,
  readingLevels,
  recordEcho,
  recordNotes,
  recordRhythm,
  recordScales,
  rhythmSeconds,
  LISTEN_LEAD_IN_S,
} from './stats';
import { reviewOf } from './skills';
import { defaultProgress, sanitizeProgress, shiftDay, type DayStats, type Progress } from './storage';

const TODAY = '2026-10-25';
const tap = generateExercise({ ...DEFAULT_SETTINGS, notes: ['half', 'quarter', 'eighth'], bars: 4, tempo: 90 }, 7);
const echo = generateExercise({ ...DEFAULT_SETTINGS, mode: 'echo', bars: 4, tempo: 90 }, 7);

/** A judged run: per note a judgement and an offset in ms (null for a miss). */
function result(ex: typeof tap, judge: (i: number) => [NoteResult['judgement'], number | null], accuracy = 83.6, stars: JudgeResult['stars'] = 2): JudgeResult {
  const notes = buildTimeline(ex).notes.map((_, index): NoteResult => {
    const [judgement, offsetMs] = judge(index);
    return { index, judgement, offsetMs, hold: null, releaseOffsetMs: null, tap: null };
  });
  return { notes, accuracy, stars } as unknown as JudgeResult;
}

/** What the store keeps reads back the same from storage and from the account. */
const readsBack = (p: Progress): void => expect(sanitizeProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);

describe('recordRhythm', () => {
  const r = result(tap, (i) => (i % 4 === 3 ? ['miss', null] : ['great', i % 2 ? -21.6 : 12.4]));

  it('adds a tap round’s seconds, accuracy, timing and cells to today, and the skill practised', () => {
    const p = recordRhythm(defaultProgress(), tap, r, TODAY, 'normal');
    const hits = r.notes.filter((n) => n.judgement !== 'miss');
    expect(p.stats.days[TODAY]).toEqual({
      sec: Math.round(playedSeconds(tap)),
      rounds: 1,
      acc: 84,
      off: hits.reduce((s, n) => s + Math.round(n.offsetMs!), 0),
      hits: hits.length,
      cells: cellPoints(tap, r, 'normal'),
    });
    expect(p.stats.seen).toEqual({ rhythm: TODAY });
    expect(p.stats.echo).toEqual({});
    readsBack(p);
  });

  it('counts a run’s played length: count-in, lead-in and bars', () => {
    // 4 bars of 4/4 at 90 BPM (10.67 s), a bar of count-in (2.67 s) and the 0.4 s lead-in.
    expect(playedSeconds(tap)).toBeCloseTo(16 * (60 / 90) + 4 * (60 / 90) + 0.4, 5);
    expect(playedSeconds({ ...tap, settings: { ...tap.settings, countIn: 2 } })).toBeCloseTo(24 * (60 / 90) + 0.4, 5);
    // Count-in off still plays a (silent) bar first.
    expect(playedSeconds({ ...tap, settings: { ...tap.settings, countIn: 0 } })).toBeCloseTo(playedSeconds(tap), 5);
  });

  it('adds up the rounds of a day', () => {
    const once = recordRhythm(defaultProgress(), tap, r, TODAY, 'normal');
    const twice = recordRhythm(once, tap, { ...r, accuracy: 60 }, TODAY, 'normal');
    const d = twice.stats.days[TODAY];
    expect(d.rounds).toBe(2);
    expect(d.acc).toBe(84 + 60);
    expect(d.sec).toBe(2 * once.stats.days[TODAY].sec);
    expect(d.cells.quarter?.[1]).toBe(2 * once.stats.days[TODAY].cells.quarter![1]);
    readsBack(twice);
  });

  it('counts Echo’s listening as minutes, and Echo as rhythm by ear', () => {
    const r2 = result(echo, () => ['perfect', 3], 98, 4);
    const p = recordRhythm(defaultProgress(), echo, r2, TODAY, 'normal', { plays: 2, replays: 1 });
    expect(p.stats.days[TODAY].sec).toBe(Math.round(rhythmSeconds(echo, 2)));
    // Each listen: the bars, a bar of count-in and Echo's own 0.3 s lead-in (Echo.tsx), not Play's 0.4 s.
    expect(LISTEN_LEAD_IN_S).toBe(0.3);
    expect(rhythmSeconds(echo, 2) - playedSeconds(echo)).toBeCloseTo(2 * (16 * (60 / 90) + 4 * (60 / 90) + 0.3), 5);
    expect(p.stats.seen).toEqual({ ear: TODAY });
    expect(p.stats.echo).toEqual({ [String(materialLevel(echo))]: [1, 4] });
    readsBack(p);
  });

  it('tolerates a partial result (no offsets, no stars)', () => {
    const partial = { notes: [{ index: 0, judgement: 'good', offsetMs: null, hold: null, releaseOffsetMs: null, tap: null }], accuracy: 70 } as unknown as JudgeResult;
    const p = recordRhythm(defaultProgress(), tap, partial, TODAY, 'normal');
    expect(p.stats.days[TODAY]).toMatchObject({ rounds: 1, acc: 70, off: 0, hits: 0 });
    readsBack(p);
  });

  it('keeps the newest 42 days', () => {
    const day: DayStats = { sec: 60, rounds: 1, acc: 90, off: 0, hits: 1, cells: {} };
    const days = Object.fromEntries(Array.from({ length: 42 }, (_, i) => [shiftDay(TODAY, -1 - i), day]));
    const p = recordRhythm({ ...defaultProgress(), stats: { ...defaultProgress().stats, days } }, tap, r, TODAY, 'normal');
    const kept = Object.keys(p.stats.days).sort();
    expect(kept).toHaveLength(42);
    expect(kept[0]).toBe(shiftDay(TODAY, -41));
    expect(kept[41]).toBe(TODAY);
    readsBack(p);
  });

  it('keeps today’s figures when days a clock set forward wrote fill the window', () => {
    const day: DayStats = { sec: 60, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} };
    // 42 days of the account a year ahead, then a round with the clock right.
    const ahead = Array.from({ length: 42 }, (_, i) => shiftDay('2027-10-01', i));
    const p = recordRhythm({ ...defaultProgress(), stats: { ...defaultProgress().stats, days: Object.fromEntries(ahead.map((d) => [d, day])) } }, tap, r, TODAY, 'normal');
    expect(p.stats.days[TODAY]).toMatchObject({ rounds: 1 });
    expect(Object.keys(p.stats.days).sort()).toEqual([TODAY, ...ahead.slice(1)]);
    // The next day keeps both days played; the days ahead give way one by one.
    const q = recordScales(p, 120, shiftDay(TODAY, 1));
    expect(Object.keys(q.stats.days).sort()).toEqual([TODAY, shiftDay(TODAY, 1), ...ahead.slice(2)]);
    readsBack(p);
    readsBack(q);
  });

  it('counts a day just after today as played (a time zone ahead), and a clock set back drops no more than it adds', () => {
    const day: DayStats = { sec: 60, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} };
    // The 41 days before today, and tomorrow (another device a time zone ahead).
    const real = [...Array.from({ length: 41 }, (_, i) => shiftDay(TODAY, -41 + i)), shiftDay(TODAY, 1)];
    const p = { ...defaultProgress(), stats: { ...defaultProgress().stats, days: Object.fromEntries(real.map((d) => [d, day])) } };
    // Today with tomorrow already there: the oldest day goes, as always.
    expect(Object.keys(recordScales(p, 60, TODAY).stats.days).sort()).toEqual([...real.slice(1, 41), TODAY, shiftDay(TODAY, 1)]);
    // A clock set back years: its one day is kept, and only the oldest of the days played goes.
    const back = recordScales(p, 60, '2001-01-01');
    expect(Object.keys(back.stats.days).sort()).toEqual(['2001-01-01', ...real.slice(1)]);
    readsBack(back);
  });
});

describe('recordEcho', () => {
  const four = echo;
  const two = generateExercise({ ...DEFAULT_SETTINGS, mode: 'echo', bars: 2 }, 3);

  it('counts rounds at ★★ or more per material level, and keeps the best stars of 4 bars or more', () => {
    const level = String(materialLevel(four));
    let p = recordEcho(defaultProgress(), four, { stars: 1 });
    expect(p.stats.echo).toEqual({ [level]: [0, 1] });
    p = recordEcho(p, four, { stars: 3 });
    p = recordEcho(p, four, { stars: 2 });
    expect(p.stats.echo).toEqual({ [level]: [2, 3] });
    // Two bars: a round at ★★ counts, its stars are not a 4-bar best; under ★★ it adds nothing.
    const short = String(materialLevel(two));
    expect(recordEcho(defaultProgress(), two, { stars: 2 }).stats.echo).toEqual({ [short]: [1, 0] });
    const none = defaultProgress();
    expect(recordEcho(none, two, { stars: 1 })).toBe(none);
  });
});

describe('recordNotes', () => {
  const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, clefs: ['treble', 'bass'], keys: ['G'], count: 20 };
  const notes = generateRound(settings, 11);
  const answers: NoteAnswer[] = notes.map((_, i) => ({ outcome: i % 5 === 0 ? 'wrong' : i % 7 === 0 ? 'hinted' : 'right', ms: i === 3 ? 40000 : 1000 + 100 * i, given: null }));

  it('counts right and answered per clef, answer times per note (capped at 15 s), the key and the seconds', () => {
    const p = recordNotes(defaultProgress(), notes, answers, settings, TODAY);
    for (const clef of ['treble', 'bass'] as const) {
      const mine = notes.map((n, i) => ({ n, a: answers[i] })).filter((x) => x.n.clef === clef);
      expect(p.stats.clefs[clef]).toEqual([mine.filter((x) => x.a.outcome === 'right').length, mine.length]);
    }
    const capped = answers.map((a) => Math.min(15000, a.ms));
    const total = Object.values(p.stats.noteMs).reduce((s, [ms]) => s + ms, 0);
    expect(total).toBe(capped.reduce((s, x) => s + x, 0));
    expect(Object.values(p.stats.noteMs).reduce((s, [, n]) => s + n, 0)).toBe(notes.length);
    expect(p.stats.lastKey).toEqual({ key: 'G', clef: notes[notes.length - 1].clef });
    expect(p.stats.days[TODAY].sec).toBe(Math.round(total / 1000));
    expect(p.stats.days[TODAY].rounds).toBe(0);
    expect(p.stats.seen).toEqual({ treble: TODAY, bass: TODAY });
    readsBack(p);
  });

  it('keeps each clef’s best accuracy and fastest average for the levels the round covers', () => {
    const p = recordNotes(defaultProgress(), notes, answers, settings, TODAY);
    // Whole staff in G major (1 sharp): lines, spaces, the whole staff and keys with one sharp or flat.
    expect(readingLevels(settings, 'treble')).toEqual([1, 2, 3, 6]);
    const treble = notes.map((n, i) => ({ n, a: answers[i] })).filter((x) => x.n.clef === 'treble');
    const acc = Math.round((treble.filter((x) => x.a.outcome === 'right').length / treble.length) * 100);
    const avg = Math.round(treble.reduce((s, x) => s + Math.min(15000, x.a.ms), 0) / treble.length);
    for (const level of [1, 2, 3, 6]) expect(p.stats.reading[`treble:${level}`]).toEqual([acc, avg]);
    expect(p.stats.reading['treble:4']).toBeUndefined();
    // A better round raises the accuracy; a slower one keeps the faster time.
    const right = answers.map((a): NoteAnswer => ({ ...a, outcome: 'right', ms: 9000 }));
    const q = recordNotes(p, notes, right, settings, TODAY);
    expect(q.stats.reading['treble:1']).toEqual([100, avg]);
    readsBack(q);
  });

  it('needs a few notes of a clef for its levels, and records nothing without answers', () => {
    const few = recordNotes(defaultProgress(), notes.slice(0, 4), answers.slice(0, 4), settings, TODAY);
    expect(few.stats.reading).toEqual({});
    expect(Object.values(few.stats.clefs).reduce((s, x) => s + x![1], 0)).toBe(4);
    const none = defaultProgress();
    expect(recordNotes(none, notes, [], settings, TODAY)).toBe(none);
  });

  it('counts a short round as a second at least, so its day shows a minute', () => {
    const p = recordNotes(defaultProgress(), notes.slice(0, 1), [{ outcome: 'right', ms: 450, given: null }], settings, TODAY);
    expect(p.stats.days[TODAY].sec).toBe(1);
    expect(minutesOf(p.stats.days[TODAY].sec)).toBe(1);
  });
});

describe('readingLevels', () => {
  const s = (patch: Partial<NoteSettings>): NoteSettings => ({ ...DEFAULT_NOTE_SETTINGS, ...patch });
  it('covers the levels whose notes and keys the round draws', () => {
    expect(readingLevels(s({}), 'treble')).toEqual([1, 2, 3]);
    expect(readingLevels(s({ range: 'ledger1' }), 'treble')).toEqual([1, 2, 3, 4, 5]);
    expect(readingLevels(s({ range: 'ledger2' }), 'bass')).toEqual([1, 2, 3, 4, 5, 8]);
    expect(readingLevels(s({ keys: ['F'] }), 'bass')).toEqual([1, 2, 3, 6]);
    // The most sharps or flats among the keys of a Mix keys round.
    expect(readingLevels(s({ keys: ['C', 'A'], mixKeys: true }), 'treble')).toEqual([1, 2, 3, 7]);
    expect(readingLevels(s({ keys: ['C', 'A'], mixKeys: false }), 'treble')).toEqual([1, 2, 3]);
    expect(readingLevels(s({ keys: ['Db'] }), 'treble')).toEqual([1, 2, 3, 9]);
    expect(readingLevels(s({ keys: ['Cb'] }), 'treble')).toEqual([1, 2, 3, 10]);
  });
  it('follows the positions a lesson narrows its notes to', () => {
    // Treble lines only (E4 G4 B4 D5 F5), or middle C to G.
    expect(readingLevels(s({ only: [30, 32, 34, 36, 38] }), 'treble')).toEqual([1]);
    expect(readingLevels(s({ range: 'ledger1', only: [28, 29, 30, 31, 32] }), 'treble')).toEqual([4]);
  });
});

describe('recordScales and markSeen', () => {
  it('adds a Scales round’s seconds and the skill', () => {
    const p = recordScales(defaultProgress(), 61.6, TODAY);
    expect(p.stats.days[TODAY]).toEqual({ sec: 62, rounds: 0, acc: 0, off: 0, hits: 0, cells: {} });
    expect(recordScales(defaultProgress(), 0.3, TODAY).stats.days[TODAY].sec).toBe(1);
    expect(p.stats.seen).toEqual({ scales: TODAY });
    readsBack(p);
  });

  it('keeps the later day a skill was practised, unless a clock set forward wrote it', () => {
    const p = markSeen(defaultProgress(), 'theory', TODAY);
    expect(markSeen(p, 'theory', TODAY)).toBe(p);
    expect(markSeen(p, 'theory', '2026-10-26').stats.seen.theory).toBe('2026-10-26');
    // A day after today: another device a time zone ahead.
    expect(markSeen(p, 'theory', '2026-10-24')).toBe(p);
    // More than a day after today: written by a clock set wrong, so today's day replaces it.
    expect(markSeen(p, 'theory', '2026-10-01').stats.seen.theory).toBe('2026-10-01');
  });

  it('corrects the day practised once the clock is right again, so review comes due', () => {
    const r = result(tap, () => ['great', 5]);
    let p: Progress = { ...defaultProgress(), skills: { 'rhythm:1': '2026-10-01' } };
    p = recordRhythm(p, tap, r, '2027-01-15', 'normal');
    expect(p.stats.seen.rhythm).toBe('2027-01-15');
    p = recordRhythm(p, tap, r, TODAY, 'normal');
    expect(p.stats.seen.rhythm).toBe(TODAY);
    expect(reviewOf(p, 'rhythm', shiftDay(TODAY, 30))).toEqual({ due: true, days: 30 });
    readsBack(p);
  });

  it('shows whole minutes, at least 1 for a day with practice', () => {
    expect([0, 1, 29, 90, 149, 151].map(minutesOf)).toEqual([0, 1, 1, 2, 2, 3]);
  });
});

describe('cellTotals', () => {
  const day = (cells: DayStats['cells']): DayStats => ({ sec: 0, rounds: 1, acc: 0, off: 0, hits: 0, cells });

  it('adds up the last 42 days, today included, and shows an accuracy from 12 notes', () => {
    const days = {
      [TODAY]: day({ ties: [700, 800] }),
      [shiftDay(TODAY, -41)]: day({ ties: [300, 400], half: [1100, 1100] }),
      [shiftDay(TODAY, -42)]: day({ ties: [0, 5000] }),
    };
    const t = cellTotals({ ...defaultProgress(), stats: { ...defaultProgress().stats, days } }, TODAY);
    expect(t.ties).toEqual([1000, 1200]);
    expect(t.half).toEqual([1100, 1100]);
    expect(t.quarter).toEqual([0, 0]);
    expect(cellAccuracy(t.ties)).toBe(83);
    expect(cellAccuracy(t.half)).toBeNull(); // 11 notes
    expect(cellAccuracy(t.quarter)).toBeNull();
  });
});
