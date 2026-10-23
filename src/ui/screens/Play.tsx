/**
 * Play · tap the rhythm. Phone: top bar, lesson / bar / tempo line with the combo, the staff and length lane, the beat
 * counter, the judgement and the big pad. Tablet: the exercise header, a staff card across the width, the count and
 * combo cards, the judgement and the big pad. Desktop (≥ 1100 px): the exercise header, a wide staff card, the key-cap
 * pad and four small stat cards; sheets become dialogs. Echo: a listen phase first (Echo.tsx), then the same screen
 * with the staff and lane swapped for the tap-back card.
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { JudgeResult, Tap } from '../../core/api';
import { findLesson } from '../../game/path';
import { pathLessonOf } from '../../game/tracks';
import type { Prefs } from '../../game/storage';
import { LengthLane } from '../../render/LengthLane';
import { t, tx } from '../../i18n';
import { ExerciseFrame } from '../components/AppShell';
import { AnalogMetronome, BeatRow, StaffBox, TapPad } from '../components/Bits';
import { ExerciseHeader } from '../components/ExerciseHeader';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { exerciseView, type ExerciseView } from '../exerciseView';
import { SHORTER_PHONE, useBreakpoint, useDocTitle, useExerciseLayout, useKeyboardHints, useLingering, useMediaQuery, useReducedMotion } from '../hooks';
import { useLearnReturn } from '../lib/learnReturn';
import { liveAccuracy, windowStart } from '../lib/playMath';
import { describeBars } from '../lib/notation';
import { metersLabel } from '../lib/format';
import { Link, navigate } from '../router';
import { todayIso, useStore, type Run } from '../store';
import { ECHO_PLAYS, EchoCard, echoWhere, EchoListen } from './Echo';
import { PlayCountRow, PlayDeskRow, type CountProps } from './PlayParts';
import { HowToContent, IntroContent, PauseContent, ReadyContent, useListen } from './PlaySheets';
import { howToEyebrow, usePlaySession } from './playSession';

/** The staff's size on the shortest phone screens: two rows of notes take 139 px instead of 174. */
const STAFF_SHORTER = 0.8;

export function Play(): JSX.Element | null {
  const { state } = useStore();
  const run = state.run;
  const view = run ? exerciseView(run.exercise) : null;
  useEffect(() => {
    if (!run || !view) navigate('/setup', { replace: true });
  }, [run, view]);
  if (!run || !view) return null;
  if (run.exercise.settings.mode === 'echo') return <EchoPlay run={run} view={view} />;
  return <PlayRun run={run} view={view} />;
}

/** Where the run comes from: "Lesson 2.3", "Daily challenge", "Free practice". */
function runWhere(run: Run): string {
  if (run.lessonId) return t('play.lesson', { id: pathLessonOf('rhythm', run.lessonId)?.id ?? run.lessonId });
  if (run.daily) return t('home.dailyTitle');
  return t('play.free');
}

/** Echo: listen (up to ECHO_PLAYS times), then tap it back with the notation hidden; Hear again goes back to listening. */
function EchoPlay({ run, view }: { run: Run; view: ExerciseView }): JSX.Element {
  const { dispatch } = useStore();
  const [tapping, setTapping] = useState(false);
  const [plays, setPlays] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const onPlayed = useCallback(() => setPlays((n) => n + 1), []);
  const where = echoWhere(runWhere(run));
  // A fresh run object for each attempt: Play starts it straight away (the tap on Tap it back is the gesture).
  const tapBack = (): void => {
    dispatch({ type: 'start', run: { exercise: run.exercise, lessonId: run.lessonId, daily: run.daily } });
    setTapping(true);
  };
  const hearAgain = (): void => {
    setAutoPlay(true);
    setTapping(false);
  };
  if (tapping) return <PlayRun run={run} view={view} echo={{ playsLeft: ECHO_PLAYS - plays, onHearAgain: hearAgain }} />;
  return <EchoListen run={run} view={view} where={where} playsLeft={ECHO_PLAYS - plays} autoPlay={autoPlay} onPlayed={onPlayed} onTapBack={tapBack} />;
}

interface EchoProps {
  playsLeft: number;
  onHearAgain(): void;
}

