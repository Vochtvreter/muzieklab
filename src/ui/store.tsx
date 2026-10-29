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
import { Rng } from '../core/rng';
import { awardAchievements, roundAchievements } from '../game/achievements';
import { dailyTier } from '../game/daily';
import { mergePrefs, mergeSynced, sameValue, type Synced } from '../game/merge';
import { exerciseHas, introId, lessonIntros } from '../game/intro';
import { isNoteTrack, noteLessonSettings, type NoteTrackId } from '../game/notesPath';
import { ALL_LESSONS, findLesson, lessonSettings, recordLessonResult } from '../game/path';
import { passSkills } from '../game/skills';
import { markSeen, recordNotes, recordRhythm, recordScales, SCALE_CAP_S, type EchoPlays } from '../game/stats';
import { pathLessonOf, pathLessonOpen } from '../game/tracks';
import { progressKey, type TrackId } from '../game/track';
import { xpForResult } from '../game/xp';
import type { Me } from '../../shared/api';
import {
  ACCOUNT_KEY,
  addPracticeDay,
  defaultProgress,
  isEmptyProgress,
  loadAccount,
  loadPrefs,
  loadProgress,
  localDateIso,
  PREFS_KEY,
  PROGRESS_KEY,
  resetProgress as clearStoredProgress,
  saveAccount,
  savePrefs,
  saveProgress,
  streak,
  sanitizeSettings,
  type AchievementId,
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
  /**
   * No tap led here (restored after a reload, or started from a Learn practice link's own address in a new tab): Play
   * waits for a tap (Ready · Start) before it makes sound.
   */
  needsGesture?: boolean;
  /** What a Learn section's practice shows (intro ids, makeRunShowing): Next keeps it. */
  shows?: string[];
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

/** A note lesson of the Learning path: its kind (First notes, Read notes, Keys) and its id there ("4.3"). */
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
      l && isNoteTrack(l.track) && typeof l.id === 'string' && noteLessonSettings(l.track, l.id) ? { track: l.track, id: l.id } : null;
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

/**
 * A new personal best a run set, for the level-up sheet's "New personal best" row: a lesson played before whose best
 * accuracy went up (`lesson` is its number in the Learning path, "4.2"), or the daily challenge's best (as dailyBest).
 * Accuracy as a whole %.
 */
export type PersonalBest = { kind: 'lesson'; lesson: string; accuracy: number } | { kind: 'daily'; accuracy: number };

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
  /** Achievements this run earned (game/achievements.ts), in the Progress tab's order. */
  achievements: AchievementId[];
  /** A new personal best, or null. */
  best: PersonalBest | null;
}

