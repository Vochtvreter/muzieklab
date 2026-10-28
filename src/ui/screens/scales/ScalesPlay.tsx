/**
 * Scales · play or spell a scale (DESIGN.md §3.7). Piano: play the scale note by note on the 9-key window; each right
 * note is written on the staff and fills the next degree box, a wrong key flashes red and the feedback names the step.
 * Names: the letters are given, one per degree; pick ♭ ♮ ♯ (𝄪) for each. Hear it so far and Start over show from the
 * first note on (Hear the scale once it is done). A scale with mistakes comes back once at the end of the round.
 * Tablet (no board yet; Read notes' NoteTablet pattern): the exercise header, the scale and mistakes, the staff card with
 * the degrees and the tools under them, the feedback and the answer card. Desktop: the exercise header, a wide staff, the answer card with
 * computer keys and the side panel.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  afterScale,
  isRightNote,
  isWrongOctave,
  keyAlter,
  letterOf,
  pianoWindow,
  scaleNotes,
  signChoices,
  type PlayedScale,
  type RoundScale,
  type ScaleAlter,
  type ScaleGiven,
} from '../../../core/api';
import { SCALE_CAP_S } from '../../../game/stats';
import { t } from '../../../i18n';
import { PitchStaff, type PitchNote } from '../../../render/PitchStaff';
import { engine, unlockAudio } from '../../audio';
import { ExerciseFrame } from '../../components/AppShell';
import { ExerciseHeader } from '../../components/ExerciseHeader';
import { Icon } from '../../components/Icon';
import type { KeyMark } from '../../components/NoteInputs';
import { DegreeRow, keyNames, SCALE_GAP_KBD, SCALE_WHITE_KBD, ScalePiano, SignButtons, type DegreeCell } from '../../components/ScaleInputs';
import { PHONE_LANDSCAPE, SHORTER_PHONE, useBreakpoint, useDocTitle, useExerciseLayout, useKeyboardHints, useMediaQuery } from '../../hooks';
import { keyForTabbedControl } from '../../lib/focusModality';
import { letterName } from '../../lib/noteText';
import { noteName, scaleName, scaleSpoken, stepHow, stepLabel, stepsOf } from '../../lib/scaleText';
import { useFocusHandOff } from '../../lib/screenFocus';
import { leave, Link, navigate } from '../../router';
import { todayIso, useStore, type ScaleRun } from '../../store';

/** Notes per staff: a scale going up (8), then the way down on a staff of its own, from the top note. */
const PAGE = 8;

export function ScalesPlay(): JSX.Element | null {
  const { state } = useStore();
  const run = state.scaleRun;
  useEffect(() => {
    if (!run) navigate('/scales', { replace: true });
  }, [run]);
  if (!run) return null;
  return <Round key={run.seed} run={run} />;
}

