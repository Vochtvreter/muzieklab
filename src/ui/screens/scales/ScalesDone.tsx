/**
 * Scales · round done (DESIGN.md §3.7 Round done): scales without a mistake out of all, every scale with its mistakes
 * and stars (scored on the first try; one with mistakes is marked as having come back), how far the circle is filled,
 * and Change setup / New round. The back arrow goes to the Scales hub.
 */
import { useEffect, useState } from 'react';
import { CIRCLE, doneCounts, majorLevel, minorLevel, type KeyId, type ScaleStars } from '../../../core/api';
import { levelInfo } from '../../../game/xp';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { LevelUpContent } from '../../components/Reward';
import { Sheet } from '../../components/Sheet';
import { useBreakpoint, useDocTitle, useLingering } from '../../hooks';
import { circleLabel, keyName, scaleName } from '../../lib/scaleText';
import { Link, navigate } from '../../router';
import { useStore, type ScaleLast } from '../../store';
import { useStartScales } from './start';

const shownLevelUp = new WeakSet<ScaleLast>();

export function ScalesDone(): JSX.Element | null {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const start = useStartScales();
  useDocTitle(t('app.docTitle', { page: t('scales.done.docTitle') }));
  const last = state.scaleLast;
  useEffect(() => {
    if (!last) navigate('/scales', { replace: true });
  }, [last]);

  const leveledUp = !!last && levelInfo(last.reward.xpAfter).level > levelInfo(last.reward.xpBefore).level;
  const [levelUp, setLevelUp] = useState<'open' | null>(() => (last && leveledUp && !shownLevelUp.has(last) ? 'open' : null));
  useEffect(() => {
    if (last && levelUp) shownLevelUp.add(last);
  }, [last, levelUp]);
  const { shown: sheet, closing } = useLingering(levelUp, 240);
  useEffect(() => {
    if (!levelUp) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLevelUp(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [levelUp]);

  if (!last) return null;
  const { result: r, run, reward, starsBefore } = last;
  const s = run.settings;
  const sub = t('scales.done.sub', {
    types: s.types.map((x) => t('scales.typeLower.' + x)).join(', '),
    dir: t(s.direction === 'up' ? 'scales.setup.upWord' : 'scales.setup.upDownWord'),
    input: t('scales.setup.inputWord.' + s.input),
  });
  const again = (): void => start(s, { replace: true });
  const change = (): void => dispatch({ type: 'scaleSettings', settings: s });
  const minor = !s.types.includes('major');

  return (
    <ExerciseFrame className="frame--results">
      <div className="page results sdone no-scrollbar">
        <div className="screen-head">
          <Link to="/scales" aria-label={t('scales.done.back')} className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t('scales.done.title')}</h1>
            <span className="muted-text">{sub}</span>
          </div>
        </div>

        <div className="score sdone-score">
          <div className="score-pct" role="img" aria-label={t('scales.done.cleanAria', { clean: r.clean, total: r.total })}>
            <span aria-hidden="true">{r.clean}</span>
            <span aria-hidden="true" className="sdone-of">
              {' '}
              / {r.total}
            </span>
          </div>
          <div className="muted-text score-sub">
            {r.total === 0 ? t('scales.done.none') : t('scales.done.score', { count: r.mistakes })} · <b className="tone-ink">{t('xp.earned', { count: reward.xp })}</b>
          </div>
        </div>

        {r.total > 0 && (
          <div role="list" aria-label={t('scales.done.listAria')} className="card sdone-list">
            {r.scales.map((x, i) => (
              <div key={i} role="listitem" className="sdone-row">
                <div className="sdone-row-text">
                  <div className="sdone-row-head">
                    <b>{scaleName(x.scale)}</b>
                    <span className={x.mistakes ? 'tone-miss' : 'tone-good'}>{t('scales.done.mistakes', { count: x.mistakes })}</span>
                  </div>
                  {x.cameBack && (
                    <span className="sdone-back">
                      <Icon name="restart" size={13} strokeWidth={2.4} />
                      {t('scales.done.cameBack')}
                    </span>
                  )}
                </div>
                <span role="img" aria-label={t('scales.starsAria', { count: x.stars })} className="sdone-stars">
                  <span aria-hidden="true">{'★'.repeat(x.stars)}</span>
                  <span aria-hidden="true" className="scale-stars-off">
                    {'★'.repeat(3 - x.stars)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <CircleProgress before={starsBefore} after={state.progress.scales.stars} minor={minor} />

        <div className="results-actions">
          <div className="results-main">
            <Link to="/scales/setup" className="btn btn--outline" onClick={change}>
              {t('scales.done.change')}
            </Link>
            <button type="button" className="btn btn--accent" onClick={again}>
              {t('scales.done.newRound')}
            </button>
          </div>
        </div>
      </div>
      {sheet && (
        <Sheet variant={bp === 'desktop' ? 'dialog' : 'sheet'} closing={closing} panelKey="levelup" labelledBy="leveluptitle" maxWidth={bp === 'desktop' ? 460 : undefined}>
          <LevelUpContent xpBefore={reward.xpBefore} xpAfter={reward.xpAfter} onDone={() => setLevelUp(null)} />
        </Sheet>
      )}
    </ExerciseFrame>
  );
}

/** The circle with every key that has two stars (minor: a form with two stars) filled; keys new this round ringed. */
function CircleProgress({ before, after, minor }: { before: ScaleStars; after: ScaleStars; minor: boolean }): JSX.Element {
  // Major: two stars fill a key. Minor: each form with two stars counts.
  const level = (stars: ScaleStars, key: KeyId): number => (minor ? minorLevel(stars, key) : majorLevel(stars, key) >= 2 ? 1 : 0);
  const filled = (stars: ScaleStars, key: KeyId): boolean => level(stars, key) > 0;
  const was = (key: KeyId): boolean => level(after, key) <= level(before, key);
  const countOf = (stars: ScaleStars): number => (minor ? doneCounts(stars).minor : doneCounts(stars).major);
  const n0 = countOf(before);
  const n1 = countOf(after);
  const total = minor ? 45 : 15;
  const fresh: KeyId[] = [];
  const C = 88;
  const R = 67;
  const dots = CIRCLE.map((keys, pos) => {
    const key = keys.find((k) => filled(after, k) && !was(k)) ?? keys.find((k) => filled(after, k)) ?? keys[0];
    const on = filled(after, key);
    const isNew = on && !was(key);
    if (isNew) fresh.push(key);
    const a = (pos * Math.PI) / 6;
    const x = C + R * Math.sin(a);
    const y = C - R * Math.cos(a);
    const other = keys.find((k) => k !== key);
    return (
      <g key={pos}>
        {isNew && <circle cx={x} cy={y} r={19} className="cprog-new" />}
        <circle cx={x} cy={y} r={on ? 15.5 : 14.75} className={on ? 'cprog-on' : 'cprog-off'} />
        <text x={x} y={other ? y + 0.5 : y + 4.5} textAnchor="middle" className={'cprog-label' + (on ? ' is-on' : '') + (other ? ' is-small' : '')}>
          {circleLabel(key, minor)}
        </text>
        {other && (
          <text x={x} y={y + 10} textAnchor="middle" className={'cprog-alt' + (on ? ' is-on' : '')}>
            {circleLabel(other, minor)}
          </text>
        )}
      </g>
    );
  });
  const names = fresh.map((k) => keyName(k, minor));
  return (
    <div className="card cprog">
      <svg viewBox="0 0 176 176" className="cprog-svg" role="img"
        aria-label={t(minor ? 'scales.done.circleMinorAria' : 'scales.done.circleMajorAria', { count: n1, total, fresh: names.join(', ') || t('scales.done.noneNew') })}>
        <circle cx={C} cy={C} r={R} className="cprog-ring" />
        {dots}
        <text x={C} y={C + 3} textAnchor="middle" className="cprog-count">
          {n1}
        </text>
        <text x={C} y={C + 21} textAnchor="middle" className="cprog-of">
          {t('scales.done.of', { total })}
        </text>
      </svg>
      <div className="cprog-text">
        <b>{t('scales.done.circle')}</b>
        <div className="cprog-n" aria-hidden="true">
          {n0 !== n1 && (
            <>
              <span className="tone-faint">{n0}</span> <span className="tone-faint cprog-arrow">→</span>{' '}
            </>
          )}
          {n1}
          <span className="cprog-total"> / {total}</span>
        </div>
        <div className="muted-text">
          {t(minor ? 'scales.done.minorCount' : 'scales.done.majorCount')}{' '}
          {names.length > 0 ? t('scales.done.reached', { names: names.join(', '), count: names.length }) : t('scales.done.nothingNew')}
        </div>
      </div>
    </div>
  );
}
