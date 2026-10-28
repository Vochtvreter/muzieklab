/**
 * Read notes · name it, write it, hear it (DESIGN.md §3.5). A staff of whole notes, one per bar, with the current one
 * highlighted; answer with names (sign first, then the name; no sign row when no note can have one) or on the piano,
 * switchable mid-round. With Hear the notes on, a piano key sounds when pressed and the right note after every answer.
 * Path lessons also write and hear: a note to write is put on the staff (point, drag, ▲ ▼ or the arrow keys, then
 * Check); a note to hear plays after sol and stays hidden until it is named. A lesson's name buttons are the notes it
 * has learned. Right answers move on by themselves; after a wrong one the feedback says why and Next note goes on.
 * Tablet: the exercise header, the question and score, a big staff, the feedback and the answer card (App design canvas,
 * NoteTablet). Desktop: the exercise header, a wide staff, the answer card with computer keys and three stat cards.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import {
  BOTTOM_LINE,
  HEAR_REFERENCE,
  isRight,
  keySigns,
  letterOf,
  needsPractice,
  noteMidi,
  pianoKeyMidi,
  rangeSteps,
  roundHasSigns,
  roundLetters,
  type Alter,
  type Given,
  type Letter,
  type NoteAnswer,
  type RoundNote,
  type Step,
} from '../../../core/api';
import { pathLessonOf } from '../../../game/tracks';
import { PitchStaff, type PitchMark, type PitchNote } from '../../../render/PitchStaff';
import { staffRoom, stepAtY } from '../../../render/pitchDraw';
import { formatDecimal, t } from '../../../i18n';
import { engine, unlockAudio } from '../../audio';
import { ExerciseFrame } from '../../components/AppShell';
import { Segmented } from '../../components/Controls';
import { ExerciseHeader } from '../../components/ExerciseHeader';
import { Icon } from '../../components/Icon';
import { BLACK_KBD, NameButtons, Piano, SignRow, WHITE_KBD, type KeyMark } from '../../components/NoteInputs';
import { SHORT_PHONE, SHORTER_PHONE, useBreakpoint, useDocTitle, useExerciseLayout, useKeyboardHints, useMediaQuery } from '../../hooks';
import { keyForTabbedControl } from '../../lib/focusModality';
import { useLearnReturn } from '../../lib/learnReturn';
import {
  feedbackText,
  fullName,
  hearFeedback,
  hearHint,
  hintText,
  keySignsText,
  letterName,
  majorName,
  positionText,
  solfegeName,
  writeFeedback,
  type NameSystem,
} from '../../lib/noteText';
import { useFocusHandOff } from '../../lib/screenFocus';
import { Link, navigate } from '../../router';
import { todayIso, useStore, type NoteRun } from '../../store';

/** A right answer without a hint moves on after this long. */
const AUTO_NEXT_MS = 700;
/** After a wrong piano key, the right note follows this long after it (seconds). */
const CORRECTION_GAP = 0.5;
/** A note to hear: sol, then the note this long after it (seconds). */
const HEAR_GAP = 0.9;
const BLACK_PCS = [1, 3, 6, 8, 10];
const WHITE_PCS: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const WHITE_ORDER = [0, 2, 4, 5, 7, 9, 11];

type Mode = 'solfege' | 'letters' | 'piano';

export function NotesPlay(): JSX.Element | null {
  const { state } = useStore();
  const run = state.noteRun;
  useEffect(() => {
    if (!run) navigate('/notes', { replace: true });
  }, [run]);
  if (!run) return null;
  return <Round key={run.seed + ':' + run.notes.length} run={run} />;
}

/** The notes on the staff now: the current clef-and-key run, in pages of `size` (a new clef or key starts a new staff). */
export function staffPage(notes: RoundNote[], i: number, size: number): { from: number; to: number } {
  const same = (a: RoundNote, b: RoundNote): boolean => a.clef === b.clef && a.key === b.key;
  let start = i;
  while (start > 0 && same(notes[start - 1], notes[i])) start--;
  let end = i + 1;
  while (end < notes.length && same(notes[end], notes[i])) end++;
  const from = start + Math.floor((i - start) / size) * size;
  return { from, to: Math.min(end, from + size) };
}

