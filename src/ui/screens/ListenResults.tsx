/**
 * Listen results (DESIGN.md §3.2, Scoring and Results): Results without the timing lane and the judgement counts. The
 * stars, the beats right and the XP, the plays badge, the exercise with each note right or wrong and, under a wrong bar,
 * what was written (Yours); a tip; Listen, Practice settings and Copy code; Retry and Next (Try again under 2 stars).
 */
import { useEffect, useMemo, useState } from 'react';
import { encodeCode, MAX_STARS, SHOWN_STARS } from '../../core/api';
import { answerNotation, LISTEN_PLAYS, stepMidi } from '../../core/dictation';
import { UNLOCK_STARS } from '../../game/track';
import { levelInfo } from '../../game/xp';
import type { NoteMark } from '../../render/Staff';
import { t } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { StaffBox } from '../components/Bits';
import { Icon } from '../components/Icon';
import { AchievementBadges, CodeCopy, LevelUpContent } from '../components/Reward';
import { Sheet } from '../components/Sheet';
import { exerciseView } from '../exerciseView';
import { useBreakpoint, useDocTitle, useLingering } from '../hooks';
import { metersLabel, starsLabel, wholePercent } from '../lib/format';
import { listenTip } from '../lib/listenText';
import { useLearnReturn } from '../lib/learnReturn';
import { describeBars } from '../lib/notation';
import { Link, navigate } from '../router';
import { runSetup, useStore, type ListenLast } from '../store';
import { useReplay } from './start';

const levelUpShown = new WeakSet<ListenLast>();

