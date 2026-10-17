/** Starting an exercise from a user gesture: unlock audio, generate, store the run, go to Play. */
import { useCallback } from 'react';
import type { Exercise, Settings } from '../../core/api';
import { unlockAudio } from '../audio';
import { newSeed } from '../lib/format';
import { navigate } from '../router';
import { makeRun, runSettings, useStore } from '../store';

export function useStartLesson(): (lessonId: string) => void {
  const { state, dispatch } = useStore();
  return useCallback(
    (lessonId: string) => {
      unlockAudio();
      const run = makeRun(runSettings(state, lessonId), newSeed(), lessonId);
      if (!run) return;
      dispatch({ type: 'start', run });
      navigate('/play');
    },
    [state, dispatch],
  );
}

/** Free practice with the given settings (hold comes from the Input pref). */
export function useStartPractice(): (settings: Settings) => void {
  const { state, dispatch } = useStore();
  return useCallback(
    (settings: Settings) => {
      unlockAudio();
      const run = makeRun({ ...settings, hold: state.prefs.holdMode === 'hold' }, newSeed(), null);
      if (!run) return;
      dispatch({ type: 'start', run });
      navigate('/play');
    },
    [state.prefs.holdMode, dispatch],
  );
}

/** Retry (the same exercise) or Next (a new seed, same settings and lesson). */
export function useReplay(): (exercise: Exercise, lessonId: string | null, same: boolean) => void {
  const { dispatch } = useStore();
  return useCallback(
    (exercise: Exercise, lessonId: string | null, same: boolean) => {
      unlockAudio();
      const run = same ? { exercise, lessonId } : makeRun(exercise.settings, newSeed(), lessonId);
      if (!run) return;
      dispatch({ type: 'start', run });
      navigate('/play');
    },
    [dispatch],
  );
}
