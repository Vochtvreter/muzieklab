/**
 * Read notes · name it (DESIGN.md §3.5). A staff of whole notes, one per bar, with the current one highlighted; answer
 * with names (sign first, then the name; no sign row when no note can have one) or on the piano, switchable
 * mid-round. With Hear the notes on, a piano key sounds when pressed and the right note after every answer. Right
 * answers move on by themselves; after a wrong one the feedback says why and Next note goes on. Desktop: the exercise
 * header, a wide staff, the answer card with computer keys and three stat cards.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  isRight,
  keySigns,
  letterOf,
  noteId,
  noteMidi,
  pianoKeyMidi,
  roundHasSigns,
  type Alter,
  type Given,
  type Letter,
  type NoteAnswer,
  type RoundNote,
} from '../../../core/api';
import { PitchStaff, type PitchMark } from '../../../render/PitchStaff';
import { t } from '../../../i18n';
import { engine, unlockAudio } from '../../audio';
import { ExerciseFrame } from '../../components/AppShell';
import { Segmented } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { BLACK_KBD, NameButtons, Piano, SignRow, WHITE_KBD, type KeyMark } from '../../components/NoteInputs';
import { useBreakpoint, useDocTitle, useKeyboardHints } from '../../hooks';
import { useLearnReturn } from '../../lib/learnReturn';
import { feedbackText, hintText, keySignsText, majorName, positionText, letterName, solfegeName, type NameSystem } from '../../lib/noteText';
import { Link, navigate } from '../../router';
import { todayIso, useStore, type NoteRun } from '../../store';

/** A right answer without a hint moves on after this long. */
const AUTO_NEXT_MS = 700;
/** After a wrong piano key, the right note follows this long after it (seconds). */
const CORRECTION_GAP = 0.5;
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
  const shownAt = useRef(performance.now());
  const note = notes[i];
  const system: NameSystem = mode === 'solfege' ? 'solfege' : 'letters';

  // Mixed rounds: names and piano take turns every 5 notes (the player can still switch any time).
  useEffect(() => {
    if (i === 0 || notes[i].input === notes[i - 1].input) return;
    setMode(notes[i].input === 'piano' ? 'piano' : state.prefs.noteNames);
  }, [i]);

  const sound = useCallback(
    (midis: number[], gap?: number) => {
      if (!run.settings.playNotes) return;
      unlockAudio();
      engine().pitches(midis, gap);
    },
    [run.settings.playNotes],
  );

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
    setI(i + 1);
    setGiven(null);
    setDone(false);
    setHinted(false);
    setSign(0);
    setLeft(timer * 1000);
    shownAt.current = performance.now();
  }, [done, i, total, answers, finish, timer]);

  const answer = useCallback(
    (g: Given | null) => {
      if (done || !note) return;
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
    [done, note, hinted, i, timer, sound],
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
      const k = e.key.toUpperCase();
      if (e.key === 'Enter' || e.key === ' ') {
        if (done) {
          e.preventDefault();
          next();
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
      else if (/^[A-G]$/.test(k)) answer({ kind: 'name', letter: k as Letter, alter: sign });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, done, sign, signs, answer, pressKey, next, desktop]);

  const size = desktop ? 8 : 6;
  const page = staffPage(notes, i, size);
  const shown = useMemo(() => notes.slice(page.from, page.to).map((n) => ({ step: n.step, sign: n.sign })), [notes, page.from, page.to]);
  const marks = useMemo(() => notes.slice(page.from, page.to).map((_, j) => markOf(answers[page.from + j])), [notes, page.from, page.to, answers]);
  const room = run.settings.range === 'staff' ? 1.5 : run.settings.range === 'ledger1' ? 2.5 : 3.5;

  const right = answers.filter((a) => a.outcome === 'right').length;
  const answeredCount = answers.length;
  const avg = answeredCount ? answers.reduce((s, a) => s + a.ms, 0) / answeredCount / 1000 : null;
  const keyHasSigns = keySigns(note.key).length > 0;
  // A path lesson says which one ("Lesson 4.3 · Treble clef · C major"); free practice names the clef and key.
  const where = run.lesson
    ? t('notes.play.eyebrowLesson', { id: run.lesson.id, clef: t('notes.clefLong.' + note.clef), key: majorName(note.key) })
    : t('notes.play.eyebrow', { clef: t('notes.clefLong.' + note.clef), key: majorName(note.key) });

  // The feedback line: the answer's verdict, the hint, a new key or clef, or what to do.
  let feedback: string;
  let tone = '';
  if (done) {
    const ok = last?.outcome === 'right' || last?.outcome === 'hinted';
    feedback = feedbackText(note, given, ok, system);
    tone = last?.outcome === 'right' ? 'right' : last?.outcome === 'hinted' ? 'hint' : 'wrong';
  } else if (hinted) {
    feedback = hintText(note, system);
    tone = 'hint';
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
  const keyMarks: Partial<Record<number, KeyMark>> = {};
  if (done) {
    const L = letterOf(note.step);
    if (given?.kind === 'name') {
      // Right letter with the wrong sign stays red: the button showed the wrong name.
      if (given.letter === L) nameMarks[L] = given.alter === note.alter ? 'right' : 'wrong';
      else {
        nameMarks[given.letter] = 'wrong';
        nameMarks[L] = 'right';
      }
    } else if (given === null && mode !== 'piano') {
      nameMarks[L] = 'right';
    } else {
      if (given?.kind === 'piano') keyMarks[given.pc] = 'wrong';
      const pc = (WHITE_PCS[L] + note.alter + 12) % 12;
      keyMarks[pc] = 'right';
    }
  }

  const staffLabel = t('notes.play.staffLabel', { clef: t('notes.clefLong.' + note.clef), key: majorName(note.key), n: i + 1, total });
  const staff = (
    <PitchStaff clef={note.clef} keyId={note.key} notes={shown} slots={size} marks={marks} cursor={i - page.from} scale={desktop ? 1.6 : bp === 'tablet' ? 2 : 1.45}
      room={room} label={staffLabel} className="nplay-staff-svg" />
  );
  const timerBar = timer > 0 && (
    <div className="ntimer" role="progressbar" aria-label={t('notes.play.timeLeft')} aria-valuemin={0} aria-valuemax={timer} aria-valuenow={Math.ceil(left / 1000)}>
      <div style={{ width: (left / (timer * 1000)) * 100 + '%' }} />
    </div>
  );
  const modeSeg = (
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
  const labelsSeg = mode === 'piano' && (
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
    mode === 'piano' ? (
      <Piano labels={state.prefs.pianoLabels} marks={keyMarks} onPick={pressKey} kbd={keys} />
    ) : (
      <>
        {signs && <SignRow value={sign} onChange={setSign} disabled={done} kbd={keys} />}
        <NameButtons system={system} sign={sign} marks={nameMarks} onPick={(L) => answer({ kind: 'name', letter: L, alter: sign })} kbd={keys} />
      </>
    );
  const feedbackBox = (
    <div className={'nfeedback m-ease' + (tone ? ' is-' + tone : '')} aria-live="polite">
      {feedback}
    </div>
  );
  const actions = (
    <div className="nactions">
      <button type="button" className="btn btn--outline" disabled={done || hinted} onClick={() => setHinted(true)}>
        {t('notes.play.hint')}
      </button>
      <button type="button" className={'btn ' + (done ? 'btn--accent' : 'btn--blocked')} disabled={!done} onClick={next}>
        {t(i + 1 >= total ? 'notes.play.finish' : 'notes.play.next')}
        {keys && <kbd className="kbd kbd--bare">↵</kbd>}
      </button>
    </div>
  );
  const quitLink = (e: MouseEvent): void => {
    e.preventDefault();
    quit();
  };
  const ask = t(mode === 'piano' ? 'notes.play.askPiano' : 'notes.play.askNames');

  if (desktop) {
    const needs = answers
      .map((a, j) => ({ a, n: notes[j] }))
      .filter(({ a }) => a.outcome !== 'right')
      .map(({ n }) => noteId(n.clef, n.step));
    const needsText = [...new Set(needs)].slice(0, 3).map((id) => {
      const n = notes.find((x) => noteId(x.clef, x.step) === id)!;
      const name = (state.prefs.noteNames === 'solfege' ? solfegeName : letterName)(letterOf(n.step), n.alter);
      return t('notes.play.needsItem', { note: name, pos: positionText(n.clef, n.step) });
    });
    return (
      <div className="dplay nplay-desk">
        <header className="dplay-head">
          <div className="brand brand--static">{t('app.name')}</div>
          <div className="dplay-title">
            <span className="eyebrow">
              {run.lesson ? where : t('notes.play.eyebrowLong', { clef: t('notes.clefLower.' + note.clef), key: majorName(note.key) })}
            </span>
            <span className="mono-line">{t('notes.play.noteOf', { n: i + 1, total })}</span>
          </div>
          <div className="progress progress--grow" role="progressbar" aria-label={t('notes.play.progress')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount}>
            <div style={{ width: (answeredCount / total) * 100 + '%' }} />
          </div>
          <div className="dplay-actions">
            <Link to={home} query={homeQuery} className="text-link-btn" aria-keyshortcuts="Escape" onClick={quitLink}>
              {t('notes.play.quit')} {keys && <kbd className="kbd kbd--bare">{t('pause.esc')}</kbd>}
            </Link>
          </div>
        </header>
        <h1 className="sr-only">{t('notes.play.heading')}</h1>
        <main className="dplay-main nplay-main">
          <div className="card nplay-staff nplay-staff--desk">
            {staff}
            {timerBar}
          </div>
          <div className="dplay-row">
            <section className="card nanswer" aria-label={ask}>
              <div className="nanswer-head">
                {modeSeg}
                {keys && <span className="muted-text">{t(mode === 'piano' ? 'notes.play.kbdPiano' : signs ? 'notes.play.kbdNames' : 'notes.play.kbdNamesPlain')}</span>}
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
                <span className="stat-mono nstat-big">{avg === null ? t('common.dash') : t('notes.play.seconds', { value: avg.toFixed(1) })}</span>
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

        <div className="play-info">
          <div className="play-info-left">
            <span className="eyebrow">{where}</span>
            <span className="nplay-ask">{ask}</span>
          </div>
          <div className="nplay-score" role="img" aria-label={t('notes.play.correctLabel', { right, done: answeredCount })}>
            <div className="nplay-score-n" aria-hidden="true">
              <span className="tone-good">{right}</span>
              <span className="tone-faint"> / {answeredCount}</span>
            </div>
            <div className="muted-small" aria-hidden="true">
              {t('notes.play.correct')}
            </div>
          </div>
        </div>

        <div className="card nplay-staff">
          {staff}
          {timerBar}
        </div>

        {feedbackBox}
        <button type="button" className="skip-link nplay-skip" onClick={skip}>
          {t('notes.play.skip')}
        </button>

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
