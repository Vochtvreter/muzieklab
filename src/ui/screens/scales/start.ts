/**
 * Starting a Scales round: draw it from the settings and a new seed, store it, go to its play screen. `opts.query` goes
 * along to Play (`from=11.2`: started from a setup or the circle opened from Learn).
 */
import { useCallback } from 'react';
import type { ScaleSettings } from '../../../core/api';
import { unlockAudio } from '../../audio';
import { newSeed } from '../../lib/format';
import { guardFollowUpTap } from '../../lib/tapGuard';
import { navigate } from '../../router';
import { makeScaleRun, useStore } from '../../store';

export function useStartScales(): (settings: ScaleSettings, opts?: { replace?: boolean; query?: string }) => void {
  const { dispatch } = useStore();
  return useCallback(
    (settings: ScaleSettings, opts: { replace?: boolean; query?: string } = {}) => {
      // Inside the tap, so iOS lets the notes sound.
      if (settings.playNotes) unlockAudio();
      dispatch({ type: 'scaleStart', run: makeScaleRun(settings, newSeed()) });
      // A double tap on Start: its second tap must not press the piano key under it.
      guardFollowUpTap();
      navigate('/scales/play', opts);
    },
    [dispatch],
  );
}
