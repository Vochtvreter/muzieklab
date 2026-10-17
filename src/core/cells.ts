/**
 * The metric tree and the cell library (§5.3), shared by the generator and the feasibility check (§5.6),
 * so the settings screen never allows something the generator cannot build.
 */
import type { Meter, NoteValue, Settings } from './types';
import { PPQ } from './types';

export type NodeKind = 'bar44' | 'bar34' | 'half' | 'beat' | 'eighth' | 'sixteenth';

export const NODE_TICKS: Record<NodeKind, number> = {
  bar44: 4 * PPQ,
  bar34: 3 * PPQ,
  half: 2 * PPQ,
  beat: PPQ,
  eighth: PPQ / 2,
  sixteenth: PPQ / 4,
};

/** One value placed by an option. `rest`: may this leaf become a rest? */
export interface LeafSpec {
  dur: number;
  value: NoteValue;
  dots: 0 | 1;
  triplet?: boolean;
  rest: boolean;
}

export type Part = { offset: number; node: NodeKind } | { offset: number; leaf: LeafSpec };

export type OptionType = 'fill' | 'split' | 'cell';
export type CellTag = 'dotted' | 'synco' | 'triplet';

export interface NodeOption {
  id: string;
  type: OptionType;
  parts: Part[];
  /** Note values that must be on as notes (e.g. quarter–half–quarter is spelled with tied quarters). */
  needsNotes?: NoteValue[];
  needsTies?: boolean;
  tag?: CellTag;
  /** Base weight before the density profile (§5.3: deeper splits are less likely). */
  weight: number;
}

const Q = PPQ;
const leaf = (dur: number, value: NoteValue, dots: 0 | 1, rest: boolean, triplet = false): LeafSpec =>
  triplet ? { dur, value, dots, rest, triplet } : { dur, value, dots, rest };
const L = (offset: number, spec: LeafSpec): Part => ({ offset, leaf: spec });
const N = (offset: number, node: NodeKind): Part => ({ offset, node });

const OPTIONS: Record<NodeKind, NodeOption[]> = {
  bar44: [
    { id: 'whole', type: 'fill', weight: 1, parts: [L(0, leaf(4 * Q, 'whole', 0, true))] },
    { id: 'halves', type: 'split', weight: 3, parts: [N(0, 'half'), N(2 * Q, 'half')] },
    {
      id: 'q-h-q',
      type: 'cell',
      tag: 'synco',
      needsTies: true,
      needsNotes: ['quarter', 'half'],
      weight: 0.5,
      parts: [L(0, leaf(Q, 'quarter', 0, true)), L(Q, leaf(2 * Q, 'half', 0, false)), L(3 * Q, leaf(Q, 'quarter', 0, true))],
    },
    {
      id: 'dh-q',
      type: 'cell',
      tag: 'dotted',
      weight: 0.4,
      parts: [L(0, leaf(3 * Q, 'half', 1, false)), L(3 * Q, leaf(Q, 'quarter', 0, true))],
    },
  ],
  bar34: [
    { id: 'dotted-half', type: 'fill', weight: 1, parts: [L(0, leaf(3 * Q, 'half', 1, true))] },
    { id: 'h+b', type: 'split', weight: 1.2, parts: [N(0, 'half'), N(2 * Q, 'beat')] },
    { id: 'b+h', type: 'split', weight: 0.8, parts: [N(0, 'beat'), N(Q, 'half')] },
    { id: 'b+b+b', type: 'split', weight: 1.6, parts: [N(0, 'beat'), N(Q, 'beat'), N(2 * Q, 'beat')] },
  ],
  half: [
    { id: 'half', type: 'fill', weight: 1, parts: [L(0, leaf(2 * Q, 'half', 0, true))] },
    { id: 'beats', type: 'split', weight: 1.3, parts: [N(0, 'beat'), N(Q, 'beat')] },
    {
      id: 'dq-e',
      type: 'cell',
      tag: 'dotted',
      weight: 0.6,
      parts: [L(0, leaf(1.5 * Q, 'quarter', 1, false)), L(1.5 * Q, leaf(Q / 2, 'eighth', 0, true))],
    },
    {
      id: 'e-q-e',
      type: 'cell',
      tag: 'synco',
      needsTies: true,
      weight: 0.5,
      parts: [L(0, leaf(Q / 2, 'eighth', 0, true)), L(Q / 2, leaf(Q, 'quarter', 0, false)), L(1.5 * Q, leaf(Q / 2, 'eighth', 0, true))],
    },
  ],
  beat: [
    { id: 'quarter', type: 'fill', weight: 1, parts: [L(0, leaf(Q, 'quarter', 0, true))] },
    { id: 'eighths', type: 'split', weight: 0.9, parts: [N(0, 'eighth'), N(Q / 2, 'eighth')] },
    {
      id: 'de-s',
      type: 'cell',
      tag: 'dotted',
      weight: 0.45,
      parts: [L(0, leaf(0.75 * Q, 'eighth', 1, false)), L(0.75 * Q, leaf(Q / 4, 'sixteenth', 0, true))],
    },
    {
      id: 's-de',
      type: 'cell',
      tag: 'dotted',
      weight: 0.25,
      parts: [L(0, leaf(Q / 4, 'sixteenth', 0, true)), L(Q / 4, leaf(0.75 * Q, 'eighth', 1, false))],
    },
    {
      id: 's-e-s',
      type: 'cell',
      weight: 0.3,
      parts: [L(0, leaf(Q / 4, 'sixteenth', 0, true)), L(Q / 4, leaf(Q / 2, 'eighth', 0, false)), L(0.75 * Q, leaf(Q / 4, 'sixteenth', 0, true))],
    },
    {
      id: 'triplet',
      type: 'cell',
      tag: 'triplet',
      weight: 0.6,
      parts: [0, 1, 2].map((i) => L((i * Q) / 3, leaf(Q / 3, 'eighth', 0, i > 0, true))),
    },
  ],
  eighth: [
    { id: 'eighth', type: 'fill', weight: 1, parts: [L(0, leaf(Q / 2, 'eighth', 0, true))] },
    { id: 'sixteenths', type: 'split', weight: 0.7, parts: [N(0, 'sixteenth'), N(Q / 4, 'sixteenth')] },
  ],
  sixteenth: [{ id: 'sixteenth', type: 'fill', weight: 1, parts: [L(0, leaf(Q / 4, 'sixteenth', 0, true))] }],
};

