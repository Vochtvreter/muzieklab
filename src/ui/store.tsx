/**
 * App state: React context + useReducer. Holds the prefs and progress (persisted via game/storage),
 * the free-practice settings, the current run (exercise + seed) and the last result.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import {
  DEFAULT_NOTE_SETTINGS,
  DEFAULT_SETTINGS,
  generateExercise,
  generateRound,
  noteRoundXp,
  sanitizeNoteSettings,
  scoreRound,
  updateWeak,
  type Exercise,
  type JudgeResult,
  type NoteAnswer,
  type NoteSettings,
  type RoundNote,
  type RoundResult,
  type Settings,
  type Tap,
} from '../core/api';
import { lessonSettings, recordLessonResult } from '../game/path';
import { xpForResult } from '../game/xp';
import {
  addPracticeDay,
  defaultProgress,
  isEmptyProgress,
  loadPrefs,
  loadProgress,
  localDateIso,
  resetProgress as clearStoredProgress,
  savePrefs,
  saveProgress,
  streak,
  sanitizeSettings,
  type Prefs,
  type Progress,
} from '../game/storage';
import { parseHash } from './router';

export interface Run {
  exercise: Exercise;
  /** Lesson id ("7.3") or null for free practice. */
  lessonId: string | null;
  /** The daily challenge's date (yyyy-mm-dd) when this run is one, else null. */
  daily: string | null;
  /** Restored after a reload: Play waits for a tap (Ready · Start) before it makes sound. */
  needsGesture?: boolean;
}

/** The current run, per tab (sessionStorage), so a reload on Play rebuilds the same exercise. */
export const RUN_KEY = 'muzieklab.run.v1';

interface StoredRun {
  settings: Settings;
  seed: number;
  lessonId: string | null;
  daily?: string | null;
}

function saveRun(run: Run | null): void {
  try {
    if (!run) sessionStorage.removeItem(RUN_KEY);
    else sessionStorage.setItem(RUN_KEY, JSON.stringify({ settings: run.exercise.settings, seed: run.exercise.seed, lessonId: run.lessonId, daily: run.daily } satisfies StoredRun));
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
    const daily = typeof v.daily === 'string' ? v.daily : null;
    const settings = sanitizeSettings(v.settings);
    const run = settings && makeRun(settings, v.seed, lessonId, daily);
    return run && { ...run, needsGesture: true };
  } catch {
    return null;
  }
}

/** A Read notes round: its settings and seed, the notes drawn, and the focus notes of *Practice missed notes*. */
export interface NoteRun {
  settings: NoteSettings;
  seed: number;
  focus: string[];
  notes: RoundNote[];
}

/** The current Read notes round, per tab, so a reload on its Play screen starts the same round again. */
export const NOTE_RUN_KEY = 'muzieklab.noteRun.v1';

export function makeNoteRun(settings: NoteSettings, seed: number, weak: Record<string, number>, focus: string[] = []): NoteRun {
  return { settings, seed, focus, notes: generateRound(settings, seed, weak, focus) };
}

function saveNoteRun(run: NoteRun | null): void {
  try {
    if (!run) sessionStorage.removeItem(NOTE_RUN_KEY);
    else sessionStorage.setItem(NOTE_RUN_KEY, JSON.stringify({ settings: run.settings, seed: run.seed, focus: run.focus }));
  } catch {
    /* storage blocked: a reload goes back to the setup */
  }
}

