/**
 * Progress → Skill levels → one skill (App design canvas, Mobile · Progress · skill levels · one skill): the skill's
 * level and meter, the Review due card when it is due, the next level with its checks and the skill's button, the level
 * over 12 weeks and all ten levels. Its own route (#/progress/skills/rhythm), so the way back is a real link to Skill
 * levels (the board's back button returns to the list state).
 * Phone: as the board, with the tab bar (Progress current); on a phone at least 700 px tall the head stays at the top.
 * Tablet and desktop have no board: the 640 px column under the top header, as Settings' sub-pages.
 */
import { skillView, type SkillView } from '../../../game/progressView';
import { SKILL_LEVELS } from '../../../game/skills';
import type { SkillId } from '../../../game/storage';
import { t } from '../../../i18n';
import { AppShell } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { useBreakpoint, useDocTitle, useToday } from '../../hooks';
import { labelText, rich } from '../../lib/format';
import { todayIso, useStore } from '../../store';
import { LevelMeter, SkillBack, SkillCtaLink, SkillIcon } from './Skills';

/** The history chart's height: level 10 fills it, level 0 still shows a sliver. */
const HIST_PX = 66;
const HIST_MIN_PX = 3;

/** "Level 6 of 10, and 1 of 3 checks for level 7" (the meter at the top). */
function meterLabel(s: SkillView): string {
  const next = s.next;
  if (!next || next.later) return t('skills.detail.meterLevel', { level: s.level, max: SKILL_LEVELS });
  return t('skills.detail.meter', { level: s.level, max: SKILL_LEVELS, done: next.done, total: next.total, n: next.n });
}

