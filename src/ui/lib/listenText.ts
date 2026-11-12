/**
 * Listen & write wording (DESIGN.md §3.2): a melody's note names in the player's names (do re mi or letters), the
 * values as words, and the tip after a check.
 */
import { answerBars, answerSteps, degreeStep, firstWrong, stepsInBeat, valuesInBeat, type Answer, type ListenCheck } from '../../core/dictation';
import { letterOf, MIDDLE_C, restKey, valueKey, type Exercise, type RhythmEvent, type Step } from '../../core/api';
import { valueForTicks } from '../../core/values';
import { t } from '../../i18n';
import type { NameSystem } from './noteText';

/** High do (C5) is marked: do’ or C’ (as the boards write it). */
const high = (step: Step): string => (step >= MIDDLE_C + 7 ? '’' : '');

/** A melody note's name in the player's names: "sol", "do′", or with letters "G", "C′". */
export function stepName(step: Step, system: NameSystem): string {
  const letter = letterOf(step);
  return t(system === 'solfege' ? 'notes.solfege.' + letter : 'notes.letter.' + letter) + high(step);
}

/** The other system's name, shown small under a note button or chip: "G" under sol, "do" under C. */
export function stepSub(step: Step, system: NameSystem): string {
  return stepName(step, system === 'solfege' ? 'letters' : 'solfege');
}

export const degreeName = (degree: number, system: NameSystem): string => stepName(degreeStep(degree), system);
export const degreeSub = (degree: number, system: NameSystem): string => stepSub(degreeStep(degree), system);

/** "a quarter note", "two eighth notes", "an eighth note and an eighth rest": the values of a beat, for the tip. */
function valuesWords(events: readonly RhythmEvent[]): string {
  if (!events.length) return t('listen.tip.nothing');
  const words = events.map((e) => {
    const v = valueForTicks(e.duration) ?? { value: 'sixteenth' as const, dots: 0 as const };
    return t(e.kind === 'rest' ? restKey(v.value, v.dots) : valueKey(v.value, v.dots));
  });
  // Two or more of the same value: "two eighth notes".
  if (words.length > 1 && words.every((w) => w === words[0])) return t('listen.tip.same', { count: words.length, value: words[0] });
  return words.join(t('listen.tip.and'));
}

/**
 * The tip after a check: the first beat that differs and how, "Beat 3 of bar 2: you wrote a quarter note; it was two
 * eighth notes." (the pitch when only that differs: "… you wrote mi; it was sol."), or "Every beat right."
 */
export function listenTip(ex: Exercise, answer: Answer, check: ListenCheck, system: NameSystem): string {
  const wrong = firstWrong(check);
  if (!wrong) return t('listen.tip.allRight');
  const where = { beat: wrong.beat + 1, bar: wrong.bar + 1 };
  if (wrong.pitchOnly) {
    const theirs = stepsInBeat(ex.bars, ex.pitches, wrong.bar, ex.meter, wrong.beat);
    const mine = stepsInBeat(answerBars(answer), answerSteps(answer), wrong.bar, ex.meter, wrong.beat);
    const names = (list: Step[]): string => list.map((s) => stepName(s, system)).join(' ');
    return t('listen.tip.pitch', { ...where, yours: names(mine), theirs: names(theirs) });
  }
  const theirs = valuesInBeat(ex.bars[wrong.bar].events, ex.meter, wrong.beat);
  const mine = valuesInBeat(answerBars(answer)[wrong.bar]?.events ?? [], ex.meter, wrong.beat);
  if (!mine.length) return t('listen.tip.held', { ...where, theirs: valuesWords(theirs) });
  return t('listen.tip.rhythm', { ...where, yours: valuesWords(mine), theirs: valuesWords(theirs) });
}
