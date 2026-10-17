/** Practice setup validation text (DESIGN.md §4.1), built from checkSettings(). */
import type { Feasibility, MeterId, Settings } from '../../core/api';
import { t } from '../../i18n';
import { orList } from './format';

export interface SetupHint {
  /** Element id, referenced by the greyed chip's aria-describedby. */
  id: string;
  text: string;
}

export const NO_NOTES_HINT_ID = 'meter-hint-notes';
export const meterHintId = (m: MeterId): string => 'meter-hint-' + m.replace('/', '-');

/** One translated line for a blocked meter. */
export function blockedText(entry: NonNullable<Feasibility['blocked'][MeterId]>): string {
  const values = entry.values ?? (entry.params.values ? entry.params.values.split(',') : []);
  if (entry.key === 'setup.needs' && values.length) {
    return t('setup.needs', { ...entry.params, first: values[0], values: orList(values) });
  }
  return t(entry.key, entry.params);
}

/**
 * Hint lines under the time signatures: none when everything chosen is playable; one line when no note value
 * is on; otherwise one line per chosen meter that cannot be filled.
 */
export function setupHints(settings: Settings, feas: Feasibility): SetupHint[] {
  if (settings.meters.length === 0) return [];
  if (settings.notes.length === 0) return [{ id: NO_NOTES_HINT_ID, text: t('setup.hintNoNotes') }];
  const hints: SetupHint[] = [];
  for (const m of settings.meters) {
    const entry = feas.blocked[m];
    if (entry) hints.push({ id: meterHintId(m), text: blockedText(entry) });
  }
  return hints;
}

/** Label for the disabled Start button, or null when Start is enabled. */
export function startBlockedKey(settings: Settings, feas: Feasibility): string | null {
  if (feas.ok) return null;
  if (settings.meters.length === 0) return 'setup.blockedNoMeter';
  if (settings.notes.length === 0) return 'setup.blockedNoNotes';
  return 'setup.blockedUnfillable';
}
