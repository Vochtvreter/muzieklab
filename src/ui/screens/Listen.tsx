/**
 * Listen and write (DESIGN.md §3.2): hear the exercise (a free first listen, then 3 plays, of the whole or of one bar),
 * write it value by value with the note palette (Build), then Check compares it beat by beat. With Melody (§3.2, Melody) the exercise is a
 * melody on the piano, the staff is a treble staff, and a Note row picks the pitch of each value added.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { buildTimeline, NOTE_VALUES, type Exercise, type NoteValue } from '../../core/api';
import {
  addValue,
  answerBars,
  answerComplete,
  answerNotation,
  answerSteps,
  barFilled,
  currentBar,
  degreeStep,
  emptyAnswer,
  fitProblem,
  firstWrong,
  LISTEN_PLAYS,
  playsUsed,
  melodyDegrees,
  paletteOf,
  stepMidi,
  undoValue,
  checkAnswer,
  writesNotesOnly,
  referenceDegree,
  type Answer,
  type ListenCheck,
  type Written,
} from '../../core/dictation';
import { letterOf, type Step } from '../../core/pitch';
import { t } from '../../i18n';
import type { NoteMark } from '../../render/Staff';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { StaffBox } from '../components/Bits';
import { ExerciseHeader } from '../components/ExerciseHeader';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import type { ExerciseView } from '../exerciseView';
import { useBreakpoint, useDocTitle, useExerciseLayout, useKeyboardHints, useLingering, useMediaQuery } from '../hooks';
import { metersLabel } from '../lib/format';
import { describeBars } from '../lib/notation';
import { stepName, stepSub } from '../lib/listenText';
import { leave, Link, navigate, type Route } from '../router';
import { todayIso, useStore, type Run } from '../store';
import { AUDIO_START_GRACE_MS, STOPPED_AUDIO } from './playSession';

const NOTE_GLYPH: Record<NoteValue, string> = { whole: '𝅝', half: '𝅗𝅥', quarter: '𝅘𝅥', eighth: '𝅘𝅥𝅮', sixteenth: '𝅘𝅥𝅯' };
const REST_GLYPH: Record<NoteValue, string> = { whole: '𝄻', half: '𝄼', quarter: '𝄽', eighth: '𝄾', sixteenth: '𝄿' };
/** The key of each value (§3.2): 1 whole, 2 half, 4 quarter, 8 eighth, 6 sixteenth. */
const VALUE_KEY: Record<NoteValue, string> = { whole: '1', half: '2', quarter: '4', eighth: '8', sixteenth: '6' };
/** Phone landscape: two columns (§3.2, Layout). */
const LANDSCAPE = '(max-height: 560px) and (orientation: landscape)';

/** What is playing: the whole exercise, one bar, or after Check the answer or the exercise to compare. */
type Playing = 'all' | 'bar' | 'yours' | 'theirs' | null;

/** The steps of the onsets in bar `bar` and after, from the exercise's pitches. */
function barExercise(ex: Exercise, bar: number): Exercise {
  const before = ex.bars.slice(0, bar).reduce((n, b) => n + b.events.filter((e) => e.kind === 'note' && !e.tieFromPrev).length, 0);
  const count = ex.bars[bar].events.filter((e) => e.kind === 'note' && !e.tieFromPrev).length;
  return { ...ex, bars: [ex.bars[bar]], ...(ex.pitches ? { pitches: ex.pitches.slice(before, before + count) } : {}) };
}