export interface LastResult {
  run: Run;
  result: JudgeResult;
  taps: Tap[];
  reward: Reward;
  /** The lesson's best stars before this run (0 for free practice and the daily challenge): Results tells a first pass. */
  lessonStarsBefore: number;
  /**
   * The calibration the run was played with (prefs.calibrationMs, and whether one had been made): Results' tip is about
   * this run, also after the player calibrates from it.
   */
  calibrationMs: number;
  calibrated: boolean;
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

/**
 * A one-line message Settings → Account shows after an account change that ends on Settings (signed out, the account
 * deleted, a new password set from a link…). It stays until Settings is left. `sessionEnded` is Sign in's instead: a
 * request was refused because the session had ended (account.ts, handleError).
 */
export type AccountNotice = 'signedOut' | 'signedOutEverywhere' | 'deleted' | 'deletedKept' | 'welcome' | 'passwordReset' | 'progressAdded' | 'sessionEnded';

/**
 * Progress on the account (BACKEND-PLAN.md §6, ui/sync.ts): 'idle' until the first sync of this app session, 'saving'
 * while a save runs, 'saved' when the account has everything, 'pending' when a change could not be sent (no
 * connection; it goes when the app is back online), 'failed' when the API refused or failed it.
 */
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'pending' | 'failed';

/**
 * The account (BACKEND-PLAN.md §5): who is signed in, and whether the API answered. `api` is 'unknown' until a screen
 * that needs the account asked GET /me (ui/account.ts); the app makes no network call before that.
 */
export interface AccountState {
  /** The signed-in account, or null. Kept in storage (ACCOUNT_KEY) so it shows offline. */
  me: Me | null;
  api: 'unknown' | 'reachable' | 'unreachable';
  notice: AccountNotice | null;
  sync: SyncStatus;
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
  account: AccountState;
}

export type Action =
  | { type: 'prefs'; patch: Partial<Prefs> }
  | { type: 'settings'; settings: Settings }
  | { type: 'start'; run: Run }
  /** `echo`: how an Echo round was heard (every play to listen, and the replays among them); none for Tap. */
  | { type: 'finish'; result: JudgeResult; taps: Tap[]; today: string; echo?: EchoPlays }
  | { type: 'resetProgress' }
  | { type: 'noteSettings'; settings: NoteSettings }
  | { type: 'noteStart'; run: NoteRun }
  | { type: 'noteFinish'; answers: NoteAnswer[]; today: string }
  | { type: 'learnRead'; ids: string[]; today: string }
  | { type: 'scaleSettings'; settings: ScaleSettings }
  | { type: 'scaleHub'; hub: ScaleHub }
  | { type: 'scaleStart'; run: ScaleRun }
  /** `seconds`: the round's time on its play screen (at most SCALE_CAP_S a scale), for minutes practised. */
  | { type: 'scaleFinish'; played: PlayedScale[]; today: string; seconds: number }
  /** Achievements and skill levels met by the progress as it is (once when the app starts: progress from before). */
  | { type: 'evaluate'; today: string }
  /** The API answered with this account (signed in, or an account change): it is the account from now on. */
  | { type: 'signedIn'; me: Me; notice?: AccountNotice }
  /** The API says nobody is signed in (signed out, the session ended, the account was deleted). */
  | { type: 'signedOut'; notice?: AccountNotice }
  /** The API did not answer: a cached account stays, shown as offline. */
  | { type: 'apiUnreachable' }
  | { type: 'accountNotice'; notice: AccountNotice | null }
  /**
   * The account's copy of the progress and synced prefs (ui/sync.ts), merged into this device's against `base`, the copy
   * both last agreed on. With `reset`, the account was reset since: its progress replaces this device's.
   */
  | { type: 'syncApply'; remote: Synced; base: Synced | null; reset: boolean }
  | { type: 'syncStatus'; status: SyncStatus }
  /**
   * Another tab of the app saved its prefs or progress (the tabs of a browser share its storage): this tab takes up
   * what is stored now, so it does not save its older copy over it.
   */
  | { type: 'storageChanged'; prefs: Prefs; progress: Progress }
  /**
   * Another tab signed in or out, or saved the account's new name (muzieklab.account.v1): the session cookie is the
   * browser's, so this tab's requests are that account's now, and it shows and syncs that one.
   */
  | { type: 'accountStored'; me: Me | null };

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
      const run = state.run;
      // Scored once: a second finish of the same run must not add its XP and figures again.
      if (!run || state.last?.run === run) return state;
      // The streak counts a day with real practice: at least one note hit (letting a run play out untouched does not).
      const { result } = action;
      const practised = result.notes.some((n) => n.judgement !== 'miss');
      const lessonStarsBefore = run.lessonId ? (state.progress.lessons[run.lessonId]?.stars ?? 0) : 0;
      const before = run.lessonId ? state.progress.lessons[run.lessonId] : undefined;
      let progress = practised ? addPracticeDay(state.progress, action.today) : state.progress;
      if (run.lessonId) progress = recordLessonResult(progress, run.lessonId, result.stars, result.accuracy);
      // The Progress tab's figures count real practice too.
      if (practised) progress = recordRhythm(progress, run.exercise, result, action.today, state.prefs.leniency, action.echo);
      let dailyBest = false;
      const day = run.daily;
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
      const xp = xpForResult(run.exercise, result, firstDaily);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const met = evaluate(progress, action.today, roundAchievements(run.exercise, result, action.echo));
      progress = met.progress;
      const best: PersonalBest | null = dailyBest
        ? { kind: 'daily', accuracy: Math.round(result.accuracy) }
        : run.lessonId
          ? lessonBest('rhythm', run.lessonId, before?.bestAccuracy, result.accuracy)
          : null;
      const reward: Reward = {
        xp,
        xpBefore,
        xpAfter: xpBefore + xp,
        streak: practised ? streak(progress.practiceDays, action.today) : null,
        dailyBest,
        achievements: met.achievements,
        best,
      };
      const { calibrationMs, calibratedAt } = state.prefs;
      return { ...state, progress, last: { run, result, taps: action.taps, reward, lessonStarsBefore, calibrationMs, calibrated: !!calibratedAt } };
    }
    case 'evaluate': {
      const { progress } = evaluate(state.progress, action.today);
      return progress === state.progress ? state : { ...state, progress };
    }
    case 'signedIn': {
      // The same account again (GET /me, a change of name…) keeps its sync status; another one starts over.
      const sync = state.account.me?.id === action.me.id ? state.account.sync : 'idle';
      return { ...state, account: { me: action.me, api: 'reachable', notice: action.notice ?? null, sync } };
    }
    case 'signedOut':
      return { ...state, account: { me: null, api: 'reachable', notice: action.notice ?? null, sync: 'idle' } };
    case 'syncStatus':
      return state.account.sync === action.status ? state : { ...state, account: { ...state.account, sync: action.status } };
    case 'syncApply':
      return applySynced(state, action.remote, action.base, action.reset);
    case 'storageChanged': {
      // Nothing new (another tab saved what this one has) changes nothing.
      const prefs = sameValue(state.prefs, action.prefs) ? state.prefs : action.prefs;
      const progress = sameValue(state.progress, action.progress) ? state.progress : action.progress;
      if (prefs === state.prefs && progress === state.progress) return state;
      return followSetups(state, { ...state, prefs, progress });
    }
    case 'accountStored': {
      const was = state.account.me;
      if (sameValue(was, action.me)) return state;
      // The same account: as it is now. Another one, or nobody: as after a sign-in or out, without the line Settings
      // shows for that (it was said in the tab where it happened).
      if (action.me && was?.id === action.me.id) return { ...state, account: { ...state.account, me: action.me } };
      return { ...state, account: { ...state.account, me: action.me, notice: null, sync: 'idle' } };
    }
    case 'apiUnreachable':
      return state.account.api === 'unreachable' ? state : { ...state, account: { ...state.account, api: 'unreachable' } };
    case 'accountNotice':
      return state.account.notice === action.notice ? state : { ...state, account: { ...state.account, notice: action.notice } };
    // Progress only: the account is kept (signing out is its own action).
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
      const before = lessonKey ? progress.lessons[lessonKey] : undefined;
      if (lessonKey) progress = recordLessonResult(progress, lessonKey, result.stars, result.accuracy);
      if (practised) progress = recordNotes(progress, run.notes, given, run.settings, action.today);
      const xp = noteRoundXp(run.settings, result);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const met = evaluate(progress, action.today);
      progress = met.progress;
      const reward: Reward = {
        xp,
        xpBefore,
        xpAfter: xpBefore + xp,
        streak: practised ? streak(progress.practiceDays, action.today) : null,
        dailyBest: false,
        achievements: met.achievements,
        best: run.lesson ? lessonBest(run.lesson.track, run.lesson.id, before?.bestAccuracy, result.accuracy) : null,
      };
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
      if (practised) progress = recordScales(progress, Math.min(action.seconds, SCALE_CAP_S * action.played.length), action.today);
      const xp = scaleRoundXp(run.settings, result);
      const xpBefore = progress.xp;
      progress = { ...progress, xp: xpBefore + xp };
      const met = evaluate(progress, action.today);
      progress = met.progress;
      const reward: Reward = {
        xp,
        xpBefore,
        xpAfter: xpBefore + xp,
        streak: practised ? streak(progress.practiceDays, action.today) : null,
        dailyBest: false,
        achievements: met.achievements,
        best: null,
      };
      return { ...state, progress, scaleLast: { run, played: action.played, result, reward, starsBefore } };
    }
    case 'learnRead': {
      const add = action.ids.filter((id) => !state.progress.learnRead.includes(id));
      // A quick check answered right is theory practised (a section read again too): Theory's review clears.
      const seen = state.progress.stats.seen.theory;
      if (add.length === 0 && seen !== undefined && seen >= action.today) return state;
      let progress = add.length ? { ...state.progress, learnRead: [...state.progress.learnRead, ...add].sort() } : state.progress;
      progress = evaluate(markSeen(progress, 'theory', action.today), action.today).progress;
      return { ...state, progress };
    }
  }
}

