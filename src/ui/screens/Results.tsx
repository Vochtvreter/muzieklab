/** Results (DESIGN.md §6.4): stars, accuracy, counts, holds, the judged staff, the timing and length lane, a tip. */
import { useEffect, useMemo, useState } from 'react';
import { coachTip, type Judgement } from '../../core/api';
import type { NoteMark } from '../../render/Staff';
import { LengthLane } from '../../render/LengthLane';
import { t, tipText } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { StaffBox } from '../components/Bits';
import { Icon } from '../components/Icon';
import { exerciseView } from '../exerciseView';
import { useDocTitle } from '../hooks';
import { describeBars } from '../lib/notation';
import { Link, navigate } from '../router';
import { useStore } from '../store';
import { useReplay } from './start';

const COUNTS: { key: Judgement | 'extra'; tone: string }[] = [
  { key: 'perfect', tone: 'good' },
  { key: 'great', tone: 'good' },
  { key: 'good', tone: 'gold' },
  { key: 'miss', tone: 'miss' },
  { key: 'extra', tone: 'ink' },
];

export function Results(): JSX.Element | null {
  const { state, dispatch } = useStore();
  const replay = useReplay();
  const [playing, setPlaying] = useState(false);
  useDocTitle(t('app.docTitle', { page: t('results.docTitle') }));
  const last = state.last;
  const view = last ? exerciseView(last.run.exercise) : null;

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

  const countOf = (k: Judgement | 'extra'): number => (k === 'extra' ? result.extraTaps : result.counts[k]);

  return (
    <ExerciseFrame className="frame--results">
      <div className="page results no-scrollbar">
        <div className="screen-head">
          <Link to="/" aria-label={t('results.backHome')} className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <h1 className="screen-title">{run.lessonId ? t('results.lessonDone', { id: run.lessonId }) : t('results.practiceDone')}</h1>
        </div>

        <div className="score">
          <div className="score-stars" role="img" aria-label={result.stars === 4 ? t('stars.allPerfect') : t('stars.of3', { count: result.stars })}>
            {[1, 2, 3].map((i) => (
              <span key={i} aria-hidden="true" className={i <= result.stars ? 'is-on' : ''}>
                ★
              </span>
            ))}
            {/* The hidden 4th star: only shown when earned (§6.3). */}
            {result.stars === 4 && (
              <span aria-hidden="true" className="is-on is-bonus">
                ★
              </span>
            )}
          </div>
          {result.stars === 4 && <div className="score-bonus">{t('results.allPerfect')}</div>}
          <div className="score-pct">{t('results.accuracy', { value: Math.round(result.accuracy) })}</div>
          <div className="muted-text score-sub">{t('results.summary', { combo: result.maxCombo })}</div>
        </div>

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
            label={t('results.staffLabel', { rhythm: describeBars(view.bars, ex.meter.id) })} />
        </div>

        <div className="card results-lane">
          <div className="lane-head lane-head--results">
            <b>{t('results.timing')}</b>
            <span>{t('results.timingLegend')}</span>
          </div>
          <LengthLane timeline={view.timeline} barTicks={ex.meter.barTicks} barsPerRow={2} taps={last.taps} result={result} label={t('results.laneLabel')} />
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
            <button type="button" className="btn btn--outline" onClick={() => replay(ex, run.lessonId, true)}>
              {t('results.retry')}
            </button>
            <button type="button" className="btn btn--accent" onClick={() => replay(ex, run.lessonId, false)}>
              {t('results.next')}
            </button>
          </div>
        </div>
      </div>
    </ExerciseFrame>
  );
}
