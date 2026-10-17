/** Starting a Read notes round: draw it (weak spots and focus notes boosted), store it, go to its Play screen. */
import { useCallback } from 'react';
import type { NoteSettings } from '../../../core/api';
import { newSeed } from '../../lib/format';
import { navigate } from '../../router';
import { makeNoteRun, useStore } from '../../store';

export function useStartNotes(): (settings: NoteSettings, focus?: string[], opts?: { replace?: boolean }) => void {
  const { state, dispatch } = useStore();
  const weak = state.progress.notes.weak;
  return useCallback(
    (settings: NoteSettings, focus: string[] = [], opts: { replace?: boolean } = {}) => {
      dispatch({ type: 'noteStart', run: makeNoteRun(settings, newSeed(), weak, focus) });
      navigate('/notes/play', opts);
    },
    [weak, dispatch],
  );
}
