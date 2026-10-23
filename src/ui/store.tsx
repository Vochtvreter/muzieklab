/**
 * App state: React context + useReducer. Holds the prefs and progress (persisted via game/storage),
 * the free-practice settings, the current run (exercise + seed) and the last result.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import {
  DEFAULT_NOTE_SETTINGS,
  DEFAULT_SCALE_SETTINGS,
  DEFAULT_SETTINGS,
  generateExercise,
  generateRound,
  generateScaleRound,
  noteRoundXp,
  sanitizeNoteSettings,
  sanitizeScaleSettings,
  scaleRoundXp,
  scoreRound,
  scoreScaleRound,
  SLOW_MS,
  updateScaleStars,
  updateWeak,
  type Exercise,
  type JudgeResult,
  type KeyId,
  type NoteAnswer,
  type NoteSettings,
  type PlayedScale,
  type RoundNote,
  type RoundResult,
  type RoundScale,
  type ScaleRoundResult,
  type ScaleSettings,
  type ScaleStars,
  type Settings,
  type Tap,
} from '../core/api';
import { dailyTier } from '../game/daily';
import { noteLessonSettings, type NoteTrackId } from '../game/notesPath';
import { ALL_LESSONS, isUnlocked, lessonSettings, recordLessonResult } from '../game/path';
import { progressKey } from '../game/track';
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

/** A Read notes or Keys path lesson: its path and its id there ("4.3"). */
export interface NoteLessonRef {
  track: NoteTrackId;
  id: string;
}

/** A Read notes round: its settings and seed, the notes drawn, the focus notes of *Practice missed notes*, and its lesson. */
export interface NoteRun {
  settings: NoteSettings;
  seed: number;
  focus: string[];
  notes: RoundNote[];
  /** The path lesson this round is, or null for free practice. */
  lesson: NoteLessonRef | null;
}

/** The current Read notes round, per tab, so a reload on its Play screen starts the same round again. */
export const NOTE_RUN_KEY = 'muzieklab.noteRun.v1';

export function makeNoteRun(settings: NoteSettings, seed: number, weak: Record<string, number>, focus: string[] = [], lesson: NoteLessonRef | null = null): NoteRun {
  return { settings, seed, focus, notes: generateRound(settings, seed, weak, focus), lesson };
}

function saveNoteRun(run: NoteRun | null): void {
  try {
    if (!run) sessionStorage.removeItem(NOTE_RUN_KEY);
    else sessionStorage.setItem(NOTE_RUN_KEY, JSON.stringify({ settings: run.settings, seed: run.seed, focus: run.focus, lesson: run.lesson }));
  } catch {
    /* storage blocked: a reload goes back to the setup */
  }
}

