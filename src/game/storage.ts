import type { Leniency, Settings } from '../core/types';
import type { Volumes } from '../audio/engine';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  volumes: Volumes;
  metronomeOn: boolean;
  tapSoundOn: boolean;
  leniency: Leniency;
  calibrationMs: number; // device offset
  calibratedAt: string | null; // ISO date
  seenHowTo: boolean;
}

export interface LessonProgress {
  stars: 0 | 1 | 2 | 3;
  bestAccuracy: number;
}

export interface Progress {
  lessons: Record<string, LessonProgress>; // key: lesson id, e.g. "7.3"
  practiceDays: string[]; // ISO dates (yyyy-mm-dd) with at least one finished exercise
  lastSettings: Settings | null;
}

export function loadPrefs(): Prefs {
  throw new Error('not implemented');
}
export function savePrefs(p: Prefs): void {
  throw new Error('not implemented' + p.theme);
}
export function loadProgress(): Progress {
  throw new Error('not implemented');
}
export function saveProgress(p: Progress): void {
  throw new Error('not implemented' + p.practiceDays.length);
}
/** Current streak in days ending today (or yesterday if today has no practice yet). */
export function streak(days: string[], today: string): number {
  throw new Error('not implemented' + days.length + today);
}
