/** Home: streak, Continue (the next lesson), Free practice with last time's settings. Desktop adds the path summary. */
import { useMemo } from 'react';
import { exerciseView } from '../exerciseView';
import { lessonSettings, UNITS, unitStars, type Unit } from '../../game/path';
import { streak } from '../../game/storage';
import { t, tx } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { LessonTiles, StaffBox } from '../components/Bits';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle, useToday } from '../hooks';
import { lastTimeChips, metersLabel } from '../lib/format';
import { continueLesson, lessonNumber, lessonPreview, unitStates } from '../lib/lessons';
import { describeBars } from '../lib/notation';
import { Link } from '../router';
import { todayIso, useStore } from '../store';
import { useStartLesson } from './start';

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
  useDocTitle(t('app.docTitle', { page: t('home.title') }));
  const today = useToday(todayIso);
  const days = streak(state.progress.practiceDays, today);
  const cont = continueLesson(state.progress);
  const last = state.progress.lastSettings;

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
      {bp === 'desktop' ? (
        <div className="continue-staff continue-staff--wide">
          <LessonPreview lessonId={cont.lesson.id} wide count={2} />
        </div>
      ) : (
        <div className="continue-staff">
          <div className="continue-meta">
            <span>{t('home.previewMeta', { meter: metersLabel(lessonSettings(cont.lesson.id).meters), bars: t('common.bars', { count: lessonSettings(cont.lesson.id).bars }) })}</span>
            <span>{t('common.bpm', { value: lessonSettings(cont.lesson.id).tempo })}</span>
          </div>
          <div className="continue-staff-body">
            <LessonPreview lessonId={cont.lesson.id} wide={bp === 'tablet'} count={bp === 'tablet' ? 2 : 1} />
          </div>
        </div>
      )}
      {bp !== 'desktop' && <LessonTiles unit={cont.unit} progress={state.progress} currentId={cont.lesson.id} onFill onPick={startLesson} />}
      <button type="button" className="btn btn--on-fill continue-btn" onClick={() => startLesson(cont.lesson.id)}>
        {t(cont.done ? 'home.replayButton' : 'home.continueButton')}
      </button>
    </section>
  );

  const freeCard = (
    <section aria-labelledby="free-title" className="free-card">
      <div className="free-row">
        <span aria-hidden="true" className="free-icon">
          𝅘𝅥𝅘𝅥𝅮
        </span>
        <div className="free-text">
          <h2 id="free-title">{t('home.freeTitle')}</h2>
          <div className="muted-text">{t('home.freeText')}</div>
          {bp === 'desktop' && last && <LastTime chips={lastTimeChips(last)} />}
        </div>
        {bp === 'desktop' && (
          <Link to="/setup" className="btn btn--ink free-btn">
            {t('home.freeStart')}
          </Link>
        )}
      </div>
      {bp !== 'desktop' && last && <LastTime chips={lastTimeChips(last)} />}
      {bp !== 'desktop' && (
        <Link to="/setup" className="btn btn--ink">
          {t('home.freeStart')}
        </Link>
      )}
    </section>
  );

  if (bp === 'desktop') {
    return (
      <AppShell bp={bp} active="/" wide>
        <h1 className="sr-only">{t('home.title')}</h1>
        <div className="home-desk">
          <aside className="home-desk-aside">
            <section aria-label={t('streak.label')} className="card streak-card">
              <span className="streak-badge" aria-hidden="true">
                <span />
              </span>
              <span className="streak-card-text">
                <span className="streak-card-title">{t('streak.pill', { count: days })}</span>
                <span className="muted-text">{t('streak.keep')}</span>
              </span>
            </section>
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
        {continueCard}
        {freeCard}
      </div>
    </AppShell>
  );
}

function LastTime({ chips }: { chips: string[] }): JSX.Element {
  return (
    <div className="last-time">
      <span className="last-time-label">{t('home.lastTime')}</span>
      {chips.map((c) => (
        <span key={c} className="mono-chip">
          {c}
        </span>
      ))}
    </div>
  );
}

/** Desktop Home: the learning-path card (done units, the current unit's tiles, the next locked unit). */
function PathSummary({ currentUnit, currentId }: { currentUnit: Unit; currentId: string | null }): JSX.Element {
  const { state } = useStore();
  const p = state.progress;
  const states = unitStates(p);
  const curIdx = UNITS.indexOf(currentUnit);
  const nextUnit = UNITS[curIdx + 1];
  const totalStars = UNITS.reduce((s, u) => s + unitStars(p, u.id), 0);
  const max = UNITS.reduce((s, u) => s + u.lessons.length * 3, 0);
  const cur = currentId ? currentUnit.lessons.find((l) => l.id === currentId) : null;
  return (
    <Link to="/path" className="card path-card">
      <span className="path-card-head">
        <span className="eyebrow">{t('home.pathEyebrow')}</span>
        <span className="mono-muted" aria-label={t('path.totalsLabel', { stars: totalStars, total: max })}>
          {t('path.totals', { stars: totalStars, total: max })}
        </span>
      </span>
      <span className="path-card-units">
        {UNITS.slice(0, curIdx).map((u, i) =>
          states[i] === 'done' ? (
            <span key={u.id} className="path-card-unit">
              <span className="done-check" aria-hidden="true">
                <Icon name="check" size={12} strokeWidth={3.4} />
              </span>
              <span className="path-card-unit-title">{t('path.unitTitle', { id: u.id, title: tx(u.titleKey) })}</span>
              <span className="path-card-unit-stars" aria-label={t('stars.label', { count: unitStars(p, u.id), total: u.lessons.length * 3 })}>
                {t('home.unitStars', { count: unitStars(p, u.id) })}
              </span>
            </span>
          ) : null,
        )}
      </span>
      {curIdx > 0 && <span className="hairline" />}
      <span className="path-card-current">{t('path.unitTitle', { id: currentUnit.id, title: tx(currentUnit.titleKey) })}</span>
      <LessonTiles unit={currentUnit} progress={p} currentId={currentId} onFill={false} />
      {cur && (
        <span className="muted-text">
          {t('path.next', { lesson: lessonNumber(cur.id), title: tx(cur.title), bpm: lessonSettings(cur.id).tempo })}
        </span>
      )}
      {nextUnit && (
        <>
          <span className="hairline" />
          <span className="path-card-locked">
            <span aria-hidden="true" className="unit-node unit-node--locked unit-node--small">
              {nextUnit.glyph}
            </span>
            <span className="path-card-locked-text">
              <span className="path-card-locked-title">{t('path.unitTitle', { id: nextUnit.id, title: tx(nextUnit.titleKey) })}</span>
              <span className="path-card-locked-sub">
                <Icon name="lock" size={13} strokeWidth={2.4} />
                {t('home.pathLocked', { unit: currentUnit.id })}
              </span>
            </span>
          </span>
        </>
      )}
      <span className="path-card-link">{t('home.pathView')}</span>
    </Link>
  );
}
