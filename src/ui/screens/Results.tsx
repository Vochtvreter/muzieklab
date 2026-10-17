/**
 * Results (DESIGN.md §6.4): the exercise code, stars, accuracy and XP, the daily challenge's badges, counts, holds, the
 * judged staff (in Echo the notation's reveal), the timing and length lane, a tip, and the level-up sheet.
 */
import { useEffect, useMemo, useState } from 'react';
import { coachTip, DIAMOND, encodeCode, MAX_STARS, SHOWN_STARS, type Judgement } from '../../core/api';
import { levelInfo } from '../../game/xp';
import type { NoteMark } from '../../render/Staff';
import { LengthLane } from '../../render/LengthLane';
import { dateParts, t, tipText } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { StaffBox } from '../components/Bits';
import { Icon } from '../components/Icon';
import { CodeCopy, LevelUpContent } from '../components/Reward';
import { Sheet } from '../components/Sheet';
import { exerciseView } from '../exerciseView';
import { useBreakpoint, useDocTitle, useLingering } from '../hooks';
import { starsLabel } from '../lib/format';
import { describeBars } from '../lib/notation';
import { Link, navigate } from '../router';
import { useStore, type LastResult } from '../store';
import { useReplay } from './start';

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
  const bp = useBreakpoint();
  const [playing, setPlaying] = useState(false);
  useDocTitle(t('app.docTitle', { page: t('results.docTitle') }));
  const last = state.last;
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

  const tip = useMemo(() => {
    if (!last || !view) return null;
    try {
      const c = coachTip(last.result, view.timeline, last.run.exercise);
      return tipText(c);
    } catch (e) {
      console.error('coachTip failed', e);
      return null;
    }
  }, [last, view]);

  if (!last || !view) return null;
  const { result, run } = last;
  const ex = run.exercise;

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
    dispatch({ type: 'settings', settings: ex.settings });
  };

  const diamond = result.stars === DIAMOND;
  const fourth = result.stars === MAX_STARS;
  const { reward } = last;
  const echo = ex.settings.mode === 'echo';
  const title = run.daily
    ? t('results.dailyDone')
    : run.lessonId
      ? t('results.lessonDone', { id: run.lessonId })
      : echo
        ? t('results.echoDone')
        : t('results.practiceDone');
  const badges = run.daily && (reward.streak !== null || reward.dailyBest);
  const countOf = (k: Judgement | 'extra'): number => (k === 'extra' ? result.extraTaps : result.counts[k]);

  return (
    <ExerciseFrame className="frame--results">
      <div className="page results no-scrollbar">
        <div className="screen-head">
          <Link to="/" aria-label={t('results.backHome')} className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <h1 className="screen-title">{title}</h1>
        </div>
        <CodeCopy code={encodeCode(ex.settings, ex.seed)}>
          {run.daily && <span className="muted-text">{t('results.dailySub', { date: dateParts(run.daily).short })}</span>}
        </CodeCopy>

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
            {t('results.summary', { combo: result.maxCombo })} · <b className="tone-ink">{t('xp.earned', { count: reward.xp })}</b>
          </div>
        </div>

        {badges && (
          <div className="badges">
            {reward.streak !== null && (
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

        <div className="card results-staff">
          <StaffBox bars={view.bars} meter={ex.meter} barsPerRow={2} marks={marks}
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
          <LengthLane timeline={view.timeline} barTicks={ex.meter.barTicks} barsPerRow={2} taps={last.taps} result={result} label={t('results.laneLabel')}
            hold={ex.settings.hold} />
        </div>

        {tip && (
          <div className="tip">
            <Icon name="clock" size={20} />
            <span>{tip}</span>
          </div>
        )}

        <div className="results-actions">
          <div className="results-secondary">
            <button type="button" className={'ghost-btn listen-btn' + (playing ? ' is-on' : '')} aria-pressed={playing} title={t('results.listenTitle')} onClick={listen}>
              {playing ? <Icon name="stop" size={18} className="m-in" /> : <Icon name="speaker" size={18} />}
              {t(playing ? 'results.playing' : 'results.listen')}
            </button>
            <Link to="/setup" className="ghost-btn" title={t('results.settings')} onClick={toSettings}>
              <Icon name="sliders" size={18} />
              {t('results.settings')}
            </Link>
          </div>
          <div className="results-main">
            <button type="button" className="btn btn--outline" onClick={() => replay(run, true)}>
              {t('results.retry')}
            </button>
            <button type="button" className="btn btn--accent" onClick={() => replay(run, false)}>
              {t('results.next')}
            </button>
          </div>
        </div>
      </div>
      {levelUpSheet && (
        <Sheet variant={bp === 'desktop' ? 'dialog' : 'sheet'} closing={closing} panelKey="levelup" labelledBy="leveluptitle" maxWidth={bp === 'desktop' ? 460 : undefined}>
          <LevelUpContent xpBefore={reward.xpBefore} xpAfter={reward.xpAfter} onDone={() => setLevelUp(null)} />
        </Sheet>
      )}
    </ExerciseFrame>
  );
}