export function optionsFor(kind: NodeKind): NodeOption[] {
  return OPTIONS[kind];
}

export function rootKind(meter: Meter): NodeKind {
  return meter.id === '4/4' ? 'bar44' : meter.id === '3/4' ? 'bar34' : 'half';
}

/**
 * Can a rest of this length at this position be written as one symbol (§5.7)?
 * In 4/4 a half rest only on beat 1 or 3; in 3/4 only on beat 1; dotted rests only when shorter than a beat
 * and on the beat; a full-bar rest is a whole rest (handled by the caller).
 */
export function restShapeOk(meter: Meter, start: number, dur: number): boolean {
  const beat = meter.beatTicks;
  switch (dur) {
    case 4 * Q:
      return meter.id === '4/4' && start === 0;
    case 2 * Q:
      return meter.id === '4/4' ? start % (2 * Q) === 0 : start === 0;
    case Q:
      return start % Q === 0;
    case Q / 2:
      return start % (Q / 2) === 0;
    case Q / 4:
      return start % (Q / 4) === 0;
    case 0.75 * Q:
      return start % beat === 0;
    default:
      return false;
  }
}

/** Rule check for one leaf, against the player's settings. */
export class Tree {
  private memo = new Map<string, boolean>();

  constructor(
    readonly meter: Meter,
    readonly settings: Settings,
  ) {}

  noteOk(l: LeafSpec): boolean {
    const s = this.settings;
    return s.notes.includes(l.value) && (!l.dots || s.dotted) && (!l.triplet || s.triplets);
  }

  restOk(l: LeafSpec, start: number): boolean {
    const s = this.settings;
    if (!l.rest) return false;
    if (l.dur === this.meter.barTicks) return s.rests.includes('whole');
    if (l.triplet) return s.triplets && s.rests.includes('eighth');
    if (!s.rests.includes(l.value)) return false;
    if (l.dots && !s.dotted) return false;
    return restShapeOk(this.meter, start, l.dur);
  }

  leafOk(l: LeafSpec, start: number, firstNote: boolean): boolean {
    return this.noteOk(l) || (!firstNote && this.restOk(l, start));
  }

  optionOk(opt: NodeOption, start: number, firstNote: boolean): boolean {
    const s = this.settings;
    if (opt.needsTies && !s.ties) return false;
    if (opt.needsNotes && !opt.needsNotes.every((v) => s.notes.includes(v))) return false;
    return opt.parts.every((p, i) => {
      const fn = firstNote && i === 0;
      return 'leaf' in p ? this.leafOk(p.leaf, start + p.offset, fn) : this.canFill(p.node, start + p.offset, fn);
    });
  }

  /** Coin-change style DP along the metric tree (§5.6), memoised per node position. */
  canFill(kind: NodeKind, start: number, firstNote: boolean): boolean {
    const key = kind + '@' + start + (firstNote ? '!' : '');
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    const ok = OPTIONS[kind].some((o) => this.optionOk(o, start, firstNote));
    this.memo.set(key, ok);
    return ok;
  }

  /** A bar that starts with a note can be built (so the meter is playable). */
  playable(): boolean {
    return this.canFill(rootKind(this.meter), 0, true);
  }

  /**
   * What can appear in this meter (for the "every enabled value appears" rule, §5.5): atoms like
   * n:quarter, r:eighth, dotted, triplets, synco.
   */
  reachableAtoms(): Set<string> {
    const atoms = new Set<string>();
    const seen = new Set<string>();
    const visit = (kind: NodeKind, start: number): void => {
      const key = kind + '@' + start;
      if (seen.has(key)) return;
      seen.add(key);
      for (const opt of OPTIONS[kind]) {
        if (!this.optionOk(opt, start, false)) continue;
        if (opt.tag === 'synco') atoms.add('synco');
        for (const p of opt.parts) {
          if ('node' in p) {
            visit(p.node, start + p.offset);
            continue;
          }
          const at = start + p.offset;
          if (this.noteOk(p.leaf)) atoms.add(leafAtom('n', p.leaf));
          if (this.restOk(p.leaf, at)) atoms.add(p.leaf.dur === this.meter.barTicks ? 'r:whole' : leafAtom('r', p.leaf));
        }
      }
    };
    visit(rootKind(this.meter), 0);
    return atoms;
  }
}

function leafAtom(kind: 'n' | 'r', l: LeafSpec): string {
  if (l.triplet) return 'triplets';
  if (l.dots) return 'dotted';
  return kind + ':' + l.value;
}