/**
 * Progress with what it now meets marked on `today`: the 7-day streak and `earned` (what a round earned on its own)
 * as achievements, and every skill level whose checks are met. `achievements` lists those new to it.
 */
function evaluate(p: Progress, today: string, earned: AchievementId[] = []): { progress: Progress; achievements: AchievementId[] } {
  const a = awardAchievements(p, today, earned);
  return { progress: passSkills(a.progress, today).progress, achievements: a.added };
}

/**
 * A lesson played before whose best accuracy this round beat: a new personal best (by its Learning path number). Beaten
 * as shown, in whole %: 87.45% after 87.4% is no new best.
 */
function lessonBest(track: TrackId, ref: string, was: number | undefined, accuracy: number): PersonalBest | null {
  if (was === undefined || !(Math.round(accuracy) > Math.round(was))) return null;
  return { kind: 'lesson', lesson: pathLessonOf(track, ref)?.id ?? progressKey(track, ref), accuracy: Math.round(accuracy) };
}

/**
 * The account's copy merged into the state (game/merge.ts), with the setups that follow from the progress. Always a new
 * progress object, so the sync's change effect runs and saves the merge when it differs from the account's copy.
 */
function applySynced(state: AppState, remote: Synced, base: Synced | null, reset: boolean): AppState {
  const local: Synced = { prefs: state.prefs, progress: state.progress };
  const merged = reset
    ? { prefs: mergePrefs(local.prefs, remote.prefs, base?.prefs ?? null), progress: remote.progress }
    : mergeSynced(local, remote, base);
  const prefs = { ...state.prefs, ...merged.prefs };
  const progress = { ...merged.progress };
  const next = followSetups(state, { ...state, prefs, progress });
  if (reset) {
    next.last = null;
    next.noteLast = null;
    next.scaleLast = null;
  }
  return next;
}

