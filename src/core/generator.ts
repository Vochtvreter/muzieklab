import type { Bar, Exercise, Meter, NoteValue, RhythmEvent, Settings } from './types';
import { METER_IDS, PPQ } from './types';
import { getMeter, isCadencePosition } from './meters';
import { checkSettings } from './feasibility';
import { Tree } from './cells';
import { Rng } from './rng';
import { generateBar, type GenContext } from './bar';
import { baseOf, formString, pickForm, sameBar, vary } from './phrase';
import { valueForTicks, VALUE_TICKS } from './values';
import { rateDifficulty } from './difficulty';

const ATTEMPTS = 40;

/** Clamp to the ranges of §4 and fall back to a quarter note when nothing is playable (never throws). */
export function normaliseSettings(settings: Settings): Settings {
  const s: Settings = {
    ...settings,
    meters: METER_IDS.filter((m) => settings.meters.includes(m)),
    notes: [...new Set(settings.notes)],
    rests: [...new Set(settings.rests)],
    bars: Math.max(1, Math.min(16, Math.round(settings.bars) || 1)),
    tempo: Math.max(40, Math.min(200, Math.round(settings.tempo) || 80)),
  };
  if (!s.meters.length) s.meters = ['4/4'];
  if (!checkSettings(s).ok) s.notes = [...new Set<NoteValue>([...s.notes, 'quarter'])];
  return s;
}

/** Cadence (§5.4): the last sounding note starts on a strong beat and lasts ≥ a beat, or only rests follow it. */
export function cadenceOk(meter: Meter, bars: Bar[]): boolean {
  const last = bars.length - 1;
  const events = bars[last].events;
  let k = events.length - 1;
  while (k >= 0 && events[k].kind === 'rest') k--;
  if (k < 0) return false;
  let start = k;
  while (start > 0 && events[start].tieFromPrev) start--;
  if (events[start].tieFromPrev) return false; // the sound began in an earlier bar
  const e = events[start];
  if (!isCadencePosition(meter, e.start)) return false;
  const length = events[k].start + events[k].duration - e.start;
  return k < events.length - 1 || length >= meter.beatTicks;
}

/** Longest continuous silence, in ticks, across bar lines. */
function longestRest(bars: Bar[]): number {
  let run = 0;
  let best = 0;
  for (const bar of bars) {
    for (const e of bar.events) {
      run = e.kind === 'rest' ? run + e.duration : 0;
      best = Math.max(best, run);
    }
  }
  return best;
}

/** Coverage atoms present in the exercise (same naming as Tree.reachableAtoms). */
function presentAtoms(meter: Meter, bars: Bar[]): Set<string> {
  const atoms = new Set<string>();
  for (const bar of bars) {
    for (const e of bar.events) {
      if (e.tieFromPrev) atoms.add('synco');
      if (e.triplet) {
        atoms.add('triplets');
        continue;
      }
      if (e.kind === 'rest' && e.duration === meter.barTicks) {
        atoms.add('r:whole');
        continue;
      }
      const v = valueForTicks(e.duration);
      if (!v) continue;
      atoms.add(v.dots ? 'dotted' : (e.kind === 'note' ? 'n:' : 'r:') + v.value);
      const offBeat = e.start % PPQ !== 0 && e.duration >= PPQ;
      const hidesMiddle = meter.id === '4/4' && e.start > 0 && e.start < 2 * PPQ && e.start + e.duration > 2 * PPQ;
      if (e.kind === 'note' && (offBeat || hidesMiddle)) atoms.add('synco');
    }
  }
  return atoms;
}

/** Events per beat, scaled between the slowest and the fastest the enabled values allow (0–1). */
function relativeDensity(meter: Meter, s: Settings, bars: Bar[]): number | null {
  const lengths = [...s.notes, ...s.rests].map((v) => VALUE_TICKS[v]).filter((t) => t <= meter.barTicks);
  if (s.dotted && s.notes.includes('half') && meter.id !== '2/4') lengths.push(3 * PPQ);
  if (s.triplets && s.notes.includes('eighth')) lengths.push(PPQ / 3);
  if (!lengths.length) return null;
  const lo = meter.beatTicks / Math.max(...lengths);
  const hi = meter.beatTicks / Math.min(...lengths);
  if (hi - lo < 0.05) return null;
  const events = bars.reduce((n, b) => n + b.events.length, 0);
  return (events / (bars.length * meter.beatsPerBar) - lo) / (hi - lo);
}

