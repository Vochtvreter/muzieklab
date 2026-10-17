/**
 * App state: React context + useReducer. Holds the prefs and progress (persisted via game/storage),
 * the free-practice settings, the current run (exercise + seed) and the last result.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, generateExercise, type Exercise, type JudgeResult, type Settings, type Tap } from '../core/api';
import { lessonSettings, recordLessonResult } from '../game/path';
import {
  addPracticeDay,
  defaultProgress,
  loadPrefs,
  loadProgress,
  localDateIso,
  resetProgress as clearStoredProgress,
  savePrefs,
  saveProgress,
  type Prefs,
  type Progress,
} from '../game/storage';
import { parseHash } from './router';

export interface Run {
  exercise: Exercise;
  /** Lesson id ("7.3") or null for free practice. */
  lessonId: string | null;
  /** Restored after a reload: Play waits for a tap (Ready · Start) before it makes sound. */
  needsGesture?: boolean;
}

/** The current run, per tab (sessionStorage), so a reload on Play rebuilds the same exercise. */
export const RUN_KEY = 'muzieklab.run.v1';

interface StoredRun {
  settings: Settings;
  seed: number;
  lessonId: string | null;
}

function saveRun(run: Run | null): void {
  try {
    if (!run) sessionStorage.removeItem(RUN_KEY);
    else sessionStorage.setItem(RUN_KEY, JSON.stringify({ settings: run.exercise.settings, seed: run.exercise.seed, lessonId: run.lessonId } satisfies StoredRun));
  } catch {
    /* storage blocked: a reload goes back to Setup, as before */
  }
}

/** The run saved for this tab, regenerated from its settings and seed (the generator is deterministic). */
export function restoreRun(): Run | null {
  try {
    const raw = sessionStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredRun>;
    if (!v || typeof v.seed !== 'number' || typeof v.settings !== 'object' || v.settings === null) return null;
    const lessonId = typeof v.lessonId === 'string' ? v.lessonId : null;
    const run = makeRun(v.settings as Settings, v.seed, lessonId);
    return run && { ...run, needsGesture: true };
  } catch {
    return null;
  }
}

export interface LastResult {
  run: Run;
  result: JudgeResult;
  taps: Tap[];
}

export interface AppState {
  prefs: Prefs;
  progress: Progress;
  /** Free-practice settings as edited on the setup screen. */
  settings: Settings;
  run: Run | null;
  last: LastResult | null;
}

export type Action =
  | { type: 'prefs'; patch: Partial<Prefs> }
  | { type: 'settings'; settings: Settings }
  | { type: 'start'; run: Run }
  | { type: 'finish'; result: JudgeResult; taps: Tap[]; today: string }
  | { type: 'resetProgress' };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'prefs':
      return { ...state, prefs: { ...state.prefs, ...action.patch } };
    case 'settings':
      return { ...state, settings: action.settings };
    case 'start': {
      const progress = action.run.lessonId ? state.progress : { ...state.progress, lastSettings: action.run.exercise.settings };
      return { ...state, run: action.run, progress };
    }
    case 'finish': {
      if (!state.run) return state;
      // The streak counts a day with real practice: at least one note hit (letting a run play out untouched does not).
      const practised = action.result.notes.some((n) => n.judgement !== 'miss');
      let progress = practised ? addPracticeDay(state.progress, action.today) : state.progress;
      if (state.run.lessonId) progress = recordLessonResult(progress, state.run.lessonId, action.result.stars, action.result.accuracy);
      return { ...state, progress, last: { run: state.run, result: action.result, taps: action.taps } };
    }
    case 'resetProgress':
      return { ...state, progress: defaultProgress(), last: null };
  }
}

/** The hold setting an exercise uses: a lesson preset's `hold: false` wins, otherwise the Input pref. */
export function effectiveHold(prefs: Prefs, lessonId: string | null): boolean {
  if (lessonId && lessonSettings(lessonId).hold === false) return false;
  return prefs.holdMode === 'hold';
}

/** Settings for a run, with the effective hold applied. */
export function runSettings(state: Pick<AppState, 'prefs' | 'settings'>, lessonId: string | null): Settings {
  const base = lessonId ? lessonSettings(lessonId) : state.settings;
  return { ...base, hold: effectiveHold(state.prefs, lessonId) };
}

/** Generates a run; null when the settings cannot make an exercise. */
export function makeRun(settings: Settings, seed: number, lessonId: string | null): Run | null {
  try {
    return { exercise: generateExercise(settings, seed), lessonId };
  } catch (e) {
    console.error('generateExercise failed', e);
    return null;
  }
}

function initialState(): AppState {
  const prefs = loadPrefs();
  const progress = loadProgress();
  const settings = progress.lastSettings ?? { ...DEFAULT_SETTINGS };
  // A reload on Play picks the exercise up again instead of falling back to Setup.
  const onPlay = typeof window !== 'undefined' && parseHash(window.location.hash) === '/play';
  return { prefs, progress, settings: { ...settings, hold: prefs.holdMode === 'hold' }, run: onPlay ? restoreRun() : null, last: null };
}

interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) return;
    savePrefs(state.prefs);
  }, [state.prefs]);
  useEffect(() => {
    if (first.current) return;
    if (state.progress.practiceDays.length === 0 && Object.keys(state.progress.lessons).length === 0 && !state.progress.lastSettings) {
      clearStoredProgress();
    } else {
      saveProgress(state.progress);
    }
  }, [state.progress]);
  useEffect(() => {
    if (first.current) return;
    saveRun(state.run);
  }, [state.run]);
  useEffect(() => {
    first.current = false;
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

export const todayIso = (): string => localDateIso();