/** The round saved for this tab, drawn again from its settings and seed (weak spots only change when a round ends). */
export function restoreNoteRun(weak: Record<string, number>): NoteRun | null {
  try {
    const raw = sessionStorage.getItem(NOTE_RUN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { settings?: unknown; seed?: unknown; focus?: unknown; lesson?: { track?: unknown; id?: unknown } | null };
    const settings = sanitizeNoteSettings(v?.settings);
    if (!settings || typeof v.seed !== 'number') return null;
    const focus = Array.isArray(v.focus) ? v.focus.filter((x): x is string => typeof x === 'string') : [];
    const l = v.lesson;
    const lesson =
      l && (l.track === 'notes' || l.track === 'keys') && typeof l.id === 'string' && noteLessonSettings(l.track, l.id) ? { track: l.track as NoteTrackId, id: l.id } : null;
    return makeNoteRun(settings, v.seed, weak, focus, lesson);
  } catch {
    return null;
  }
}

/** A Scales round: its settings and seed, and the scales drawn (scales with mistakes are added at the end while playing). */
export interface ScaleRun {
  settings: ScaleSettings;
  seed: number;
  scales: RoundScale[];
}

/** The current Scales round, per tab, so a reload on its play screen starts the same round again. */
export const SCALE_RUN_KEY = 'muzieklab.scaleRun.v1';

export function makeScaleRun(settings: ScaleSettings, seed: number): ScaleRun {
  return { settings, seed, scales: generateScaleRound(settings, seed) };
}

function saveScaleRun(run: ScaleRun | null): void {
  try {
    if (!run) sessionStorage.removeItem(SCALE_RUN_KEY);
    else sessionStorage.setItem(SCALE_RUN_KEY, JSON.stringify({ settings: run.settings, seed: run.seed }));
  } catch {
    /* storage blocked: a reload goes back to the hub */
  }
}

export function restoreScaleRun(): ScaleRun | null {
  try {
    const raw = sessionStorage.getItem(SCALE_RUN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { settings?: unknown; seed?: unknown };
    const settings = sanitizeScaleSettings(v?.settings);
    if (!settings || typeof v.seed !== 'number') return null;
    return makeScaleRun(settings, v.seed);
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
  /** The lesson's best stars before this run (0 for free practice and the daily challenge): Results tells a first pass. */
  lessonStarsBefore: number;
}

export interface NoteLast {
  run: NoteRun;
  /** The notes answered (a lesson's score also counts the ones left as missed: see `result`). */
  answers: NoteAnswer[];
  result: RoundResult;
  reward: Reward;
  /** A lesson round: the lesson's best stars before it, so Round done can tell a first pass (0 otherwise). */
  lessonStarsBefore: number;
}

export interface ScaleLast {
  run: ScaleRun;
  played: PlayedScale[];
  result: ScaleRoundResult;
  reward: Reward;
  /** The best stars per scale before this round, for the circle's progress on Round done. */
  starsBefore: ScaleStars;
}

/** The Scales hub: the ring in front (Major / Minor) and the selected key (§3.7). */
export interface ScaleHub {
  tab: 'major' | 'minor';
  key: KeyId;
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
  /** Scales: the setup, the hub's selection, the round being played and the last finished round. */
  scaleSettings: ScaleSettings;
  scaleHub: ScaleHub;
  scaleRun: ScaleRun | null;
  scaleLast: ScaleLast | null;
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
  | { type: 'learnRead'; ids: string[] }
  | { type: 'scaleSettings'; settings: ScaleSettings }
  | { type: 'scaleHub'; hub: ScaleHub }
  | { type: 'scaleStart'; run: ScaleRun }
  | { type: 'scaleFinish'; played: PlayedScale[]; today: string };

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
      const lessonStarsBefore = state.run.lessonId ? (state.progress.lessons[state.run.lessonId]?.stars ?? 0) : 0;
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
          // The tier is fixed by the day's first play (dailyTier): the one this run was started at.
          daily: {
            day,
            tier: dailyTier(progress, day),
            stars: prev && prev.stars > result.stars ? prev.stars : result.stars,
            accuracy: Math.max(prev?.accuracy ?? 0, result.accuracy),
          },
          dailyBest: Math.max(progress.dailyBest, result.accuracy),
        };
      }
      const xp = xpForResult(state.run.exercise, result, firstDaily);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const reward: Reward = { xp, xpBefore, xpAfter: xpBefore + xp, streak: practised ? streak(progress.practiceDays, action.today) : null, dailyBest };
      return { ...state, progress, last: { run: state.run, result, taps: action.taps, reward, lessonStarsBefore } };
    }
    case 'resetProgress':
      return {
        ...state,
        progress: defaultProgress(),
        // The free-practice setup comes from the progress (lastSettings), so it goes back to the defaults too.
        settings: practiceSettings({ prefs: state.prefs, progress: defaultProgress() }, DEFAULT_SETTINGS),
        last: null,
        noteLast: null,
        noteSettings: { ...DEFAULT_NOTE_SETTINGS },
        scaleLast: null,
        scaleSettings: { ...DEFAULT_SCALE_SETTINGS },
        scaleHub: { tab: 'major', key: DEFAULT_SCALE_SETTINGS.keys[0] },
      };
    case 'noteSettings':
      return { ...state, noteSettings: action.settings, progress: { ...state.progress, notes: { ...state.progress.notes, settings: action.settings } } };
    case 'noteStart':
      return { ...state, noteRun: action.run };
    case 'noteFinish': {
      const run = state.noteRun;
      // Scored once: a second finish (Enter in the moment before Round done opens) must not add the XP again.
      if (!run || state.noteLast?.run === run) return state;
      const given = action.answers.slice(0, run.notes.length);
      // A lesson counts the whole round: notes left when the player skipped to the summary count as missed, so a
      // lesson cannot be passed on its first few notes. Free practice scores the notes answered.
      const answers = run.lesson
        ? [...given, ...run.notes.slice(given.length).map((): NoteAnswer => ({ outcome: 'timeout', ms: SLOW_MS, given: null }))]
        : given;
      const result = scoreRound(run.notes, answers);
      // Real practice: at least one note answered (a round that only timed out, or was skipped at once, does not count).
      const practised = given.some((a) => a.given !== null);
      let progress = practised ? addPracticeDay(state.progress, action.today) : state.progress;
      // Weak spots learn from the notes answered only.
      progress = { ...progress, notes: { ...progress.notes, weak: updateWeak(progress.notes.weak, run.notes, given) } };
      const lessonKey = run.lesson ? progressKey(run.lesson.track, run.lesson.id) : null;
      const lessonStarsBefore = lessonKey ? (progress.lessons[lessonKey]?.stars ?? 0) : 0;
      if (lessonKey) progress = recordLessonResult(progress, lessonKey, result.stars, result.accuracy);
      const xp = noteRoundXp(run.settings, result);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const reward: Reward = { xp, xpBefore, xpAfter: xpBefore + xp, streak: practised ? streak(progress.practiceDays, action.today) : null, dailyBest: false };
      return { ...state, progress, noteLast: { run, answers: given, result, reward, lessonStarsBefore } };
    }
    case 'scaleSettings':
      return { ...state, scaleSettings: action.settings, progress: { ...state.progress, scales: { ...state.progress.scales, settings: action.settings } } };
    case 'scaleHub': {
      // With one key, the setup follows the key picked on the circle.
      const s = state.scaleSettings;
      const settings = s.keyMode === 'one' && s.keys[0] !== action.hub.key ? { ...s, keys: [action.hub.key] } : s;
      const progress = settings === s ? state.progress : { ...state.progress, scales: { ...state.progress.scales, settings } };
      return { ...state, scaleHub: action.hub, scaleSettings: settings, progress };
    }
    case 'scaleStart':
      return { ...state, scaleRun: action.run };
    case 'scaleFinish': {
      const run = state.scaleRun;
      if (!run || state.scaleLast?.run === run) return state;
      const result = scoreScaleRound(action.played);
      // Real practice: at least one scale finished.
      const practised = result.total > 0;
      let progress = practised ? addPracticeDay(state.progress, action.today) : state.progress;
      const starsBefore = progress.scales.stars;
      progress = { ...progress, scales: { ...progress.scales, stars: updateScaleStars(starsBefore, result) } };
      const xp = scaleRoundXp(run.settings, result);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const reward: Reward = { xp, xpBefore, xpAfter: xpBefore + xp, streak: practised ? streak(progress.practiceDays, action.today) : null, dailyBest: false };
      return { ...state, progress, scaleLast: { run, played: action.played, result, reward, starsBefore } };
    }
    case 'learnRead': {
      const add = action.ids.filter((id) => !state.progress.learnRead.includes(id));
      if (add.length === 0) return state;
      return { ...state, progress: { ...state.progress, learnRead: [...state.progress.learnRead, ...add].sort() } };
    }
  }
}

