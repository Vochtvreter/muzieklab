/**
 * Calibrate timing (DESIGN.md §6.1): tap along with 16 clicks; the median offset is this device's delay. Opened from
 * Results (`#/calibrate?from=results`, with `&learn=7.3` when Results goes back to a Learn section), back and Save
 * return there; otherwise, and when there is no run to show (after a reload), to Settings.
 */
import { useEffect, useRef, useState } from 'react';
import { medianOffsetMs, tapOffsetsMs } from '../../audio/calibration';
import { localDateIso } from '../../game/storage';
import { attachTapInput } from '../../input/tapInput';
import { t } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { TapPad } from '../components/Bits';
import { Icon } from '../components/Icon';
import { useDocTitle } from '../hooks';
import { signed, signedMs } from '../lib/format';
import { calibrateBackQuery } from '../lib/learnReturn';
import { focusLost } from '../lib/screenFocus';
import { hashQuery, Link, navigate, useHash } from '../router';
import { useStore } from '../store';

const CLICKS = 16;
const BPM = 90;
/** A tap further than this from every click is not counted. */
const MATCH_S = 0.25;
const MIN_TAPS = 8;

type Phase = 'idle' | 'measuring' | 'done';

/** Taps that landed near a click, at most one per click (the first one). */
export function matchedTaps(taps: number[], clicks: number[], window = MATCH_S): number[] {
  const used = new Set<number>();
  const out: number[] = [];
  for (const tap of taps) {
    let best = -1;
    for (let i = 0; i < clicks.length; i++) {
      if (Math.abs(tap - clicks[i]) <= window && (best < 0 || Math.abs(tap - clicks[i]) < Math.abs(tap - clicks[best]))) best = i;
    }
    if (best >= 0 && !used.has(best)) {
      used.add(best);
      out.push(tap);
    }
  }
  return out;
}

const pct = (v: number): string => ((Math.max(-100, Math.min(100, v)) + 100) / 2).toFixed(2) + '%';

