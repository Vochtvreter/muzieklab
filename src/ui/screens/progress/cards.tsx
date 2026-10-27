/**
 * The Progress tab's cards (App design canvas, Mobile · Progress, ProgressTablet and ProgressDesktop): the level (a line
 * on phone, a card with the Ranks ladder on tablet and desktop), the Skill levels link, the streak calendar, the skill
 * map, achievements, Read notes per clef, the slowest notes and the last key, and the major and minor scales. They draw
 * what game/progressView.ts works out; each card says something short for a new player instead of an empty chart.
 */
import type { ReactNode } from 'react';
import { staffOffset, type Clef, type Step } from '../../../core/api';
import type { AchievementView, CalendarView, CellView, NotesView, ProgressHeader, ScalesView, SkillsView } from '../../../game/progressView';
import type { CellId } from '../../../game/storage';
import { t } from '../../../i18n';
import { PitchStaff } from '../../../render/PitchStaff';
import { Icon } from '../../components/Icon';
import { ACHIEVEMENT_ICONS } from '../../lib/achievementIcons';
import { andList, rich, starsLabel, starsText } from '../../lib/format';
import { keyPairName, keySignsAria, keySignsText, letterName, majorName, solfegeName } from '../../lib/noteText';
import { circleLabel, keyName } from '../../lib/scaleText';
import { Link } from '../../router';
import { shortDate, weekday } from './text';

