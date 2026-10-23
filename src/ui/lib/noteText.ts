/**
 * Read notes wording: note and key names (letters or fixed do, both from the catalog), positions on the staff, hints and
 * the feedback line (DESIGN.md §3.5). Note names are locale data, so every piece comes from t().
 */
import {
  BOTTOM_LINE,
  HEAR_REFERENCE,
  KEYS,
  MIDDLE_C,
  keyAlter,
  keySigns,
  letterOf,
  missKind,
  placeKind,
  staffOffset,
  type Clef,
  type Given,
  type KeyId,
  type Letter,
  type RoundNote,
  type ScaleAlter,
  type Step,
} from '../../core/api';
import { getLocale, t } from '../../i18n';

export type NameSystem = 'solfege' | 'letters';

/** Read notes uses ♭ ♮ ♯ only; scales also need the double sharp (F𝄪 in G♯ harmonic minor, §3.7). */
const SIGN_KEY: Record<ScaleAlter, string> = { [-2]: 'doubleFlat', [-1]: 'flat', 0: 'natural', 1: 'sharp', 2: 'doubleSharp' };
export const signKey = (a: ScaleAlter): string => SIGN_KEY[a];
/** ♭ ♮ ♯ 𝄪 */
export const signGlyph = (a: ScaleAlter): string => t('notes.sign.' + SIGN_KEY[a]);
export const signWord = (a: ScaleAlter): string => t('notes.signWord.' + SIGN_KEY[a]);

/** "F♯" (no sign for a natural). */
export function letterName(letter: Letter, alter: ScaleAlter): string {
  return t('notes.letter.' + letter) + (alter === 0 ? '' : signGlyph(alter));
}
/** "fa♯" */
export function solfegeName(letter: Letter, alter: ScaleAlter): string {
  return t('notes.solfege.' + letter) + (alter === 0 ? '' : signGlyph(alter));
}
/** "F♯ (fa♯)" with letters first, or "fa♯ (F♯)" with do re mi, so both systems are learned together. */
export function fullName(letter: Letter, alter: ScaleAlter, system: NameSystem = 'letters'): string {
  const l = letterName(letter, alter);
  const s = solfegeName(letter, alter);
  return system === 'solfege' ? t('notes.name', { main: s, sub: l }) : t('notes.name', { main: l, sub: s });
}
/** For screen readers: "F sharp". */
export function spokenName(letter: Letter, alter: ScaleAlter): string {
  return alter === 0 ? t('notes.letter.' + letter) : t('notes.spoken', { letter: t('notes.letter.' + letter), sign: signWord(alter) });
}

/** "G major" */
export function majorName(key: KeyId): string {
  const m = KEYS[key].major;
  return t('notes.major', { tonic: letterName(m.letter, m.alter) });
}
export function minorName(key: KeyId): string {
  const m = KEYS[key].minor;
  return t('notes.minor', { tonic: letterName(m.letter, m.alter) });
}
/** "G major · E minor" */
export const keyPairName = (key: KeyId): string => t('notes.keyPair', { major: majorName(key), minor: minorName(key) });

/** "1 sharp: every F is F♯", "2 sharps: F♯, C♯", "No sharps or flats". */
export function keySignsText(key: KeyId): string {
  const signs = keySigns(key);
  if (signs.length === 0) return t('notes.keyNone');
  const names = signs.map((s) => letterName(s.letter, s.alter));
  const msg = signs[0].alter > 0 ? 'notes.keySharps' : 'notes.keyFlats';
  return t(msg, { count: signs.length, letter: t('notes.letter.' + signs[0].letter), name: names[0], names: names.join(', ') });
}

/** For screen readers: "2 sharps", "no sharps or flats". */
export function keySignsAria(key: KeyId): string {
  const f = KEYS[key].fifths;
  return t('notes.signsAria', { sharps: Math.max(0, f), flats: Math.max(0, -f) });
}

/** Where a note sits: "the top line", "the 2nd space", "the first ledger line below", … */
export function positionText(clef: Clef, step: Step): string {
  const o = staffOffset(clef, step);
  if (o >= 0 && o <= 8) return t(o % 2 === 0 ? `notes.play.pos.line${o / 2 + 1}` : `notes.play.pos.space${(o + 1) / 2}`);
  if (o === -1) return t('notes.play.pos.spaceBelow');
  if (o === 9) return t('notes.play.pos.spaceAbove');
  if (o < 0) {
    const d = -o; // 2: first ledger line, 3: below it, 4: second, 5: below the second
    const n = Math.min(2, Math.floor(d / 2));
    return t(d % 2 === 0 ? 'notes.play.pos.ledgerBelow' : 'notes.play.pos.underLedger', { n });
  }
  const d = o - 8;
  const n = Math.min(2, Math.floor(d / 2));
  return t(d % 2 === 0 ? 'notes.play.pos.ledgerAbove' : 'notes.play.pos.overLedger', { n });
}

/** Landmarks a hint measures from (§3.5): the outer and middle lines, the clef's line, middle C and the ledger lines. */
function landmarks(clef: Clef): { step: Step; key: string }[] {
  const b = BOTTOM_LINE[clef];
  const common = [
    { step: b, key: 'bottom' },
    { step: b + 4, key: 'middle' },
    { step: b + 8, key: 'top' },
  ];
  if (clef === 'treble') {
    return [...common, { step: b + 2, key: 'gLine' }, { step: MIDDLE_C, key: 'middleC' }, { step: b - 4, key: 'ledgerBelow2' }, { step: b + 10, key: 'ledgerAbove1' }, { step: b + 12, key: 'ledgerAbove2' }];
  }
  return [...common, { step: b + 6, key: 'fLine' }, { step: MIDDLE_C, key: 'middleC' }, { step: b + 12, key: 'ledgerAbove2' }, { step: b - 2, key: 'ledgerBelow1' }, { step: b - 4, key: 'ledgerBelow2' }];
}