/** The round saved for this tab, drawn again from its settings and seed (weak spots only change when a round ends). */
export function restoreNoteRun(weak: Record<string, number>): NoteRun | null {
  try {
    const raw = sessionStorage.getItem(NOTE_RUN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { settings?: unknown; seed?: unknown; focus?: unknown };
    const settings = sanitizeNoteSettings(v?.settings);
    if (!settings || typeof v.seed !== 'number') return null;
    const focus = Array.isArray(v.focus) ? v.focus.filter((x): x is string => typeof x === 'string') : [];
    return makeNoteRun(settings, v.seed, weak, focus);
  } catch {
    return null;
  }
}

/** What a finished run earned, for Results and the level-up sheet. */
export interface Reward {
  xp: number;
  /** Total XP before and after this run. */
  xpBefore: number;
  xpAfter: number;
  /** Streak in days after this run when it counted as practice, else null. */
  streak: number | null;
  /** A daily challenge beat the best daily accuracy so far. */
  dailyBest: boolean;
}

export interface LastResult {
  run: Run;
  result: JudgeResult;
  taps: Tap[];
  reward: Reward;
}

export interface NoteLast {
  run: NoteRun;
  answers: NoteAnswer[];
  result: RoundResult;
  reward: Reward;
}

export interface AppState {
  prefs: Prefs;
  progress: Progress;
  /** Free-practice settings as edited on the setup screen. */
  settings: Settings;
  run: Run | null;
  last: LastResult | null;
  /** Read notes: the setup, the round being played and the last finished round. */
  noteSettings: NoteSettings;
  noteRun: NoteRun | null;
  noteLast: NoteLast | null;
}

export type Action =
  | { type: 'prefs'; patch: Partial<Prefs> }
  | { type: 'settings'; settings: Settings }
  | { type: 'start'; run: Run }
  | { type: 'finish'; result: JudgeResult; taps: Tap[]; today: string }
  | { type: 'resetProgress' }
  | { type: 'noteSettings'; settings: NoteSettings }
  | { type: 'noteStart'; run: NoteRun }
  | { type: 'noteFinish'; answers: NoteAnswer[]; today: string }
  | { type: 'learnRead'; ids: string[] };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'prefs':
      return { ...state, prefs: { ...state.prefs, ...action.patch } };
    case 'settings':
      return { ...state, settings: action.settings };
    case 'start': {
      const free = !action.run.lessonId && !action.run.daily;
      const progress = free ? { ...state.progress, lastSettings: action.run.exercise.settings } : state.progress;
      return { ...state, run: action.run, progress };
    }
    case 'finish': {
      if (!state.run) return state;
      // The streak counts a day with real practice: at least one note hit (letting a run play out untouched does not).
      const { result } = action;
      const practised = result.notes.some((n) => n.judgement !== 'miss');
      let progress = practised ? addPracticeDay(state.progress, action.today) : state.progress;
      if (state.run.lessonId) progress = recordLessonResult(progress, state.run.lessonId, result.stars, result.accuracy);
      let dailyBest = false;
      const day = state.run.daily;
      const firstDaily = !!day && practised && progress.daily?.day !== day;
      if (day && practised) {
        const prev = progress.daily?.day === day ? progress.daily : null;
        dailyBest = result.accuracy > progress.dailyBest;
        progress = {
          ...progress,
          daily: { day, stars: prev && prev.stars > result.stars ? prev.stars : result.stars, accuracy: Math.max(prev?.accuracy ?? 0, result.accuracy) },
          dailyBest: Math.max(progress.dailyBest, result.accuracy),
        };
      }
      const xp = xpForResult(state.run.exercise, result, firstDaily);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const reward: Reward = { xp, xpBefore, xpAfter: xpBefore + xp, streak: practised ? streak(progress.practiceDays, action.today) : null, dailyBest };
      return { ...state, progress, last: { run: state.run, result, taps: action.taps, reward } };
    }
    case 'resetProgress':
      return { ...state, progress: defaultProgress(), last: null, noteLast: null, noteSettings: { ...DEFAULT_NOTE_SETTINGS } };
    case 'noteSettings':
      return { ...state, noteSettings: action.settings, progress: { ...state.progress, notes: { ...state.progress.notes, settings: action.settings } } };
    case 'noteStart':
      return { ...state, noteRun: action.run };
    case 'noteFinish': {
      const run = state.noteRun;
      if (!run) return state;
      const answers = action.answers.slice(0, run.notes.length);
      const result = scoreRound(run.notes, answers);
      // Real practice: at least one note answered (a round that only timed out, or was skipped at once, does not count).
      const practised = answers.some((a) => a.given !== null);
      let progress = practised ? addPracticeDay(state.progress, action.today) : state.progress;
      progress = { ...progress, notes: { ...progress.notes, weak: updateWeak(progress.notes.weak, run.notes, answers) } };
      const xp = noteRoundXp(run.settings, result);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const reward: Reward = { xp, xpBefore, xpAfter: xpBefore + xp, streak: practised ? streak(progress.practiceDays, action.today) : null, dailyBest: false };
      return { ...state, progress, noteLast: { run, answers, result, reward } };
    }
    case 'learnRead': {
      const add = action.ids.filter((id) => !state.progress.learnRead.includes(id));
      if (add.length === 0) return state;
      return { ...state, progress: { ...state.progress, learnRead: [...state.progress.learnRead, ...add].sort() } };
    }
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
export function makeRun(settings: Settings, seed: number, lessonId: string | null, daily: string | null = null): Run | null {
  try {
    return { exercise: generateExercise(settings, seed), lessonId, daily };
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
  const route = typeof window !== 'undefined' ? parseHash(window.location.hash) : '/';
  return {
    prefs,
    progress,
    settings: { ...settings, hold: prefs.holdMode === 'hold' },
    run: route === '/play' ? restoreRun() : null,
    last: null,
    noteSettings: progress.notes.settings ?? { ...DEFAULT_NOTE_SETTINGS },
    noteRun: route === '/notes/play' ? restoreNoteRun(progress.notes.weak) : null,
    noteLast: null,
  };
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
    if (isEmptyProgress(state.progress)) {
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
    if (first.current) return;
    saveNoteRun(state.noteRun);
  }, [state.noteRun]);
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