export function Calibration(): JSX.Element {
  const { state, dispatch } = useStore();
  useDocTitle(t('app.docTitle', { page: t('calibrate.title') }));
  const query = hashQuery(useHash());
  // Back to Results only with a run to show: after a reload there is none, and Results would send the player Home.
  const fromResults = query.get('from') === 'results' && !!state.last;
  const backTo = fromResults ? '/results' : '/settings';
  const backQuery = fromResults ? calibrateBackQuery(query) : undefined;
  const [phase, setPhase] = useState<Phase>('idle');
  const [taps, setTaps] = useState<number[]>([]);
  const clicks = useRef<number[]>([]);
  const rawTaps = useRef<number[]>([]);
  const [pad, setPad] = useState<HTMLButtonElement | null>(null);
  // Set by Try again, whose button the pad replaces: the pad takes the focus, which would otherwise fall to the page.
  const focusPad = useRef(false);
  // Set when the run ends with the focus on the pad, which the result replaces: its first button takes the focus.
  const focusResult = useRef(false);
  const actions = useRef<HTMLDivElement>(null);
  const prefsRef = useRef(state.prefs);
  prefsRef.current = state.prefs;

  const begin = (): void => {
    unlockAudio();
    const eng = engine();
    applyAudioPrefs(prefsRef.current, eng);
    eng.setVolumes({ ...prefsRef.current.volumes, metronome: Math.max(prefsRef.current.volumes.metronome, 0.5) });
    eng.setCalibrationOffsetMs(0);
    rawTaps.current = [];
    setTaps([]);
    clicks.current = eng.clicks(CLICKS, BPM, 1);
    setPhase('measuring');
  };

  const finish = (): void => {
    focusResult.current = !!pad && pad === document.activeElement;
    setPhase('done');
  };

  // Input: the first press starts the clicks; later presses are measured.
  useEffect(() => {
    if (phase === 'done') return;
    return attachTapInput(pad, {
      down: (ts) => {
        if (phase === 'idle') {
          begin();
          return;
        }
        rawTaps.current.push(engine().eventToAudioTime(ts));
        const m = matchedTaps(rawTaps.current, clicks.current);
        setTaps(m);
        if (m.length >= CLICKS) finish();
      },
      up: () => undefined,
    });
  }, [phase, pad]);

  useEffect(() => {
    if (!pad || !focusPad.current) return;
    focusPad.current = false;
    if (focusLost()) pad.focus();
  }, [pad]);

  // The result's first button, Save or else Try again, takes the focus from the pad it replaces.
  useEffect(() => {
    if (phase !== 'done' || !focusResult.current) return;
    focusResult.current = false;
    if (focusLost()) actions.current?.querySelector('button')?.focus();
  }, [phase]);

  // Done once the last click has passed.
  useEffect(() => {
    if (phase !== 'measuring') return;
    const id = window.setInterval(() => {
      const last = clicks.current[clicks.current.length - 1] ?? 0;
      if (engine().now() > last + 0.6) finish();
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, pad]);

  // Leaving without saving restores the stored offset.
  useEffect(
    () => () => {
      const eng = engine();
      eng.stop();
      applyAudioPrefs(prefsRef.current, eng);
    },
    [],
  );

  const offsets = tapOffsetsMs(taps, clicks.current);
  const n = offsets.length;
  const median = n ? medianOffsetMs(taps, clicks.current) : null;
  const sorted = [...offsets].sort((a, b) => a - b);
  const enough = n >= MIN_TAPS;

  const again = (): void => {
    engine().stop();
    rawTaps.current = [];
    setTaps([]);
    focusPad.current = true;
    setPhase('idle');
  };

  const save = (): void => {
    if (median === null) return;
    dispatch({ type: 'prefs', patch: { calibrationMs: median, calibratedAt: localDateIso() } });
    engine().setCalibrationOffsetMs(median);
    navigate(backTo, { query: backQuery });
  };

  const dots = offsets.map((v, i) => {
    const level = offsets.slice(0, i).filter((w) => Math.abs(w - v) < 5).length;
    const last = i === n - 1 && phase === 'measuring';
    return <span key={i} className={'cal-dot m-in' + (last ? ' is-last' : '')} style={{ left: pct(v), top: 56 - Math.min(level, 5) * 10 }} />;
  });

  const lastLabel = phase === 'idle' ? t('calibrate.pressToStart') : n ? t('calibrate.lastTap', { offset: signedMs(offsets[n - 1]) }) : t('calibrate.tapEach');
  const fmt = (v: number): string => signedMs(v);
  const resultKey = median === null || median === 0 ? 'calibrate.resultZero' : median > 0 ? 'calibrate.resultLate' : 'calibrate.resultEarly';

  return (
    <ExerciseFrame className="frame--cal">
      <div className="page cal no-scrollbar">
        <div className="screen-head">
          <Link to={backTo} query={backQuery} aria-label={t(fromResults ? 'calibrate.backResults' : 'calibrate.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <h1 className="screen-title">{t('calibrate.title')}</h1>
        </div>
        <div className="cal-intro">
          <p>{t('calibrate.intro')}</p>
          <p className="muted-text">{t('calibrate.tip')}</p>
        </div>

        <div className="card cal-card">
          <div className="cal-stats">
            <div className="cal-stat">
              <span className="label">{t('calibrate.click')}</span>
              <span aria-live="polite" className="cal-count">
                {n} <span>{t('calibrate.of', { total: CLICKS })}</span>
              </span>
            </div>
            <div className="cal-stat cal-stat--right">
              <span className="label">{t('calibrate.delay')}</span>
              <span className="cal-median">{median === null ? t('common.dash') : fmt(median)}</span>
            </div>
          </div>
          <div aria-hidden="true" className="pips">
            {Array.from({ length: CLICKS }, (_, i) => (
              <span key={i} className={'m-ease' + (i < n ? ' is-on' : '')} />
            ))}
          </div>
          <div role="img" className="cal-plot"
            aria-label={n ? t('calibrate.lineAria', { count: n, min: fmt(sorted[0]), max: fmt(sorted[n - 1]), delay: fmt(median ?? 0) }) : t('calibrate.lineEmpty')}>
            <span className="cal-axis" />
            <span className="cal-tick cal-tick--end" style={{ left: 0 }} />
            <span className="cal-tick" style={{ left: 'calc(25% - 1px)' }} />
            <span className="cal-tick cal-tick--zero" style={{ left: 'calc(50% - 1px)' }} />
            <span className="cal-tick" style={{ left: 'calc(75% - 1px)' }} />
            <span className="cal-tick cal-tick--end" style={{ right: 0 }} />
            {n >= 3 && median !== null && <span className="cal-median-line m-ease" style={{ left: pct(median) }} />}
            {dots}
            <span className="cal-axis-label" style={{ left: 0 }}>
              {t('calibrate.axisMin')}
            </span>
            <span className="cal-axis-label cal-axis-label--mid">{t('calibrate.axisZero')}</span>
            <span className="cal-axis-label" style={{ right: 0 }}>
              {t('calibrate.axisMax')}
            </span>
            <span className="cal-side" style={{ left: 0 }}>
              {t('calibrate.early')}
            </span>
            <span className="cal-side" style={{ right: 0 }}>
              {t('calibrate.late')}
            </span>
          </div>
        </div>

        {phase !== 'done' ? (
          <>
            <div aria-live="polite" className="judgement judgement--cal">
              {lastLabel}
            </div>
            <TapPad ref={setPad} progress={n / CLICKS} held={false} />
            <span className="muted-text cal-anykey">{t('calibrate.anyKey')}</span>
          </>
        ) : enough && median !== null ? (
          <>
            <div className="card cal-result m-in" role="status">
              <span className="label">{t('calibrate.delay')}</span>
              <span className="cal-result-n">{fmt(median)}</span>
              <span className="cal-result-text">{t(resultKey, { count: n, ms: signed(Math.abs(median)).replace(/^[+−]/, '') })}</span>
            </div>
            <div ref={actions} className="cal-actions m-in">
              <button type="button" className="btn btn--accent" onClick={save}>
                {t('calibrate.save')}
              </button>
              <button type="button" className="btn btn--outline" onClick={again}>
                {t('calibrate.again')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="card cal-result m-in" role="status">
              <span className="cal-result-text">{t('calibrate.tooFew', { count: n })}</span>
            </div>
            <div ref={actions} className="cal-actions m-in">
              <button type="button" className="btn btn--accent" onClick={again}>
                {t('calibrate.again')}
              </button>
            </div>
          </>
        )}
      </div>
    </ExerciseFrame>
  );
}