function Round({ run }: { run: ScaleRun }): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';
  const kbd = useKeyboardHints(bp);
  // A phone on its side is tablet-wide but short: the phone layout (two columns, in the CSS), and a smaller staff keeps
  // the degrees and feedback in view.
  const short = useMediaQuery(PHONE_LANDSCAPE);
  const tablet = useExerciseLayout() === 'tablet';
  // So is a phone browser on a small phone (375 × 553, DESIGN.md §9): the piano and its letters stay in view.
  const shorter = useMediaQuery(SHORTER_PHONE);
  useDocTitle(t('app.docTitle', { page: t('scales.play.docTitle') }));
  const s = run.settings;
  const dir = s.direction;

  const [queue, setQueue] = useState<RoundScale[]>(run.scales);
  const [idx, setIdx] = useState(0);
  const [played, setPlayed] = useState<PlayedScale[]>([]);
  const [pos, setPos] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState<ScaleGiven | null>(null);
  const [hinted, setHinted] = useState(false);
  // Minutes practised (the Progress tab): the time on each scale, from when it is shown, at most SCALE_CAP_S each.
  const time = useRef({ sum: 0, since: performance.now() });
  const lap = (): number => {
    const now = performance.now();
    time.current.sum += Math.min(SCALE_CAP_S, Math.max(0, (now - time.current.since) / 1000));
    time.current.since = now;
    return time.current.sum;
  };

  const sc = queue[idx];
  const notes = useMemo(() => scaleNotes(sc, dir), [sc, dir]);
  const steps = useMemo(() => stepsOf(sc, dir), [sc, dir]);
  const total = queue.length;
  const done = pos >= notes.length;
  const piano = sc.input === 'piano';
  const cur = notes[Math.min(pos, notes.length - 1)];
  const curLetter = letterOf(cur.step);

  // Hint once used, the signs or the keys once the scale is done, Next scale until the next one is done and Start over
  // before a note go away under the focus: it goes on to Next scale once the scale is done, else to the answers.
  const holdFocus = useFocusHandOff(() => (done ? ['.splay-next'] : ['.ssign', '.spiano button']));

  const sound = useCallback(
    (midis: number[]) => {
      if (!s.playNotes || midis.length === 0) return;
      unlockAudio();
      engine().pitches(midis);
    },
    [s.playNotes],
  );

  const finish = useCallback(
    (list: PlayedScale[]) => {
      dispatch({ type: 'scaleFinish', played: list, today: todayIso(), seconds: Math.round(lap()) });
    },
    [dispatch],
  );
  // Go to Round done once the store holds this round's result (as Read notes and Play do), never before it.
  useEffect(() => {
    if (state.scaleLast?.run === run) navigate('/scales/done', { replace: true });
  }, [state.scaleLast, run]);

  const next = useCallback(() => {
    if (!done) return;
    const list = [...played, { scale: sc, mistakes }];
    const q = afterScale(queue, idx, mistakes);
    if (idx + 1 >= q.length) return finish(list);
    holdFocus();
    lap();
    setPlayed(list);
    setQueue(q);
    setIdx(idx + 1);
    setPos(0);
    setMistakes(0);
    setWrong(null);
    setHinted(false);
  }, [done, played, sc, mistakes, queue, idx, finish, holdFocus]);

  const answer = useCallback(
    (g: ScaleGiven) => {
      if (done) return;
      holdFocus();
      if (g.kind === 'piano') sound([g.midi]);
      if (isRightNote(cur, g)) {
        if (g.kind === 'sign') sound([cur.midi]);
        setPos(pos + 1);
        setWrong(null);
        setHinted(false);
      } else {
        setMistakes(mistakes + 1);
        setWrong(g);
        // Why this one is wrong takes the hint's place, and Hint can be asked again.
        setHinted(false);
      }
    },
    [done, cur, pos, mistakes, sound, holdFocus],
  );

  const hear = (): void => {
    unlockAudio();
    engine().pitches(notes.slice(0, pos).map((n) => n.midi));
  };
  const startOver = (): void => {
    holdFocus();
    setPos(0);
    setWrong(null);
    setHinted(false);
  };
  const quit = (): void => leave('/scales');
  const skip = (): void => finish(done ? [...played, { scale: sc, mistakes }] : played);
  const choices = useMemo(() => signChoices(sc, dir), [sc, dir]);

  // Keys (desktop): the home row and the row above play the piano, − 0 = X pick the sign, Enter goes on, Space plays
  // the notes so far, Esc quits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      // A button reached with Tab (a sign, Start over, Skip) takes Space and Enter itself.
      if (keyForTabbedControl(e)) return;
      const k = e.key.toUpperCase();
      // After a click the key or sign keeps the focus (or Hint, Next scale or Start over handed it on to one): Enter is
      // Next scale, once the scale is done, and never presses that key or sign (focusModality.ts).
      if (e.key === 'Enter') {
        e.preventDefault();
        if (done) next();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        hear();
        return;
      }
      if (e.key === 'Escape' && desktop) {
        e.preventDefault();
        quit();
        return;
      }
      if (done) return;
      if (piano) {
        const w = pianoWindow(sc);
        const wi = (SCALE_WHITE_KBD as readonly string[]).indexOf(k);
        const gi = (SCALE_GAP_KBD as readonly string[]).indexOf(k);
        const black = w.blacks.find((b) => b.after === gi + 1);
        if (wi >= 0) answer({ kind: 'piano', midi: w.whites[wi] });
        else if (gi >= 0 && black) answer({ kind: 'piano', midi: black.midi });
        else return;
      } else {
        const a: ScaleAlter | null = e.key === '-' || e.key === '_' ? -1 : e.key === '0' ? 0 : e.key === '=' || e.key === '+' ? 1 : k === 'X' ? 2 : null;
        if (a === null || !choices.includes(a)) return;
        answer({ kind: 'sign', alter: a });
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The staff: the notes so far on this page (up, or the way down from the top note) and the next note's place.
  const start = dir === 'upDown' && pos >= PAGE ? PAGE - 1 : 0;
  const keyId = s.write === 'keySig' ? sc.key : 'C';
  // The whole page as it will be written: the staff keeps room for it, so its size stays the same as the notes come in.
  const pageNotes = useMemo<PitchNote[]>(
    () =>
      notes.slice(start, start + PAGE).map((n) => {
        const sig = keyId === 'C' ? 0 : keyAlter(keyId, letterOf(n.step));
        return { step: n.step, sign: n.alter === sig ? null : n.alter };
      }),
    [notes, start, keyId],
  );
  const shown = useMemo(() => pageNotes.slice(0, pos - start), [pageNotes, pos, start]);
  const staffLabel = t('scales.play.staffLabel', {
    scale: scaleSpoken(sc),
    notes: notes.slice(0, pos).map(noteName).join(', ') || t('scales.play.none'),
  });
  // Up and down on the shortest phones draws the staff at 1, so a why of two lines leaves Hint and Next scale in view
  // with its second degree row, also beside a B♭ scale's staff, the tallest (DESIGN.md §9).
  const staffScale = desktop ? 1.7 : shorter && dir === 'upDown' ? 1 : short || shorter ? 1.1 : bp === 'tablet' ? 1.8 : 1.25;
  const staff = (
    <PitchStaff clef="treble" keyId={keyId} notes={shown} fitNotes={pageNotes} slots={PAGE} cursor={done ? null : pos - start} barlines={false} room={2.2}
      scale={staffScale} label={staffLabel} className="splay-staff-svg" />
  );

  // Degree boxes: given letters when spelling, "?" for the next note when playing.
  const cell = (i: number): DegreeCell => {
    const n = notes[i];
    const state: DegreeCell['state'] = i < pos ? 'done' : i === pos ? 'current' : 'next';
    const letter = t('notes.letter.' + letterOf(n.step));
    const text = i < pos ? noteName(n) : piano ? (i === pos ? '?' : '') : letter;
    return { degree: n.degree, text, given: piano ? undefined : letter, state };
  };
  const stepCells = s.showSteps ? steps : steps.map(() => null);
  const upCells = notes.slice(0, PAGE).map((_, i) => cell(i));
  const downCells = dir === 'upDown' ? [{ ...cell(PAGE - 1), state: pos >= PAGE ? ('done' as const) : ('next' as const) }, ...notes.slice(PAGE).map((_, i) => cell(PAGE + i))] : [];
  const degrees = (
    <div className="splay-degrees">
      <DegreeRow cells={upCells} steps={stepCells.slice(0, PAGE - 1)} known={Math.max(0, pos - 1)} label={t('scales.play.degreesUp')} />
      {dir === 'upDown' && <DegreeRow cells={downCells} steps={stepCells.slice(PAGE - 1)} known={Math.max(0, pos - PAGE)} label={t('scales.play.degreesDown')} />}
    </div>
  );

  // The feedback line: what to play or spell next, a wrong answer and why, the hint, or the scale done.
  const prev = pos > 0 ? noteName(notes[pos - 1]) : '';
  const way = dir === 'upDown' && pos >= PAGE ? 'down' : 'up';
  const how = pos > 0 && !done ? stepHow(steps[pos - 1]) : '';
  let feedback: string;
  let tone = '';
  if (done) {
    feedback = t(mistakes ? 'scales.play.doneMistakes' : 'scales.play.doneClean', { scale: scaleName(sc), count: mistakes });
    tone = 'right';
  } else if (wrong) {
    const given = wrong.kind === 'piano' ? keyNames(wrong.midi) : letterName(curLetter, wrong.alter);
    // The note's own key an octave off: "Not C" would deny the C that was played.
    if (wrong.kind === 'piano' && isWrongOctave(cur, wrong)) feedback = t(wrong.midi > cur.midi ? 'scales.play.wrongOctaveHigh' : 'scales.play.wrongOctaveLow', { note: noteName(cur) });
    else feedback = pos === 0 ? t('scales.play.wrongStart', { given, scale: scaleName(sc) }) : t(way === 'up' ? 'scales.play.wrongUp' : 'scales.play.wrongDown', { given, prev, how });
    tone = 'wrong';
  } else if (hinted) {
    feedback = pos === 0 ? t('scales.play.hintStart', { scale: scaleName(sc) }) : t(way === 'up' ? 'scales.play.hintUp' : 'scales.play.hintDown', { prev, step: stepLabel(steps[pos - 1]), how });
    tone = 'hint';
  } else if (piano) {
    feedback = pos === 0 ? t('scales.play.idleStart', { tonic: noteName(notes[0]) }) : t(way === 'up' ? 'scales.play.idleUp' : 'scales.play.idleDown', { degree: cur.degree, prev, how: s.showSteps ? how : t('scales.play.nextNote') });
  } else {
    feedback = t('scales.play.idleSign', { letter: t('notes.letter.' + curLetter) });
  }

  const keyMarks: Partial<Record<number, KeyMark>> = {};
  if (pos > 0) keyMarks[notes[pos - 1].midi] = 'right';
  if (wrong?.kind === 'piano') keyMarks[wrong.midi] = 'wrong';
  const playedMidis = notes.slice(0, pos).map((n) => n.midi);
  const inputs = piano ? (
    <ScalePiano scale={sc} marks={keyMarks} played={playedMidis} onPick={(midi) => answer({ kind: 'piano', midi })} disabled={done} kbd={kbd} />
  ) : (
    <SignButtons letter={curLetter} choices={choices} wrong={wrong?.kind === 'sign' ? wrong.alter : null} onPick={(alter) => answer({ kind: 'sign', alter })} disabled={done} kbd={kbd} />
  );
  // The done line ends with the scale's notes. Up and down on the shortest phones leaves them to the degree rows, which
  // show all 15, and to screen readers (scales.css).
  const feedbackBox = (
    <div className={'nfeedback m-ease' + (tone ? ' is-' + tone : '')} aria-live="polite">
      <span>
        {feedback}
        {done && (
          <>
            {' '}
            <span className="nfeedback-notes">{notes.map(noteName).join(' ')}</span>
          </>
        )}
      </span>
    </div>
  );
  const nextLabel = t(idx + 1 >= afterScale(queue, idx, mistakes).length ? 'scales.play.finish' : 'scales.play.next');
  const nextBtn = (
    <button type="button" className={'btn splay-next ' + (done ? 'btn--accent' : 'btn--blocked')} disabled={!done} onClick={next}>
      {nextLabel}
      {kbd && <kbd className="kbd kbd--bare kbd--on-fill">↵</kbd>}
    </button>
  );
  // Before the first note there is nothing to hear or start over: both wait, hidden, in their place (no jump when they come).
  const idle = pos === 0 ? ' is-idle' : '';
  const hearBtn = (
    <button type="button" className={'btn btn--outline splay-hear' + idle} disabled={pos === 0} onClick={hear} aria-keyshortcuts="Space">
      <Icon name="play" size={14} />
      {t(done ? 'scales.play.hearAll' : 'scales.play.hear')}
      {kbd && <kbd className="kbd kbd--bare">{t('scales.play.space')}</kbd>}
    </button>
  );
  const overBtn = (
    <button type="button" className={'btn btn--outline' + idle} disabled={pos === 0 || done} onClick={startOver}>
      {t('scales.play.startOver')}
    </button>
  );
  // Piano: Next scale takes Start over's place once the scale is done. Names: Hint and Next scale under the signs.
  const second = piano && done ? nextBtn : overBtn;
  // The hint takes the place of a wrong answer, and of its red mark, as on the boards (ScaleSpell).
  const hint = (): void => {
    holdFocus();
    setWrong(null);
    setHinted(true);
  };
  const answerActions = piano ? null : (
    <div className="nactions">
      <button type="button" className="btn btn--outline" disabled={done || hinted} onClick={hint}>
        {t('scales.play.hint')}
      </button>
      {nextBtn}
    </div>
  );
  const eyebrow = t('scales.play.eyebrow', {
    type: t('scales.type.' + sc.type),
    dir: t(dir === 'up' ? 'scales.setup.upWord' : 'scales.setup.upDownWord'),
    input: t(piano ? 'scales.setup.inputWord.piano' : 'scales.setup.inputWord.names'),
  });
  const again = sc.again && <span className="splay-again">{t('scales.play.again')}</span>;
  const mistakesBox = (
    <div className="splay-mistakes" role="img" aria-label={t('scales.play.mistakesAria', { count: mistakes })}>
      <div className={'splay-mistakes-n ' + (mistakes ? 'tone-miss' : 'tone-good')} aria-hidden="true">
        {mistakes}
      </div>
      <div className="muted-small" aria-hidden="true">
        {t('scales.play.mistakes', { count: mistakes })}
      </div>
    </div>
  );
  const quitLink = (e: MouseEvent): void => {
    e.preventDefault();
    quit();
  };

  // Tablet and desktop: the exercise header. Esc quits on desktop (as before, also on a touch screen at desktop width).
  const header = (
    <ExerciseHeader tablet={tablet} eyebrow={t('scales.play.eyebrowLong', { rest: eyebrow })} line={t('scales.play.scaleOf', { n: idx + 1, total })}
      progress={{ label: t('scales.play.progress'), value: idx / total, max: total, now: idx }}>
      <Link to="/scales" className="text-link-btn" aria-keyshortcuts={desktop ? 'Escape' : undefined} onClick={quitLink}>
        {t('scales.play.quit')} {kbd && <kbd className="kbd kbd--bare">{t('pause.esc')}</kbd>}
      </Link>
    </ExerciseHeader>
  );
  // The scale's name and the mistakes, over the staff (phone and tablet).
  const info = (
    <div className="play-info">
      <div className="play-info-left">
        <span className="eyebrow">{eyebrow}</span>
        <span className="splay-title">
          {scaleName(sc)} {again}
        </span>
      </div>
      {mistakesBox}
    </div>
  );
  const tools = (
    <div className="splay-tools">
      {hearBtn}
      {second}
    </div>
  );
  const skipLink = (
    <button type="button" className="skip-link nplay-skip" onClick={skip}>
      {t('scales.play.skip')}
    </button>
  );

  // Tablet: as Read notes' (App design canvas, NoteTablet). The staff card takes the height left; Hear it so far and Start
  // over (hidden in their place before the first note) go under its degrees, as they are about the notes on the staff.
  if (tablet) {
    return (
      <div className="tframe">
        {header}
        <h1 className="sr-only">{t(piano ? 'scales.play.headingPiano' : 'scales.play.headingNames')}</h1>
        <main className="page nplay ntab stab">
          {info}
          <div className="card nplay-staff splay-staff ntab-staff stab-staff">
            {staff}
            {degrees}
            {tools}
          </div>
          {feedbackBox}
          <div className="card ntab-card stab-answer">
            {inputs}
            {answerActions}
          </div>
          {skipLink}
        </main>
      </div>
    );
  }

  if (desktop) {
    return (
      <div className="dplay splay-desk">
        {header}
        <h1 className="sr-only">{t(piano ? 'scales.play.headingPiano' : 'scales.play.headingNames')}</h1>
        <main className="dplay-main nplay-main">
          <div className="card nplay-staff nplay-staff--desk splay-staff">{staff}</div>
          <div className="dplay-row">
            <section className="card nanswer sanswer" aria-labelledby="scale-title">
              <div className="nanswer-head">
                <h2 id="scale-title" className="splay-title">
                  {scaleName(sc)} {again}
                </h2>
                {kbd && <span className="muted-text">{t(piano ? 'scales.play.kbdPiano' : 'scales.play.kbdNames')}</span>}
              </div>
              {degrees}
              {inputs}
              {feedbackBox}
              {answerActions}
            </section>
            <aside className="nstats sstats">
              <div className="card stat">
                <span className="label">{t('scales.play.mistakesTitle')}</span>
                <span className={'stat-mono nstat-big ' + (mistakes ? 'tone-miss' : 'tone-good')}>{mistakes}</span>
                {/* It breaks only after a "·": each part keeps its count with its stars ("2–3 ★"). */}
                <span className="nstat-text sstats-rule">
                  {(['three', 'two', 'one'] as const).map((n, i) => (
                    <Fragment key={n}>
                      {i > 0 && '\u00a0· '}
                      <span>{t('scales.play.starsRule.' + n)}</span>
                    </Fragment>
                  ))}
                </span>
              </div>
              {hearBtn}
              {second}
              <button type="button" className="skip-link nstat-skip" onClick={skip}>
                {t('scales.play.skip')}
              </button>
            </aside>
          </div>
        </main>
      </div>
    );
  }

  return (
    <ExerciseFrame className="frame--play">
      <div className={'page play nplay splay no-scrollbar' + (dir === 'upDown' ? ' splay--updown' : '')}>
        <h1 className="sr-only">{t(piano ? 'scales.play.headingPiano' : 'scales.play.headingNames')}</h1>
        <div className="play-top">
          <Link to="/scales" aria-label={t('scales.play.quit')} className="icon-btn icon-btn--edge-sm" onClick={quitLink}>
            <Icon name="close" size={22} strokeWidth={2.2} />
          </Link>
          <div className="progress" role="progressbar" aria-label={t('scales.play.progress')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={idx}>
            <div style={{ width: (idx / total) * 100 + '%' }} />
          </div>
          <span className="mono-muted nplay-count">{t('scales.play.count', { n: idx + 1, total })}</span>
        </div>

        {info}

        <div className="card nplay-staff splay-staff">{staff}</div>
        {degrees}
        {feedbackBox}
        {tools}
        {skipLink}

        <div className="ninputs splay-inputs">
          {inputs}
          {answerActions}
        </div>
      </div>
    </ExerciseFrame>
  );
}
