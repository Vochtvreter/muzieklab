/**
 * Home: streak, level and XP, Continue (the next lesson), the daily challenge and Free practice (Rhythm, Read notes,
 * Scales).
 * Desktop (App design canvas, Desktop · Home): a left column with streak and level, the daily challenge and the path
 * summary, next to Continue and the practice tiles.
 */
import { useMemo } from 'react';
import { exerciseView } from '../exerciseView';
import { dailyChallenge } from '../../game/daily';
import { lessonSettings, UNITS, type Unit } from '../../game/path';
import { streak } from '../../game/storage';
import { levelInfo } from '../../game/xp';
import { dateParts, t, tx } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { LessonTiles, StaffBox } from '../components/Bits';
import { DateTile, XpLine } from '../components/Reward';
import { useBreakpoint, useDocTitle, useToday } from '../hooks';
import { metersLabel } from '../lib/format';
import { continueLesson, lessonNumber, lessonPreview, unitStates } from '../lib/lessons';
import { describeBars } from '../lib/notation';
import { Link } from '../router';
import { todayIso, useStore } from '../store';
import { useStartDaily, useStartLesson } from './start';

function StreakPill({ days }: { days: number }): JSX.Element {
  return (
    <div className="streak-pill">
      <span className="streak-dot" aria-hidden="true" />
      {t('streak.pill', { count: days })}
    </div>
  );
}

/**
 * The lesson as a preview (same every visit): a bar that shows what the lesson adds, e.g. a half rest in "Half rests".
 * One bar on phones; two from tablet up, where one bar left most of the card empty.
 */
function LessonPreview({ lessonId, wide, count = 1 }: { lessonId: string; wide?: boolean; count?: 1 | 2 }): JSX.Element | null {
  const preview = useMemo(() => lessonPreview(lessonId), [lessonId]);
  const view = preview ? exerciseView(preview.run.exercise) : null;
  if (!preview || !view || view.bars.length === 0) return null;
  const from = Math.max(0, Math.min(preview.bar, view.bars.length - count));
  const bars = view.bars.slice(from, from + count);
  return (
    <div className={'preview-staff' + (wide ? ' preview-staff--wide' : '')}>
      <StaffBox bars={bars} meter={preview.run.exercise.meter} barsPerRow={bars.length} label={describeBars(bars, preview.run.exercise.meter.id, from + 1)} />
    </div>
  );
}

