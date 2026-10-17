import type { MeterId, NoteValue, Settings } from './types';
import { METER_IDS, NOTE_VALUES } from './types';
import { getMeter } from './meters';
import { Tree } from './cells';
import { restKey, valueKey } from './values';

export interface Feasibility {
  /** Meters among settings.meters that can be filled with the enabled values. */
  playable: MeterId[];
  /**
   * For each meter (chosen or not) that cannot be filled: a hint message key + params, e.g. needs a quarter note.
   * key 'setup.needs', params { meter: '3/4', values: 'value.quarter,rest.quarter,value.dottedHalf' } (message keys,
   * comma-separated, at most three, to be joined as "a, b or c"); `values` holds the same keys as an array.
   * key 'setup.needsMore', params { meter } when no single extra value would help.
   */
  blocked: Partial<Record<MeterId, { key: string; params: Record<string, string>; values?: string[] }>>;
  /** True when at least one chosen meter is playable and at least one note value is on. */
  ok: boolean;
}

export function isPlayable(settings: Settings, meter: MeterId): boolean {
  return new Tree(getMeter(meter), settings).playable();
}

const BY_SIZE: NoteValue[] = NOTE_VALUES; // whole … sixteenth, largest first

/**
 * One-step changes that would make the meter playable (at most three): the largest note value that helps, the
 * largest rest, the dotted value, then further notes and rests. E.g. 3/4 with only half notes:
 * quarter note, quarter rest or dotted half.
 */
function suggestions(settings: Settings, meter: MeterId): string[] {
  const helps = (patch: Partial<Settings>): boolean => isPlayable({ ...settings, ...patch }, meter);
  const notes = BY_SIZE.filter((v) => !settings.notes.includes(v) && helps({ notes: [...settings.notes, v] })).map((v) => valueKey(v, 0));
  const rests = BY_SIZE.filter((v) => !settings.rests.includes(v) && helps({ rests: [...settings.rests, v] })).map((v) => restKey(v, 0));
  const dotted = settings.dotted
    ? []
    : (['half', 'quarter', 'eighth'] as NoteValue[]).filter((v) => settings.notes.includes(v) && helps({ dotted: true })).map((v) => valueKey(v, 1));
  const firsts = [notes[0], rests[0], dotted[0]].filter((k): k is string => !!k);
  const rest = [...notes.slice(1), ...rests.slice(1), ...dotted.slice(1)];
  return [...firsts, ...rest].slice(0, 3);
}

/** DP feasibility check per meter (§4.1, §5.6). */
export function checkSettings(settings: Settings): Feasibility {
  const blocked: Feasibility['blocked'] = {};
  const playableAll = new Set<MeterId>();
  for (const id of METER_IDS) {
    if (isPlayable(settings, id)) {
      playableAll.add(id);
      continue;
    }
    const values = suggestions(settings, id);
    blocked[id] = values.length
      ? { key: 'setup.needs', params: { meter: id, values: values.join(',') }, values }
      : { key: 'setup.needsMore', params: { meter: id }, values: [] };
  }
  const playable = METER_IDS.filter((id) => settings.meters.includes(id) && playableAll.has(id));
  return { playable, blocked, ok: playable.length > 0 && settings.notes.length > 0 };
}
