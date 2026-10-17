import type { Exercise, JudgeResult, NoteResult, Timeline } from './types';
import { spellExercise } from './speller';
import { valueKey } from './values';

/** One-line coaching tip (§6.4): message key + params for i18n. */
export interface CoachTip {
  key: string;
  params: Record<string, string | number>;
}

/** Steadiness worth a tip, in ms of standard deviation. */
export const UNSTEADY_SD_MS = 45;

/** Where a note ends, as a count position: the beat number (1-based) and the part of that beat. */
function countAt(tick: number, exercise: Exercise): { beat: number; part: string } {
  const { meter } = exercise;
  const inBar = tick % meter.barTicks;
  const beat = Math.floor(inBar / meter.beatTicks) + 1;
  const sub = inBar % meter.beatTicks;
  const q = meter.beatTicks / 4;
  const t = meter.beatTicks / 3;
  const part = sub === 0 ? 'count.beat' : sub === 2 * q ? 'count.and' : sub === q ? 'count.e' : sub === 3 * q ? 'count.a' : sub === t ? 'count.trip' : 'count.let';
  return { beat, part };
}

/** Value key of a sounding note as written: a tied note is 'value.tiedNote'. */
function writtenValue(exercise: Exercise, index: number): string {
  for (const bar of spellExercise(exercise)) {
    const sym = bar.symbols.find((s) => s.onsetIndex === index);
    if (sym) return sym.tieToNext ? 'value.tiedNote' : valueKey(sym.value, sym.dots, !!sym.tuplet);
  }
  return 'value.note';
}

/**
 * One-line coaching tip (§6.4): the worst hold problem first, then the tendency, then misses, extra taps,
 * steadiness, and praise. Keys and params:
 * - tip.cutShort / tip.heldLong { value (message key), bar (1-based), beat, liftBeat, liftPart (count.* key), count }
 * - tip.rushing / tip.dragging { ms }
 * - tip.missed { count, bar }   tip.extraTaps { count }   tip.unsteady { ms }
 * - tip.perfect {}   tip.good {}
 */
export function coachTip(result: JudgeResult, timeline: Timeline, exercise: Exercise): CoachTip {
  const holdIssues = result.notes.filter((r): r is NoteResult & { hold: 'short' | 'long' } => r.hold === 'short' || r.hold === 'long');
  if (holdIssues.length) {
    // Worst = the largest share of the note that was missed (cut short) or overshot (held long).
    const severity = (r: NoteResult): number => {
      const n = timeline.notes[r.index];
      return Math.abs(r.releaseOffsetMs ?? (n.end - n.onset) * 1000) / ((n.end - n.onset) * 1000);
    };
    const worst = holdIssues.reduce((a, b) => (severity(b) > severity(a) ? b : a));
    const note = timeline.notes[worst.index];
    const lift = countAt(note.tick + note.durationTicks, exercise);
    return {
      key: worst.hold === 'short' ? 'tip.cutShort' : 'tip.heldLong',
      params: {
        value: writtenValue(exercise, worst.index),
        bar: note.bar + 1,
        beat: countAt(note.tick, exercise).beat,
        liftBeat: lift.beat,
        liftPart: lift.part,
        count: holdIssues.filter((r) => r.hold === worst.hold).length,
      },
    };
  }
  if (result.tendency !== 'steady') {
    return { key: result.tendency === 'rushing' ? 'tip.rushing' : 'tip.dragging', params: { ms: Math.round(Math.abs(result.meanOffsetMs)) } };
  }
  if (result.counts.miss > 0) {
    const perBar = new Map<number, number>();
    for (const r of result.notes) if (r.judgement === 'miss') perBar.set(timeline.notes[r.index].bar, (perBar.get(timeline.notes[r.index].bar) ?? 0) + 1);
    const [bar] = [...perBar.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
    return { key: 'tip.missed', params: { count: result.counts.miss, bar: bar + 1 } };
  }
  if (result.extraTaps > 0) return { key: 'tip.extraTaps', params: { count: result.extraTaps } };
  if (result.sdOffsetMs > UNSTEADY_SD_MS) return { key: 'tip.unsteady', params: { ms: Math.round(result.sdOffsetMs) } };
  if (result.counts.perfect === result.notes.length) return { key: 'tip.perfect', params: {} };
  return { key: 'tip.good', params: {} };
}
