/**
 * The Progress tab (v1.5; App design canvas, Mobile · Progress, ProgressTablet and ProgressDesktop; DESIGN.md §8.5).
 * A switch picks Rhythm, Notes or Scales; it changes only the cards below.
 *
 * - Phone: the title with the streak, the level line and the switch stay at the top while the cards scroll under them
 *   (the whole page scrolls on a phone under 700 px tall, so a phone browser still shows the cards). The Skill levels
 *   link heads every view; the streak calendar and the achievements are in the Rhythm view.
 * - Tablet (and a phone on its side): the title and the switch, the Level card beside the streak calendar, Skill levels,
 *   then the view's cards in two columns (the skill map full width).
 * - Desktop: the Level card, Skill levels and the streak calendar in a column on the left, the view's cards beside it.
 */
import { useMemo, useState } from 'react';
import { progressView } from '../../../game/progressView';
import { weakSpotsSettings, weakSpotsShows } from '../../../game/weakSpots';
import { t } from '../../../i18n';
import { AppShell } from '../../components/AppShell';
import { Segmented } from '../../components/Controls';
import { StreakPill } from '../../components/Reward';
import { useBreakpoint, useDocTitle, useToday } from '../../hooks';
import { FROM_PROGRESS } from '../../lib/learnReturn';
import { navigate } from '../../router';
import { todayIso, useStore } from '../../store';
import {
  AchievementsCard,
  ClefCard,
  KeyCard,
  LevelCard,
  LevelLine,
  MajorsCard,
  MinorsCard,
  SkillLevelsLink,
  SkillMapCard,
  SlowCard,
  StreakCard,
} from './cards';
import { AccuracyCard, MinutesCard, TimingCard } from './charts';

type View = 'rhythm' | 'notes' | 'scales';
const VIEWS: View[] = ['rhythm', 'notes', 'scales'];

export function ProgressScreen(): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('progress.title') }));
  const today = useToday(todayIso);
  // The view stays picked while the tab is open; every visit starts on Rhythm (the boards' default).
  const [view, setView] = useState<View>('rhythm');
  const v = useMemo(() => progressView(state.progress, today), [state.progress, today]);

  // Practice weak spots: the rhythm setup with what the weak cells need, then the setup screen, where Start plays it
  // with a note of each weak cell. The setup's back arrow returns here, and so does Results' after a round started there.
  const weak = useMemo(() => weakSpotsSettings(state.settings, v.cells), [state.settings, v.cells]);
  const practice = weak
    ? (): void => {
        dispatch({ type: 'settings', settings: weak, shows: weakSpotsShows(v.cells) });
        navigate('/setup', { query: FROM_PROGRESS });
      }
    : null;
  const solfege = state.prefs.noteNames === 'solfege';

  const switcher = (
    <Segmented<View> label={t('progress.show')} value={view} onChange={setView} className="prog-seg"
      options={VIEWS.map((x) => ({ value: x, label: t('progress.view.' + x) }))} />
  );
  const skills = <SkillLevelsLink skills={v.skills} />;
  const streak = <StreakCard cal={v.calendar} />;
  const accuracy = <AccuracyCard data={v.accuracy} size={bp} />;
  const timing = <TimingCard data={v.timing} size={bp} />;
  const minutes = <MinutesCard data={v.minutes} size={bp} />;
  const map = <SkillMapCard cells={v.cells} onPractice={practice} />;
  const achievements = <AchievementsCard list={v.achievements.list} earned={v.achievements.earned} />;
  const clefs = <ClefCard notes={v.notes} />;
  const slow = <SlowCard notes={v.notes} solfege={solfege} />;
  const key = <KeyCard lastKey={v.notes.lastKey} />;
  const majors = <MajorsCard scales={v.scales} />;
  const minors = <MinorsCard scales={v.scales} />;

  if (bp === 'phone') {
    return (
      <AppShell bp={bp} active="/progress">
        <div className="page prog prog--phone no-scrollbar">
          <div className="prog-head">
            <div className="prog-title-row">
              <h1 className="page-title">{t('progress.title')}</h1>
              <StreakPill days={v.header.streak} />
            </div>
            <LevelLine h={v.header} />
            {switcher}
          </div>
          <div className="prog-body no-scrollbar">
            {skills}
            {view === 'rhythm' && (
              <>
                {streak}
                {accuracy}
                {minutes}
                {map}
                {timing}
                {achievements}
              </>
            )}
            {view === 'notes' && (
              <>
                {clefs}
                {slow}
                {key}
              </>
            )}
            {view === 'scales' && (
              <>
                {majors}
                {minors}
              </>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  // Tablet and desktop: the same grids for each view (the boards), beside the aside on desktop.
  const cards =
    view === 'rhythm' ? (
      <>
        <div className="prog-grid">
          {accuracy}
          {timing}
        </div>
        {map}
        <div className="prog-grid">
          {minutes}
          {achievements}
        </div>
      </>
    ) : view === 'notes' ? (
      <div className="prog-grid prog-grid--top">
        <div className="prog-col">
          {clefs}
          {key}
        </div>
        {slow}
      </div>
    ) : (
      <div className="prog-grid">
        {majors}
        {minors}
      </div>
    );
  const head = (
    <div className="prog-wide-head">
      <h1 className="page-title">{t('progress.title')}</h1>
      {switcher}
    </div>
  );

  if (bp === 'tablet') {
    return (
      <AppShell bp={bp} active="/progress" fill>
        <div className="page prog prog--wide prog--tablet no-scrollbar">
          {head}
          <div className="prog-grid">
            <LevelCard h={v.header} />
            {streak}
          </div>
          {skills}
          {cards}
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell bp={bp} active="/progress" fill>
      <div className="page prog prog--wide prog--desk no-scrollbar">
        {head}
        <div className="prog-desk">
          <aside className="prog-aside">
            <LevelCard h={v.header} />
            {skills}
            {streak}
          </aside>
          <div className="prog-main">{cards}</div>
        </div>
      </div>
    </AppShell>
  );
}