/** A card: a section named by its eyebrow heading, with a note on the right of the heading. */
export function Card({ id, title, meta, className, children }: { id: string; title: string; meta?: ReactNode; className?: string; children: ReactNode }): JSX.Element {
  return (
    <section aria-labelledby={id} className={'prog-card' + (className ? ' ' + className : '')}>
      <div className="prog-card-head">
        <h2 id={id} className="eyebrow">
          {title}
        </h2>
        {meta && <span className="prog-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/** The arrow after a button's words. */
const Arrow = (): JSX.Element => <Icon name="arrow" size={18} />;

// --- Level --------------------------------------------------------------------------------------------------------

/** The XP bar: filled for the XP into the current level (DESIGN.md §8.3, as Home's level sheet). */
function XpBar({ h }: { h: ProgressHeader }): JSX.Element {
  return (
    <div role="img" aria-label={t('progress.xpBar', { into: h.into, span: h.span, pct: h.pct, next: h.nextLevel })} className="prog-xp">
      <div style={{ width: `${Math.min(100, (h.into / h.span) * 100)}%` }} />
    </div>
  );
}

const rankName = (rank: string): string => t('rank.' + rank);

/** Phone: "Level 7 · Measure", total XP of where the next level starts, the bar, and what is next. */
export function LevelLine({ h }: { h: ProgressHeader }): JSX.Element {
  return (
    <div className="prog-level">
      <div className="prog-level-row">
        <span>
          <b>{t('xp.level', { level: h.level })}</b>
          {t('xp.rankLine', { rank: rankName(h.rank) })}
        </span>
        <span className="prog-mono">{t('progress.xpOf', { total: h.total, next: h.nextLevelAt })}</span>
      </div>
      <XpBar h={h} />
      <div className="prog-level-next">
        {h.nextRank
          ? rich('progress.toNextRank', { count: h.toNext, next: h.nextLevel }, { rank: <b>{rankName(h.nextRank.rank)}</b> })
          : t('xp.toNext', { count: h.toNext, next: h.nextLevel })}
      </div>
    </div>
  );
}

/** Tablet and desktop: the Level card, with the six ranks (done, now, next, later). */
export function LevelCard({ h }: { h: ProgressHeader }): JSX.Element {
  return (
    <section aria-labelledby="lvl-title" className="prog-card prog-lvl">
      <h2 id="lvl-title" className="prog-lvl-title">
        <span className="prog-lvl-level">{t('xp.level', { level: h.level })}</span>
        <span className="prog-lvl-rank">{t('xp.rankLine', { rank: rankName(h.rank) })}</span>
      </h2>
      <XpBar h={h} />
      <div className="prog-lvl-xp">
        <span className="prog-mono">{t('progress.xpOf', { total: h.total, next: h.nextLevelAt })}</span>
        <span>{rich('progress.toNext', { next: h.nextLevel }, { xp: <b>{t('progress.xp', { count: h.toNext })}</b> })}</span>
      </div>
      <div className="prog-ranks-label" aria-hidden="true">
        {t('progress.ranks')}
      </div>
      <ol aria-label={t('progress.ranks')} className="prog-ranks">
        {h.ranks.map((r) => (
          <li key={r.rank} aria-current={r.state === 'current' ? 'step' : undefined} className={'prog-rank is-' + r.state}>
            <span>{rankName(r.rank)}</span>
            {r.state === 'done' && (
              <>
                <Icon name="check" size={16} />
                <span className="sr-only">{t('progress.rankDone')}</span>
              </>
            )}
            {r.state === 'current' && <span className="prog-rank-note">{t('progress.rankNow', { level: h.level })}</span>}
            {r.state === 'next' && <span className="prog-rank-note">{t('progress.rankNext')}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The link to Skill levels: "25 of 60 levels · 6 skills · 1 review due". */
export function SkillLevelsLink({ skills }: { skills: SkillsView }): JSX.Element {
  return (
    <Link to="/progress/skills" className="prog-skills">
      <span className="prog-skills-icon" aria-hidden="true">
        <Icon name="stairs" size={22} strokeWidth={2.2} />
      </span>
      <span className="prog-skills-text">
        <b>{t('skills.title')}</b>
        <span>{t('progress.skillsSub', { total: skills.total, max: skills.max, count: skills.skills.length, due: skills.reviewDue.length })}</span>
      </span>
      <Icon name="chevron" size={20} strokeWidth={2.2} className="prog-skills-chevron" />
    </Link>
  );
}

// --- Streak calendar ----------------------------------------------------------------------------------------------

/** More missed days than this are counted in the calendar's label instead of listed. */
const LIST_MISSED = 8;

function calendarLabel(cal: CalendarView): string {
  const clauses = [t('progress.calendar.practised', { count: cal.practised, total: cal.elapsed })];
  if (cal.missed.length > LIST_MISSED) clauses.push(t('progress.calendar.missedCount', { count: cal.missed.length }));
  else if (cal.missed.length > 0) clauses.push(t('progress.calendar.missed', { days: andList(cal.missed.map(shortDate)) }));
  const { streakStart: start, streakEnd: end } = cal;
  clauses.push(
    !start || !end
      ? t('progress.calendar.noStreak')
      : start === end
        ? t('progress.calendar.streakDay', { day: shortDate(end) })
        : end === cal.today
          ? t('progress.calendar.streakToday', { start: shortDate(start), today: shortDate(end) })
          : t('progress.calendar.streakUntil', { start: shortDate(start), end: shortDate(end) }),
  );
  return t('progress.calendar.label', {
    from: shortDate(cal.first),
    to: shortDate(cal.last),
    details: clauses.reduce((a, b) => t('progress.calendar.join', { a, b })),
  });
}

/** The streak card: five weeks, Monday first, ending this week; streak days gold, earlier practice days a gold tint. */
export function StreakCard({ cal }: { cal: CalendarView }): JSX.Element {
  return (
    <section aria-labelledby="streak-title" className="prog-card prog-streak">
      <div className="prog-card-head prog-streak-head">
        <h2 id="streak-title" className="prog-streak-title">
          <span className="prog-streak-dot" aria-hidden="true" />
          {t('streak.pill', { count: cal.streak })}
        </h2>
        <span className="prog-meta">{t('progress.calendar.range', { from: shortDate(cal.first), to: shortDate(cal.last) })}</span>
      </div>
      <div role="img" aria-label={calendarLabel(cal)} className="prog-cal">
        {cal.weeks[0].map((d, i) => (
          <span key={'wd' + i} className={'prog-cal-wd' + (i === cal.todayIndex ? ' is-today' : '')}>
            {weekday(d.date, 'narrow')}
          </span>
        ))}
        {cal.weeks.flat().map((d) => (
          <span key={d.date} title={t('progress.calendar.day', { date: shortDate(d.date), state: t('progress.calendar.state.' + (d.isToday && d.state === 'streak' ? 'streakToday' : d.state)) })}
            className={'prog-cal-day is-' + d.state + (d.isToday ? ' is-now' : '')}>
            {d.day}
          </span>
        ))}
      </div>
      <div className="prog-legend">
        <span>
          <span className="prog-swatch is-streak" />
          {t('progress.calendar.legendStreak')}
        </span>
        <span>
          <span className="prog-swatch is-practised" />
          {t('progress.calendar.legendPractised')}
        </span>
        <span>
          <span className="prog-swatch is-missed" />
          {t('progress.calendar.legendMissed')}
        </span>
        <span>
          <span className="prog-swatch is-now" />
          {t('progress.calendar.legendToday')}
        </span>
        <span className="prog-legend-end">{t('progress.calendar.count', { count: cal.practised, total: cal.elapsed })}</span>
      </div>
    </section>
  );
}

// --- Skill map ----------------------------------------------------------------------------------------------------

/** Each cell's notes, as the boards write them (Noto Music). */
const GLYPH: Record<CellId, string> = {
  quarter: '\u{1D158}\u{1D165}',
  half: '\u{1D157}\u{1D165}',
  eighths: '\u{1D158}\u{1D165}\u{1D16E}\u{1D158}\u{1D165}\u{1D16E}',
  rests: '\u{1D13D}',
  ties: '\u{1D158}\u{1D165}⁀\u{1D158}\u{1D165}',
  dottedHalf: '\u{1D157}\u{1D165}.',
  dottedQE: '\u{1D158}\u{1D165}.\u{1D158}\u{1D165}\u{1D16E}',
  sixteenths: '\u{1D158}\u{1D165}\u{1D16F}\u{1D158}\u{1D165}\u{1D16F}',
};

function cellLabel(c: CellView): string {
  const name = t(c.name);
  if (c.locked) return t('progress.cells.locked', { name, unit: c.unlockUnit });
  if (c.accuracy === null) return t('progress.cells.none', { name });
  return t(c.weak ? 'progress.cells.weak' : 'progress.cells.value', { name, value: c.accuracy });
}

/**
 * The skill map: the eight rhythm cells by rolling accuracy (90%+, 80–89%, under 80% a weak spot; locked until the
 * Learning path opens them), and Practice weak spots when there is a cell with enough notes (`onPractice`).
 */
export function SkillMapCard({ cells, onPractice }: { cells: CellView[]; onPractice: (() => void) | null }): JSX.Element {
  return (
    <Card id="skill-title" title={t('progress.cells.title')} meta={t('progress.cells.meta')} className="prog-map">
      <div role="list" className="prog-cells">
        {cells.map((c) => (
          <div key={c.id} role="listitem" aria-label={cellLabel(c)} className={'prog-cell is-' + (c.locked ? 'locked' : (c.band ?? 'none'))}>
            <span className="prog-cell-top" aria-hidden="true">
              <span className="prog-cell-glyph">{GLYPH[c.id]}</span>
              {c.locked ? (
                <span className="prog-cell-lock">
                  {t('progress.cells.lockedShort')}
                  <Icon name="lock" size={16} />
                </span>
              ) : (
                <span className="prog-cell-value">
                  {c.weak && <Icon name="alert" size={15} />}
                  {c.accuracy === null ? t('common.dash') : t('common.percent', { value: c.accuracy })}
                </span>
              )}
            </span>
            <span className="prog-cell-name" aria-hidden="true">
              {t(c.name)}
            </span>
          </div>
        ))}
      </div>
      <div className="prog-map-foot">
        <div className="prog-legend prog-map-legend">
          <span>
            <span className="prog-swatch is-high" />
            {t('progress.cells.legendHigh')}
          </span>
          <span>
            <span className="prog-swatch is-mid" />
            {t('progress.cells.legendMid')}
          </span>
          <span>
            <span className="prog-swatch is-weak" />
            {t('progress.cells.legendWeak')}
          </span>
        </div>
        {onPractice && (
          <Link to="/setup" className="btn btn--accent prog-btn"
            onClick={(e) => {
              // A new tab (Ctrl, Cmd, Shift or a middle click) just opens the setup; this tab's setup stays as it is.
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              onPractice();
            }}>
            {t('progress.cells.practice')}
            <Arrow />
          </Link>
        )}
      </div>
    </Card>
  );
}

// --- Achievements -------------------------------------------------------------------------------------------------

/** The five achievements: earned ones in gold with their icon, the others locked; what each asks for, for screen readers. */
export function AchievementsCard({ list, earned }: { list: AchievementView[]; earned: number }): JSX.Element {
  return (
    <Card id="ach-title" title={t('progress.achievements.title')} meta={t('progress.achievements.earned', { count: earned })} className="prog-ach">
      <ul className="prog-badges">
        {list.map((a) => (
          <li key={a.id} className={'prog-badge' + (a.earned ? ' is-earned' : '')}>
            <span className="prog-badge-icon" aria-hidden="true">
              <Icon name={a.earned ? ACHIEVEMENT_ICONS[a.id] : 'lock'} size={22} />
            </span>
            <span className="prog-badge-name">{t(a.name)}</span>
            <span className="prog-badge-status">{t(a.earned ? 'progress.achievements.statusEarned' : 'progress.achievements.statusLocked')}</span>
            <span className="sr-only">{t(a.text)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- Notes view ---------------------------------------------------------------------------------------------------

const CLEF_GLYPH: Record<Clef, string> = { treble: '\u{1D11E}', bass: '\u{1D122}' };

/** Accuracy per clef over every Read notes round. */
export function ClefCard({ notes }: { notes: NotesView }): JSX.Element {
  const played = notes.clefs.some((c) => c.accuracy !== null);
  const parts = andList(
    notes.clefs.map((c) =>
      c.accuracy === null
        ? t('progress.clefs.partNone', { clef: t('notes.clefLower.' + c.clef) })
        : t('progress.clefs.part', { clef: t('notes.clefLower.' + c.clef), value: c.accuracy }),
    ),
  );
  return (
    <Card id="clef-title" title={t('progress.clefs.title')} meta={t('progress.clefs.meta')}>
      {played ? (
        <div role="img" aria-label={t('progress.clefs.label', { parts })} className="prog-clefs">
          {notes.clefs.map((c) => (
            <div key={c.clef} className="prog-clef">
              <span className="prog-clef-glyph">{CLEF_GLYPH[c.clef]}</span>
              <span className="prog-clef-name">{t('notes.clef.' + c.clef)}</span>
              <span className="prog-meter">
                <span style={{ width: `${c.accuracy ?? 0}%` }} />
              </span>
              <span className="prog-clef-value">{c.accuracy === null ? t('common.dash') : t('common.percent', { value: c.accuracy })}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="prog-empty">{t('progress.clefs.empty')}</p>
      )}
    </Card>
  );
}

/** Where a note sits, short: "top space", "first ledger line below" (Read notes' positionText has "the …"). */
function placeText(clef: Clef, step: Step): string {
  const o = staffOffset(clef, step);
  if (o >= 0 && o <= 8) return t(o % 2 === 0 ? `progress.pos.line${o / 2 + 1}` : `progress.pos.space${(o + 1) / 2}`);
  if (o === -1) return t('progress.pos.spaceBelow');
  if (o === 9) return t('progress.pos.spaceAbove');
  const d = o < 0 ? -o : o - 8;
  const n = Math.min(2, Math.floor(d / 2));
  const dir = o < 0 ? (d % 2 === 0 ? 'ledgerBelow' : 'underLedger') : d % 2 === 0 ? 'ledgerAbove' : 'overLedger';
  return t('progress.pos.' + dir, { n });
}

/** Bars of the slowest notes fill at this many seconds. */
const SLOW_FULL_S = 3.2;

/** The three notes answered slowest on average (three answers or more), with where each sits. */
export function SlowCard({ notes, solfege }: { notes: NotesView; solfege: boolean }): JSX.Element {
  const played = notes.clefs.some((c) => c.answered > 0);
  return (
    <Card id="slow-title" title={t('progress.slow.title')} meta={t('progress.slow.meta')} className="prog-slow-card">
      {notes.slowest.length > 0 ? (
        <ul className="prog-slow">
          {notes.slowest.map((n) => (
            <li key={n.id} className="prog-slow-row">
              <span className="prog-slow-glyph" aria-hidden="true">
                {CLEF_GLYPH[n.clef]}
              </span>
              <span className="prog-slow-text">
                <b>{(solfege ? solfegeName : letterName)(n.letter, n.alter)}</b>
                <span>{t('progress.slow.where', { pos: placeText(n.clef, n.step), clef: t('progress.clef.' + n.clef) })}</span>
              </span>
              <span className="prog-meter prog-meter--slow" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (n.seconds / SLOW_FULL_S) * 100)}%` }} />
              </span>
              <span className="prog-slow-time">{t('progress.slow.seconds', { value: n.seconds })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="prog-empty">{t(played ? 'progress.slow.few' : 'progress.slow.empty')}</p>
      )}
    </Card>
  );
}

/** The last round's key: its signature drawn on the staff, its name and what it does; and Read notes. */
export function KeyCard({ lastKey }: { lastKey: NotesView['lastKey'] }): JSX.Element {
  return (
    <Card id="key-title" title={t('progress.key.title')} meta={lastKey && t('progress.key.meta', { clef: t('progress.clef.' + lastKey.clef) })}>
      {lastKey ? (
        <div className="prog-key">
          <span className="prog-key-staff">
            <PitchStaff clef={lastKey.clef} keyId={lastKey.key} notes={[]} slots={0} room={1.5}
              label={t('progress.key.label', { major: majorName(lastKey.key), signs: keySignsAria(lastKey.key) })} />
          </span>
          <span className="prog-key-text">
            <b>{keyPairName(lastKey.key)}</b>
            <span>{keySignsText(lastKey.key)}</span>
          </span>
        </div>
      ) : (
        <p className="prog-empty">{t('progress.key.empty')}</p>
      )}
      <Link to="/notes" className="btn btn--outline prog-btn prog-btn--outline">
        {t('progress.key.read')}
        <Arrow />
      </Link>
    </Card>
  );
}

// --- Scales view --------------------------------------------------------------------------------------------------

/** The 15 major scales round the circle with their best stars; ★★ and up tinted. */
export function MajorsCard({ scales }: { scales: ScalesView }): JSX.Element {
  const total = scales.majors.length;
  return (
    <Card id="maj-title" title={t('progress.majors.title')}
      meta={rich('progress.majors.meta', {}, { count: <b>{t('progress.majors.count', { done: scales.majorsDone, total })}</b> })}>
      <div role="img" aria-label={t('progress.majors.label', { done: scales.majorsDone, total })} className="prog-track">
        <div style={{ width: `${(scales.majorsDone / total) * 100}%` }} />
      </div>
      <ul className="prog-majors">
        {scales.majors.map((m) => (
          <li key={m.key} aria-label={t('progress.majors.tile', { name: keyName(m.key, false), stars: starsLabel(m.stars) })}
            className={'prog-major is-' + Math.min(2, m.stars)}>
            <span aria-hidden="true" className="prog-major-name">
              {circleLabel(m.key, false)}
            </span>
            <span aria-hidden="true" className="prog-major-stars">
              {starsText(m.stars)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const MINOR_FORMS = ['natural', 'harmonic', 'melodic'] as const;

/** The minor keys started, with the best stars of each form; and the way to the circle of fifths. */
export function MinorsCard({ scales }: { scales: ScalesView }): JSX.Element {
  return (
    <Card id="min-sc-title" title={t('progress.minors.title')} className="prog-minors-card"
      meta={rich('progress.minors.meta', {}, { count: <b>{t('progress.minors.count', { done: scales.minorsStarted, total: scales.majors.length })}</b> })}>
      {scales.minors.length > 0 ? (
        <table className="prog-minors">
          <thead>
            <tr>
              <th scope="col">{t('progress.minors.key')}</th>
              {MINOR_FORMS.map((f) => (
                <th key={f} scope="col">
                  {t('progress.minors.' + f)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scales.minors.map((m) => (
              <tr key={m.key}>
                <th scope="row">{keyName(m.key, true)}</th>
                {MINOR_FORMS.map((f) => (
                  <td key={f} aria-label={starsLabel(m[f])} className={m[f] > 0 ? 'is-on' : undefined}>
                    {starsText(m[f])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="prog-empty">{t('progress.minors.empty')}</p>
      )}
      <Link to="/scales" className="btn btn--outline prog-btn prog-btn--outline prog-btn--end">
        {t('progress.minors.circle')}
        <Arrow />
      </Link>
    </Card>
  );
}
