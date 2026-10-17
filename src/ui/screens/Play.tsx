/**
 * Play · tap the rhythm. Phone and tablet: top bar, lesson / bar / tempo line with the combo, the staff and length
 * lane, the beat counter, the judgement and the big pad. Desktop (≥ 1100 px): the exercise header, a wide staff card,
 * the key-cap pad and four small stat cards; sheets become dialogs.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { JudgeResult, Tap } from '../../core/api';
import { findLesson } from '../../game/path';
import { LengthLane } from '../../render/LengthLane';
import { t, tx } from '../../i18n';
import { applyAudioPrefs, engine } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { BeatRow, StaffBox, TapPad } from '../components/Bits';
import { SwitchTrack } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { exerciseView, type ExerciseView } from '../exerciseView';
import { useBreakpoint, useDocTitle, useLingering } from '../hooks';
import { liveAccuracy, windowStart } from '../lib/playMath';
import { describeBars } from '../lib/notation';
import { metersLabel } from '../lib/format';
import { Link, navigate } from '../router';
import { todayIso, useStore, type Run } from '../store';
import { HowToContent, PauseContent } from './PlaySheets';
import { usePlaySession } from './playSession';

export function Play(): JSX.Element | null {
  const { state } = useStore();
  const run = state.run;
  const view = run ? exerciseView(run.exercise) : null;
  useEffect(() => {
    if (!run || !view) navigate('/setup', { replace: true });
  }, [run, view]);
  if (!run || !view) return null;
  return <PlayRun run={run} view={view} />;
}

function PlayRun({ run, view }: { run: Run; view: ExerciseView }): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';
  const ex = run.exercise;
  const lesson = run.lessonId ? findLesson(run.lessonId) : null;
  useDocTitle(t('app.docTitle', { page: t('play.docTitle') }));

  const onFinish = useCallback(
    (result: JudgeResult, taps: Tap[]) => {
      dispatch({ type: 'finish', result, taps, today: todayIso() });
    },
    [dispatch],
  );
  // Go to Results once the store holds this run's result (not before, or Results would see the old state).
  useEffect(() => {
    if (state.last?.run === run) navigate('/results', { replace: true });
  }, [state.last, run]);
  const onIntroDone = useCallback(() => dispatch({ type: 'prefs', patch: { seenHowTo: true } }), [dispatch]);
  const s = usePlaySession(run, view, state.prefs, onIntroDone, onFinish);

  // Esc closes an open sheet (Resume / Got it); ? swaps to How to play.
  useEffect(() => {
    if (!s.sheet) return;
    const onKey = (e: KeyboardEvent): void => {
      // Holding Esc must not pause and then, on auto-repeat, resume straight away.
      if (e.repeat) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        s.closeSheet();
      } else if (e.key === '?' && s.sheet !== 'help') {
        e.preventDefault();
        s.openSheet('help');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.sheet, s.closeSheet, s.openSheet]);

  const bars = ex.bars.length;
  const total = view.timeline.totalSeconds;
  const tg = Math.max(0, s.frame.tg);
  const curBar = Math.min(bars - 1, Math.floor(tg / view.barSeconds));
  const progress = total > 0 ? Math.min(1, tg / total) : 0;
  const where = lesson ? t('play.lesson', { id: lesson.lesson.id }) : t('play.free');
  const barText = t('play.barOf', { bar: curBar + 1, total: bars });

  const perRow = desktop ? 4 : 2;
  const from = windowStart(curBar, perRow, 2, bars);
  const shownBars = useMemo(() => view.bars.slice(from, from + perRow * 2), [view.bars, from, perRow]);
  const rhythm = useMemo(() => describeBars(shownBars, ex.meter.id, from + 1), [shownBars, ex.meter.id, from]);
  const staff = (
    <StaffBox bars={shownBars} meter={ex.meter} barsPerRow={perRow} marks={s.marks} cursor={s.frame.cursor} label={rhythm} />
  );
  const lane = (
    <LengthLane timeline={view.timeline} barTicks={ex.meter.barTicks} barsPerRow={4} taps={s.taps} result={s.liveResult}
      now={s.phase === 'running' && s.frame.tg >= 0 ? s.frame.tg : null} label={t('results.laneLabel')} />
  );
  const laneHead = (
    <div className="lane-head">
      <span>
        <b>{t('play.length')}</b> · {t(desktop ? 'play.lengthLegendLong' : 'play.lengthLegend')}
      </span>
      <span>{bars > 1 ? t('play.barsRange', { from: 1, to: bars }) : t('play.barsOne', { from: 1 })}</span>
    </div>
  );

  const beat = s.frame.beat;
  const beatLabel = beat.inBar === null
    ? t('play.beats', { total: ex.meter.beatsPerBar })
    : t(beat.countIn ? 'play.countIn' : 'play.countingBeat', { beat: beat.inBar + 1, total: ex.meter.beatsPerBar });
  const fbClass = 'judgement' + (s.feedback ? ' tone-' + s.feedback.tone : '');
  const fbText = s.phase === 'running' && s.feedback ? t(s.feedback.key) : ' ';

  const quit = (): void => {
    s.stop();
    navigate('/');
  };
  const toSettings = (): void => {
    s.stop();
    dispatch({ type: 'settings', settings: ex.settings });
    navigate('/setup');
  };

  const { shown: sheetShown, closing } = useLingering(s.sheet, 240);
  const sheet = sheetShown && (
    <Sheet variant={desktop ? 'dialog' : 'sheet'} closing={closing} panelKey={sheetShown} labelledBy={sheetShown === 'help' ? 'howto' : 'pausetitle'}
      maxWidth={desktop ? (sheetShown === 'help' ? 520 : 440) : undefined}>
      {sheetShown === 'help' ? (
        <HowToContent eyebrow={t(s.phase === 'intro' ? 'howto.firstTime' : 'howto.paused')} desktop={desktop} onDone={s.closeSheet} />
      ) : (
        <PauseContent context={t('pause.context', { where, bar: curBar + 1, total: bars })} desktop={desktop} lesson={!!lesson}
          onResume={s.closeSheet} onRestart={s.restart} onHelp={() => s.openSheet('help')} onSettings={toSettings} onQuit={quit} />
      )}
    </Sheet>
  );

  if (desktop) {
    const metronomeOn = state.prefs.metronomeOn;
    const toggleMetronome = (): void => {
      const prefs = { ...state.prefs, metronomeOn: !metronomeOn };
      dispatch({ type: 'prefs', patch: { metronomeOn: !metronomeOn } });
      applyAudioPrefs(prefs, engine());
    };
    return (
      <div className="dplay">
        <header className="dplay-head">
          <div className="brand brand--static">{t('app.name')}</div>
          <div className="dplay-title">
            <span className="eyebrow">{lesson ? t('play.lessonTitle', { id: lesson.lesson.id, title: tx(lesson.lesson.title) }) : t('play.free')}</span>
            <span className="mono-line">
              {barText} · {metersLabel([ex.meter.id])} · <span className="music">𝅘𝅥</span> {t('play.beatEquals', { bpm: ex.tempo })}
            </span>
          </div>
          <div className="progress progress--grow" role="progressbar" aria-label={t('play.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div style={{ width: progress * 100 + '%' }} />
          </div>
          <div className="dplay-actions">
            <button type="button" className="icon-btn icon-btn--quiet" aria-haspopup="dialog" aria-keyshortcuts="?" aria-label={t('play.helpShortcut')} title={t('play.helpTitle')}
              onClick={() => s.openSheet('help')}>
              <Icon name="help" size={20} strokeWidth={1.8} />
            </button>
            <button type="button" className="btn-outline" aria-haspopup="dialog" aria-keyshortcuts="Escape" title={t('play.pauseTitle')} onClick={() => s.openSheet('pause')}>
              <Icon name="pause" size={16} />
              {t('play.pause')} <kbd className="kbd kbd--bare">{t('pause.esc')}</kbd>
            </button>
            <Link to="/" className="text-link-btn" onClick={() => s.stop()}>
              {t('play.quitShort')}
            </Link>
          </div>
        </header>
        <h1 className="sr-only">{t('play.heading')}</h1>
        <main className="dplay-main">
          <div className="card dplay-staff">
            <div className="dplay-staff-inner">
              {staff}
              {laneHead}
              {lane}
            </div>
          </div>
          <div className="dplay-row">
            <div className="dpad" ref={s.setPad as (el: HTMLDivElement | null) => void}>
              <div aria-live="polite" className={fbClass}>
                {fbText}
              </div>
              <button type="button" className={'keycap' + (s.frame.held ? ' is-held' : '')} aria-label={t('play.pad')}>
                {t('play.padLabel')}
                <span className="keycap-bar" aria-hidden="true">
                  <span style={{ width: s.frame.ring * 100 + '%' }} />
                </span>
              </button>
            </div>
            <div className="dstats">
              <div className="card stat">
                <span className="label">{t('play.count')}</span>
                <div className="dbeats" role="img" aria-label={beatLabel}>
                  {Array.from({ length: ex.meter.beatsPerBar }, (_, i) => (
                    <span key={i} aria-hidden="true" className={i === beat.inBar ? 'is-on' : ''}>
                      {i + 1}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card stat">
                <span className="label">{t('play.comboTitle')}</span>
                <span className="stat-big">{t('play.comboValue', { count: s.combo })}</span>
              </div>
              <div className="card stat">
                <span className="label">{t('play.soFar')}</span>
                <span className="stat-mono">{t('common.percent', { value: liveAccuracy(s.judged, s.extraTaps) })}</span>
              </div>
              <div className="card stat">
                <span className="label" id="dmetro">
                  {t('play.metronome')}
                </span>
                <button type="button" role="switch" aria-checked={metronomeOn} aria-labelledby="dmetro" className="stat-switch" onClick={toggleMetronome}>
                  <SwitchTrack on={metronomeOn} />
                  {t(metronomeOn ? 'play.on' : 'play.off')}
                </button>
              </div>
            </div>
          </div>
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
          <Link to="/" aria-label={t('play.quit')} className="icon-btn icon-btn--edge-sm" onClick={() => s.stop()}>
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

        <div className="card play-staff">
          {staff}
          {laneHead}
          {lane}
        </div>

        <BeatRow beats={ex.meter.beatsPerBar} active={beat.inBar} label={beatLabel} />

        <div aria-live="polite" className={fbClass + ' judgement--phone'}>
          {fbText}
        </div>
        <TapPad ref={s.setPad as (el: HTMLButtonElement | null) => void} progress={s.frame.ring} held={s.frame.held} />
      </div>
      {sheet}
    </ExerciseFrame>
  );
}
