/**
 * Progress → Skill levels (App design canvas, Mobile · Progress · skill levels): the last 30 days in two tiles, the six
 * skills (each a link to its own screen) with a 10-segment level meter, Focus next and the footnote.
 * Phone: as the board, with the tab bar (Progress current); on a phone at least 700 px tall the head stays at the top
 * while the rest scrolls under it. Tablet and desktop have no board: the same content in the 640 px column under the
 * top header, as Settings' sub-pages, with Progress current in the header.
 *
 * Also the pieces the one-skill screen (SkillDetail) shares: the way back, the skill's icon tile, the level meter, a
 * level's name and the skill's button.
 */
import type { MouseEvent } from 'react';
import { skillsView, type SkillView } from '../../../game/progressView';
import { echoPreset, notesPreset, REVIEW_DAYS, SKILL_LEVELS, type SkillCta } from '../../../game/skills';
import type { SkillId } from '../../../game/storage';
import { hasMessage, t, translateParams } from '../../../i18n';
import { AppShell } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { useBreakpoint, useDocTitle, useToday } from '../../hooks';
import { andList, labelText, rich } from '../../lib/format';
import { fromSkills } from '../../lib/learnReturn';
import { Link, type Route } from '../../router';
import { todayIso, useStore } from '../../store';

/** Each skill's glyph (Noto Music) on its tile; Scales and Theory draw an icon instead. */
const GLYPH: Partial<Record<SkillId, string>> = {
  rhythm: '\u{1D158}\u{1D165}\u{1D16E}',
  ear: '\u{1D13D}\u{1D157}\u{1D165}',
  treble: '\u{1D11E}',
  bass: '\u{1D122}',
};

/** The skill's icon tile: 44 px on the list, 52 px (`big`) at the top of its own screen. */
export function SkillIcon({ skill, big }: { skill: SkillId; big?: boolean }): JSX.Element {
  const glyph = GLYPH[skill];
  return (
    <span className={'skill-icon' + (big ? ' skill-icon--big' : '')} aria-hidden="true">
      {glyph ? (
        <span className="skill-glyph">{glyph}</span>
      ) : skill === 'scales' ? (
        // Four noteheads going up a scale.
        <svg width={big ? 34 : 30} height={big ? 30 : 26} viewBox="0 0 34 30" fill="none" stroke="currentColor" strokeWidth={big ? 2 : 2.2}>
          <ellipse cx="5" cy="25" rx="4" ry="3" />
          <ellipse cx="13" cy="19" rx="4" ry="3" />
          <ellipse cx="21" cy="12" rx="4" ry="3" />
          <ellipse cx="29" cy="5" rx="4" ry="3" />
        </svg>
      ) : (
        <Icon name="book" size={big ? 28 : 24} />
      )}
    </span>
  );
}

/**
 * The 10-segment level meter: the levels passed in the accent, and the next level in gold as far as its checks are done.
 * With `label` it is an image with that name; without, the row or head around it says it.
 */
