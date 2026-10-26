/** Starting a Scales round: draw it from the settings and a new seed, store it, go to its play screen. */
import { useCallback } from 'react';
import type { ScaleSettings } from '../../../core/api';
import { unlockAudio } from '../../audio';
import { newSeed } from '../../lib/format';
import { guardFollowUpTap } from '../../lib/tapGuard';
import { navigate } from '../../router';
import { makeScaleRun, useStore } from '../../store';

export function useStartScales(): (settings: ScaleSettings, opts?: { replace?: boolean }) => void {
  const { dispatch } = useStore();
  return useCallback(
    (settings: ScaleSettings, opts: { replace?: boolean } = {}) => {
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
