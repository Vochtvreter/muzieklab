/**
 * Home: streak and level chips, Continue (the next lesson), the daily challenge and Free practice (Rhythm, Read notes,
 * Scales). The level chip opens the level details in a sheet.
 * Desktop (App design canvas, Desktop · Home): a left column with streak and level, the daily challenge and the path
 * summary, next to Continue and the practice tiles.
 */
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { exerciseView } from '../exerciseView';
import { dailyChallenge, reachedUnit } from '../../game/daily';
import { ALL_LESSONS, lessonSettings, UNITS, type Unit } from '../../game/path';
import { streak } from '../../game/storage';
import { levelInfo, type LevelInfo } from '../../game/xp';
import { dateParts, t, tx } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { LessonTiles, StaffBox } from '../components/Bits';
import { DateTile, LevelContent, XpBar } from '../components/Reward';
import { Sheet } from '../components/Sheet';
import { useBreakpoint, useDocTitle, useLingering, useToday } from '../hooks';
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

const RING_R = 5;
const RING_C = 2 * Math.PI * RING_R;

/** "Level 1" beside the streak, with a small ring for the XP into the level; opens the level details. */
function LevelChip({ info, onOpen, chipRef }: { info: LevelInfo; onOpen(): void; chipRef: Ref<HTMLButtonElement> }): JSX.Element {
  const pct = info.span > 0 ? Math.max(0, Math.min(1, info.into / info.span)) : 0;
  return (
    <button ref={chipRef} type="button" className="level-chip" aria-haspopup="dialog" onClick={onOpen}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="level-ring">
        <circle cx="7" cy="7" r={RING_R} className="level-ring-track" />
        <circle cx="7" cy="7" r={RING_R} className="level-ring-fill" strokeDasharray={`${(RING_C * pct).toFixed(2)} ${RING_C.toFixed(2)}`}
          transform="rotate(-90 7 7)" />
      </svg>
      {t('xp.level', { level: info.level })}
    </button>
  );
}

/**
 * The lesson as a preview (same every visit): a bar that shows what the lesson adds, e.g. a half rest in "Half rests".
 * One bar on phones; two from tablet up, where one bar left most of the card empty.
 */
function LessonPreview({ lessonId, wide, count = 1 }: { lessonId: string; wide?: boolean; count?: 1 | 2 }): JSX.Element | null {
  const preview = useMemo(() => lessonPreview(lessonId), [lessonId]);
  const view = preview ? exerciseView(preview.run.exercise) : null;
  const from = preview && view ? Math.max(0, Math.min(preview.bar, view.bars.length - count)) : 0;
  // The same array between renders, so the staff is not drawn again whenever Home renders.
  const bars = useMemo(() => view?.bars.slice(from, from + count) ?? [], [view, from, count]);
  if (!preview || !view || bars.length === 0) return null;
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
  // Nothing played on the path yet: the card starts the first lesson instead of continuing.
  const fresh = !!cont && !cont.done && !ALL_LESSONS.some((x) => state.progress.lessons[x.lesson.id]);
  const xp = levelInfo(state.progress.xp);
  const reached = reachedUnit(state.progress);
  const daily = useMemo(() => dailyChallenge(today, reached).settings, [today, reached]);
  const dailyDone = state.progress.daily?.day === today ? state.progress.daily : null;

  // The level details (phone, tablet): a sheet from the level chip; focus goes back to the chip when it closes.
  const [levelSheet, setLevelSheet] = useState<'open' | null>(null);
  const { shown: levelShown, closing } = useLingering(levelSheet, 240);
  const chip = useRef<HTMLButtonElement>(null);
  const closeLevel = (): void => {
    setLevelSheet(null);
    chip.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!levelSheet) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeLevel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [levelSheet]);

  const dailyText = (
    <div className="daily-text">
      <h2 id="daily-title">{t('home.dailyTitle')}</h2>
      <div className="muted-text">{t('home.dailyMeta', { bars: t('common.bars', { count: daily.bars }) })}</div>
      {dailyDone && <div className="daily-done">{t('home.dailyDone', { accuracy: Math.round(dailyDone.accuracy) })}</div>}
    </div>
  );
  // Outlined: Continue is the one filled button on Home.
  const dailyButton = (
    <button type="button" className="btn btn--outline daily-btn" aria-label={t('home.dailyPlayLabel', { date: dateParts(today).long })} onClick={startDaily}>
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
          {t(cont.done ? 'home.replayEyebrow' : fresh ? 'home.startEyebrow' : 'home.continueEyebrow', {
            unit: cont.unit.id,
            lesson: lessonNumber(cont.lesson.id),
            total: cont.unit.lessons.length,
          })}
        </div>
        <h2 id="continue-title" className="continue-title">
          {tx(cont.lesson.title)}
        </h2>
      </div>
      {/* No meter, bars or tempo over the staff: the staff shows the meter, the lesson title says what it is. */}
      <div className={'continue-staff' + (bp === 'desktop' ? ' continue-staff--wide' : '')}>
        <div className="continue-staff-body">
          <LessonPreview lessonId={cont.lesson.id} wide={bp !== 'phone'} count={bp === 'phone' ? 1 : 2} />
        </div>
      </div>
      {bp !== 'desktop' && <LessonTiles unit={cont.unit} progress={state.progress} currentId={cont.lesson.id} onFill onPick={startLesson} />}
      <button type="button" className="btn btn--on-fill continue-btn" onClick={() => startLesson(cont.lesson.id)}>
        {t(cont.done ? 'home.replayButton' : fresh ? 'home.startButton' : 'home.continueButton')}
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
                <XpBar info={xp} />
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
      <div className={'page home' + (bp === 'tablet' ? ' home--tablet' : '')}>
        <div className="home-head">
          {bp === 'phone' ? (
            <>
              <div className="brand brand--home">{t('app.name')}</div>
              <h1 className="sr-only">{t('home.title')}</h1>
            </>
          ) : (
            <h1 className="page-title">{t('home.title')}</h1>
          )}
          <div className="home-chips">
            <LevelChip info={xp} onOpen={() => setLevelSheet('open')} chipRef={chip} />
            <StreakPill days={days} />
          </div>
        </div>
        {continueCard}
        {dailyCard}
        {freeCard}
      </div>
      {levelShown && (
        <Sheet variant="sheet" closing={closing} panelKey="level" labelledBy="leveluptitle">
          <LevelContent xp={state.progress.xp} onDone={closeLevel} />
        </Sheet>
      )}
    </AppShell>
  );
}

/** Desktop Home: the learning-path card (the current unit, a bar of all units, its lesson tiles and the next lesson). */
function PathSummary({ currentUnit, currentId }: { currentUnit: Unit; currentId: string | null }): JSX.Element {
  const { state, dispatch } = useStore();
  const p = state.progress;
  const states = unitStates(p);
  const cur = currentId ? currentUnit.lessons.find((l) => l.id === currentId) : null;
  return (
    // The card shows the rhythm path, so it opens that path (not the one picked last on the Path tab).
    <Link to="/path" className="card path-card" onClick={() => dispatch({ type: 'prefs', patch: { pathTrack: 'rhythm' } })}>
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
          {t('path.next', { lesson: cur.id, title: tx(cur.title), bpm: lessonSettings(cur.id).tempo })}
        </span>
      )}
      <span className="path-card-link">{t('home.pathView')}</span>
    </Link>
  );
}