export function LevelMeter({ skill, big, label }: { skill: SkillView; big?: boolean; label?: string }): JSX.Element {
  const next = skill.next;
  const part = next && next.total > 0 ? Math.round((next.done / next.total) * 100) : 0;
  return (
    <span className={'skill-meter' + (big ? ' skill-meter--big' : '')} role={label ? 'img' : undefined} aria-label={label}
      aria-hidden={label ? undefined : true}>
      {Array.from({ length: SKILL_LEVELS }, (_, i) => (
        <span key={i} className="skill-seg">
          {i < skill.level ? (
            <span className="skill-seg-fill" />
          ) : i === skill.level && part > 0 ? (
            <span className="skill-seg-fill is-part" style={{ width: part + '%' }} />
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * A skill's button (Focus next, the skill's screen): a link to where it is practised. Rhythm by ear first puts Echo
 * mode on the rhythm setup, the clefs put their clef on the Read notes setup, so the setup opens ready to start.
 * `from` is the screen it is on (fromSkills): the setup or the Scales tab it opens goes back there. A tab it opens (the
 * Path, Learn) has no way back to keep. `review`: the Review due card's smaller dark button, without the arrow.
 */
export function SkillCtaLink({ cta, from, review }: { cta: SkillCta; from: string; review?: boolean }): JSX.Element {
  const { state, dispatch } = useStore();
  const target = cta.target;
  const tab = target.to === '/path' || target.to.startsWith('/learn');
  const apply = (e: MouseEvent): void => {
    // A click that opens the link in a new tab or window leaves this tab's setup as it is.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target.kind === 'echo') dispatch({ type: 'settings', settings: echoPreset(state.settings) });
    else if (target.kind === 'notes') dispatch({ type: 'noteSettings', settings: notesPreset(state.noteSettings, target.clef) });
  };
  return (
    <Link to={target.to as Route} query={tab ? undefined : from} className={review ? 'btn btn--ink skill-review-btn' : 'btn btn--accent skill-cta'} onClick={apply}>
      {labelText(cta.label)}
      {!review && <Icon name="arrow" size={18} strokeWidth={2.2} />}
    </Link>
  );
}

/**
 * A level's name as said, for screen readers: a name that writes a sign ("D and B♭ major"), which a reader says as a
 * symbol or skips, has its words in skills.levelSpoken ("D and B flat major", Dutch "D en bes majeur"); any other name
 * is said as it is written.
 */
export function levelSpoken(name: string): string {
  const said = name.replace(/^skills\.level\./, 'skills.levelSpoken.');
  return t(said !== name && hasMessage(said) ? said : name);
}

/** A level's name (a message key): as written, and in words for screen readers where it writes a sign (levelSpoken). */
export function LevelName({ name }: { name: string }): JSX.Element {
  const shown = t(name);
  const said = levelSpoken(name);
  if (said === shown) return <>{shown}</>;
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{said}</span>
    </>
  );
}

/** "Rhythm reading: level 6 of 10. 1 of 3 checks for level 7, Dotted notes. +1 this month." */
function rowLabel(s: SkillView): string {
  const next = s.next;
  const parts = [t('skills.list.rowLevel', { name: t(s.name), level: s.level, max: SKILL_LEVELS })];
  if (!next) parts.push(t('skills.list.rowDone'));
  else if (next.later) parts.push(t('skills.list.rowLater', { n: next.n, next: levelSpoken(next.name) }));
  else parts.push(t('skills.list.rowChecks', { done: next.done, total: next.total, n: next.n, next: levelSpoken(next.name) }));
  if (s.chip) parts.push(labelText(s.chip.label) + '.');
  return parts.join(' ');
}

function SkillRow({ skill: s }: { skill: SkillView }): JSX.Element {
  return (
    <li>
      <Link to={`/progress/skills/${s.id}`} className="skill-row" aria-label={rowLabel(s)}>
        <SkillIcon skill={s.id} />
        <span className="skill-row-text" aria-hidden="true">
          <span className="skill-row-head">
            <span className="skill-row-name">{t(s.name)}</span>
            {s.chip && <span className={'skill-chip skill-chip--' + s.chip.kind}>{labelText(s.chip.label)}</span>}
          </span>
          <LevelMeter skill={s} />
          <span className="skill-row-line">
            <b>{t('skills.list.level', { level: s.level })}</b>
            {' · '}
            {s.next ? t('skills.list.next', { name: t(s.next.name) }) : t('skills.list.allPassed')}
          </span>
        </span>
        <Icon name="chevron" size={20} strokeWidth={2.2} className="skill-chevron" />
      </Link>
    </li>
  );
}

/** The back link at the top of the skill screens: a chevron and the screen it goes back to. */
export function SkillBack({ to, text, label }: { to: Route; text: string; label: string }): JSX.Element {
  return (
    <Link to={to} className="skill-back" aria-label={label}>
      <Icon name="back" size={22} strokeWidth={2.2} />
      {text}
    </Link>
  );
}

/** Progress → Skill levels (App design canvas, Mobile · Progress · skill levels; #/progress/skills). */
export function Skills(): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  const today = useToday(todayIso);
  useDocTitle(t('app.docTitle', { page: t('skills.title') }));
  const view = skillsView(state.progress, today);
  const due = view.reviewDue;
  const names = andList(due.map((id) => t(`skills.name.${id}`)));
  const focus = view.focus.label;

  return (
    <AppShell bp={bp} active="/progress">
      <div className="page skill-page no-scrollbar">
        <div className="skill-head">
          <SkillBack to="/progress" text={t('nav.progress')} label={t('skills.list.back')} />
          <div className="skill-title-row">
            <h1 className="page-title">{t('skills.title')}</h1>
            <span className="skill-total" role="img" aria-label={t('skills.list.totalLabel', { total: view.total, max: view.max })}>
              <span aria-hidden="true" className="skill-total-n">
                {t('skills.list.total', { total: view.total, max: view.max })}
              </span>
              <span aria-hidden="true">{t('skills.list.totalWord')}</span>
            </span>
          </div>
        </div>

        <div className="skill-body no-scrollbar">
          <section aria-label={t('skills.list.recent')} className="card skill-tiles">
            <div className="skill-tile skill-tile--gain">
              <span className="skill-tile-n">{view.gained > 0 ? '+' + view.gained : '0'}</span>
              <span className="skill-tile-label">{t('skills.list.gained', { count: view.gained })}</span>
            </div>
            <div className={'skill-tile ' + (due.length ? 'skill-tile--review' : 'skill-tile--calm')}>
              <span className="skill-tile-n">{due.length}</span>
              <span className="skill-tile-label">{due.length ? t('skills.list.review', { count: due.length, names }) : t('skills.list.noReview')}</span>
            </div>
          </section>

          <section aria-labelledby="skills-title" className="skill-section">
            <div className="skill-section-head">
              <h2 id="skills-title" className="eyebrow">
                {t('skills.list.yours')}
              </h2>
              <span className="skill-meta">{t('skills.list.each', { count: SKILL_LEVELS })}</span>
            </div>
            <ul className="skill-list">
              {view.skills.map((s) => (
                <SkillRow key={s.id} skill={s} />
              ))}
            </ul>
            <div className="skill-legend">
              <span>
                <span className="skill-swatch" aria-hidden="true" />
                {t('skills.list.legendPassed')}
              </span>
              <span>
                <span className="skill-swatch is-part" aria-hidden="true" />
                {t('skills.list.legendChecks')}
              </span>
            </div>
          </section>

          <section aria-labelledby="focus-title" className="card skill-card skill-focus">
            <h2 id="focus-title" className="eyebrow">
              {t('skills.list.focus')}
            </h2>
            <p className="skill-focus-text">
              {rich(focus.key, translateParams(focus.params), typeof focus.params.skill === 'string' ? { skill: <b>{t(focus.params.skill)}</b> } : {})}
            </p>
            <SkillCtaLink cta={view.focus.cta} from={fromSkills()} />
          </section>

          <p className="skill-foot">{rich('skills.list.foot', { count: REVIEW_DAYS }, { review: <b>{t('skills.chip.review')}</b> })}</p>
        </div>
      </div>
    </AppShell>
  );
}