const markOf = (a: NoteAnswer | undefined): PitchMark | undefined =>
  !a ? undefined : a.outcome === 'right' ? 'right' : a.outcome === 'hinted' ? 'hinted' : 'wrong';

function Round({ run }: { run: NoteRun }): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';
  // A phone on its side is tablet-wide but keeps the phone layout (two columns, in the CSS).
  const tablet = useExerciseLayout() === 'tablet';
  // A phone browser on a small phone (375 × 553): a smaller staff, so the answer buttons fit below it (DESIGN.md §9).
  const shorter = useMediaQuery(SHORTER_PHONE);
  const short = useMediaQuery(SHORT_PHONE);
  const keys = useKeyboardHints(bp);
  useDocTitle(t('app.docTitle', { page: t('notes.play.docTitle') }));
  const notes = run.notes;
  const total = notes.length;
  const timer = run.settings.timer;
  // C major or A minor without extra signs: no note can have a sign, so there is no sign to pick.
  const signs = roundHasSigns(run.settings);

  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<NoteAnswer[]>([]);
  const [given, setGiven] = useState<Given | null>(null);
  const [done, setDone] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [sign, setSign] = useState<Alter>(0);
  const [mode, setMode] = useState<Mode>(() => (notes[0]?.input === 'piano' ? 'piano' : state.prefs.noteNames));
  const [left, setLeft] = useState(timer * 1000);
  /** Where the note being written sits now (null: not put on the staff yet). */
  const [ghost, setGhost] = useState<Step | null>(null);
  const shownAt = useRef(performance.now());
  const note = notes[i];
  const task = note.task;
  const system: NameSystem = mode === 'solfege' ? 'solfege' : 'letters';
  // A note to write is named in the player's names (the piano has none).
  const nameSystem: NameSystem = task === 'write' ? state.prefs.noteNames : system;
  // A path lesson's name buttons are the notes it has learned.
  const letters = useMemo(() => roundLetters(run.settings), [run.settings]);
  const writing = task === 'write' && !done;
  const steps = useMemo(() => rangeSteps(note.clef, run.settings.range), [note.clef, run.settings.range]);
  const place = useCallback((st: Step) => setGhost(Math.max(steps[0], Math.min(steps[steps.length - 1], st))), [steps]);
  // ▲ ▼ and the arrow keys: one line or space; the first press puts the note on the middle line.
  const move = useCallback(
    (d: number) => setGhost((g) => (g === null ? BOTTOM_LINE[note.clef] + 4 : Math.max(steps[0], Math.min(steps[steps.length - 1], g + d)))),
    [steps, note.clef],
  );

  // Hint once used, Next note until the next answer, the signs and ▲ ▼ once the note is answered and the staff written
  // on once it is checked go away under the focus: it goes on to Next note once the note is answered, else to the
  // answers (the next note's staff to write on).
  const holdFocus = useFocusHandOff(() => (done ? ['.nactions .btn--accent'] : writing ? ['.nwrite-staff'] : ['.name-btn', '.piano button']));

  const sound = useCallback(
    (midis: number[], gap?: number) => {
      if (!run.settings.playNotes) return;
      unlockAudio();
      engine().pitches(midis, gap);
    },
    [run.settings.playNotes],
  );
  // A note to hear: sol, then the note. It always sounds (Hear the notes only turns the other sounds off).
  const hearIt = useCallback(() => {
    if (!note) return;
    unlockAudio();
    engine().pitches([noteMidi({ ...note, step: HEAR_REFERENCE, alter: 0 }), noteMidi(note)], HEAR_GAP);
  }, [note]);
  useEffect(() => {
    if (note?.task === 'hear') hearIt();
  }, [i]);

  const finish = useCallback(
    (list: NoteAnswer[]) => {
      dispatch({ type: 'noteFinish', answers: list, today: todayIso() });
    },
    [dispatch],
  );
  // A round started from a Learn section (?from=8.2) keeps it: Round done and Quit return there.
  const { back, carry } = useLearnReturn();
  // Go to Round done once the store holds this round's result. Navigating in finish() itself raced the store when a
  // right last answer finished the round from a timer: the summary rendered before the result and sent the player
  // back to the setup.
  useEffect(() => {
    if (state.noteLast?.run === run) navigate('/notes/done', { replace: true, query: carry });
  }, [state.noteLast, run, carry]);

  const next = useCallback(() => {
    if (!done) return;
    if (i + 1 >= total) return finish(answers);
    holdFocus();
    // Mixed rounds: names and piano take turns every 5 notes (the player can still switch any time). With the note, so
    // the focus handed on goes to the answers it is shown with.
    if (notes[i + 1].input !== notes[i].input) setMode(notes[i + 1].input === 'piano' ? 'piano' : state.prefs.noteNames);
    setI(i + 1);
    setGiven(null);
    setDone(false);
    setHinted(false);
    setSign(0);
    setGhost(null);
    setLeft(timer * 1000);
    shownAt.current = performance.now();
  }, [done, i, total, answers, finish, timer, holdFocus, notes, state.prefs.noteNames]);

  const answer = useCallback(
    (g: Given | null) => {
      if (done || !note) return;
      holdFocus();
      const ms = g === null ? timer * 1000 : Math.round(performance.now() - shownAt.current);
      const right = g !== null && isRight(note, g);
      const outcome: NoteAnswer['outcome'] = g === null ? 'timeout' : right ? (hinted ? 'hinted' : 'right') : 'wrong';
      setAnswers((a) => [...a.slice(0, i), { outcome, ms, given: g }]);
      setGiven(g);
      setDone(true);
      // The key pressed sounds at once; then the note on the staff, unless that key was it (a wrong answer hears the right one).
      const midi = noteMidi(note);
      if (g?.kind === 'piano') sound(right ? [midi] : [pianoKeyMidi(note, g.pc), midi], CORRECTION_GAP);
      else sound([midi]);
    },
    [done, note, hinted, i, timer, sound, holdFocus],
  );
  // A piano key: the answer, or after it just its sound, to compare with the right note.
  const pressKey = useCallback(
    (pc: number) => {
      if (done) sound([pianoKeyMidi(note, pc)]);
      else answer({ kind: 'piano', pc });
    },
    [done, note, answer, sound],
  );

  // A right answer moves on by itself; wrong ones wait for Next so the explanation can be read.
  const last = answers[i];
  useEffect(() => {
    if (!done || last?.outcome !== 'right') return;
    const id = window.setTimeout(next, AUTO_NEXT_MS);
    return () => window.clearTimeout(id);
  }, [done, last, next]);

  // Time per note: the bar runs down and a timeout counts as missed.
  useEffect(() => {
    if (!timer || done) return;
    const id = window.setInterval(() => {
      // In a hidden tab the clock waits (browsers slow this interval down but keep it running); coming back restarts it.
      if (document.visibilityState === 'hidden') return;
      const rest = timer * 1000 - (performance.now() - shownAt.current);
      setLeft(Math.max(0, rest));
      if (rest <= 0) answer(null);
    }, 100);
    return () => window.clearInterval(id);
  }, [timer, done, answer]);

  // Coming back to the tab restarts the current note's clock, so time away is not counted.
  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'visible' && !done) {
        shownAt.current = performance.now();
        setLeft(timer * 1000);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [done, timer]);

  // Quit goes back where the round started: the Path for a lesson, the Learn section, the Read notes setup otherwise.
  const home = run.lesson ? '/path' : (back?.to ?? '/notes');
  const homeQuery = run.lesson ? undefined : back?.query;
  const quit = (): void => navigate(home, { replace: true, query: homeQuery });
  const skip = (): void => finish(answers.slice(0, done ? i + 1 : i));

  // Keys: letters (names) or A S D F G H J / W E T Y U (piano; after the answer they only sound), − 0 = for the sign,
  // Enter or Space for Next, Esc quits (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      // A button reached with Tab (Skip, another mode, a piano key, ▲ ▼) takes Space and Enter itself, and the Quit link
      // Enter. A name button, or a segment already chosen (the mode, the key labels), has nothing more to do once the
      // note is answered: there they still go on.
      if (keyForTabbedControl(e) && !(done && target?.closest('.name-btn, [aria-pressed="true"]'))) return;
      const k = e.key.toUpperCase();
      if (e.key === 'Enter' || e.key === ' ') {
        if (done) {
          e.preventDefault();
          next();
        } else if (writing && ghost !== null) {
          e.preventDefault();
          answer({ kind: 'place', step: ghost });
        } else if (target?.closest('.name-btn, .piano button')) {
          // An answer that has the focus after a click, or since Hint or Next note handed it on, is not pressed by
          // these: only one reached with Tab of its own is (above).
          e.preventDefault();
        }
        return;
      }
      // Writing: the arrow keys move the note a line or space.
      if (task === 'write') {
        if (writing && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          move(e.key === 'ArrowUp' ? 1 : -1);
        } else if (e.key === 'Escape' && desktop) {
          e.preventDefault();
          quit();
        }
        return;
      }
      if (e.key === 'Escape' && desktop) {
        e.preventDefault();
        quit();
        return;
      }
      if (mode === 'piano') {
        const w = (WHITE_KBD as readonly string[]).indexOf(k);
        const b = (BLACK_KBD as readonly string[]).indexOf(k);
        if (w >= 0) pressKey(WHITE_ORDER[w]);
        else if (b >= 0) pressKey(BLACK_PCS[b]);
        else return;
      } else if (done) return;
      else if (signs && (e.key === '-' || e.key === '_')) setSign(-1);
      else if (signs && e.key === '0') setSign(0);
      else if (signs && (e.key === '=' || e.key === '+')) setSign(1);
      else if (/^[A-G]$/.test(k) && letters.includes(k as Letter)) answer({ kind: 'name', letter: k as Letter, alter: sign });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, done, sign, signs, answer, pressKey, next, desktop, task, writing, ghost, move, letters]);

  // A round that writes notes draws a taller staff with fewer bars (on a phone, on its side too), so a line or space is
  // easy to point at. A tablet keeps six bars (NoteTablet draws eight): at its staff size eight leave no room for a sharp
  // or flat before the last note.
  const big = useMemo(() => notes.some((n) => n.task === 'write'), [notes]);
  const size = desktop ? 8 : big && !tablet ? 4 : 6;
  const page = staffPage(notes, i, size);
  // Notes to hear or write stay hidden until answered (an empty slot); the one being written shows where it sits now.
  const shown = useMemo(
    () =>
      notes.slice(page.from, page.to).map((n, j): PitchNote | null => {
        const at = page.from + j;
        const open = at > i || (at === i && !done);
        if (!open || n.task === 'read') return { step: n.step, sign: n.sign };
        return at === i && n.task === 'write' && ghost !== null ? { step: ghost, sign: null } : null;
      }),
    [notes, page.from, page.to, i, done, ghost],
  );
  // Room on the staff for every note in this clef and key, hidden ones too: the staff keeps one size from page to page.
  // A round that writes notes keeps room for the two ends of the range too, where the note being written and the
  // cursor's box round it can go.
  const fitNotes = useMemo(
    () => [
      ...notes.filter((n) => n.clef === note.clef && n.key === note.key).map((n): PitchNote => ({ step: n.step, sign: n.sign })),
      ...(big ? [steps[0], steps[steps.length - 1]].map((step): PitchNote => ({ step, sign: null })) : []),
    ],
    [notes, note.clef, note.key, big, steps],
  );
  const marks = useMemo(
    () => notes.slice(page.from, page.to).map((_, j) => markOf(answers[page.from + j]) ?? (page.from + j === i && ghost !== null && !done ? 'ghost' : undefined)),
    [notes, page.from, page.to, answers, i, ghost, done],
  );
  const room = run.settings.range === 'staff' ? 1.5 : run.settings.range === 'ledger1' ? 2.5 : 3.5;
  // The staff is 4 staff spaces high with its room above and below: `room`, or more where the clef, a sign or the
  // cursor on one of its notes reaches further, as PitchStaff draws it.
  const space = useMemo(() => staffRoom({ clef: note.clef, key: note.key, notes: fitNotes, cursor: 0, room }), [note.clef, note.key, fitNotes, room]);
  // On a phone browser's short screen a taller staff (a range with ledger lines, signs far over or under the staff) is
  // drawn smaller, at most one space higher than the staff alone (8 spaces, not 9 or 11): the answer controls under it
  // have no more height to give, and Hint and Next note would go off the screen (DESIGN.md §9).
  const ledgerFit = short ? Math.min(1, 8 / (4 + space.above + space.below)) : 1;

  const right = answers.filter((a) => a.outcome === 'right').length;
  const answeredCount = answers.length;
  const avg = answeredCount ? answers.reduce((s, a) => s + a.ms, 0) / answeredCount / 1000 : null;
  const keyHasSigns = keySigns(note.key).length > 0;
  // A path lesson says which one ("Lesson 4.3 · Treble clef · C major"); free practice names the clef and key.
  const where = run.lesson
    ? t('notes.play.eyebrowLesson', { id: pathLessonOf(run.lesson.track, run.lesson.id)?.id ?? run.lesson.id, clef: t('notes.clefLong.' + note.clef), key: majorName(note.key) })
    : t('notes.play.eyebrow', { clef: t('notes.clefLong.' + note.clef), key: majorName(note.key) });

  // The feedback line: the answer's verdict, the hint, a new key or clef, or what to do.
  let feedback: string;
  let tone = '';
  if (done) {
    const ok = last?.outcome === 'right' || last?.outcome === 'hinted';
    feedback = (task === 'write' ? writeFeedback : task === 'hear' ? hearFeedback : feedbackText)(note, given, ok, nameSystem);
    tone = last?.outcome === 'right' ? 'right' : last?.outcome === 'hinted' ? 'hint' : 'wrong';
  } else if (hinted) {
    feedback = task === 'hear' ? hearHint(note, nameSystem) : hintText(note, nameSystem);
    tone = 'hint';
  } else if (task === 'write') {
    feedback = t(ghost === null ? 'notes.play.idleWrite' : 'notes.play.idleWriteCheck');
  } else if (task === 'hear') {
    feedback = t('notes.play.idleHear');
  } else if (i > 0 && notes[i - 1].key !== note.key) {
    feedback = t('notes.play.newKey', { key: majorName(note.key), signs: keySignsText(note.key) });
    tone = 'news';
  } else if (i > 0 && notes[i - 1].clef !== note.clef) {
    feedback = t('notes.play.newClef', { clef: t('notes.clefLower.' + note.clef) });
    tone = 'news';
  } else if (mode === 'piano') {
    feedback = t(keyHasSigns ? 'notes.play.idlePianoKey' : 'notes.play.idlePiano');
  } else if (signs) {
    feedback = t(keyHasSigns ? 'notes.play.idleNamesKey' : 'notes.play.idleNames');
  } else {
    // Nothing to say about signs: the question alone (desktop has no question line above the staff).
    feedback = desktop ? t('notes.play.askNames') : '';
  }

  // Answer marks on the buttons: the right one green, a wrong pick red.
  const nameMarks: Partial<Record<Letter, KeyMark>> = {};
  // The green button reads the note's own name (F♯, also with ♮ picked): a mark has to fit the name it shows.
  const nameSigns: Partial<Record<Letter, Alter>> = {};
  const keyMarks: Partial<Record<number, KeyMark>> = {};
  if (done) {
    const L = letterOf(note.step);
    if (given?.kind === 'name') {
      // Right letter with the wrong sign stays red: the button showed the wrong name.
      if (given.letter === L) nameMarks[L] = given.alter === note.alter ? 'right' : 'wrong';
      else {
        nameMarks[given.letter] = 'wrong';
        nameMarks[L] = 'right';
        nameSigns[L] = note.alter;
      }
    } else if (task === 'write') {
      // Written on the staff: no buttons to mark.
    } else if (given === null && mode !== 'piano') {
      nameMarks[L] = 'right';
      nameSigns[L] = note.alter;
    } else {
      if (given?.kind === 'piano') keyMarks[given.pc] = 'wrong';
      const pc = (WHITE_PCS[L] + note.alter + 12) % 12;
      keyMarks[pc] = 'right';
    }
  }

  const staffLabel = t(task !== 'read' && !done ? 'notes.play.staffLabelOpen' : 'notes.play.staffLabel', {
    clef: t('notes.clefLong.' + note.clef),
    key: majorName(note.key),
    n: i + 1,
    total,
  });
  const target = fullName(letterOf(note.step), note.alter, nameSystem);
  // Writing: point at (or drag along) the staff to put the note on the nearest line or space.
  const staffBox = useRef<HTMLDivElement>(null);
  const pointAt = (e: PointerEvent<HTMLDivElement>): void => {
    const svg = staffBox.current?.querySelector('svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const h = svg.viewBox.baseVal.height;
    if (r.height <= 0 || h <= 0) return;
    place(stepAtY(note.clef, space.above, ((e.clientY - r.top) / r.height) * h));
  };
  const staffSvg = (
    <PitchStaff clef={note.clef} keyId={note.key} notes={shown} fitNotes={fitNotes} slots={size} marks={marks} cursor={i - page.from}
      scale={big ? (desktop ? 2 : tablet ? 2.6 : shorter ? 1.5 : 2.1) : (desktop ? 1.6 : tablet ? 2 : shorter ? 1.15 : 1.45) * ledgerFit} room={room}
      label={writing ? undefined : staffLabel} className="nplay-staff-svg" />
  );
  // A slider for screen readers and the keyboard: its value is where the note sits.
  const staff = writing ? (
    <div ref={staffBox} className="nwrite-staff" role="slider" tabIndex={0} aria-label={t('notes.play.writeSlider', { name: target })}
      aria-valuemin={steps[0]} aria-valuemax={steps[steps.length - 1]} aria-valuenow={ghost ?? undefined}
      aria-valuetext={ghost === null ? t('notes.play.writeNone') : positionText(note.clef, ghost)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pointAt(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons) pointAt(e);
      }}>
      {staffSvg}
    </div>
  ) : (
    staffSvg
  );
  const hearButton = task === 'hear' && (
    <button type="button" className="btn btn--outline nhear-btn" onClick={hearIt}>
      <Icon name="speaker" size={18} />
      {t('notes.play.hearAgain')}
    </button>
  );
  const timerBar = timer > 0 && (
    <div className="ntimer" role="progressbar" aria-label={t('notes.play.timeLeft')} aria-valuemin={0} aria-valuemax={timer} aria-valuenow={Math.ceil(left / 1000)}>
      <div style={{ width: (left / (timer * 1000)) * 100 + '%' }} />
    </div>
  );
  const modeSeg = task !== 'write' && (
    <Segmented<Mode> label={t('notes.play.modes')} value={mode} className="nmode"
      onChange={(v) => {
        setMode(v);
        if (v !== 'piano') dispatch({ type: 'prefs', patch: { noteNames: v } });
      }}
      options={[
        { value: 'solfege', label: t('notes.play.modeSolfege') },
        { value: 'letters', label: t('notes.play.modeLetters') },
        { value: 'piano', label: t('notes.play.modePiano') },
      ]} />
  );
  const labelsSeg = mode === 'piano' && task !== 'write' && (
    <div className="nlabels">
      <span>{t('notes.play.anyOctave')}</span>
      <Segmented label={t('notes.play.labels')} value={state.prefs.pianoLabels} className="seg--small" pad={3} gap={4}
        onChange={(v) => dispatch({ type: 'prefs', patch: { pianoLabels: v } })}
        options={[
          { value: 'letters', label: t('notes.play.labelLetters') },
          { value: 'solfege', label: t('notes.play.labelSolfege') },
          { value: 'off', label: t('notes.play.labelOff') },
        ]} />
    </div>
  );
  const inputs =
    task === 'write' ? (
      <div className="nwrite">
        <div className="nwrite-ask">
          <span className="label">{t('notes.play.writeLabel')}</span>
          <span className="nwrite-name">{target}</span>
        </div>
        <div className="nwrite-moves">
          <button type="button" className="btn btn--outline" disabled={done} aria-label={t('notes.play.lower')} onClick={() => move(-1)}>
            <Icon name="chevronSmall" size={22} strokeWidth={2.4} className="nwrite-down" />
          </button>
          <button type="button" className="btn btn--outline" disabled={done} aria-label={t('notes.play.higher')} onClick={() => move(1)}>
            <Icon name="chevronSmall" size={22} strokeWidth={2.4} className="nwrite-up" />
          </button>
        </div>
      </div>
    ) : mode === 'piano' ? (
      <Piano labels={state.prefs.pianoLabels} marks={keyMarks} onPick={pressKey} kbd={keys} />
    ) : (
      <>
        {signs && <SignRow value={sign} onChange={setSign} disabled={done} kbd={keys} />}
        <NameButtons system={system} sign={sign} signs={nameSigns} marks={nameMarks} onPick={(L) => answer({ kind: 'name', letter: L, alter: sign })} kbd={keys} letters={letters} />
      </>
    );
  const feedbackBox = (
    <div className={'nfeedback m-ease' + (tone ? ' is-' + tone : '')} aria-live="polite">
      {feedback}
    </div>
  );
  const actions = (
    <div className="nactions">
      <button type="button" className="btn btn--outline" disabled={done || hinted}
        onClick={() => {
          holdFocus();
          setHinted(true);
        }}>
        {t('notes.play.hint')}
      </button>
      {writing ? (
        // Writing: Check takes the note where it sits; then it is Next note as after any answer.
        <button type="button" className={'btn ' + (ghost !== null ? 'btn--accent' : 'btn--blocked')} disabled={ghost === null}
          onClick={() => ghost !== null && answer({ kind: 'place', step: ghost })}>
          {t('notes.play.check')}
          {keys && <kbd className="kbd kbd--bare">↵</kbd>}
        </button>
      ) : (
        <button type="button" className={'btn ' + (done ? 'btn--accent' : 'btn--blocked')} disabled={!done} onClick={next}>
          {t(i + 1 >= total ? 'notes.play.finish' : 'notes.play.next')}
          {keys && <kbd className="kbd kbd--bare">↵</kbd>}
        </button>
      )}
    </div>
  );
  const quitLink = (e: MouseEvent): void => {
    e.preventDefault();
    quit();
  };
  const ask =
    task === 'write'
      ? t('notes.play.askWrite', { name: target })
      : task === 'hear'
        ? t(mode === 'piano' ? 'notes.play.askHearPiano' : 'notes.play.askHear')
        : t(mode === 'piano' ? 'notes.play.askPiano' : 'notes.play.askNames');

  // Tablet and desktop: the exercise header. Esc quits on desktop (as before, also on a touch screen at desktop width).
  const header = (
    <ExerciseHeader tablet={tablet} eyebrow={run.lesson ? where : t('notes.play.eyebrowLong', { clef: t('notes.clefLower.' + note.clef), key: majorName(note.key) })}
      line={t('notes.play.noteOf', { n: i + 1, total })}
      progress={{ label: t('notes.play.progress'), value: answeredCount / total, max: total, now: answeredCount }}>
      <Link to={home} query={homeQuery} className="text-link-btn" aria-keyshortcuts={desktop ? 'Escape' : undefined} onClick={quitLink}>
        {t('notes.play.quit')} {keys && <kbd className="kbd kbd--bare">{t('pause.esc')}</kbd>}
      </Link>
    </ExerciseHeader>
  );
  // The question and the score, over the staff (phone and tablet).
  const info = (
    <div className="play-info">
      <div className="play-info-left">
        <span className="eyebrow">{where}</span>
        <span className="nplay-ask">{ask}</span>
      </div>
      <div className="nplay-score" role="img" aria-label={t('notes.play.correctLabel', { right, done: answeredCount })}>
        <div className="nplay-score-n" aria-hidden="true">
          <span className="tone-good">{right}</span>
          <span className="tone-muted"> / {answeredCount}</span>
        </div>
        <div className="muted-small" aria-hidden="true">
          {t('notes.play.correct')}
        </div>
      </div>
    </div>
  );
  const skipLink = (
    <button type="button" className="skip-link nplay-skip" onClick={skip}>
      {t('notes.play.skip')}
    </button>
  );

  // Tablet (App design canvas, NoteTablet): the staff card takes the height the answer card leaves.
  if (tablet) {
    return (
      <div className="tframe">
        {header}
        <h1 className="sr-only">{t('notes.play.heading')}</h1>
        <main className="page nplay ntab">
          {info}
          <div className="card nplay-staff ntab-staff">
            {staff}
            {timerBar}
            {hearButton}
          </div>
          {feedbackBox}
          <section className="card ntab-card ntab-answer" aria-label={ask}>
            {modeSeg}
            {labelsSeg}
            {inputs}
            {actions}
          </section>
          {skipLink}
        </main>
      </div>
    );
  }

  if (desktop) {
    // The notes missed as they were written: F♯ missed on a line where an F was right reads F♯.
    const needsText = needsPractice(notes, answers).slice(0, 3).map((n) => {
      const name = (state.prefs.noteNames === 'solfege' ? solfegeName : letterName)(letterOf(n.step), n.alter);
      return t('notes.play.needsItem', { note: name, pos: positionText(n.clef, n.step) });
    });
    return (
      <div className="dplay nplay-desk">
        {header}
        <h1 className="sr-only">{t('notes.play.heading')}</h1>
        <main className="dplay-main nplay-main">
          <div className="card nplay-staff nplay-staff--desk">
            {staff}
            {timerBar}
            {hearButton}
          </div>
          <div className="dplay-row">
            <section className="card nanswer" aria-label={ask}>
              <div className="nanswer-head">
                {modeSeg}
                {keys && (
                  <span className="muted-text">
                    {t(task === 'write' ? 'notes.play.kbdWrite' : mode === 'piano' ? 'notes.play.kbdPiano' : signs ? 'notes.play.kbdNames' : 'notes.play.kbdNamesPlain')}
                  </span>
                )}
              </div>
              {labelsSeg}
              {inputs}
              {feedbackBox}
              {actions}
            </section>
            <aside className="nstats">
              <div className="card stat">
                <span className="label">{t('notes.play.correctTitle')}</span>
                <span className="stat-mono nstat-big" role="img" aria-label={t('notes.play.correctLabel', { right, done: answeredCount })}>
                  <span className="tone-good">{right}</span>
                  <span className="tone-muted"> / {answeredCount}</span>
                </span>
              </div>
              <div className="card stat">
                <span className="label">{t('notes.play.avgTitle')}</span>
                <span className="stat-mono nstat-big">{avg === null ? t('common.dash') : t('notes.play.seconds', { value: formatDecimal(avg) })}</span>
              </div>
              <div className="card stat nstat-wide">
                <span className="label">{t('notes.play.needsTitle')}</span>
                <span className="nstat-text">{needsText.length ? t('notes.play.needsList', { list: needsText.join('; ') }) : t('notes.play.needsNone')}</span>
              </div>
              <button type="button" className="skip-link nstat-skip" onClick={skip}>
                {t('notes.play.skip')}
              </button>
            </aside>
          </div>
        </main>
      </div>
    );
  }

  return (
    <ExerciseFrame className="frame--play">
      <div className="page play nplay no-scrollbar">
        <h1 className="sr-only">{t('notes.play.heading')}</h1>
        <div className="play-top">
          <Link to={home} query={homeQuery} aria-label={t('notes.play.quit')} className="icon-btn icon-btn--edge-sm" onClick={quitLink}>
            <Icon name="close" size={22} strokeWidth={2.2} />
          </Link>
          <div className="progress" role="progressbar" aria-label={t('notes.play.progress')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount}>
            <div style={{ width: (answeredCount / total) * 100 + '%' }} />
          </div>
          <span className="mono-muted nplay-count">{t('notes.play.count', { n: i + 1, total })}</span>
        </div>

        {info}

        <div className={'card nplay-staff' + (timer > 0 ? ' nplay-staff--timer' : '')}>
          {staff}
          {timerBar}
          {hearButton}
        </div>

        {feedbackBox}
        {skipLink}

        <div className="ninputs">
          {modeSeg}
          {labelsSeg}
          {inputs}
          {actions}
        </div>
      </div>
    </ExerciseFrame>
  );
}
