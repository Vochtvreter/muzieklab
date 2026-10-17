/** Glue between the prefs and the audio engine. */
import { getAudioEngine, type AudioEngine } from '../audio/engine';
import type { Prefs } from '../game/storage';

export function engine(): AudioEngine {
  return getAudioEngine();
}

/** Volumes with switched-off channels at 0 (the metronome is muted, so the count-in still sounds), plus the calibration offset. */
export function applyAudioPrefs(prefs: Prefs, eng: AudioEngine = getAudioEngine()): void {
  eng.setVolumes({
    metronome: prefs.volumes.metronome,
    rhythm: prefs.volumes.rhythm,
    tap: prefs.tapSoundOn ? prefs.volumes.tap : 0,
  });
  eng.setMetronomeMuted(!prefs.metronomeOn);
  eng.setCalibrationOffsetMs(prefs.calibrationMs);
}

/** Call inside a user gesture (Start, Continue, Retry…), so iOS lets the page make sound. */
export function unlockAudio(): void {
  void getAudioEngine()
    .unlock()
    .catch(() => undefined);
}
