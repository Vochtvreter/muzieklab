/** Starting an exercise from a user gesture: unlock audio, generate, store the run, go to Play. */
import { useCallback } from 'react';
import type { Settings } from '../../core/api';
import { dailyChallenge, reachedUnit } from '../../game/daily';
import { unlockAudio } from '../audio';
import { newSeed } from '../lib/format';
import { navigate } from '../router';
import { makeRun, practiceSettings, runSettings, todayIso, useStore, type Run } from '../store';

/** A lesson by id; `replace` swaps the current screen for Play (from Results, so Back does not return to it). */
export function useStartLesson(): (lessonId: string, opts?: { replace?: boolean }) => void {
  const { state, dispatch } = useStore();
  return useCallback(
    (lessonId: string, opts: { replace?: boolean } = {}) => {
      unlockAudio();
      const run = makeRun(runSettings(state, lessonId), newSeed(), lessonId);
      if (!run) return;
      dispatch({ type: 'start', run });
      navigate('/play', { replace: opts.replace });
    },
    [state, dispatch],
  );
}

/**
 * Free practice with the given settings (hold follows the path: practiceSettings). `query` goes along to Play: from a
 * Learn practice link, `from=1.1`, so Quit and Results return to that section.
 */
export function useStartPractice(): (settings: Settings, opts?: { query?: string }) => void {
  const { state, dispatch } = useStore();
  return useCallback(
    (settings: Settings, opts: { query?: string } = {}) => {
      unlockAudio();
      const run = makeRun(practiceSettings(state, settings), newSeed(), null);
      if (!run) return;
      dispatch({ type: 'start', run });
      navigate('/play', opts);
    },
    [state, dispatch],
  );
}

/**
 * Today's daily challenge (the same exercise for everyone at this point of the path on this date). Tap only until the
 * path has taught holding (unit 2); from there hold comes from the Input pref.
 */
export function useStartDaily(): () => void {
  const { state, dispatch } = useStore();
  return useCallback(() => {
    unlockAudio();
    const day = todayIso();
    const { settings, seed } = dailyChallenge(day, reachedUnit(state.progress));
    const run = makeRun({ ...settings, hold: settings.hold && state.prefs.holdMode === 'hold' }, seed, null, day);
    if (!run) return;
    dispatch({ type: 'start', run });
    navigate('/play');
  }, [state.progress, state.prefs.holdMode, dispatch]);
}

/**
 * Retry (the same exercise) or Next (a new seed, same settings and lesson; after a daily challenge, free practice).
 * `query` keeps a Learn section to return to (`from=1.1`).
 */
export function useReplay(): (prev: Run, same: boolean, query?: string) => void {
  const { dispatch } = useStore();
  return useCallback(
    (prev: Run, same: boolean, query?: string) => {
      unlockAudio();
      const { exercise, lessonId } = prev;
      const run: Run | null = same ? { exercise, lessonId, daily: prev.daily } : makeRun(exercise.settings, newSeed(), lessonId);
      if (!run) return;
      dispatch({ type: 'start', run });
      // Results is swapped for Play (and Play for Results at the end), so Back leaves the exercise, not replays it.
      navigate('/play', { replace: true, query });
    },
    [dispatch],
  );
}
