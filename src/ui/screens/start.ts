/** Starting an exercise from a user gesture: unlock audio, generate, store the run, go to Play. */
import { useCallback } from 'react';
import type { Settings } from '../../core/api';
import { dailyChallenge, dailyTier } from '../../game/daily';
import { findPathLesson } from '../../game/tracks';
import { unlockAudio } from '../audio';
import { newSeed } from '../lib/format';
import { guardFollowUpTap } from '../lib/tapGuard';
import { navigate } from '../router';
import { makeLessonRun, makeRun, practiceSettings, runSettings, todayIso, useStore, type Run } from '../store';
import { useStartNoteLesson } from './notes/start';

/**
 * A lesson by id, with an exercise that shows what the lesson introduces (makeLessonRun); `replace` swaps the current
 * screen for Play (from Results, so Back does not return to it).
 */
export function useStartLesson(): (lessonId: string, opts?: { replace?: boolean }) => void {
  const { state, dispatch } = useStore();
  return useCallback(
    (lessonId: string, opts: { replace?: boolean } = {}) => {
      unlockAudio();
      const run = makeLessonRun(runSettings(state, lessonId), newSeed(), lessonId);
      if (!run) return;
      dispatch({ type: 'start', run });
      // A double tap on Start: its second tap must not press what Play has under it (Skip to results).
      guardFollowUpTap();
      navigate('/play', { replace: opts.replace });
    },
    [state, dispatch],
  );
}

/**
 * A lesson of the Learning path by its number there ("4.2"): a rhythm lesson on Play, a note lesson (read, write, hear)
 * on the Read notes Play screen. `replace` swaps the current screen for it (Results, Round done: Next lesson).
 */
export function useStartPathLesson(): (id: string, opts?: { replace?: boolean }) => void {
  const startRhythm = useStartLesson();
  const startNotes = useStartNoteLesson();
  return useCallback(
    (id: string, opts: { replace?: boolean } = {}) => {
      const l = findPathLesson(id)?.lesson;
      if (!l) return;
      if (l.track === 'rhythm') startRhythm(l.ref, opts);
      else startNotes(l.track, l.ref, opts);
    },
    [startRhythm, startNotes],
  );
}

/**
 * Free practice with the given settings (hold follows the path: practiceSettings). `query` goes along to Play: from a
 * Learn practice link, `from=1.1`, so Quit and Results return to that section. `replace` swaps the current screen for
 * Play (the practice link's own address, opened in a new tab). `needsGesture`: no tap led here (that address), so the
 * audio cannot start yet and Play waits on Ready · Start, as after a reload.
 */
export function useStartPractice(): (settings: Settings, opts?: { replace?: boolean; query?: string; needsGesture?: boolean }) => void {
  const { state, dispatch } = useStore();
  return useCallback(
    (settings: Settings, { needsGesture, ...opts }: { replace?: boolean; query?: string; needsGesture?: boolean } = {}) => {
      unlockAudio();
      const run = makeRun(practiceSettings(state, settings), newSeed(), null);
      if (!run) return;
      dispatch({ type: 'start', run: needsGesture ? { ...run, needsGesture } : run });
      guardFollowUpTap();
      navigate('/play', opts);
    },
    [state, dispatch],
  );
}

/**
 * Today's daily challenge (the same exercise for everyone at this point of the path on this date; once played, the
 * same one all day: dailyTier). Tap only until the path has taught holding (unit 2); from there hold comes from the
 * Input pref.
 */
export function useStartDaily(): () => void {
  const { state, dispatch } = useStore();
  return useCallback(() => {
    unlockAudio();
    const day = todayIso();
    const { settings, seed } = dailyChallenge(day, dailyTier(state.progress, day));
    const run = makeRun({ ...settings, hold: settings.hold && state.prefs.holdMode === 'hold' }, seed, null, day);
    if (!run) return;
    dispatch({ type: 'start', run });
    guardFollowUpTap();
    navigate('/play');
  }, [state.progress, state.prefs.holdMode, dispatch]);
}

/**
 * Retry (the same exercise) or Next (a new seed, same settings and lesson, again showing what the lesson introduces;
 * after a daily challenge, free practice). `query` keeps a Learn section to return to (`from=1.1`).
 */
export function useReplay(): (prev: Run, same: boolean, query?: string) => void {
  const { dispatch } = useStore();
  return useCallback(
    (prev: Run, same: boolean, query?: string) => {
      unlockAudio();
      const { exercise, lessonId } = prev;
      const run: Run | null = same
        ? { exercise, lessonId, daily: prev.daily }
        : lessonId
          ? makeLessonRun(exercise.settings, newSeed(), lessonId)
          : makeRun(exercise.settings, newSeed(), null);
      if (!run) return;
      dispatch({ type: 'start', run });
      guardFollowUpTap();
      // Results is swapped for Play (and Play for Results at the end), so Back leaves the exercise, not replays it.
      navigate('/play', { replace: true, query });
    },
    [dispatch],
  );
}
