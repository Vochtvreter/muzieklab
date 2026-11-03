/** Starting a Read notes round: draw it (weak spots and focus notes boosted), store it, go to its Play screen. */
import { useCallback } from 'react';
import type { NoteSettings } from '../../../core/api';
import { noteLessonSeed, noteLessonSettings, type NoteTrackId } from '../../../game/notesPath';
import { pathLessonOpen } from '../../../game/tracks';
import { unlockAudio } from '../../audio';
import { newSeed } from '../../lib/format';
import { guardFollowUpTap } from '../../lib/tapGuard';
import { navigate } from '../../router';
import { makeNoteRun, useStore } from '../../store';

/** A round with these settings; `opts.query` goes along to Play (`from=8.2`: started from a Learn section). */
export function useStartNotes(): (settings: NoteSettings, focus?: string[], opts?: { replace?: boolean; query?: string }) => void {
  const { state, dispatch } = useStore();
  const weak = state.progress.notes.weak;
  return useCallback(
    (settings: NoteSettings, focus: string[] = [], opts: { replace?: boolean; query?: string } = {}) => {
      // Inside the tap, so iOS lets the notes sound.
      if (settings.playNotes || settings.tasks.includes('hear')) unlockAudio();
      dispatch({ type: 'noteStart', run: makeNoteRun(settings, newSeed(), weak, focus) });
      // A double tap on Start: its second tap must not answer the first note or skip the round.
      guardFollowUpTap();
      navigate('/notes/play', opts);
    },
    [weak, dispatch],
  );
}

/**
 * A note lesson of the Learning path by its kind and own id (First notes, Read notes or Keys; the Path, Round done's
 * Next lesson). Its preset is the whole setup, except for the sound: the player's Hear the notes choice holds here
 * too (a note to hear always sounds). The player's own Read notes setup is left as it is.
 * `replace` swaps Round done for Play, so Back does not return to it.
 */
export function useStartNoteLesson(): (track: NoteTrackId, lessonId: string, opts?: { replace?: boolean }) => void {
  const { state, dispatch } = useStore();
  const { progress } = state;
  const playNotes = state.noteSettings.playNotes;
  return useCallback(
    (track: NoteTrackId, lessonId: string, opts: { replace?: boolean } = {}) => {
      const preset = noteLessonSettings(track, lessonId);
      if (!preset || !pathLessonOpen(progress, track, lessonId)) return;
      const settings = { ...preset, playNotes };
      if (playNotes || preset.tasks.includes('hear')) unlockAudio();
      // A round that shows the sign a Keys lesson is about (B♭ in "B flat in the key"); the run keeps its seed.
      const weak = progress.notes.weak;
      dispatch({ type: 'noteStart', run: makeNoteRun(settings, noteLessonSeed(settings, newSeed(), weak), weak, [], { track, id: lessonId }) });
      guardFollowUpTap();
      navigate('/notes/play', opts);
    },
    [progress, playNotes, dispatch],
  );
}
