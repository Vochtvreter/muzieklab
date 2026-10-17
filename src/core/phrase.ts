/** Phrase structure (§5.4): form plans and one-operation variations. */
import type { Bar, RhythmEvent } from './types';
import { PPQ } from './types';
import type { Rng } from './rng';
import type { GenContext } from './bar';
import { regenerateBeat } from './bar';
import { restShapeOk } from './cells';
import { valueForTicks } from './values';

const PLANS: Record<number, string[][]> = {
  1: [['a']],
  2: [['a', 'b'], ['a', "a'"]],
  3: [['a', "a'", 'b'], ['a', 'b', 'a']],
  4: [
    ['a', "a'", 'b', 'a'],
    ['a', 'b', 'a', 'c'],
    ['a', 'a', 'b', 'c'],
    ['a', 'b', "a'", "b'"],
  ],
};

export const baseOf = (token: string): string => token.replace(/'+$/, '');
const prime = (token: string): string => token + "'";

function groupSizes(n: number): number[] {
  const out: number[] = [];
  let rem = n;
  while (rem > 0) {
    if (rem >= 8 || rem === 4) {
      out.push(4);
      rem -= 4;
    } else if (rem === 5) {
      out.push(3, 2);
      rem = 0;
    } else if (rem > 4) {
      out.push(4, rem - 4);
      rem = 0;
    } else {
      out.push(rem);
      rem = 0;
    }
  }
  return out;
}

/** Form plan for n bars, as groups of tokens. 8 bars = antecedent + consequent, e.g. a b a c | a b a' d. */
export function pickForm(n: number, rng: Rng): string[][] {
  const groups: string[][] = [];
  let nextLetter = 0;
  const fresh = (size: number): string[] => {
    const plan = rng.pick(PLANS[size]);
    const used = new Set(plan.map(baseOf));
    const map = new Map<string, string>();
    [...used].sort().forEach((l) => map.set(l, String.fromCharCode(97 + nextLetter++)));
    return plan.map((t) => map.get(baseOf(t)) + t.slice(1));
  };
  groupSizes(n).forEach((size, g) => {
    const prev = groups[g - 1];
    if (size === 4 && g % 2 === 1 && prev?.length === 4) {
      const last = String.fromCharCode(97 + nextLetter++);
      groups.push([prev[0], prev[1], prime(prev[2]), last]);
    } else {
      groups.push(fresh(size));
    }
  });
  return groups;
}

export function formString(groups: string[][]): string {
  return groups.map((g) => g.join(' ')).join(' | ');
}

const sameEvents = (a: RhythmEvent[], b: RhythmEvent[]): boolean =>
  a.length === b.length &&
  a.every((e, i) => e.start === b[i].start && e.duration === b[i].duration && e.kind === b[i].kind && !!e.triplet === !!b[i].triplet);

export const sameBar = (a: Bar, b: Bar): boolean => sameEvents(a.events, b.events);

const clone = (bar: Bar): Bar => ({ events: bar.events.map((e) => ({ ...e })) });

type Op = (ctx: GenContext, bar: Bar) => Bar | null;

/** Diminution: split one note into two of half the length. */
const diminution: Op = (ctx, bar) => {
  const cands = bar.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => {
      if (e.kind !== 'note' || e.triplet) return false;
      if (![4 * PPQ, 2 * PPQ, PPQ, PPQ / 2].includes(e.duration)) return false;
      const half = valueForTicks(e.duration / 2);
      return !!half && ctx.settings.notes.includes(half.value);
    });
  if (!cands.length) return null;
  const { e, i } = ctx.rng.pick(cands);
  const out = clone(bar);
  const d = e.duration / 2;
  out.events.splice(i, 1, { start: e.start, duration: d, kind: 'note' }, { start: e.start + d, duration: d, kind: 'note' });
  return out;
};

/** Augmentation: merge two adjacent equal notes inside one beat group into one. */
const augmentation: Op = (ctx, bar) => {
  const m = ctx.meter;
  const cands: number[] = [];
  for (let i = 0; i + 1 < bar.events.length; i++) {
    const a = bar.events[i];
    const b = bar.events[i + 1];
    if (a.kind !== 'note' || b.kind !== 'note' || a.triplet || b.triplet || a.duration !== b.duration) continue;
    const d = a.duration;
    const merged = valueForTicks(2 * d);
    if (!merged || merged.dots || !ctx.settings.notes.includes(merged.value)) continue;
    let ok: boolean;
    if (d <= PPQ / 2) ok = a.start % (2 * d) === 0 && Math.floor(a.start / PPQ) === Math.floor((b.start + d - 1) / PPQ);
    else if (d === PPQ) ok = m.id === '3/4' ? a.start % PPQ === 0 : a.start % (2 * PPQ) === 0;
    else ok = m.id === '4/4' && a.start === 0 && d === 2 * PPQ;
    if (ok) cands.push(i);
  }
  if (!cands.length) return null;
  const i = ctx.rng.pick(cands);
  const out = clone(bar);
  const a = out.events[i];
  out.events.splice(i, 2, { start: a.start, duration: a.duration * 2, kind: 'note' });
  return out;
};

/** Rest substitution: a note on a weak position becomes a rest of the same length. */
const restSubstitution: Op = (ctx, bar) => {
  const m = ctx.meter;
  const s = ctx.settings;
  const cands = bar.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => {
      if (e.kind !== 'note' || e.start === 0 || m.weightAt(e.start) > 2) return false;
      if (e.triplet) return s.triplets && s.rests.includes('eighth') && e.start % PPQ !== 0;
      const v = valueForTicks(e.duration);
      if (!v || !s.rests.includes(v.value) || (v.dots && !s.dotted)) return false;
      return restShapeOk(m, e.start, e.duration);
    });
  if (!cands.length) return null;
  const { i } = ctx.rng.pick(cands);
  const out = clone(bar);
  out.events[i] = { ...out.events[i], kind: 'rest' };
  if (out.events.every((e) => e.kind === 'rest')) return null;
  return out;
};

/** Cell swap: one beat gets a fresh figure. Only for beats no event crosses. */
const cellSwap: Op = (ctx, bar) => {
  const m = ctx.meter;
  const beats: number[] = [];
  for (let b = 0; b < m.barTicks; b += m.beatTicks) {
    const crosses = bar.events.some((e) => e.start < b + m.beatTicks && e.start + e.duration > b && (e.start < b || e.start + e.duration > b + m.beatTicks));
    if (!crosses) beats.push(b);
  }
  if (!beats.length) return null;
  const b = ctx.rng.pick(beats);
  for (let t = 0; t < 4; t++) {
    const next = regenerateBeat(ctx, bar, b);
    if (next && !sameBar(next, bar)) return next;
  }
  return null;
};

const OPS: Op[] = [diminution, augmentation, restSubstitution, cellSwap];

/** One random variation operation; null when it does not apply. */
export function randomOp(ctx: GenContext, bar: Bar, rng: Rng): Bar | null {
  return rng.pick(OPS)(ctx, bar);
}

/** A variation a' of a bar, made with one operation (tried in random order); null when none changes the bar. */
export function vary(ctx: GenContext, bar: Bar, rng: Rng, accept: (b: Bar) => boolean): Bar | null {
  for (const op of rng.shuffle(OPS)) {
    for (let t = 0; t < 3; t++) {
      const out = op(ctx, bar);
      if (!out) break;
      if (!sameBar(out, bar) && accept(out)) return out;
    }
  }
  return null;
}