export function ListenPlay({ run, view, exit }: { run: Run; view: ExerciseView; exit: { to: Route; query?: string } }): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';
  const tablet = useExerciseLayout() === 'tablet';
  const landscape = useMediaQuery(LANDSCAPE);
  const keys = useKeyboardHints(bp);
  const ex = run.exercise;
  const meter = ex.meter;
  const melody = !!ex.pitches;
  // Write · Melody: the notes alone, every one a quarter. A note button adds its note; there is no value palette.
  const notesOnly = writesNotesOnly(ex.settings);
  const names = state.prefs.noteNames;
  const steps = useMemo(() => melodyDegrees(ex.settings).map(degreeStep), [ex.settings]);
  const palette = useMemo(
    () => (writesNotesOnly(ex.settings) ? { notes: ['quarter' as NoteValue], rests: [], dotted: false } : paletteOf(ex.settings)),
    [ex.settings],
  );
  useDocTitle(t('app.docTitle', { page: t('listen.title') }));

  const [answer, setAnswer] = useState<Answer>(() => emptyAnswer(ex.bars.length));
  /** Times the exercise was heard (a play of the whole or of one bar): the first is free, then each uses a play. */
  const [heard, setHeard] = useState(0);
  const [playing, setPlaying] = useState<Playing>(null);
  const [stopped, setStopped] = useState(false);
  const [rest, setRest] = useState(false);
  const [dot, setDot] = useState(false);
  const [pitch, setPitch] = useState<Step>(() => steps[0]);
  const [check, setCheck] = useState<ListenCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [help, setHelp] = useState<'help' | null>(state.prefs.seenListenHowTo ? null : 'help');
  const startedAt = useRef(performance.now());
  const timer = useRef<number | null>(null);
  const watch = useRef<number | null>(null);
  /** A play that counts and has not ended: given back once when it is cut off. */
  const counting = useRef(false);

  const bar = currentBar(answer, meter);
  const complete = answerComplete(answer, meter);
  const left = LISTEN_PLAYS - playsUsed(heard);
  const checked = check !== null;

  const stopAll = useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (watch.current !== null) window.clearInterval(watch.current);
    timer.current = watch.current = null;
    engine().stop();
    setPlaying(null);
  }, []);

  // A play cut off (the app left, the audio stopped or never started) stops and is given back, as on Echo (§3.3).
  const cut = useCallback(
    (audio: boolean): void => {
      if (!counting.current) {
        stopAll();
        return;
      }
      counting.current = false;
      stopAll();
      setStopped(audio);
      setHeard((n) => Math.max(0, n - 1));
    },
    [stopAll],
  );

  const play = useCallback(
    (what: Exclude<Playing, null>): void => {
      if (playing) {
        // A second press stops what plays; a play that counted stays used.
        counting.current = false;
        stopAll();
        return;
      }
      const uses = what === 'all' || what === 'bar';
      if (uses && left <= 0) return;
      const source: Exercise =
        what === 'bar' ? barExercise(ex, bar) : what === 'yours' ? { ...ex, bars: answerBars(answer), ...(melody ? { pitches: answerSteps(answer) } : {}) } : ex;
      unlockAudio();
      const eng = engine();
      applyAudioPrefs(state.prefs, eng);
      const timeline = what === 'all' || what === 'theirs' ? view.timeline : buildTimeline(source);
      // A play: one bar of count-in clicks, then the rhythm (Melody: the do it starts from on the first count-in beat,
      // then the melody on the piano). Compare plays start at once, without a count-in.
      const countInBars = uses ? 1 : 0;
      const started = eng.start({
        timeline,
        meter,
        tempo: ex.tempo,
        countInBars,
        metronome: ex.settings.metronome,
        playRhythm: true,
        leadIn: 0.15,
        ...(source.pitches ? { melody: source.pitches.map(stepMidi) } : {}),
        // The reference before a play: the note the melody starts on when the setup chose one (Starts on), else do.
        ...(melody && uses ? { reference: stepMidi(degreeStep(referenceDegree(ex.settings))) } : {}),
      });
      const at = performance.now();
      setStopped(false);
      setPlaying(what);
      if (uses) {
        counting.current = true;
        setHeard((n) => n + 1);
      }
      watch.current = window.setInterval(() => {
        if (STOPPED_AUDIO.has(eng.audioState()) && performance.now() - at > AUDIO_START_GRACE_MS) cut(true);
      }, 200);
      timer.current = window.setTimeout(() => {
        counting.current = false;
        stopAll();
      }, Math.max(0, started.end - eng.now() + 0.3) * 1000);
    },
    [playing, left, ex, bar, answer, melody, state.prefs, view, meter, stopAll, cut],
  );

  useEffect(() => {
    if (!playing) return;
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') cut(false);
    };
    document.addEventListener('visibilitychange', onVis);
    const off = engine().onStateChange((s) => {
      if (STOPPED_AUDIO.has(s)) cut(true);
    });
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      off();
    };
  }, [playing, cut]);
  useEffect(() => () => stopAll(), [stopAll]);

  const add = useCallback(
    (value: NoteValue): void => {
      if (checked || complete) return;
      const isRest = rest;
      if (!(isRest ? palette.rests : palette.notes).includes(value)) return;
      const w: Written = { value, dots: dot && value !== 'sixteenth' ? 1 : 0, kind: isRest ? 'rest' : 'note', ...(melody && !isRest ? { step: pitch } : {}) };
      const why = fitProblem(answer[bar], meter, w, palette);
      if (why) {
        setProblem(t(why === 'tooLong' ? 'listen.tooLong' : 'listen.gap', { value: t('noteButton.' + value), bar: bar + 1 }));
        return;
      }
      setProblem(null);
      setAnswer((a) => addValue(a, meter, w));
      setRest(false);
      setDot(false);
    },
    [checked, complete, rest, dot, palette, melody, pitch, answer, bar, meter],
  );
  /** Melody alone: a quarter at this note. */
  const addNote = useCallback(
    (step: Step): void => {
      if (checked || complete) return;
      setProblem(null);
      setAnswer((a) => addValue(a, meter, { value: 'quarter', dots: 0, kind: 'note', step }));
    },
    [checked, complete, meter],
  );
  const undo = useCallback((): void => {
    if (checked) return;
    setProblem(null);
    setAnswer((a) => undoValue(a));
  }, [checked]);

  const doCheck = useCallback((): void => {
    if (checked || !complete) return;
    stopAll();
    const c = checkAnswer(ex, answer);
    setCheck(c);
    const seconds = (performance.now() - startedAt.current) / 1000;
    dispatch({ type: 'listenFinish', answer, heard, today: todayIso(), seconds });
  }, [checked, complete, ex, answer, heard, dispatch, stopAll]);

  const toResults = (): void => {
    stopAll();
    navigate('/listen/done', { replace: true });
  };

  const closeHelp = useCallback((): void => {
    setHelp(null);
    if (!state.prefs.seenListenHowTo) dispatch({ type: 'prefs', patch: { seenListenHowTo: true } });
  }, [state.prefs.seenListenHowTo, dispatch]);

  // Keys (§3.2): Space plays, Enter checks, 1 2 4 8 6 add a value, R rest, . dot, Backspace undoes; with Melody the
  // letter of a note picks it (C again goes to the other do). ? opens How to play, Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (help) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeHelp();
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      const onControl = !!target?.closest('button, a, input, [role="radio"]');
      if (e.key === '?') {
        e.preventDefault();
        setHelp('help');
      } else if (e.key === ' ' && !onControl) {
        e.preventDefault();
        if (!checked) play('all');
      } else if (e.key === 'Enter' && !onControl) {
        e.preventDefault();
        if (checked) toResults();
        else doCheck();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        undo();
      } else if (e.key === 'r' || e.key === 'R') {
        if (!checked && palette.rests.length) setRest((v) => !v);
      } else if (e.key === '.') {
        if (!checked && palette.dotted) setDot((v) => !v);
      } else if (melody && /^[a-gA-G]$/.test(e.key)) {
        const letter = e.key.toUpperCase();
        const matches = steps.filter((s) => letterOf(s) === letter);
        // Melody alone: the letter adds its note (with Shift the high do, when both are picked).
        if (notesOnly && matches.length) addNote(e.shiftKey ? matches[matches.length - 1] : matches[0]);
        else if (matches.length) setPitch((p) => (matches.length > 1 && p === matches[0] ? matches[1] : matches[0]));
      } else {
        const v = NOTE_VALUES.find((x) => VALUE_KEY[x] === e.key);
        if (v && palette.notes.concat(palette.rests).includes(v)) add(v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const quit = (e: MouseEvent): void => {
    e.preventDefault();
    stopAll();
    leave(exit.to, exit.query);
  };

  // The staff: what is written, value for value; after Check each note right or wrong.
  const written = useMemo(() => answerNotation(answer, meter), [answer, meter]);
  const marks = useMemo(() => {
    if (!check) return undefined;
    const m: Record<number, NoteMark> = {};
    let k = 0;
    check.values.forEach((barValues, b) =>
      barValues.forEach((ok, i) => {
        if (answer[b][i].kind === 'note') m[k++] = ok ? 'perfect' : 'miss';
      }),
    );
    return m;
  }, [check, answer]);
  const perRow = bp === 'phone' ? 2 : 4;
  const clef = melody ? ('treble' as const) : undefined;
  const wrong = check ? firstWrong(check) : null;

  const bars = t('common.bars', { count: ex.bars.length });
  const meta = melody ? t('listen.metaMelody', { meter: metersLabel([meter.id]), bars }) : t('listen.meta', { meter: metersLabel([meter.id]), bars });
  const filled = barFilled(answer[bar]);
  const beatsIn = Math.floor(filled / meter.beatTicks);

  const playTitle = playing === 'all' || playing === 'bar'
    ? t('listen.playing')
    : stopped
      ? t('listen.interrupted')
      : left <= 0
        ? t('listen.noPlays')
        : heard === 0
          ? t(melody ? 'listen.playMelody' : 'listen.playRhythm')
          : t('listen.playAgain');

  const playCard = (
    <section className="card listen-play" aria-labelledby="listen-play-title">
      <button type="button" className={'listen-play-btn' + (playing === 'all' ? ' is-playing' : '')} disabled={checked || (!playing && left <= 0)}
        aria-label={playing === 'all' ? t('listen.stop') : playTitle} aria-keyshortcuts={keys ? 'Space' : undefined} onClick={() => play('all')}>
        <Icon name={playing === 'all' ? 'stop' : 'play'} size={26} />
      </button>
      <div className="listen-play-text">
        <div className="listen-play-row">
          <h2 id="listen-play-title" className="listen-play-title" aria-live="polite">
            {playTitle}
          </h2>
          <span className="listen-pips" aria-hidden="true">
            {Array.from({ length: LISTEN_PLAYS }, (_, i) => (
              <span key={i} className={i < left ? 'is-on' : ''} />
            ))}
          </span>
        </div>
        <span className="muted-text listen-plays">
          {heard === 0 ? t('listen.firstFree', { count: LISTEN_PLAYS }) : left > 0 ? t('listen.playsLeft', { count: left }) : t('listen.playsUsed', { count: LISTEN_PLAYS })}
        </span>
      </div>
    </section>
  );

  const beatStrip = (
    <div className="listen-beats" aria-hidden="true">
      {checked
        ? check.beats.map((b, i) => <span key={i} className={(b.right ? 'is-right' : 'is-wrong') + (b.beat === 0 && i > 0 ? ' is-bar' : '')} />)
        : Array.from({ length: meter.beatsPerBar }, (_, i) => (
            <span key={i} className={i < beatsIn ? 'is-on' : i === beatsIn && filled % meter.beatTicks ? 'is-part' : ''} />
          ))}
    </div>
  );

  const answerCard = (
    <section className="card listen-answer" aria-labelledby="listen-answer-title">
      <div id="listen-answer-title" className="listen-label">
        {t('listen.yourAnswer')}
      </div>
      <div className="listen-staff">
        <StaffBox bars={written} meter={meter} barsPerRow={perRow} marks={marks} clef={clef} shrinkToFit
          label={t('listen.answerLabel', { rhythm: describeBars(written, meter.id) })} />
      </div>
      {checked ? (
        <div className="listen-status">
          <b>{t('listen.valuesRight', { right: check.valuesRight, total: check.valuesTotal })}</b>
          <span className={wrong ? 'tone-miss' : 'tone-good'}>{wrong ? t('listen.beatDiffers', { beat: wrong.beat + 1, bar: wrong.bar + 1 }) : t('listen.allRight')}</span>
        </div>
      ) : (
        <div className="listen-bar-row">
          <div className="listen-bar-text">
            <b>{t('listen.bar', { bar: bar + 1, total: ex.bars.length })}</b>
            <span className="mono-line">{t('listen.beatsWritten', { count: beatsIn, total: meter.beatsPerBar })}</span>
          </div>
          <button type="button" className="ghost-btn listen-bar-btn" disabled={!playing && left <= 0} aria-pressed={playing === 'bar'} onClick={() => play('bar')}>
            <Icon name={playing === 'bar' ? 'stop' : 'speaker'} size={18} />
            {t('listen.playBar', { bar: bar + 1 })}
          </button>
        </div>
      )}
      {beatStrip}
      {checked && (
        <div className="listen-compare m-in">
          {/* Under the answer, each wrong bar as it was played (§3.2: "under a wrong bar, You heard"). */}
          {check.barsRight.map((ok, b) =>
            ok ? null : (
              <div key={b} className="listen-heard">
                <span className="listen-label">{t('listen.youHeardBar', { bar: b + 1 })}</span>
                <StaffBox bars={[view.bars[b]]} meter={meter} barsPerRow={1} clef={clef} shrinkToFit
                  label={t('listen.heardLabel', { rhythm: describeBars([view.bars[b]], meter.id) })} />
              </div>
            ),
          )}
          <div className="listen-compare-btns">
            <button type="button" className="ghost-btn" aria-pressed={playing === 'yours'} onClick={() => play('yours')}>
              <Icon name={playing === 'yours' ? 'stop' : 'speaker'} size={18} />
              {t('listen.playYours')}
            </button>
            <button type="button" className="ghost-btn" aria-pressed={playing === 'theirs'} onClick={() => play('theirs')}>
              <Icon name={playing === 'theirs' ? 'stop' : 'speaker'} size={18} />
              {t(melody ? 'listen.playTheMelody' : 'listen.playTheRhythm')}
            </button>
          </div>
        </div>
      )}
    </section>
  );

  // With Rest on, the rests that are on; otherwise the note values.
  const valueButtons = NOTE_VALUES.filter((v) => (rest ? palette.rests : palette.notes).includes(v));
  const hint = problem ?? (complete ? t('listen.hintFull') : notesOnly ? t('listen.hintNotes') : melody ? t('listen.hintMelody') : t('listen.hint', { bar: bar + 1 }));
  const notesBlock = !checked && notesOnly && (
    <div className="listen-palette">
      <div className="listen-label" id="listen-note-label">
        {t('listen.addNote')}
      </div>
      <div role="group" aria-labelledby="listen-note-label" className="listen-notes listen-notes--add" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s) => (
          <button key={s} type="button" className="listen-note" aria-disabled={complete || undefined} aria-keyshortcuts={letterOf(s)}
            aria-label={t('listen.addNoteLabel', { note: stepName(s, names) })} onClick={() => addNote(s)}>
            <span className="listen-note-main">{stepName(s, names)}</span>
            <span className="listen-note-sub" aria-hidden="true">
              {stepSub(s, names)}
            </span>
          </button>
        ))}
      </div>
      <div className="muted-text listen-hint" aria-live="polite">
        {hint}
      </div>
    </div>
  );
  const paletteBlock = notesOnly ? notesBlock : !checked && (
    <div className="listen-palette">
      {melody && (
        <div className="listen-notes-row">
          <div className="listen-label" id="listen-note-label">
            {t('listen.note')}
          </div>
          <div role="radiogroup" aria-labelledby="listen-note-label" className="listen-notes" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((s, i) => (
              <button key={s} type="button" role="radio" aria-checked={pitch === s} tabIndex={pitch === s ? 0 : -1}
                className={'listen-note' + (pitch === s ? ' is-on' : '')} aria-keyshortcuts={letterOf(s)} onClick={() => setPitch(s)}
                onKeyDown={(e) => {
                  const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                  if (!d) return;
                  e.preventDefault();
                  const next = steps[(i + d + steps.length) % steps.length];
                  setPitch(next);
                  (e.currentTarget.parentElement?.children[(i + d + steps.length) % steps.length] as HTMLElement | undefined)?.focus();
                }}>
                <span className="listen-note-main">{stepName(s, names)}</span>
                <span className="listen-note-sub" aria-hidden="true">
                  {stepSub(s, names)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="listen-label">{t('listen.addValue')}</div>
      <div className="listen-values">
        {valueButtons.map((v) => {
          const w = { value: v, dots: (dot && v !== 'sixteenth' ? 1 : 0) as 0 | 1 };
          const off = complete || fitProblem(answer[bar], meter, w, palette) !== null;
          const label = t(rest ? 'restButton.' + v : 'noteButton.' + v) + (melody && !rest ? ', ' + stepName(pitch, names) : '');
          return (
            <button key={v} type="button" className={'listen-value' + (rest ? ' is-rest' : '')} aria-disabled={off || undefined} aria-label={label}
              aria-keyshortcuts={VALUE_KEY[v]} onClick={() => add(v)}>
              <span className="music">{(rest ? REST_GLYPH : NOTE_GLYPH)[v]}</span>
              {dot && v !== 'sixteenth' && <span className="listen-value-dot" aria-hidden="true" />}
              <kbd aria-hidden="true">{VALUE_KEY[v]}</kbd>
            </button>
          );
        })}
        {palette.rests.length > 0 && (
          <button type="button" className={'listen-value listen-value--word' + (rest ? ' is-on' : '')} aria-pressed={rest} aria-keyshortcuts="R" onClick={() => setRest((x) => !x)}>
            {t('listen.rest')}
            <kbd aria-hidden="true">R</kbd>
          </button>
        )}
        {palette.dotted && (
          <button type="button" className={'listen-value listen-value--word' + (dot ? ' is-on' : '')} aria-pressed={dot} aria-keyshortcuts="." onClick={() => setDot((x) => !x)}>
            {t('listen.dot')}
            <kbd aria-hidden="true">.</kbd>
          </button>
        )}
      </div>
      <div className="muted-text listen-hint" aria-live="polite">
        {hint}
      </div>
    </div>
  );

  const footer = checked ? (
    <div className="listen-footer">
      <button type="button" className="btn btn--accent listen-next m-in" onClick={toResults}>
        {t('listen.next')}
        <Icon name="arrow" size={20} />
      </button>
    </div>
  ) : (
    <div className="listen-footer listen-footer--two">
      <button type="button" className="btn btn--outline" aria-disabled={!answer.some((b) => b.length) || undefined} aria-keyshortcuts={keys ? 'Backspace' : undefined} onClick={undo}>
        {t('listen.undo')}
      </button>
      {complete ? (
        <button type="button" className="btn btn--accent" aria-keyshortcuts={keys ? 'Enter' : undefined} onClick={doCheck}>
          {t('listen.check')}
          {keys && <kbd className="kbd kbd--on-fill">↵</kbd>}
        </button>
      ) : (
        <button type="button" className="btn btn--blocked" disabled>
          {t('listen.fillToCheck', { bar: bar + 1 })}
        </button>
      )}
    </div>
  );

  const { shown: helpShown, closing } = useLingering(help, 240);
  const sheet = helpShown && (
    <Sheet variant={desktop ? 'dialog' : 'sheet'} closing={closing} panelKey="help" labelledBy="listen-howto" maxWidth={desktop ? 520 : undefined}>
      <div className="sheet-head">
        <span className="eyebrow">{t(state.prefs.seenListenHowTo ? 'listen.howto.again' : 'listen.howto.first')}</span>
        <h2 id="listen-howto" className="sheet-title">
          {t('howto.title')}
        </h2>
      </div>
      <ol className="steps">
        {[1, 2, 3].map((n) => (
          <li key={n}>
            <span className="step-n" aria-hidden="true">
              {n}
            </span>
            <span>{t(n === 2 && notesOnly ? 'listen.howto.step2Notes' : n === 2 && melody ? 'listen.howto.step2Melody' : 'listen.howto.step' + n, { plays: LISTEN_PLAYS })}</span>
          </li>
        ))}
      </ol>
      {keys && <span className="sheet-note">{t(notesOnly ? 'listen.howto.keysNotes' : melody ? 'listen.howto.keysMelody' : 'listen.howto.keys')}</span>}
      <button type="button" data-autofocus className="btn btn--accent sheet-cta" onClick={closeHelp}>
        {t('howto.gotIt')}
        {keys && <kbd className="kbd kbd--on-fill">{t('pause.esc')}</kbd>}
      </button>
    </Sheet>
  );

  const helpButton = (
    <button type="button" className="icon-btn icon-btn--quiet" aria-haspopup="dialog" aria-keyshortcuts={keys ? '?' : undefined}
      aria-label={t('play.help')} title={t('play.help')} onClick={() => setHelp('help')}>
      <Icon name="help" size={20} strokeWidth={1.8} />
    </button>
  );

  const body = landscape ? (
    <div className="listen-cols">
      <div className="listen-col">
        {playCard}
        {answerCard}
      </div>
      <div className="listen-col">
        {paletteBlock}
        {footer}
      </div>
    </div>
  ) : (
    <>
      {playCard}
      {answerCard}
      {paletteBlock}
      {footer}
    </>
  );

  if (desktop || tablet) {
    return (
      <div className={desktop ? 'dplay' : 'tframe'}>
        <ExerciseHeader tablet={tablet} eyebrow={t('listen.title')} line={meta}
          progress={{ label: t('play.progress'), value: checked ? 1 : (ex.bars.length ? bar / ex.bars.length : 0), max: 100, now: checked ? 100 : Math.round((100 * bar) / ex.bars.length) }}>
          {helpButton}
          <Link to={exit.to} query={exit.query} className="text-link-btn" onClick={quit}>
            {t('play.quitShort')}
          </Link>
        </ExerciseHeader>
        <h1 className="sr-only">{t('listen.title')}</h1>
        <main className="page listen listen--wide">{body}</main>
        {sheet}
      </div>
    );
  }

  return (
    <ExerciseFrame className="frame--play">
      <div className="page listen">
        <div className="listen-head">
          <Link to={exit.to} query={exit.query} aria-label={t('play.quit')} className="icon-btn icon-btn--edge-sm" onClick={quit}>
            <Icon name="close" size={22} strokeWidth={2.2} />
          </Link>
          <div className="listen-head-text">
            <h1 className="listen-head-title">{t('listen.title')}</h1>
            <span className="mono-line">{meta}</span>
          </div>
          {helpButton}
        </div>
        {body}
      </div>
      {sheet}
    </ExerciseFrame>
  );
}