/** The hold setting a lesson uses: its preset's `hold: false` wins, otherwise the Input pref. */
export function effectiveHold(prefs: Prefs, lessonId: string | null): boolean {
  if (lessonId && lessonSettings(lessonId).hold === false) return false;
  return prefs.holdMode === 'hold';
}

/** The path's first lesson that judges holds (2.1: unit 1 is tap only). */
const FIRST_HOLD_LESSON = ALL_LESSONS.find(({ lesson }) => lessonSettings(lesson.id).hold)?.lesson.id ?? '2.1';

/**
 * Whether free practice (Tap and Echo, Learn's practice links) judges holds. It follows the path, so the rules do not
 * change when the player leaves it: the Input pref, once the path has taught holding (its first hold lesson is open),
 * or earlier when the setup's "Hold notes for their length" was turned on.
 */
export function practiceHold(prefs: Prefs, progress: Progress): boolean {
  if (prefs.holdMode !== 'hold') return false;
  return prefs.holdEarly !== null || isUnlocked(progress, FIRST_HOLD_LESSON);
}

/** Free-practice settings for a run: `settings` with the practice hold. Every start outside the path uses this. */
export function practiceSettings(state: Pick<AppState, 'prefs' | 'progress'>, settings: Settings): Settings {
  return { ...settings, hold: practiceHold(state.prefs, state.progress) };
}

/**
 * The setup's hold switch. On holds from now on, also before the path teaches it, and remembers the Input pref it
 * replaced. Off before that takes the early choice back and puts that Input pref back (on and off again leaves Tap only
 * as it was), so the lessons of unit 2 on hold as before; after it, it sets the Input pref to tap only.
 */
export function practiceHoldPatch(state: Pick<AppState, 'prefs' | 'progress'>, on: boolean): Partial<Prefs> {
  if (on) return { holdMode: 'hold', holdEarly: state.prefs.holdMode };
  if (isUnlocked(state.progress, FIRST_HOLD_LESSON)) return { holdMode: 'tap', holdEarly: null };
  return { holdMode: state.prefs.holdEarly ?? state.prefs.holdMode, holdEarly: null };
}

/** Settings for a run: a lesson's, with its hold, or the free-practice setup with the practice hold. */
export function runSettings(state: Pick<AppState, 'prefs' | 'progress' | 'settings'>, lessonId: string | null): Settings {
  if (!lessonId) return practiceSettings(state, state.settings);
  return { ...lessonSettings(lessonId), hold: effectiveHold(state.prefs, lessonId) };
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
  const scaleSettings = progress.scales.settings ?? { ...DEFAULT_SCALE_SETTINGS };
  // A reload on Play picks the exercise up again instead of falling back to Setup.
  const route = typeof window !== 'undefined' ? parseHash(window.location.hash) : '/';
  return {
    prefs,
    progress,
    settings: practiceSettings({ prefs, progress }, settings),
    run: route === '/play' ? restoreRun() : null,
    last: null,
    noteSettings: progress.notes.settings ?? { ...DEFAULT_NOTE_SETTINGS },
    noteRun: route === '/notes/play' ? restoreNoteRun(progress.notes.weak) : null,
    noteLast: null,
    scaleSettings,
    scaleHub: { tab: 'major', key: scaleSettings.keys[0] },
    scaleRun: route === '/scales/play' ? restoreScaleRun() : null,
    scaleLast: null,
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
    if (first.current) return;
    saveScaleRun(state.scaleRun);
  }, [state.scaleRun]);
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