const DENSITY_RANGE: Record<Settings['density'], [number, number]> = {
  sparse: [0, 0.5],
  balanced: [0.08, 0.8],
  busy: [0.3, 1],
};

/** Ties across bar lines (optional extra): only inside a phrase, between short notes, never into triplets. */
function addBarTies(bars: Bar[], rng: Rng): void {
  for (let i = 0; i + 1 < bars.length; i++) {
    if ((i + 1) % 4 === 0) continue;
    const a = bars[i].events[bars[i].events.length - 1];
    const b = bars[i + 1].events[0];
    if (a.kind !== 'note' || b.kind !== 'note' || a.triplet || b.triplet || b.tieFromPrev) continue;
    if (a.duration > 2 * PPQ || b.duration > 2 * PPQ) continue;
    if (rng.chance(0.3)) b.tieFromPrev = true;
  }
}

interface Candidate {
  bars: Bar[];
  form: string;
  penalty: number;
}

function buildCandidate(ctx: GenContext, n: number, required: Set<string>): Candidate {
  const { meter, settings: s, rng } = ctx;
  const groups = pickForm(n, rng);
  const tokens = groups.flat();
  const lastToken = tokens[tokens.length - 1];
  const base = new Map<string, Bar>();
  const variant = new Map<string, Bar>();
  let penalty = 0;

  const makeBase = (letter: string): Bar => {
    const first = tokens[0] === letter;
    const cadence = baseOf(lastToken) === letter;
    const others = [...base.values()];
    const { bar, ok } = generateBar(
      ctx,
      first,
      (b) => (!cadence || cadenceOk(meter, [b])) && !others.some((o) => sameBar(o, b)),
    );
    if (!ok) penalty += cadence ? 5 : 1;
    base.set(letter, bar);
    return bar;
  };

  const bars = tokens.map((token) => {
    const letter = baseOf(token);
    const b = base.get(letter) ?? makeBase(letter);
    if (token === letter) return b;
    let v = variant.get(token);
    if (!v) {
      const needCadence = token === lastToken;
      v = vary(ctx, b, rng, (x) => !needCadence || cadenceOk(meter, [x])) ?? b;
      variant.set(token, v);
    }
    return v;
  });

  // Rules that look at the whole exercise (§5.5); the history-hash rule is the caller's business.
  tokens.forEach((t, i) => {
    if (i > 0 && t !== tokens[i - 1] && sameBar(bars[i], bars[i - 1])) penalty += 1;
  });
  const out = bars.map((b) => ({ events: b.events.map((e): RhythmEvent => ({ ...e })) }));
  if (s.ties) addBarTies(out, rng);
  if (!cadenceOk(meter, out)) penalty += 5;
  if (longestRest(out) > meter.barTicks) penalty += 3;
  if (n >= 2) {
    const present = presentAtoms(meter, out);
    for (const a of required) if (!present.has(a)) penalty += 1;
  }
  const d = relativeDensity(meter, s, out);
  const [lo, hi] = DENSITY_RANGE[s.density];
  if (d !== null && (d < lo || d > hi)) penalty += 1;
  return { bars: out, form: formString(groups), penalty };
}

/** Seeded, deterministic exercise generator (§5.3–5.5). */
export function generateExercise(settings: Settings, seed: number): Exercise {
  const s = normaliseSettings(settings);
  const rng = new Rng(seed);
  const playable = checkSettings(s).playable;
  const meter = getMeter(playable.length ? rng.pick(playable) : '4/4');
  const tree = new Tree(meter, s);
  const ctx: GenContext = { meter, settings: s, tree, rng };
  const required = tree.reachableAtoms();
  if (s.ties && s.bars >= 2) required.add('synco');

  let best: Candidate | null = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const c = buildCandidate(ctx, s.bars, required);
    if (!best || c.penalty < best.penalty) best = c;
    if (c.penalty === 0) break;
  }
  const chosen = best as Candidate;
  return {
    seed,
    settings: s,
    meter,
    tempo: s.tempo,
    bars: chosen.bars,
    form: chosen.form,
    difficulty: rateDifficulty(meter, chosen.bars, s.tempo),
  };
}