/**
 * `next`, a new state with progress from elsewhere (the account's copy merged in, another tab's), with the setups shown
 * on their screens following that progress where it changed them.
 */
function followSetups(state: AppState, next: AppState): AppState {
  const was = state.progress;
  const { prefs, progress } = next;
  if (!sameValue(was.lastSettings, progress.lastSettings)) {
    next.settings = practiceSettings({ prefs, progress }, progress.lastSettings ?? DEFAULT_SETTINGS);
  }
  if (!sameValue(was.notes.settings, progress.notes.settings)) next.noteSettings = progress.notes.settings ?? { ...DEFAULT_NOTE_SETTINGS };
  if (!sameValue(was.scales.settings, progress.scales.settings)) {
    next.scaleSettings = progress.scales.settings ?? { ...DEFAULT_SCALE_SETTINGS };
    next.scaleHub = { ...state.scaleHub, key: next.scaleSettings.keys[0] };
  }
  return next;
}

/** The hold setting a lesson uses: its preset's `hold: false` wins, otherwise the Input pref. */
export function effectiveHold(prefs: Prefs, lessonId: string | null): boolean {
  if (lessonId && lessonSettings(lessonId).hold === false) return false;
  return prefs.holdMode === 'hold';
}

/** The first rhythm lesson that judges holds (rhythm 2.1, the path's 4.1: rhythm unit 1 is tap only). */
const FIRST_HOLD_LESSON = ALL_LESSONS.find(({ lesson }) => lessonSettings(lesson.id).hold)?.lesson.id ?? '2.1';

/**
 * Whether free practice (Tap and Echo, Learn's practice links) judges holds. It follows the path, so the rules do not
 * change when the player leaves it: the Input pref, once the path has taught holding (its first hold lesson is open),
 * or earlier when the setup's "Hold notes for their length" was turned on.
 */