/**
 * The hint: the nearest landmark and its name, and, where the key changes the letter, a pointer to the signature. Off
 * the landmark, its name and the way to the note are two sentences ("The top line is fa (F). This note is one step
 * higher."), so the landmark's name does not read as the answer.
 */
export function hintText(n: RoundNote, system: NameSystem): string {
  const marks = landmarks(n.clef);
  let best = marks[0];
  for (const m of marks) if (Math.abs(m.step - n.step) < Math.abs(best.step - n.step)) best = m;
  const diff = n.step - best.step;
  const landmark = t('notes.play.landmark.' + best.key);
  const name = fullName(letterOf(best.step), 0, system);
  // The landmark can start the sentence: {Landmark} is it capitalised.
  const Landmark = landmark.charAt(0).toLocaleUpperCase(getLocale()) + landmark.slice(1);
  const text =
    diff === 0
      ? t('notes.play.hintOn', { landmark, name })
      : t('notes.play.hintNear', { count: Math.abs(diff), dir: diff > 0 ? 'up' : 'down', Landmark, name });
  if (n.sign !== null) return t('notes.play.hintSign', { text });
  const k = keyAlter(n.key, letterOf(n.step));
  return k !== 0 ? t('notes.play.hintKey', { text, signWord: signWord(k) }) : text;
}

/** The feedback line after an answer: right, or what went wrong and why (§3.5, the canvas wording). */
export function feedbackText(n: RoundNote, given: Given | null, right: boolean, system: NameSystem): string {
  const letter = letterOf(n.step);
  const name = fullName(letter, n.alter, given?.kind === 'piano' ? 'letters' : system);
  const pos = positionText(n.clef, n.step);
  const keySign = n.sign === null && n.alter !== 0;
  if (given === null) return t('notes.play.timeout', { name, pos });
  if (right) {
    if (n.sign !== null) return t('notes.play.rightSign', { name, signWord: signWord(n.sign) });
    if (keySign) return t('notes.play.rightKey', { name, letter: t('notes.letter.' + letter), signWord: signWord(n.alter) });
    return t('notes.play.right', { name });
  }
  const kind = missKind(n, given);
  const place = t('notes.play.place.' + placeKind(n.clef, n.step));
  if (given.kind === 'piano') {
    if (kind === 'keySign') return t('notes.play.pianoKey', { name, pos, letter: t('notes.letter.' + letter), signWord: signWord(n.alter) });
    if (kind === 'noteSign' && n.sign !== null) return t('notes.play.pianoSign', { name, pos, letter: t('notes.letter.' + letter), signWord: signWord(n.sign) });
  }
  if (kind === 'keySign') return t('notes.play.wrongKeySign', { place, key: majorName(n.key), keyName: letterName(letter, n.alter), name });
  if (kind === 'noteSign' && n.sign !== null) return t('notes.play.wrongNoteSign', { place, signWord: signWord(n.sign), name });
  if (kind === 'extraSign') return t('notes.play.wrongExtraSign', { place, name });
  if (n.sign !== null) return t('notes.play.wrongLetterSign', { name, pos, signWord: signWord(n.sign) });
  if (keySign) return t('notes.play.wrongLetterKey', { name, pos, signWord: signWord(n.alter) });
  return t('notes.play.wrongLetter', { name, pos });
}

/** "one step above sol", "sol itself": where a heard note is from the reference (§3.5, hear). */
function fromSol(step: Step, system: NameSystem): string {
  const diff = step - HEAR_REFERENCE;
  const sol = (system === 'solfege' ? solfegeName : letterName)(letterOf(HEAR_REFERENCE), 0);
  return diff === 0 ? t('notes.play.hearSame', { sol }) : t('notes.play.hearFrom', { count: Math.abs(diff), dir: diff > 0 ? 'up' : 'down', sol });
}

/** The hint for a note to hear: higher or lower than sol, or sol itself. */
export const hearHint = (n: RoundNote, system: NameSystem): string => t('notes.play.hearHint', { from: fromSol(n.step, system) });

/** The feedback after a heard note: right, or what it was and where it is from sol. */
export function hearFeedback(n: RoundNote, given: Given | null, right: boolean, system: NameSystem): string {
  const name = fullName(letterOf(n.step), n.alter, given?.kind === 'piano' ? 'letters' : system);
  if (right) return t('notes.play.hearRight', { name, from: fromSol(n.step, system) });
  return t(given === null ? 'notes.play.hearTimeout' : 'notes.play.hearWrong', { name, from: fromSol(n.step, system) });
}

/** The feedback after a note written on the staff: right, or where it went and where it goes. */
export function writeFeedback(n: RoundNote, given: Given | null, right: boolean, system: NameSystem): string {
  const name = fullName(letterOf(n.step), n.alter, system);
  const pos = positionText(n.clef, n.step);
  if (given === null) return t('notes.play.timeout', { name, pos });
  if (right) return t('notes.play.writeRight', { name, pos });
  const at = given.kind === 'place' ? given.step : n.step;
  return t('notes.play.writeWrong', { name, pos, wrote: fullName(letterOf(at), 0, system), wrotePos: positionText(n.clef, at) });
}
