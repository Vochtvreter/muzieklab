import type { Exercise, Meter, NotatedBar, NotatedSymbol, RhythmEvent, Settings } from './types';
import { PPQ } from './types';
import { restShapeOk } from './cells';
import { groupRests } from './rests';
import { valueForTicks } from './values';

interface Piece {
  start: number;
  duration: number;
}

const PLAIN = [4 * PPQ, 2 * PPQ, PPQ, PPQ / 2, PPQ / 4];
const DOTTED = [3 * PPQ, 1.5 * PPQ, 0.75 * PPQ];

/**
 * Splits a span into writable values: the largest value that fits, starts on its own grid, and does not run
 * past the next beat unless it starts on a beat. A fallback for spans the generator never makes directly.
 */
function greedy(
  meter: Meter,
  start: number,
  dur: number,
  allowDotted: (ticks: number) => boolean,
  shapeOk: (pos: number, ticks: number) => boolean = () => true,
): Piece[] {
  const sizes = [...PLAIN, ...DOTTED.filter(allowDotted)].sort((a, b) => b - a);
  const out: Piece[] = [];
  let pos = start;
  const end = start + dur;
  while (pos < end) {
    const rem = end - pos;
    const fits = (c: number): boolean => {
      if (c > rem || !shapeOk(pos, c)) return false;
      const plain = DOTTED.includes(c) ? (c * 2) / 3 : c;
      if (pos % Math.min(plain, meter.beatTicks) !== 0) return false;
      if (pos % meter.beatTicks !== 0 && pos + c > Math.ceil(pos / meter.beatTicks) * meter.beatTicks) return false;
      return !(meter.id === '4/4' && pos < 2 * PPQ && pos + c > 2 * PPQ && pos !== 0);
    };
    const c = sizes.find(fits) ?? sizes.find((x) => x <= rem) ?? rem;
    out.push({ start: pos, duration: c });
    pos += c;
  }
  return out;
}

/** A sounding span as tied pieces (§5.7 strict style): never hide the middle of a 4/4 bar unless starting on beat 1. */
function splitNote(meter: Meter, e: RhythmEvent, s: Settings): Piece[] {
  const mid = 2 * PPQ;
  const spans: Piece[] =
    meter.id === '4/4' && e.start > 0 && e.start < mid && e.start + e.duration > mid
      ? [
          { start: e.start, duration: mid - e.start },
          { start: mid, duration: e.start + e.duration - mid },
        ]
      : [{ start: e.start, duration: e.duration }];
  return spans.flatMap((p) => {
    const v = valueForTicks(p.duration);
    if (v && (!v.dots || s.dotted)) return [p];
    return greedy(meter, p.start, p.duration, () => s.dotted);
  });
}

function splitRest(meter: Meter, e: RhythmEvent): Piece[] {
  if (restShapeOk(meter, e.start, e.duration)) return [{ start: e.start, duration: e.duration }];
  return greedy(meter, e.start, e.duration, (t) => t < meter.beatTicks, (pos, t) => restShapeOk(meter, pos, t));
}

const beamable = (sym: NotatedSymbol): boolean => sym.kind === 'note' && (sym.value === 'eighth' || sym.value === 'sixteenth');

/** Beams per beat (never across beats), tuplet brackets per beat. */
function beamAndTuplets(meter: Meter, symbols: NotatedSymbol[]): void {
  let beamId = 0;
  let tupletId = 0;
  const beatOf = (sym: NotatedSymbol): number => Math.floor(sym.start / meter.beatTicks);
  const inOneBeat = (sym: NotatedSymbol): boolean => beatOf(sym) === Math.floor((sym.start + sym.duration - 1) / meter.beatTicks);
  let i = 0;
  while (i < symbols.length) {
    if (!beamable(symbols[i]) || !inOneBeat(symbols[i])) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < symbols.length && beamable(symbols[j]) && inOneBeat(symbols[j]) && beatOf(symbols[j]) === beatOf(symbols[i])) j++;
    if (j - i > 1) {
      for (let k = i; k < j; k++) symbols[k].beamGroup = beamId;
      beamId++;
    }
    i = j;
  }
  i = 0;
  while (i < symbols.length) {
    if (!symbols[i].tuplet) {
      i++;
      continue;
    }
    const beat = beatOf(symbols[i]);
    const id = tupletId++;
    while (i < symbols.length && symbols[i].tuplet && beatOf(symbols[i]) === beat) {
      symbols[i].tuplet = { num: 3, den: 2, id };
      i++;
    }
  }
}

/** Rhythm -> notation (§5.7). onsetIndex numbering matches buildTimeline(). */
export function spellExercise(exercise: Exercise): NotatedBar[] {
  const { meter, settings: s } = exercise;
  let onset = 0;
  // A tie only continues a sounding note; a stray tieFromPrev after a rest is a new onset (as in buildTimeline).
  const continues = new Set<RhythmEvent>();
  let prev: RhythmEvent | undefined;
  for (const e of exercise.bars.flatMap((bar) => bar.events)) {
    if (e.kind === 'note' && e.tieFromPrev && prev?.kind === 'note') continues.add(e);
    prev = e;
  }
  const tiedOn = (e: RhythmEvent | undefined): boolean => !!e && continues.has(e);
  return exercise.bars.map((bar, b) => {
    if (bar.events.every((e) => e.kind === 'rest')) {
      return {
        symbols: [
          { value: 'whole', dots: 0, kind: 'rest', tieToNext: false, start: 0, duration: meter.barTicks, onsetIndex: -1, wholeBarRest: true },
        ],
      };
    }
    const nextBarFirst = exercise.bars[b + 1]?.events[0];
    const events = groupRests(meter, s, bar.events);
    const symbols: NotatedSymbol[] = [];
    events.forEach((e, i) => {
      if (e.triplet) {
        const sym: NotatedSymbol = { value: 'eighth', dots: 0, kind: e.kind, tieToNext: false, start: e.start, duration: e.duration, onsetIndex: -1, tuplet: { num: 3, den: 2, id: 0 } };
        if (e.kind === 'note') {
          if (!continues.has(e)) sym.onsetIndex = onset++;
          sym.tieToNext = tiedOn(events[i + 1] ?? nextBarFirst);
        }
        symbols.push(sym);
        return;
      }
      const pieces = e.kind === 'note' ? splitNote(meter, e, s) : splitRest(meter, e);
      const next = events[i + 1] ?? nextBarFirst;
      pieces.forEach((p, k) => {
        const v = valueForTicks(p.duration) ?? { value: 'sixteenth' as const, dots: 0 as const };
        const last = k === pieces.length - 1;
        symbols.push({
          value: v.value,
          dots: v.dots,
          kind: e.kind,
          tieToNext: e.kind === 'note' && (!last || tiedOn(next)),
          start: p.start,
          duration: p.duration,
          onsetIndex: e.kind === 'note' && k === 0 && !continues.has(e) ? onset++ : -1,
        });
      });
    });
    beamAndTuplets(meter, symbols);
    return { symbols };
  });
}
