/**
 * Scales wording (DESIGN.md §3.7): scale and note names, the steps between degrees and the feedback line. Every word
 * comes from the catalog, so names follow the player's language.
 */
import { KEYS, letterOf, scaleSteps, stepName, tonic, type Direction, type KeyId, type Scale, type ScaleNote, type ScaleType, type StepName } from '../../core/api';
import { t } from '../../i18n';
import { letterName, spokenName } from './noteText';

/** "D major", "E harmonic minor". */
export function scaleName(s: Scale): string {
  const n = tonic(s);
  return t('scales.name.' + s.type, { tonic: letterName(n.letter, n.alter) });
}

/** For screen readers: "D major", "F sharp harmonic minor". */
export function scaleSpoken(s: Scale): string {
  const n = tonic(s);
  return t('scales.name.' + s.type, { tonic: spokenName(n.letter, n.alter) });
}

/** The hub's names: "D major", "B minor" (all three forms together). */
export function keyName(key: KeyId, minor: boolean): string {
  const n = minor ? KEYS[key].minor : KEYS[key].major;
  return t(minor ? 'notes.minor' : 'notes.major', { tonic: letterName(n.letter, n.alter) });
}

/** The tonic alone, as on the circle: "F♯", or lower case for minor ("f♯"). */
export function circleLabel(key: KeyId, minor: boolean): string {
  const n = minor ? KEYS[key].minor : KEYS[key].major;
  const name = letterName(n.letter, n.alter);
  return minor ? name.toLowerCase() : name;
}

/** A note of a scale as written: "F♯", "F𝄪". */
export const noteName = (n: ScaleNote): string => letterName(letterOf(n.step), n.alter);

/** "W W H W W W H" in the player's language (H, W and 1½). */
export function stepsText(type: ScaleType): string {
  return scaleSteps({ key: 'C', type }).map((h) => stepLabel(stepName(h))).join(' ');
}

export const stepLabel = (s: StepName): string => t('scales.step.' + s);

/** The steps between neighbouring notes, in playing order. */
export const stepsOf = (s: Scale, direction: Direction): StepName[] => scaleSteps(s, direction).map(stepName);

/** "a whole step: skip one key", for the feedback line. */
export const stepHow = (s: StepName): string => t('scales.how.' + s);