function PlayRun({ run, view, echo }: { run: Run; view: ExerciseView; echo?: EchoProps }): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';
  // A phone on its side is tablet-wide but keeps the phone layout (two columns, in the CSS).
  const tablet = useExerciseLayout() === 'tablet';
  // Tablet and desktop: the exercise header, four bars a row and the long lane legend.
  const wide = desktop || tablet;
  const keys = useKeyboardHints(bp);
  const still = useReducedMotion();
  // A phone browser on a small phone (375 × 553): the staff is drawn smaller so the pad still fits (DESIGN.md §9).
  const shorter = useMediaQuery(SHORTER_PHONE);
  const ex = run.exercise;
  const lesson = run.lessonId ? findLesson(run.lessonId) : null;
  // Started from a Learn section (?from=1.1): Quit returns there, and Results and the setup keep it.
  const { back, carry } = useLearnReturn();
  const exit = back?.to ?? '/';
  useDocTitle(t('app.docTitle', { page: t('play.docTitle') }));

  const onFinish = useCallback(
    (result: JudgeResult, taps: Tap[]) => {
      dispatch({ type: 'finish', result, taps, today: todayIso() });
    },
    [dispatch],
  );
  // Go to Results once the store holds this run's result (not before, or Results would see the old state).
  useEffect(() => {
    if (state.last?.run === run) navigate('/results', { replace: true, query: carry });
  }, [state.last, run, carry]);
  const onSeen = useCallback((patch: Partial<Prefs>) => dispatch({ type: 'prefs', patch }), [dispatch]);
  // Echo has its own How to play in the listen phase, so tapping starts straight away.
  const isEcho = !!echo;
  const prefs = useMemo(() => (isEcho ? { ...state.prefs, seenHowTo: true, seenHold: true } : state.prefs), [isEcho, state.prefs]);
  // A lesson other than the one finished last waits on Ready, so its rhythm can be read first; Retry and Next exercise
  // of the same lesson start straight away.
  const [fresh] = useState(() => !isEcho && !!run.lessonId && !!state.last && state.last.run.lessonId !== run.lessonId);
  const s = usePlaySession(run, view, prefs, onSeen, onFinish, fresh);
  const listen = useListen(ex, view.timeline, state.prefs);
  // Every way out of a sheet: Start's count-in takes the audio over from the intro sheet's Listen.
  const closeSheet = (): void => {
    listen.halt();
    s.closeSheet();
  };
  const help = (): void => {
    listen.stop();
    s.openSheet('help');
  };

  // Esc closes an open sheet (Resume / Got it / Start); ? swaps to How to play. Attached again on each render, which
  // is rare while a sheet is open, so it calls the current closeSheet and help.
  useEffect(() => {
    if (!s.sheet) return;
    const onKey = (e: KeyboardEvent): void => {
      // Holding Esc must not pause and then, on auto-repeat, resume straight away.
      if (e.repeat) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Esc may not start audio (it is not a user-activation key), so it does not start or resume from here.
        if (!s.needsTap) closeSheet();
      } else if (e.key === '?' && s.sheet !== 'help') {
        e.preventDefault();
        help();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const bars = ex.bars.length;
  const total = view.timeline.totalSeconds;
  const tg = Math.max(0, s.frame.tg);
  const curBar = Math.min(bars - 1, Math.floor(tg / view.barSeconds));
  const progress = total > 0 ? Math.min(1, tg / total) : 0;
  const where = echo ? echoWhere(runWhere(run)) : runWhere(run);
  // The count-in does not look like bar 1 (§3.1): the line says Count-in until the music's first beat.
  const countIn = s.frame.countIn;
  const barText = echo ? t('play.echo.tapBack') : countIn ? t('play.countingIn') : t('play.barOf', { bar: curBar + 1, total: bars });

  const perRow = wide ? 4 : 2;
  const from = windowStart(curBar, perRow, 2, bars);
  const shownBars = useMemo(() => view.bars.slice(from, from + perRow * 2), [view.bars, from, perRow]);
  const rhythm = useMemo(() => describeBars(shownBars, ex.meter.id, from + 1), [shownBars, ex.meter.id, from]);
  const echoCard = echo && (
    <EchoCard taps={s.taps.length} playsLeft={echo.playsLeft} onDone={s.skip}
      onHearAgain={() => {
        s.stop();
        echo.onHearAgain();
      }} />
  );
  const staff = (
    <StaffBox bars={shownBars} meter={ex.meter} barsPerRow={perRow} marks={s.marks} cursor={s.frame.cursor} label={rhythm} scale={shorter ? STAFF_SHORTER : 1} />
  );
  const lane = (
    <LengthLane timeline={view.timeline} barTicks={ex.meter.barTicks} barsPerRow={4} taps={s.taps} result={s.liveResult}
      now={s.phase === 'running' && s.frame.tg >= 0 ? s.frame.tg : null} label={t('results.laneLabel')} hold={ex.settings.hold} live />
  );
  const laneHead = (
    <div className="lane-head">
      {ex.settings.hold ? (
        <span>
          <b>{t('play.length')}</b> · {t(wide ? 'play.lengthLegendLong' : 'play.lengthLegend')}
        </span>
      ) : (
        <span>
          <b>{t('play.tapTiming')}</b> · {t(wide ? 'play.tapLegendLong' : 'play.tapLegend')}
        </span>
      )}
      <span>{bars > 1 ? t('play.barsRange', { from: 1, to: bars }) : t('play.barsOne', { from: 1 })}</span>
    </div>
  );

  const soFar = liveAccuracy(s.judged, s.extraTaps);
  const beat = s.frame.beat;
  const beatLabel = beat.inBar === null
    ? t('play.beats', { total: ex.meter.beatsPerBar })
    : t(beat.countIn ? 'play.countIn' : 'play.countingBeat', { beat: beat.inBar + 1, total: ex.meter.beatsPerBar });
  const analog = state.prefs.metronomeLook === 'analog' && (
    <AnalogMetronome beats={ex.meter.beatsPerBar} active={beat.inBar} at={s.frame.beats} tempo={ex.tempo} label={beatLabel} still={still} />
  );
  const fbClass = 'judgement' + (s.feedback ? ' tone-' + s.feedback.tone : '');
  const fbText = s.phase === 'running' && s.feedback ? t(s.feedback.key) : echo && s.phase === 'running' ? t('play.echo.yourTurnCue') : ' ';

  // Quit swaps Play for Home (or the Learn section) in the history, so Back does not walk into the exercise again.
  const quit = (): void => {
    s.stop();
    navigate(exit, { replace: true, query: back?.query });
  };
  const quitLink = (e: MouseEvent): void => {
    e.preventDefault();
    quit();
  };
  const toSettings = (): void => {
    s.stop();
    dispatch({ type: 'settings', settings: ex.settings });
    navigate('/setup', { query: carry });
  };

  const { shown: sheetShown, closing } = useLingering(s.sheet, 240);
  // How to play says why it opened; opened with ? before the start when it was not due, it names the run.
  const howToKey = howToEyebrow(s.phase, s.intro);
  const sheet = sheetShown && (
    <Sheet variant={desktop ? 'dialog' : 'sheet'} closing={closing} panelKey={sheetShown}
      labelledBy={sheetShown === 'help' ? 'howto' : sheetShown === 'new' ? 'introtitle' : sheetShown === 'ready' ? 'readytitle' : 'pausetitle'}
      maxWidth={desktop ? (sheetShown === 'help' ? 520 : 440) : undefined} low={sheetShown === 'new' || sheetShown === 'ready'}>
      {sheetShown === 'help' ? (
        <HowToContent eyebrow={echo ? t('howto.echo.eyebrow') : howToKey ? t(howToKey) : where} desktop={keys} hold={ex.settings.hold} echo={!!echo}
          onDone={closeSheet} />
      ) : sheetShown === 'new' ? (
        <IntroContent title={lesson ? tx(lesson.lesson.title) : where} intros={s.intros} listen={listen} onStart={closeSheet} />
      ) : sheetShown === 'ready' ? (
        <ReadyContent context={where} onStart={closeSheet}
          detail={t('ready.detail', { bars: t('common.bars', { count: bars }), meter: metersLabel([ex.meter.id]), bpm: ex.tempo })} />
      ) : (
        <PauseContent context={t('pause.context', { where, bar: curBar + 1, total: bars })} desktop={keys} lesson={!!lesson} interrupted={s.interrupted}
          onResume={closeSheet} onRestart={s.restart} onHelp={help} onSettings={toSettings} onQuit={quit} />
      )}
    </Sheet>
  );

  const title = lesson && !echo ? t('play.lessonTitle', { id: pathLessonOf('rhythm', lesson.lesson.id)?.id ?? lesson.lesson.id, title: tx(lesson.lesson.title) }) : where;
  const count: CountProps = { beats: ex.meter.beatsPerBar, beat, label: beatLabel, countIn, analog };
  const staffContent = echoCard || (
    <>
      {staff}
      {laneHead}
      {lane}
    </>
  );
  // Tablet and desktop: the exercise header. The keyboard shortcuts belong to the desktop layout (as before, also on a
  // touch screen at desktop width); a tablet names the buttons as the phone does.
  const header = wide && (
    <ExerciseHeader tablet={tablet} eyebrow={title}
      line={
        <>
          {barText} · {metersLabel([ex.meter.id])} · <span className="music">𝅘𝅥</span> {t('play.beatEquals', { bpm: ex.tempo })}
        </>
      }
      progress={{ label: t('play.progress'), value: progress, max: 100, now: Math.round(progress * 100) }}>
      <button type="button" className="icon-btn icon-btn--quiet" aria-haspopup="dialog" aria-keyshortcuts={desktop ? '?' : undefined}
        aria-label={t(desktop ? 'play.helpShortcut' : 'play.help')} title={t(desktop ? 'play.helpTitle' : 'play.help')} onClick={() => s.openSheet('help')}>
        <Icon name="help" size={20} strokeWidth={1.8} />
      </button>
      <button type="button" className="btn-outline" aria-haspopup="dialog" aria-keyshortcuts={desktop ? 'Escape' : undefined} title={desktop ? t('play.pauseTitle') : undefined}
        onClick={() => s.openSheet('pause')}>
        <Icon name="pause" size={16} />
        {t('play.pause')} {keys && <kbd className="kbd kbd--bare">{t('pause.esc')}</kbd>}
      </button>
      <Link to={exit} query={back?.query} className="text-link-btn" onClick={quitLink}>
        {t('play.quitShort')}
      </Link>
    </ExerciseHeader>
  );
  const skipLink = !echo && (
    <button type="button" className="skip-link" onClick={s.skip} disabled={s.phase === 'intro'}>
      {t('play.skip')}
    </button>
  );

  if (desktop) {
    return (
      <div className="dplay">
        {header}
        <h1 className="sr-only">{t('play.heading')}</h1>
        <main className="dplay-main">
          <div className="card dplay-staff">
            <div className="dplay-staff-inner">{staffContent}</div>
          </div>
          <PlayDeskRow count={count} combo={s.combo} soFar={soFar} judgement={fbText} judgementClass={fbClass} held={s.frame.held} ring={s.frame.ring}
            padRef={s.setPad as (el: HTMLDivElement | null) => void} />
        </main>
        {sheet}
      </div>
    );
  }

  // Tablet (App design canvas, PlayTablet): the header, the staff card across the width, the count and combo, then the
  // big pad takes the height that is left.
  if (tablet) {
    return (
      <div className="tframe">
        {header}
        <h1 className="sr-only">{t('play.heading')}</h1>
        <main className="page tplay-main">
          <div className={'card tplay-staff' + (echo ? ' tplay-staff--echo' : '')}>
            <div className="dplay-staff-inner">{staffContent}</div>
          </div>
          <PlayCountRow count={count} combo={s.combo} />
          <div aria-live="polite" className={fbClass + ' judgement--tablet'}>
            {fbText}
          </div>
          <TapPad ref={s.setPad as (el: HTMLButtonElement | null) => void} progress={s.frame.ring} held={s.frame.held} />
          {skipLink}
        </main>
        {sheet}
      </div>
    );
  }

  return (
    <ExerciseFrame className="frame--play">
      <div className="page play">
        <h1 className="sr-only">{t('play.heading')}</h1>
        <div className="play-top">
          <Link to={exit} query={back?.query} aria-label={t('play.quit')} className="icon-btn icon-btn--edge-sm" onClick={quitLink}>
            <Icon name="close" size={22} strokeWidth={2.2} />
          </Link>
          <div className="progress" role="progressbar" aria-label={t('play.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div style={{ width: progress * 100 + '%' }} />
          </div>
          <button type="button" className="icon-btn icon-btn--quiet icon-btn--narrow" aria-label={t('play.help')} title={t('play.help')} aria-haspopup="dialog"
            onClick={() => s.openSheet('help')}>
            <Icon name="help" size={20} strokeWidth={1.8} />
          </button>
          <button type="button" className="icon-btn icon-btn--edge-sm-r" aria-label={t('play.pause')} aria-haspopup="dialog" aria-expanded={s.sheet === 'pause'}
            onClick={() => s.openSheet('pause')}>
            <Icon name="pause" size={22} />
          </button>
        </div>

        <div className="play-info">
          <div className="play-info-left">
            <span className="eyebrow">{where}</span>
            <span className="mono-line mono-line--big">
              {barText} · <span className="music">𝅘𝅥</span> {t('play.beatEquals', { bpm: ex.tempo })}
            </span>
          </div>
          <div className="play-combo">
            <div className="play-combo-n">{t('play.comboValue', { count: s.combo })}</div>
            <div className="muted-small">{t('play.combo')}</div>
          </div>
        </div>

        <div className={'card play-staff' + (echo ? ' play-staff--echo' : '')}>{staffContent}</div>

        {analog || <BeatRow beats={ex.meter.beatsPerBar} active={beat.inBar} countIn={beat.countIn} label={beatLabel} />}

        <div aria-live="polite" className={fbClass + ' judgement--phone'}>
          {fbText}
        </div>
        <TapPad ref={s.setPad as (el: HTMLButtonElement | null) => void} progress={s.frame.ring} held={s.frame.held} />
        {skipLink}
      </div>
      {sheet}
    </ExerciseFrame>
  );
}
