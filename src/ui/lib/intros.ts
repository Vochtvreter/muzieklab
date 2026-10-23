/** How the intro sheet shows a new symbol (game/intro.ts): its glyph, its name, one short fact, and its Learn section. */
import type { NoteValue } from '../../core/api';
import type { Intro } from '../../game/intro';
import { t } from '../../i18n';

/** Noto Music glyphs, as the setup's note and rest buttons draw them. */
export const NOTE_GLYPH: Record<NoteValue, string> = { whole: '𝅝', half: '𝅗𝅥', quarter: '𝅘𝅥', eighth: '𝅘𝅥𝅮', sixteenth: '𝅘𝅥𝅯' };
export const REST_GLYPH: Record<NoteValue, string> = { whole: '𝄻', half: '𝄼', quarter: '𝄽', eighth: '𝄾', sixteenth: '𝄿' };

/** "Half note", "Quarter rest", "Three-four", "Tie". */
export function introName(i: Intro): string {
  if (i.kind === 'note') return t('noteButton.' + i.value);
  if (i.kind === 'rest') return t('restButton.' + i.value);
  if (i.kind === 'meter') return t('intro.name.meter' + i.meter.split('/')[0]);
  return t('intro.name.' + i.kind);
}

/** "2 beats", "1 beat of silence", "3 beats in a bar", "adds half the note’s length". */
export function introFact(i: Intro): string {
  if (i.kind === 'note' || i.kind === 'rest') return t(`intro.fact.${i.kind}.${i.value}`);
  if (i.kind === 'meter') return t('intro.fact.meter', { count: Number(i.meter.split('/')[0]) });
  return t('intro.fact.' + i.kind);
}

/** The Learn section that explains it (ui/learn/chapters.ts). */
export function introSection(i: Intro): string {
  switch (i.kind) {
    case 'meter':
      return '1.2';
    case 'note':
      return i.value === 'eighth' ? '4.1' : i.value === 'sixteenth' ? '4.2' : '2.1';
    case 'rest':
      return '3.1';
    case 'ties':
      return '5.1';
    case 'dotted':
      return '5.2';
    case 'triplets':
      return '7.1';
  }
}