export function ListenResults(): JSX.Element | null {
  const { state, dispatch } = useStore();
  const replay = useReplay();
  const bp = useBreakpoint();
  const { back, carry } = useLearnReturn();
  const [playing, setPlaying] = useState(false);
  useDocTitle(t('app.docTitle', { page: t('results.docTitle') }));
  const last = state.listenLast ?? null;
  const view = last ? exerciseView(last.run.exercise) : null;

  const leveledUp = !!last && levelInfo(last.reward.xpAfter).level > levelInfo(last.reward.xpBefore).level;
  const [levelUp, setLevelUp] = useState<'open' | null>(() => (last && leveledUp && !levelUpShown.has(last) ? 'open' : null));
  useEffect(() => {
    if (last && levelUp) levelUpShown.add(last);
  }, [last, levelUp]);
  const { shown: levelUpSheet, closing } = useLingering(levelUp, 240);
  useEffect(() => {
    if (!levelUp) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLevelUp(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [levelUp]);

  useEffect(() => {
    if (!last || !view) navigate('/', { replace: true });
  }, [last, view]);
  useEffect(() => {
    if (!playing || !view) return;
    const id = window.setTimeout(() => setPlaying(false), (view.timeline.totalSeconds + 0.6) * 1000);
    return () => window.clearTimeout(id);
  }, [playing, view]);
  useEffect(() => () => engine().stop(), []);

  const marks = useMemo(() => {
    const m: Record<number, NoteMark> = {};
    last?.check.onsetsRight.forEach((ok, i) => (m[i] = ok ? 'perfect' : 'miss'));
    return m;
  }, [last]);
  const yours = useMemo(() => (last ? answerNotation(last.answer, last.run.exercise.meter) : []), [last]);

  if (!last || !view) return null;
  const { run, check, reward } = last;
  const ex = run.exercise;
  const melody = !!ex.pitches;
  const clef = melody ? ('treble' as const) : undefined;
  const again = last.stars < UNLOCK_STARS;
  const fourth = last.stars === MAX_STARS;
  const code = encodeCode(ex.settings, ex.seed);
  const wide = bp !== 'phone';
  const perRow = bp === 'desktop' ? 4 : 2;
  const tip = listenTip(ex, last.answer, check, state.prefs.noteNames);
  const wrongBars = check.barsRight.map((ok, i) => (ok ? -1 : i)).filter((i) => i >= 0);
  const achieved = leveledUp ? [] : reward.achievements;

  const listen = (): void => {
    const eng = engine();
    if (playing) {
      eng.stop();
      setPlaying(false);
      return;
    }
    unlockAudio();
    applyAudioPrefs(state.prefs, eng);
    eng.start({
      timeline: view.timeline,
      meter: ex.meter,
      tempo: ex.tempo,
      countInBars: 0,
      metronome: ex.settings.metronome,
      playRhythm: true,
      leadIn: 0.15,
      ...(ex.pitches ? { melody: ex.pitches.map(stepMidi) } : {}),
    });
    setPlaying(true);
  };
  const toSettings = (): void => {
    engine().stop();
    dispatch({ type: 'settings', settings: runSetup(run) });
  };

  const score = (
    <>
      <div className="score">
        <div className={'score-stars' + (fourth ? ' score-stars--bonus' : '')} role="img" aria-label={starsLabel(last.stars)}>
          <span className="score-stars-row">
            {Array.from({ length: SHOWN_STARS }, (_, i) => (
              <span key={i} aria-hidden="true" className={i < last.stars ? 'is-on' : ''}>
                ★
              </span>
            ))}
          </span>
          {fourth && (
            <span aria-hidden="true" className="is-on is-bonus">
              ★
            </span>
          )}
        </div>
        <div className="score-pct">{t('results.accuracy', { value: wholePercent(last.accuracy) })}</div>
        <div className="muted-text score-sub">
          {t('listen.results.summary')} · <b className="tone-ink">{t('xp.earned', { count: reward.xp })}</b>
        </div>
      </div>
      <div className="badges">
        <span className="badge">
          <Icon name="speaker" size={15} />
          {t('listen.results.plays', { count: last.plays, total: LISTEN_PLAYS })}
        </span>
        <AchievementBadges ids={achieved} />
      </div>
    </>
  );

  const review = (
    <>
      <div className="card results-staff listen-results-staff">
        <div className="listen-results-head">
          <b>{t(melody ? 'listen.results.theMelody' : 'listen.results.theRhythm')}</b>
          <span className="mono-line">{t('listen.meta', { meter: metersLabel([ex.meter.id]), bars: t('common.bars', { count: ex.bars.length }) })}</span>
        </div>
        <StaffBox bars={view.bars} meter={ex.meter} barsPerRow={perRow} marks={marks} clef={clef} shrinkToFit
          label={t('listen.heardLabel', { rhythm: describeBars(view.bars, ex.meter.id) })} />
        {wrongBars.length > 0 && (
          <div className="listen-yours">
            <span className="listen-label">{t('listen.results.yours')}</span>
            {wrongBars.map((b) => (
              <div key={b} className="listen-yours-bar">
                <span className="muted-text">{t('listen.results.barN', { bar: b + 1 })}</span>
                <StaffBox bars={[yours[b]]} meter={ex.meter} barsPerRow={1} clef={clef} shrinkToFit
                  label={t('listen.answerLabel', { rhythm: describeBars([yours[b]], ex.meter.id) })} />
              </div>
            ))}
          </div>
        )}
        <div className="listen-status">
          <b>{t('listen.results.beatsRight', { right: check.beatsRight, total: check.beats.length })}</b>
        </div>
      </div>
      <div className="tip">
        <Icon name={check.beatsRight === check.beats.length ? 'check' : 'info'} size={20} />
        <div className="tip-body">
          <span>{tip}</span>
        </div>
      </div>
    </>
  );

  const actions = (
    <div className="results-actions">
      <div className="results-secondary">
        <button type="button" className={'ghost-btn listen-btn' + (playing ? ' is-on' : '')} aria-pressed={playing} onClick={listen}>
          {playing ? <Icon name="stop" size={18} className="m-in" /> : <Icon name="speaker" size={18} />}
          {t(playing ? 'results.playing' : 'results.listen')}
        </button>
        <Link to="/setup" query={carry} className="ghost-btn" onClick={toSettings}>
          <Icon name="sliders" size={18} />
          {t('results.settings')}
        </Link>
        {wide && <CodeCopy code={code} className="ghost-btn" />}
      </div>
      <div className={'results-main' + (again ? ' results-main--again' : '')}>
        {again ? (
          <>
            <button type="button" className="btn btn--outline" onClick={() => replay(run, false, carry)}>
              {t('results.newExercise')}
            </button>
            <button type="button" className="btn btn--accent" onClick={() => replay(run, true, carry)}>
              {t('results.tryAgain')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--outline" onClick={() => replay(run, true, carry)}>
              {t('results.retry')}
            </button>
            <button type="button" className="btn btn--accent" onClick={() => replay(run, false, carry)}>
              {t('results.next')}
            </button>
          </>
        )}
      </div>
      {!wide && <CodeCopy code={code} className="ghost-btn copy-link" />}
    </div>
  );

  return (
    <ExerciseFrame className="frame--results" wide>
      <div className="page results no-scrollbar">
        <div className="screen-head">
          <Link to={back?.to ?? '/'} query={back?.query} leaves aria-label={back?.label ?? t('results.backHome')} className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t(melody ? 'listen.results.titleMelody' : 'listen.results.title')}</h1>
          </div>
        </div>
        {wide ? (
          <div className="wide">
            <div className="wide-main">{review}</div>
            <div className="wide-side results-side">
              {score}
              {actions}
            </div>
          </div>
        ) : (
          <>
            {score}
            {review}
            {actions}
          </>
        )}
      </div>
      {levelUpSheet && (
        <Sheet variant={bp === 'desktop' ? 'dialog' : 'sheet'} closing={closing} panelKey="levelup" labelledBy="leveluptitle" maxWidth={bp === 'desktop' ? 460 : undefined}>
          <LevelUpContent xpBefore={reward.xpBefore} xpAfter={reward.xpAfter} achievements={reward.achievements} best={reward.best} onDone={() => setLevelUp(null)} />
        </Sheet>
      )}
    </ExerciseFrame>
  );
}
