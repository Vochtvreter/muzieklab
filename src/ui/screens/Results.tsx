/**
 * Results (DESIGN.md §6.4): stars, accuracy and XP, the badges (the daily challenge's, an achievement earned without a
 * level), counts, holds, the judged staff (in Echo the notation's reveal), the timing and length lane, a tip (with
 * Calibrate when the tip is about latency, or a line once the player has calibrated since), the actions with Copy code,
 * and the level-up sheet.
 */
import { useEffect, useMemo, useState } from 'react';
import { coachTip, DIAMOND, encodeCode, MAX_STARS, SHOWN_STARS, type Judgement } from '../../core/api';
import { UNLOCK_STARS } from '../../game/track';
import { findPathLesson, pathLessonOf } from '../../game/tracks';
import { levelInfo } from '../../game/xp';
import type { NoteMark } from '../../render/Staff';
import { LengthLane } from '../../render/LengthLane';
import { dateParts, t, tipText, tx } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { StaffBox } from '../components/Bits';
import { Icon } from '../components/Icon';
import { AchievementBadges, CodeCopy, LevelUpContent, OutcomeBadge } from '../components/Reward';
import { Sheet } from '../components/Sheet';
import { exerciseView } from '../exerciseView';
import { useBreakpoint, useDocTitle, useLingering } from '../hooks';
import { starsLabel } from '../lib/format';
import { calibrateQuery, useLearnReturn } from '../lib/learnReturn';
import { lessonOutcome } from '../lib/lessons';
import { describeBars } from '../lib/notation';
import { Link, navigate } from '../router';
import { runSetup, useStore, type LastResult } from '../store';
import { useReplay, useStartPathLesson } from './start';

const COUNTS: { key: Judgement | 'extra'; tone: string }[] = [
  { key: 'perfect', tone: 'good' },
  { key: 'great', tone: 'good' },
  { key: 'good', tone: 'gold' },
  { key: 'miss', tone: 'miss' },
  { key: 'extra', tone: 'ink' },
];

/** Results whose level-up sheet was shown already: coming back to the screen does not show it again. */
const levelUpShown = new WeakSet<LastResult>();

