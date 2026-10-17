/** One bar, top-down along the metric tree (§5.3). */
import type { Bar, Meter, RhythmEvent, Settings } from './types';
import type { NodeKind, NodeOption } from './cells';
import { Tree, optionsFor, rootKind } from './cells';
import type { Rng } from './rng';

const DENSITY: Record<Settings['density'], { fill: number; split: number }> = {
  sparse: { fill: 2.2, split: 0.45 },
  balanced: { fill: 1, split: 1 },
  busy: { fill: 0.45, split: 2.2 },
};

const REST_P: Record<Settings['restAmount'], number> = { few: 0.07, some: 0.17, many: 0.32 };

export interface GenContext {
  meter: Meter;
  settings: Settings;
  tree: Tree;
  rng: Rng;
}

function optionWeight(ctx: GenContext, opt: NodeOption): number {
  const d = DENSITY[ctx.settings.density];
  if (opt.type === 'fill') return opt.weight * d.fill;
  if (opt.type === 'split') return opt.weight * d.split;
  return opt.weight;
}

/** Probability that a leaf becomes a rest: lower on strong positions (weight ≥ 3). */
function restChance(ctx: GenContext, start: number): number {
  const p = REST_P[ctx.settings.restAmount];
  return ctx.meter.weightAt(start) >= 3 ? p * 0.35 : p;
}

/** Fills one metric node; `firstNote` forces the node's first event to be a note. */
export function generateNode(ctx: GenContext, kind: NodeKind, start: number, firstNote: boolean, out: RhythmEvent[]): void {
  const opts = optionsFor(kind).filter((o) => ctx.tree.optionOk(o, start, firstNote));
  if (!opts.length) throw new Error('unfillable node ' + kind + '@' + start);
  const opt = opts[Math.max(0, ctx.rng.weighted(opts.map((o) => optionWeight(ctx, o))))];
  opt.parts.forEach((p, i) => {
    const at = start + p.offset;
    const fn = firstNote && i === 0;
    if ('node' in p) {
      generateNode(ctx, p.node, at, fn, out);
      return;
    }
    const canNote = ctx.tree.noteOk(p.leaf);
    const canRest = !fn && ctx.tree.restOk(p.leaf, at);
    const rest = !canNote || (canRest && ctx.rng.chance(restChance(ctx, at)));
    const ev: RhythmEvent = { start: at, duration: p.leaf.dur, kind: rest ? 'rest' : 'note' };
    if (p.leaf.triplet) ev.triplet = true;
    out.push(ev);
  });
}

/** A fully silent bar becomes one bar-long rest (drawn as a whole rest); null if the whole rest is off. */
function normalise(meter: Meter, settings: Settings, events: RhythmEvent[]): Bar | null {
  if (events.every((e) => e.kind === 'rest')) {
    if (!settings.rests.includes('whole')) return null;
    return { events: [{ start: 0, duration: meter.barTicks, kind: 'rest' }] };
  }
  return { events };
}

export function generateRawBar(ctx: GenContext, first: boolean): Bar | null {
  const events: RhythmEvent[] = [];
  generateNode(ctx, rootKind(ctx.meter), 0, first, events);
  return normalise(ctx.meter, ctx.settings, events);
}

export function regenerateBeat(ctx: GenContext, bar: Bar, beatStart: number): Bar | null {
  const inside = (e: RhythmEvent): boolean => e.start >= beatStart && e.start < beatStart + ctx.meter.beatTicks;
  const fresh: RhythmEvent[] = [];
  generateNode(ctx, 'beat', beatStart, false, fresh);
  const events = [...bar.events.filter((e) => !inside(e)), ...fresh].sort((a, b) => a.start - b.start);
  return normalise(ctx.meter, ctx.settings, events);
}

/**
 * Bar generation with bar-level rejection (§5.5): retries until `accept` holds.
 * Returns the last attempt with ok=false when no attempt passes.
 */
export function generateBar(
  ctx: GenContext,
  first: boolean,
  accept: (bar: Bar) => boolean,
  tries = 30,
): { bar: Bar; ok: boolean } {
  let last: Bar | null = null;
  for (let i = 0; i < tries; i++) {
    const bar = generateRawBar(ctx, first);
    if (!bar) continue;
    last = bar;
    if (accept(bar)) return { bar, ok: true };
  }
  if (!last) {
    // Only reachable when every attempt was silent with the whole rest off: force a note at the start.
    const events: RhythmEvent[] = [];
    generateNode(ctx, rootKind(ctx.meter), 0, true, events);
    last = { events };
  }
  return { bar: last, ok: false };
}

export { Tree };