/** The next level: its name, how many checks are done, each check with where the player is now, and the skill's button. */
function NextCard({ skill: s }: { skill: SkillView }): JSX.Element {
  const next = s.next;
  if (!next) {
    return (
      <section aria-labelledby="next-title" className="card skill-card">
        <h2 id="next-title" className="eyebrow">
          {t('skills.detail.top', { n: SKILL_LEVELS })}
        </h2>
        <div className="skill-next-name">{t('skills.detail.allPassed')}</div>
        <SkillCtaLink cta={s.cta} />
      </section>
    );
  }
  const progress = t('skills.detail.progress', { done: next.done, total: next.total });
  return (
    <section aria-labelledby="next-title" className="card skill-card">
      <div className="skill-card-head">
        <h2 id="next-title" className="eyebrow">
          {t('skills.detail.next', { n: next.n })}
        </h2>
        {!next.later && <span className="skill-meta">{rich('skills.detail.checks', { total: next.total }, { progress: <b className="skill-meta-n">{progress}</b> })}</span>}
      </div>
      <div className="skill-next-name">{t(next.name)}</div>
      {next.later ? (
        <p className="skill-later">{t('skills.later')}</p>
      ) : (
        <>
          <div className="skill-bar" role="img" aria-label={t('skills.detail.checksDone', { done: next.done, total: next.total })}>
            <div style={{ width: Math.round((next.done / Math.max(1, next.total)) * 100) + '%' }} />
          </div>
          <ul className="skill-checks">
            {next.checks.map((c, i) => (
              <li key={i} className={c.done ? 'is-done' : undefined}>
                <span className="skill-check-mark">{c.done && <Icon name="check" size={14} strokeWidth={3} />}</span>
                {c.done && <span className="sr-only">{t('skills.detail.done')}: </span>}
                <span className="skill-check-text">
                  <span className="skill-check-label">{labelText(c.label)}</span>
                  {!c.done && c.now && (
                    <span className="skill-check-now">
                      <span className="skill-check-bar" aria-hidden="true">
                        <span style={{ width: Math.round(c.w * 100) + '%' }} />
                      </span>
                      <span className="skill-check-value">{labelText(c.now)}</span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <SkillCtaLink cta={s.cta} />
    </section>
  );
}

/** The level at the end of each of the last 12 weeks, as bars; this week's darker. */
function HistoryCard({ skill: s }: { skill: SkillView }): JSX.Element {
  const h = s.history;
  const from = h[0];
  const to = h[h.length - 1];
  const label =
    from === to
      ? t('skills.detail.historySame', { weeks: h.length, level: to })
      : t('skills.detail.historyLabel', { weeks: h.length, from, to });
  return (
    <section aria-labelledby="hist-title" className="card skill-card">
      <div className="skill-card-head">
        <h2 id="hist-title" className="eyebrow">
          {t('skills.detail.history', { count: h.length })}
        </h2>
        <span className="skill-meta">{t('skills.detail.gain', { count: s.gain })}</span>
      </div>
      <div className="skill-hist" role="img" aria-label={label}>
        {h.map((level, i) => (
          <span key={i} className={i === h.length - 1 ? 'is-now' : undefined}
            style={{ height: HIST_MIN_PX + (level / SKILL_LEVELS) * (HIST_PX - HIST_MIN_PX) + 'px' }} />
        ))}
      </div>
      <div className="skill-hist-axis" aria-hidden="true">
        <span>{t('skills.detail.weeksAgo', { count: h.length })}</span>
        <span>{t('skills.detail.thisWeek')}</span>
      </div>
    </section>
  );
}

/** All ten levels: passed, the next one (with its checks done), and the ones after it. */
function LadderCard({ skill: s }: { skill: SkillView }): JSX.Element {
  const next = s.next;
  return (
    <section aria-labelledby="ladder-title" className="card skill-card skill-ladder">
      <h2 id="ladder-title" className="eyebrow">
        {t('skills.detail.ladder')}
      </h2>
      <ol>
        {s.levels.map((l) => (
          <li key={l.n} className={'is-' + l.state}>
            <span className="skill-ladder-n">{l.n}</span>
            <span className="skill-ladder-name">{t(l.name)}</span>
            {l.state === 'passed' ? (
              <span className="skill-ladder-mark">{t('skills.detail.passed')}</span>
            ) : l.state === 'next' && next ? (
              <span className="skill-ladder-mark">{next.later ? t('skills.detail.later') : t('skills.detail.progress', { done: next.done, total: next.total })}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One skill (App design canvas, Mobile · Progress · skill levels · one skill; #/progress/skills/<skill>). */
export function SkillDetail({ skill }: { skill: SkillId }): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  const today = useToday(todayIso);
  const name = t(`skills.name.${skill}`);
  useDocTitle(t('app.docTitle', { page: name }));
  const s = skillView(state.progress, skill, today);

  return (
    <AppShell bp={bp} active="/progress">
      <div className="page skill-page no-scrollbar">
        <div className="skill-head">
          <SkillBack to="/progress/skills" text={t('skills.title')} label={t('skills.detail.back')} />
          <div className="skill-hero">
            <SkillIcon skill={skill} big />
            <div className="skill-hero-text">
              <h1 className="skill-name">{name}</h1>
              <div className="skill-hero-level">
                <span className="skill-meta" aria-hidden="true">
                  <b className="tone-ink">{t('skills.list.level', { level: s.level })}</b> {t('skills.detail.of', { max: SKILL_LEVELS })}
                </span>
                <LevelMeter skill={s} big label={meterLabel(s)} />
              </div>
            </div>
          </div>
        </div>

        <div className="skill-body no-scrollbar">
          {s.review.due && (
            <section aria-labelledby="review-title" className="skill-review">
              <div className="skill-review-text">
                <h2 id="review-title">{t('skills.review.title')}</h2>
                <p>{t('skills.review.text', { count: s.review.days ?? 0 })}</p>
              </div>
              <SkillCtaLink cta={s.cta} review />
            </section>
          )}

          <NextCard skill={s} />
          <HistoryCard skill={s} />
          <LadderCard skill={s} />
        </div>
      </div>
    </AppShell>
  );
}
