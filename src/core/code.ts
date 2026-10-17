/**
 * Exercise codes (DESIGN.md §4.2): the settings and the seed in one short, typeable string, e.g.
 * `T44-HQE-RQ-4B-120-7K2QF`. The generator is deterministic, so a code rebuilds the exact same exercise.
 *
 * Segments, separated by "-" (decoding ignores case and surrounding spaces):
 *   1. mode letter (T tap, E echo) + the time signatures' digits:  T44 · E2434
 *   2. note values, W H Q E S (whole … sixteenth):                  HQE
 *   3. rests: R + the same letters, or R alone for none:          RQ · R
 *   4. bars + B:                                                   4B
 *   5. tempo in BPM:                                               120
 *   6. optional flags, X + one letter per setting off its default:  XDT
 *   7. the seed in Crockford base 32:                              7K2QF
 * Flags: D dotted · T ties · 3 triplets · N tap only (no hold) · S sparse / B busy · F few / M many rests ·
 * A metronome on beat 1 / O metronome off · 0 silent count-in / 2 two-bar count-in.
 */
import { DEFAULT_SETTINGS } from './defaults';
import { METER_IDS, NOTE_VALUES, type MeterId, type NoteValue, type Settings } from './types';

const VALUE_LETTER: Record<NoteValue, string> = { whole: 'W', half: 'H', quarter: 'Q', eighth: 'E', sixteenth: 'S' };
const MODE_LETTER: Record<Settings['mode'], string> = { tap: 'T', echo: 'E' };
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

type Flag = { letter: string; on(s: Settings): boolean; set(s: Settings): void };
const FLAGS: Flag[] = [
  { letter: 'D', on: (s) => s.dotted, set: (s) => (s.dotted = true) },
  { letter: 'T', on: (s) => s.ties, set: (s) => (s.ties = true) },
  { letter: '3', on: (s) => s.triplets, set: (s) => (s.triplets = true) },
  { letter: 'N', on: (s) => !s.hold, set: (s) => (s.hold = false) },
  { letter: 'S', on: (s) => s.density === 'sparse', set: (s) => (s.density = 'sparse') },
  { letter: 'B', on: (s) => s.density === 'busy', set: (s) => (s.density = 'busy') },
  { letter: 'F', on: (s) => s.restAmount === 'few', set: (s) => (s.restAmount = 'few') },
  { letter: 'M', on: (s) => s.restAmount === 'many', set: (s) => (s.restAmount = 'many') },
  { letter: 'A', on: (s) => s.metronome === 'accent', set: (s) => (s.metronome = 'accent') },
  { letter: 'O', on: (s) => s.metronome === 'off', set: (s) => (s.metronome = 'off') },
  { letter: '0', on: (s) => s.countIn === 0, set: (s) => (s.countIn = 0) },
  { letter: '2', on: (s) => s.countIn === 2, set: (s) => (s.countIn = 2) },
];

/** Crockford base 32 of a non-negative integer seed (at least one digit). */
function seedToB32(seed: number): string {
  let n = Math.floor(Math.abs(seed)) >>> 0;
  let out = '';
  do {
    out = B32[n % 32] + out;
    n = Math.floor(n / 32);
  } while (n > 0);
  return out;
}

function b32ToSeed(text: string): number | null {
  // Crockford: I and L read as 1, O as 0.
  const s = text.replace(/[IL]/g, '1').replace(/O/g, '0');
  if (!/^[0-9A-Z]{1,7}$/.test(s)) return null;
  let n = 0;
  for (const ch of s) {
    const d = B32.indexOf(ch);
    if (d < 0) return null;
    n = n * 32 + d;
  }
  return n <= 0xffffffff ? n : null;
}

const letters = (values: NoteValue[]): string => NOTE_VALUES.filter((v) => values.includes(v)).map((v) => VALUE_LETTER[v]).join('');

function parseValues(text: string): NoteValue[] | null {
  const out: NoteValue[] = [];
  for (const ch of text) {
    const v = NOTE_VALUES.find((x) => VALUE_LETTER[x] === ch);
    if (!v || out.includes(v)) return null;
    out.push(v);
  }
  return NOTE_VALUES.filter((v) => out.includes(v));
}

/** The code for an exercise's settings and seed. */
export function encodeCode(settings: Settings, seed: number): string {
  const meters = METER_IDS.filter((m) => settings.meters.includes(m)).map((m) => m.replace('/', '')).join('');
  const flags = FLAGS.filter((f) => f.on(settings)).map((f) => f.letter).join('');
  return [
    MODE_LETTER[settings.mode] + meters,
    letters(settings.notes),
    'R' + letters(settings.rests),
    settings.bars + 'B',
    String(settings.tempo),
    ...(flags ? ['X' + flags] : []),
    seedToB32(seed),
  ].join('-');
}

/** Settings and seed from a code; null when it is not a valid code. */
export function decodeCode(code: string): { settings: Settings; seed: number } | null {
  const parts = code.trim().toUpperCase().split('-');
  if (parts.length !== 6 && parts.length !== 7) return null;
  const [head, notesPart, restsPart, barsPart, tempoPart] = parts;
  const flagsPart = parts.length === 7 ? parts[5] : null;
  const seed = b32ToSeed(parts[parts.length - 1]);

  const mode = (Object.keys(MODE_LETTER) as Settings['mode'][]).find((m) => MODE_LETTER[m] === head[0]);
  const meterDigits = head.slice(1);
  if (!mode || meterDigits.length === 0 || meterDigits.length % 2 !== 0) return null;
  const meters: MeterId[] = [];
  for (let i = 0; i < meterDigits.length; i += 2) {
    const m = METER_IDS.find((x) => x.replace('/', '') === meterDigits.slice(i, i + 2));
    if (!m || meters.includes(m)) return null;
    meters.push(m);
  }
  const notes = parseValues(notesPart);
  const rests = restsPart.startsWith('R') ? parseValues(restsPart.slice(1)) : null;
  const bars = /^\d{1,2}B$/.test(barsPart) ? Number(barsPart.slice(0, -1)) : NaN;
  const tempo = /^\d{2,3}$/.test(tempoPart) ? Number(tempoPart) : NaN;
  if (!notes || notes.length === 0 || !rests || seed === null) return null;
  if (!(bars >= 1 && bars <= 16) || !(tempo >= 40 && tempo <= 200)) return null;

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    mode,
    hold: true,
    meters: METER_IDS.filter((m) => meters.includes(m)),
    notes,
    rests,
    dotted: false,
    ties: false,
    triplets: false,
    bars,
    tempo,
  };
  if (flagsPart !== null) {
    if (!flagsPart.startsWith('X') || flagsPart.length < 2) return null;
    for (const ch of flagsPart.slice(1)) {
      const f = FLAGS.find((x) => x.letter === ch);
      if (!f) return null;
      f.set(settings);
    }
  }
  return { settings, seed };
}