export function Results(): JSX.Element | null {
  const { state, dispatch } = useStore();
  const replay = useReplay();
  const startLesson = useStartPathLesson();
  const bp = useBreakpoint();
  const [playing, setPlaying] = useState(false);
  // An exercise started from a Learn section (?from=1.1): Back returns there; Retry, Next and the setup keep it.
  const { back, carry } = useLearnReturn();
  useDocTitle(t('app.docTitle', { page: t('results.docTitle') }));
  const last = state.last;
  const view = last ? exerciseView(last.run.exercise) : null;
  // A lesson: what this run means for the path (a lesson opened, or the stars still needed), and where Next goes.
  const outcome = last?.run.lessonId ? lessonOutcome(state.progress, last.run.lessonId, last.lessonStarsBefore) : null;
  // Next lesson goes by the Learning path, so it may be a note lesson.
  const goOn = outcome?.continueId ? findPathLesson(outcome.continueId)?.lesson ?? null : null;
  // The calibration the run was played with: calibrating from its tip does not change what the tip says about it.
  const uncalibrated = !last?.calibrated;
  // Calibrated since this run (from its tip): the tip says the next run uses it, in place of Calibrate.
  const recalibrated = !!last && (state.prefs.calibrationMs !== last.calibrationMs || !!state.prefs.calibratedAt !== last.calibrated);

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

  // Listen stops by itself at the end, and when leaving the screen.
  useEffect(() => {
    if (!playing || !last || !view) return;
    const ms = Math.max(0, (view.timeline.totalSeconds + 0.6) * 1000);
    const id = window.setTimeout(() => setPlaying(false), ms);
    return () => window.clearTimeout(id);
  }, [playing, last, view]);
  useEffect(() => () => engine().stop(), []);

  const marks = useMemo(() => {
    const m: Record<number, NoteMark> = {};
    for (const n of last?.result.notes ?? []) m[n.index] = n.judgement;
    return m;
  }, [last]);

  const nextLesson = !!goOn;
  const coach = useMemo(() => {
    if (!last || !view) return null;
    try {
      return coachTip(last.result, view.timeline, last.run.exercise, { taps: last.taps, uncalibrated, nextLesson });
    } catch (e) {
      console.error('coachTip failed', e);
      return null;
    }
  }, [last, view, uncalibrated, nextLesson]);

  if (!last || !view) return null;
  const { result, run } = last;
  const ex = run.exercise;
  const tip = coach ? tipText(coach) : null;
  // A steady offset may be the speaker or headphones: calibrating takes it off every score. A device delay only makes
  // taps late, so rushing is the player's.
  const calibrate = !!coach && (coach.key === 'tip.latency' || (uncalibrated && coach.key.startsWith('tip.dragging')));
  // Under 2 stars the filled button plays the same exercise again: moving on is not the next step yet.
  const again = result.stars < UNLOCK_STARS;
  const code = encodeCode(ex.settings, ex.seed);

  const listen = (): void => {
    const eng = engine();
    if (playing) {
      eng.stop();
      setPlaying(false);
      return;
    }
    unlockAudio();
    applyAudioPrefs(state.prefs, eng);
    eng.start({ timeline: view.timeline, meter: ex.meter, tempo: ex.tempo, countInBars: 0, metronome: ex.settings.metronome, playRhythm: true, leadIn: 0.15 });
    setPlaying(true);
  };
  const toSettings = (): void => {
    engine().stop();
    dispatch({ type: 'settings', settings: runSetup(run) });
  };

  const diamond = result.stars === DIAMOND;
  const fourth = result.stars === MAX_STARS;
  const { reward } = last;
  const echo = ex.settings.mode === 'echo';
  const title = run.daily
    ? t('results.dailyDone')
    : run.lessonId
      ? t('results.lessonDone', { id: pathLessonOf('rhythm', run.lessonId)?.id ?? run.lessonId })
      : echo
        ? t('results.echoDone')
        : t('results.practiceDone');
  const outcomeBadge = outcome && outcome.kind !== 'passed' ? <OutcomeBadge outcome={outcome} /> : null;
  // Achievements a run earned without a level: badges here (with a level, the level-up sheet lists them).
  const achieved = leveledUp ? [] : reward.achievements;
  const badges = (run.daily && (reward.streak !== null || reward.dailyBest)) || outcomeBadge || achieved.length > 0;
  const countOf = (k: Judgement | 'extra'): number => (k === 'extra' ? result.extraTaps : result.counts[k]);
  /** Next lesson when the path goes on, else a new exercise with the same settings (Next exercise; New exercise under 2 stars). */
  const moveOn = (className: string): JSX.Element =>
    goOn ? (
      <button type="button" className={className} aria-label={t('results.nextLessonLabel', { id: goOn.id, title: tx(goOn.title) })}
        onClick={() => {
          engine().stop();
          startLesson(goOn.id, { replace: true });
        }}>
        {t('results.nextLesson')}
      </button>
    ) : (
      <button type="button" className={className} onClick={() => replay(run, false, carry)}>
        {t(again ? 'results.newExercise' : 'results.next')}
      </button>
    );

  // Tablet and desktop: the judged staff, the lane and the tip on the left; the score, the counts and the actions in the
  // side panel on the right. The desktop's wider column takes four bars per row, as Play does.
  const wide = bp !== 'phone';
  const perRow = bp === 'desktop' ? 4 : 2;

  const score = (
    <>
      <div className="score">
        {/* Three slots; the 4th star turns them into a small arc over one big star; a flawless run shows the diamond instead (§6.3). */}
        <div className={'score-stars' + (diamond ? ' score-stars--diamond' : fourth ? ' score-stars--bonus' : '')} role="img"
          aria-label={starsLabel(result.stars)}>
          {diamond ? (
            <span aria-hidden="true" className="diamond-star">
              ★
            </span>
          ) : (
            <span className="score-stars-row">
              {Array.from({ length: SHOWN_STARS }, (_, i) => (
                <span key={i} aria-hidden="true" className={i < result.stars ? 'is-on' : ''}>
                  ★
                </span>
              ))}
            </span>
          )}
          {fourth && (
            <span aria-hidden="true" className="is-on is-bonus">
              ★
            </span>
          )}
        </div>
        {diamond && <div className="score-bonus">{t('results.allPerfect')}</div>}
        <div className="score-pct">{t('results.accuracy', { value: Math.round(result.accuracy) })}</div>
        <div className="muted-text score-sub">
          {t('results.summary')} · <b className="tone-ink">{t('xp.earned', { count: reward.xp })}</b>
        </div>
      </div>

      {badges && (
        <div className="badges">
          {run.daily && reward.streak !== null && (
            <span className="badge">
              <span className="streak-dot" aria-hidden="true" />
              {t('results.streakKept', { count: reward.streak })}
            </span>
          )}
          {reward.dailyBest && (
            <span className="badge badge--gold" title={t('results.newBestTitle')}>
              <Icon name="trophy" size={15} />
              {t('results.newBest')}
            </span>
          )}
          {outcomeBadge}
          <AchievementBadges ids={achieved} />
        </div>
      )}

      <div className="card counts-card">
        <div className="counts">
          {COUNTS.map((c) => (
            <div key={c.key}>
              <div className={'count-n tone-' + c.tone}>{countOf(c.key)}</div>
              <div className="count-label">{t('results.' + c.key)}</div>
            </div>
          ))}
        </div>
        {ex.settings.hold && (
          <div className="holds">
            {t('results.holds')} <b className="tone-good">{t('results.holdsRight', { count: result.holds.right })}</b> ·{' '}
            <b className="tone-gold">{t('results.holdsShort', { count: result.holds.short })}</b> ·{' '}
            <b className="tone-ink">{t('results.holdsLong', { count: result.holds.long })}</b>
          </div>
        )}
      </div>
    </>
  );

  const review = (
    <>
      <div className="card results-staff">
        <StaffBox bars={view.bars} meter={ex.meter} barsPerRow={perRow} marks={marks} shrinkToFit
          label={t(echo ? 'results.echoStaffLabel' : 'results.staffLabel', { rhythm: describeBars(view.bars, ex.meter.id) })} />
      </div>

      <div className="card results-lane">
        <div className="lane-head lane-head--results">
          <b>{t(ex.settings.hold ? 'results.timing' : 'results.tapTiming')}</b>
          <span>
            {t(ex.settings.hold ? 'results.timingLegend' : 'results.tapTimingLegend')}
            {result.extraTaps > 0 && ' · ' + t('results.extraLegend')}
          </span>
        </div>
        <LengthLane timeline={view.timeline} barTicks={ex.meter.barTicks} barsPerRow={perRow} taps={last.taps} result={result} label={t('results.laneLabel')}
          hold={ex.settings.hold} />
      </div>

      {tip && (
        <div className="tip">
          <Icon name="clock" size={20} />
          <div className="tip-body">
            <span>{tip}</span>
            {calibrate &&
              (recalibrated ? (
                <span className="tip-note">{t('results.calibrated')}</span>
              ) : (
                <Link to="/calibrate" query={calibrateQuery(carry)} className="ghost-btn tip-action" title={t('results.calibrateTitle')} onClick={() => engine().stop()}>
                  <Icon name="metronome" size={18} />
                  {t('results.calibrate')}
                </Link>
              ))}
          </div>
        </div>
      )}
    </>
  );

  const actions = (
    <div className="results-actions">
      <div className="results-secondary">
        <button type="button" className={'ghost-btn listen-btn' + (playing ? ' is-on' : '')} aria-pressed={playing} title={t('results.listenTitle')} onClick={listen}>
          {playing ? <Icon name="stop" size={18} className="m-in" /> : <Icon name="speaker" size={18} />}
          {t(playing ? 'results.playing' : 'results.listen')}
        </button>
        <Link to="/setup" query={carry} className="ghost-btn" title={t('results.settings')} onClick={toSettings}>
          <Icon name="sliders" size={18} />
          {t('results.settings')}
        </Link>
        {wide && <CodeCopy code={code} className="ghost-btn" />}
      </div>
      {/* The filled button on the right: Try again under 2 stars, else on to the next. */}
      <div className={'results-main' + (again ? ' results-main--again' : '')}>
        {again ? (
          <>
            {moveOn('btn btn--outline')}
            <button type="button" className="btn btn--accent" onClick={() => replay(run, true, carry)}>
              {t('results.tryAgain')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--outline" onClick={() => replay(run, true, carry)}>
              {t('results.retry')}
            </button>
            {moveOn('btn btn--accent')}
          </>
        )}
      </div>
      {/* A phone has no room for it next to Listen and Practice settings: a small muted link at the very bottom. */}
      {!wide && <CodeCopy code={code} className="ghost-btn copy-link" />}
    </div>
  );

  return (
    <ExerciseFrame className="frame--results" wide>
      <div className="page results no-scrollbar">
        <div className="screen-head">
          {/* A lesson goes back to the Path, as Quit does on Play and Round done's arrow after a note lesson. It leaves as
              Quit does, so the browser's Back does not open the finished exercise again. */}
          <Link to={run.lessonId ? '/path' : (back?.to ?? '/')} query={run.lessonId ? undefined : back?.query} leaves
            aria-label={run.lessonId ? t('results.lessonBack') : back ? t('learn.backToChapter', { n: back.chapter }) : t('results.backHome')}
            className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{title}</h1>
            {run.daily && <span className="muted-text">{t('results.dailySub', { date: dateParts(run.daily).short })}</span>}
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
          <LevelUpContent xpBefore={reward.xpBefore} xpAfter={reward.xpAfter} achievements={reward.achievements} best={reward.best}
            onDone={() => setLevelUp(null)} />
        </Sheet>
      )}
    </ExerciseFrame>
  );
}