export function practiceHold(prefs: Prefs, progress: Progress): boolean {
  if (prefs.holdMode !== 'hold') return false;
  return prefs.holdEarly !== null || pathLessonOpen(progress, 'rhythm', FIRST_HOLD_LESSON);
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
  if (pathLessonOpen(state.progress, 'rhythm', FIRST_HOLD_LESSON)) return { holdMode: 'tap', holdEarly: null };
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

/**
 * Seeds a start tries for an exercise that shows what it should. Most lessons find one in the first few tries; 3.4's
 * whole rest is in only about 1 exercise in 22, so 200 leave about 1 start in 10,000 without it.
 */
const INTRO_TRIES = 200;

/**
 * What a lesson's exercise must show: every symbol the lesson introduces (game/intro.ts), so the intro sheet never
 * names one the staff does not have; what its title names, its `preview` (path.ts: 7.4's dotted quarter, where the
 * generator takes any dotted value, often the dotted half; 8.3's eighth and two sixteenths in one beat); and the dot or
 * the tie its unit is about, also in a lesson that adds no symbol (6.2 Ties with eighths).
 */
function lessonShows(settings: Settings, lessonId: string): string[] {
  const flags = (['dotted', 'ties', 'triplets'] as const).filter((k) => settings[k]);
  return [...new Set([...lessonIntros(lessonId).map(introId), ...(findLesson(lessonId)?.lesson.preview ?? []), ...flags])];
}

/**
 * A run whose exercise shows every symbol given (intro ids, game/intro.ts): from `seed`, other seeds are tried until
 * the exercise has them all (else the last one). A Learn section's practice shows the extra it turns on (5.1's tie,
 * which the generator only makes likely), and keeps `shows` for Next.
 */
export function makeRunShowing(settings: Settings, seed: number, ids: readonly string[], lessonId: string | null = null): Run | null {
  const seeds = new Rng(seed);
  let run = makeRun(settings, seed, lessonId);
  for (let i = 1; i < INTRO_TRIES && run && !exerciseHas(run.exercise, ids); i++) run = makeRun(settings, seeds.int(0x7fffffff), lessonId);
  return run && !lessonId && ids.length ? { ...run, shows: [...ids] } : run;
}

/** A lesson run whose exercise shows all its lesson is about (lessonShows). */
export function makeLessonRun(settings: Settings, seed: number, lessonId: string): Run | null {
  return makeRunShowing(settings, seed, lessonShows(settings, lessonId), lessonId);
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
    account: { me: loadAccount(), api: 'unknown', notice: null, sync: 'idle' },
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
  // The prefs and progress last taken up from another tab: in storage already, so not saved again.
  const stored = useRef<Pick<AppState, 'prefs' | 'progress'> | null>(null);

  useEffect(() => {
    if (first.current || state.prefs === stored.current?.prefs) return;
    savePrefs(state.prefs);
  }, [state.prefs]);
  useEffect(() => {
    if (first.current || state.progress === stored.current?.progress) return;
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
  // Saved unless storage holds it already, as it does an account taken up from another tab. Compared with what is
  // stored, so a sign-out here after one taken up from another tab (nobody both times) still forgets the account.
  useEffect(() => {
    if (first.current || sameValue(state.account.me, loadAccount())) return;
    saveAccount(state.account.me);
  }, [state.account.me]);
  // The tabs of a browser share its storage, and each saves its whole copy of the prefs and progress: a tab takes up
  // what another saved, or its next change would put its older copy back over it (the XP and stars earned there gone,
  // a pref picked there undone). The same for the account: a tab that kept the one signed out elsewhere would show it,
  // and rename or sync the account signed in since, whose session its requests carry. What is stored is read when the
  // event comes, so a late one does not undo a newer change.
  useEffect(() => {
    const changed = (e: StorageEvent): void => {
      if (e.key === null || e.key === ACCOUNT_KEY) dispatch({ type: 'accountStored', me: loadAccount() });
      if (e.key !== null && e.key !== PREFS_KEY && e.key !== PROGRESS_KEY) return;
      stored.current = { prefs: loadPrefs(), progress: loadProgress() };
      dispatch({ type: 'storageChanged', ...stored.current });
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  useEffect(() => {
    first.current = false;
    // Progress from before (or from an older app) gets the achievements and skill levels it already meets.
    dispatch({ type: 'evaluate', today: todayIso() });
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
