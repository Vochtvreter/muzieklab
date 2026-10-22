/** Starting a Read notes round: draw it (weak spots and focus notes boosted), store it, go to its Play screen. */
import { useCallback } from 'react';
import type { NoteSettings } from '../../../core/api';
import { noteLessonSettings, type NoteTrackId } from '../../../game/notesPath';
import { trackLessonOpen } from '../../../game/tracks';
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

/**
 * A Read notes or Keys lesson by id (Path, Round done's Next lesson). Its preset is the whole setup: the player's own
 * Read notes setup is left as it is. `replace` swaps Round done for Play, so Back does not return to it.
 */
export function useStartNoteLesson(): (track: NoteTrackId, lessonId: string, opts?: { replace?: boolean }) => void {
  const { state, dispatch } = useStore();
  const { progress } = state;
  return useCallback(
    (track: NoteTrackId, lessonId: string, opts: { replace?: boolean } = {}) => {
      const settings = noteLessonSettings(track, lessonId);
      if (!settings || !trackLessonOpen(progress, track, lessonId)) return;
      dispatch({ type: 'noteStart', run: makeNoteRun(settings, newSeed(), progress.notes.weak, [], { track, id: lessonId }) });
      navigate('/notes/play', opts);
    },
    [progress, dispatch],
  );
}