export function Home(): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  const startLesson = useStartLesson();
  const startDaily = useStartDaily();
  useDocTitle(t('app.docTitle', { page: t('home.title') }));
  const today = useToday(todayIso);
  const days = streak(state.progress.practiceDays, today);
  const cont = continueLesson(state.progress);
  const xp = levelInfo(state.progress.xp);
  const daily = useMemo(() => dailyChallenge(today).settings, [today]);
  const dailyDone = state.progress.daily?.day === today ? state.progress.daily : null;

  const xpBlock = (
    <section aria-label={t('xp.label')}>
      <XpLine info={xp} />
    </section>
  );

  const dailyText = (
    <div className="daily-text">
      <h2 id="daily-title">{t('home.dailyTitle')}</h2>
      <div className="muted-text">
        {t('home.dailyMeta', { meter: metersLabel(daily.meters), bars: t('common.bars', { count: daily.bars }), bpm: daily.tempo })}
      </div>
      {dailyDone && <div className="daily-done">{t('home.dailyDone', { accuracy: Math.round(dailyDone.accuracy) })}</div>}
    </div>
  );
  const dailyButton = (
    <button type="button" className="btn btn--ink daily-btn" aria-label={t('home.dailyPlayLabel', { date: dateParts(today).long })} onClick={startDaily}>
      {t(dailyDone ? 'home.dailyAgain' : 'home.dailyPlay')}
    </button>
  );
  // Desktop: the Play button goes full width under the date and text.
  const dailyCard =
    bp === 'desktop' ? (
      <section aria-labelledby="daily-title" className="daily-card daily-card--desk">
        <div className="daily-row">
          <DateTile day={today} />
          {dailyText}
        </div>
        {dailyButton}
      </section>
    ) : (
      <section aria-labelledby="daily-title" className="daily-card">
        <DateTile day={today} />
        {dailyText}
        {dailyButton}
      </section>
    );

  const continueCard = cont && (
    <section aria-labelledby="continue-title" className="continue-card">
      <div className="continue-head">
        <div className="eyebrow eyebrow--fill">
          {t(cont.done ? 'home.replayEyebrow' : 'home.continueEyebrow', {
            unit: cont.unit.id,
            lesson: lessonNumber(cont.lesson.id),
            total: cont.unit.lessons.length,
          })}
        </div>
        <h2 id="continue-title" className="continue-title">
          {tx(cont.lesson.title)}
        </h2>
      </div>
      <div className={'continue-staff' + (bp === 'desktop' ? ' continue-staff--wide' : '')}>
        <div className="continue-meta">
          <span>{t('home.previewMeta', { meter: metersLabel(lessonSettings(cont.lesson.id).meters), bars: t('common.bars', { count: lessonSettings(cont.lesson.id).bars }) })}</span>
          <span>{t('common.bpm', { value: lessonSettings(cont.lesson.id).tempo })}</span>
        </div>
        <div className="continue-staff-body">
          <LessonPreview lessonId={cont.lesson.id} wide={bp !== 'phone'} count={bp === 'phone' ? 1 : 2} />
        </div>
      </div>
      {bp !== 'desktop' && <LessonTiles unit={cont.unit} progress={state.progress} currentId={cont.lesson.id} onFill onPick={startLesson} />}
      <button type="button" className="btn btn--on-fill continue-btn" onClick={() => startLesson(cont.lesson.id)}>
        {t(cont.done ? 'home.replayButton' : 'home.continueButton')}
      </button>
    </section>
  );

  // Free practice: Rhythm, Read notes and Scales side by side (v1.4); each opens its own setup or, for Scales, the hub.
  const freeCard = (
    <section aria-labelledby="free-title" className="free">
      <h2 id="free-title" className="free-title">
        {t('home.freeHeading')}
      </h2>
      <div className="free-tiles">
        <Link to="/setup" className="free-tile">
          <span aria-hidden="true" className="free-tile-icon">
            𝅘𝅥𝅘𝅥𝅮
          </span>
          <span className="free-tile-text">
            <b>{t('home.rhythmTile')}</b>
            <span>{t('home.rhythmTileSub')}</span>
          </span>
        </Link>
        <Link to="/notes" className="free-tile">
          <span aria-hidden="true" className="free-tile-icon">
            𝄞
          </span>
          <span className="free-tile-text">
            <b>{t('home.notesTile')}</b>
            <span>{t('home.notesTileSub')}</span>
          </span>
        </Link>
        <Link to="/scales" className="free-tile">
          <span aria-hidden="true" className="free-tile-icon">
            <svg width="34" height="30" viewBox="0 0 34 30" className="free-tile-scale">
              <g fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="5" cy="25" rx="4" ry="3" />
                <ellipse cx="13" cy="19" rx="4" ry="3" />
                <ellipse cx="21" cy="12" rx="4" ry="3" />
                <ellipse cx="29" cy="5" rx="4" ry="3" />
              </g>
            </svg>
          </span>
          <span className="free-tile-text">
            <b>{t('home.scalesTile')}</b>
            <span>{t('home.scalesTileSub')}</span>
          </span>
        </Link>
      </div>
    </section>
  );

  if (bp === 'desktop') {
    return (
      <AppShell bp={bp} active="/" wide>
        <h1 className="sr-only">{t('home.title')}</h1>
        <div className="home-desk">
          <aside className="home-desk-aside">
            <div className="card status-card">
              <section aria-label={t('streak.label')} className="streak-card">
                <span className="streak-badge" aria-hidden="true">
                  <span />
                </span>
                <span className="streak-card-title">{t('streak.pill', { count: days })}</span>
              </section>
              <span className="hairline" />
              <section aria-label={t('xp.label')} className="level-block">
                <span className="level-block-head">
                  <span className="level-block-level">{t('xp.level', { level: xp.level })}</span>
                  <span className="muted-text">{t('xp.rankLine', { rank: t('rank.' + xp.rank) })}</span>
                </span>
                <div className="xp-bar" role="img" aria-label={t('xp.bar', { into: xp.into, span: xp.span })}>
                  <div style={{ width: (xp.span > 0 ? Math.min(1, xp.into / xp.span) : 0) * 100 + '%' }} />
                </div>
                <span className="level-block-foot">
                  <span className="mono-muted">{t('xp.ofSpan', { into: xp.into, span: xp.span })}</span>
                  <span className="xp-next">{t('xp.toNext', { count: xp.span - xp.into, next: xp.level + 1 })}</span>
                </span>
              </section>
            </div>
            {dailyCard}
            {cont && <PathSummary currentUnit={cont.unit} currentId={cont.done ? null : cont.lesson.id} />}
          </aside>
          <div className="home-desk-main">
            {continueCard}
            {freeCard}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bp={bp} active="/">
      <div className="page home">
        <div className="home-head">
          {bp === 'phone' ? (
            <>
              <div className="brand brand--home">{t('app.name')}</div>
              <h1 className="sr-only">{t('home.title')}</h1>
            </>
          ) : (
            <h1 className="page-title">{t('home.title')}</h1>
          )}
          <StreakPill days={days} />
        </div>
        {xpBlock}
        {continueCard}
        {dailyCard}
        {freeCard}
      </div>
    </AppShell>
  );
}

/** Desktop Home: the learning-path card (the current unit, a bar of all units, its lesson tiles and the next lesson). */
function PathSummary({ currentUnit, currentId }: { currentUnit: Unit; currentId: string | null }): JSX.Element {
  const { state } = useStore();
  const p = state.progress;
  const states = unitStates(p);
  const cur = currentId ? currentUnit.lessons.find((l) => l.id === currentId) : null;
  return (
    <Link to="/path" className="card path-card">
      <span className="path-card-head">
        <span className="eyebrow">{t('home.pathEyebrow')}</span>
        <span className="mono-muted">{t('home.pathUnitOf', { unit: UNITS.indexOf(currentUnit) + 1, total: UNITS.length })}</span>
      </span>
      <span className="path-card-current">{t('path.unitTitle', { id: currentUnit.id, title: tx(currentUnit.titleKey) })}</span>
      <span aria-hidden="true" className="path-card-bar" style={{ gridTemplateColumns: `repeat(${UNITS.length}, minmax(0, 1fr))` }}>
        {states.map((st, i) => (
          <span key={UNITS[i].id} className={'path-card-seg path-card-seg--' + st} />
        ))}
      </span>
      <LessonTiles unit={currentUnit} progress={p} currentId={currentId} onFill={false} />
      {cur && (
        <span className="muted-text">
          {t('path.next', { lesson: lessonNumber(cur.id), title: tx(cur.title), bpm: lessonSettings(cur.id).tempo })}
        </span>
      )}
      <span className="path-card-link">{t('home.pathView')}</span>
    </Link>
  );
}
