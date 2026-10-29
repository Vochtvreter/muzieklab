/**
 * v1.1 rewards: the XP bar, the daily challenge's date tile, Copy code, and the level sheet (Home's level details, and
 * the level-up after a result, which since v1.5 also lists the achievements and the personal best the run earned).
 */
import { useEffect, useRef, useState } from 'react';
import type { AchievementId } from '../../game/storage';
import { UNLOCK_STARS, type LessonOutcome } from '../../game/track';
import { levelInfo, rankOf, RANKS, type LevelInfo } from '../../game/xp';
import { dateParts, t } from '../../i18n';
import { useReducedMotion } from '../hooks';
import { rich } from '../lib/format';
import { Link } from '../router';
import type { PersonalBest } from '../store';
import { Icon } from './Icon';

const rankName = (info: LevelInfo): string => t('rank.' + info.rank);

/** The gold XP bar and its one label, "55 XP to level 8" (`next`: false while a level-up still fills the bar). */
/** "12-day streak" with a gold dot: Home's and the Progress tab's streak chip on phone (and Home on tablet). */
export function StreakPill({ days }: { days: number }): JSX.Element {
  return (
    <div className="streak-pill">
      <span className="streak-dot" aria-hidden="true" />
      {t('streak.pill', { count: days })}
    </div>
  );
}

export function XpBar({ info, fill, next = true }: { info: LevelInfo; fill?: number; next?: boolean }): JSX.Element {
  const pct = fill ?? (info.span > 0 ? info.into / info.span : 0);
  return (
    <div className="xp">
      <div className="xp-bar" role="img" aria-label={t('xp.bar', { into: info.into, span: info.span })}>
        <div style={{ width: Math.max(0, Math.min(1, pct)) * 100 + '%' }} />
      </div>
      {next && <div className="xp-next">{t('xp.toNext', { count: info.span - info.into, next: info.level + 1 })}</div>}
    </div>
  );
}

/** The next rank and the level it starts at, or null at the top rank. */
function nextRank(info: LevelInfo): { rank: string; level: number } | null {
  if (info.rank === RANKS[RANKS.length - 1]) return null;
  let level = info.level + 1;
  while (rankOf(level) === info.rank) level++;
  return { rank: t('rank.' + rankOf(level)), level };
}

/** "Count at level 3": what the next rank is and when it comes. */
const nextRankText = (info: LevelInfo): string => {
  const n = nextRank(info);
  return n ? t('levelUp.nextRank', n) : t('levelUp.topRank');
};

/** The level sheet's top: the badge, "Level 2 · Tick" and one line under it, then the rank ladder. */
function LevelHead({ info, eyebrow, sub }: { info: LevelInfo; eyebrow?: string; sub: string }): JSX.Element {
  return (
    <>
      <div className="levelup-head">
        <span className="level-badge" aria-hidden="true">
          {info.level}
        </span>
        <span className="levelup-text">
          {eyebrow && <span className="eyebrow levelup-eyebrow">{eyebrow}</span>}
          <h2 id="leveluptitle" className="sheet-title">
            {t('levelUp.title', { level: info.level, rank: rankName(info) })}
          </h2>
          <span className="muted-text levelup-sub">{sub}</span>
        </span>
      </div>
      <ol className="ranks" aria-label={t('levelUp.ranks')}>
        {RANKS.map((r) => (
          <li key={r} aria-current={r === info.rank ? 'step' : undefined} className={r === info.rank ? 'is-current' : ''}>
            {t('rank.' + r)}
          </li>
        ))}
      </ol>
    </>
  );
}

/** Home's level details (bottom sheet / dialog): the level-up sheet without the celebration, and a Close button. */
export function LevelContent({ xp, onDone }: { xp: number; onDone(): void }): JSX.Element {
  const info = levelInfo(xp);
  return (
    <>
      <LevelHead info={info} sub={nextRankText(info)} />
      <XpBar info={info} />
      <button type="button" data-autofocus className="btn btn--accent sheet-cta" onClick={onDone}>
        {t('levelUp.close')}
      </button>
    </>
  );
}

/** The daily challenge's date: "OCT" over "15". */
export function DateTile({ day }: { day: string }): JSX.Element {
  const d = dateParts(day);
  return (
    <span className="date-tile" role="img" aria-label={d.long}>
      <span aria-hidden="true" className="date-tile-month">
        {d.month}
      </span>
      <span aria-hidden="true" className="date-tile-day">
        {d.day}
      </span>
    </span>
  );
}

/**
 * Copies text with the browser's copy command, from a text field out of sight: where the Clipboard API is missing or
 * refused (a site permission, some in-app browsers), this often still works, from the same tap. The focus goes back.
 */
function copyBySelection(text: string): boolean {
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.setAttribute('aria-hidden', 'true');
  // 16 px: iOS zooms into a field with smaller text when it gets focus.
  area.style.cssText = 'position: fixed; top: 0; left: -9999px; opacity: 0; font-size: 16px';
  document.body.append(area);
  area.focus({ preventScroll: true });
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  back?.focus({ preventScroll: true });
  return ok;
}

/**
 * Copy code: a quiet button that copies the exercise code (T44-HQE-RQ-4B-80-7K2QF) and says Copied for two seconds.
 * The code is not shown; its title has it. Where copying is not allowed at all, the code is shown under the button,
 * selected, to copy with the device's own copy command (as the Copy field does).
 */
export function CodeCopy({ code, className }: { code: string; className: string }): JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'selected'>('idle');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state !== 'copied') return;
    const id = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(id);
  }, [state]);
  const select = (): void => {
    field.current?.focus();
    field.current?.setSelectionRange(0, code.length);
  };
  useEffect(() => {
    if (state === 'selected') select();
  }, [state]);
  const fallback = (): void => {
    if (copyBySelection(code)) setState('copied');
    else if (state === 'selected') select();
    else setState('selected');
  };
  const copy = (): void => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip?.writeText) return fallback();
    clip.writeText(code).then(() => setState('copied'), fallback);
  };
  const copied = state === 'copied';
  return (
    <>
      <button type="button" className={className + ' copy-btn' + (copied ? ' is-copied' : '')} title={t('results.copyTitle', { code })} onClick={copy}>
        {copied ? <Icon name="check" size={18} strokeWidth={2.6} className="m-in" /> : <Icon name="copy" size={18} />}
        <span aria-live="polite">{t(copied ? 'results.copied' : 'results.copyCode')}</span>
      </button>
      {state === 'selected' && (
        <span className="code-shown m-in">
          <input ref={field} className="tfield-input copy-value" value={code} readOnly aria-label={t('results.code')} onFocus={(e) => e.currentTarget.select()} />
          <span className="tfield-hint" role="status">
            {t('form.selected')}
          </span>
        </span>
      )}
    </>
  );
}

/** The level-up rows fade in one after another, the first once the sheet is up (App design canvas, Resolve · Level up). */
const ROW_DELAY_MS = 450;
const ROW_STEP_MS = 150;

/**
 * The level-up sheet's list under the XP bar: an "Achievement unlocked" row for each achievement the run earned, then
 * "New personal best" when the run set one (a lesson played before, or the daily challenge).
 */
function RewardRows({ achievements, best }: { achievements: readonly AchievementId[]; best: PersonalBest | null }): JSX.Element {
  const delay = (i: number): { animationDelay: string } => ({ animationDelay: ROW_DELAY_MS + i * ROW_STEP_MS + 'ms' });
  return (
    <ul className="levelup-rows">
      {achievements.map((id, i) => (
        <li key={id} className="levelup-row m-in" style={delay(i)}>
          <span className="levelup-row-icon" aria-hidden="true">
            <Icon name="medal" size={22} />
          </span>
          <span className="levelup-row-text">
            <span className="levelup-row-eyebrow">{t('levelUp.achievement')}</span>
            <b className="levelup-row-title">{t(`achievements.${id}.name`)}</b>
            <span className="levelup-row-line">{t(`achievements.${id}.text`)}</span>
          </span>
        </li>
      ))}
      {best && (
        <li className="levelup-row m-in" style={delay(achievements.length)}>
          <span className="levelup-row-icon" aria-hidden="true">
            <Icon name="trophy" size={22} />
          </span>
          <span className="levelup-row-text">
            <span className="levelup-row-eyebrow">{t('levelUp.best')}</span>
            <b className="levelup-row-title">
              {rich(best.kind === 'lesson' ? 'levelUp.bestLesson' : 'levelUp.bestDaily', best.kind === 'lesson' ? { id: best.lesson } : {}, {
                pct: <span className="levelup-row-pct">{t('common.percent', { value: best.accuracy })}</span>,
              })}
            </b>
            <span className="levelup-row-line">{t(best.kind === 'lesson' ? 'levelUp.bestLessonLine' : 'levelUp.bestDailyLine')}</span>
          </span>
        </li>
      )}
    </ul>
  );
}

/**
 * Level up (bottom sheet / dialog): the new level's badge, the new rank or the next one, the rank ladder and the XP
 * bar, which fills the old level, then starts the new one with its label (520 ms, 1200 ms; at once with reduced
 * motion). Under it (App design canvas, Resolve · Level up) a row for each achievement the run earned and one for a
 * new personal best, then See progress (opens the Progress tab) and Continue (closes the sheet).
 */
export function LevelUpContent({
  xpBefore,
  xpAfter,
  achievements = [],
  best = null,
  onDone,
}: {
  xpBefore: number;
  xpAfter: number;
  /** What the run earned besides the level (Reward.achievements, Reward.best). */
  achievements?: readonly AchievementId[];
  best?: PersonalBest | null;
  onDone(): void;
}): JSX.Element {
  const before = levelInfo(xpBefore);
  const after = levelInfo(xpAfter);
  const still = useReducedMotion();
  const [stage, setStage] = useState(still ? 2 : 0);
  useEffect(() => {
    if (still) {
      setStage(2);
      return;
    }
    const a = window.setTimeout(() => setStage(1), 520);
    const b = window.setTimeout(() => setStage(2), 1200);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [still]);
  const newRank = after.rank !== before.rank;
  const line =
    stage === 2 ? (
      <div key="after" className="m-in">
        <XpBar info={after} />
      </div>
    ) : (
      <XpBar info={stage === 1 ? { ...before, into: before.span } : before} fill={stage === 1 ? 1 : undefined} next={false} />
    );
  return (
    <>
      <LevelHead info={after} eyebrow={t('levelUp.eyebrow')} sub={newRank ? t('levelUp.newRank', { rank: rankName(before) }) : nextRankText(after)} />
      <div className="levelup-line">{line}</div>
      {(achievements.length > 0 || best) && <RewardRows achievements={achievements} best={best} />}
      <div className="levelup-actions">
        <Link to="/progress" className="btn btn--outline sheet-cta">
          {t('levelUp.seeProgress')}
        </Link>
        <button type="button" data-autofocus className="btn btn--accent sheet-cta" onClick={onDone}>
          {t('levelUp.continue')}
        </button>
      </div>
    </>
  );
}

/**
 * A run that earned achievements but no level (the level-up sheet lists them otherwise): an "Achievement unlocked ·
 * Perfect bar" badge for each beside the summary's other badges. No board: the gold badge of a new personal best, with
 * the medal of the level-up sheet's row.
 */
export function AchievementBadges({ ids }: { ids: readonly AchievementId[] }): JSX.Element {
  return (
    <>
      {ids.map((id) => (
        <span key={id} className="badge badge--gold" title={t(`achievements.${id}.text`)}>
          <Icon name="medal" size={15} />
          {t('results.achievement', { name: t(`achievements.${id}.name`) })}
        </span>
      ))}
    </>
  );
}

/**
 * What a finished lesson did for its path (§6.4), on Results and Round done: the lesson that two stars opened, the
 * finished path, or (under two stars) what opens the next lesson. Nothing for a lesson played again.
 */
export function OutcomeBadge({ outcome }: { outcome: LessonOutcome | null }): JSX.Element | null {
  if (outcome?.kind === 'unlocked' && outcome.next)
    return (
      <span className="badge badge--unlock">
        <Icon name="unlock" size={15} />
        {t('results.unlocked', { id: outcome.next.id })}
      </span>
    );
  if (outcome?.kind === 'pathDone')
    return (
      <span className="badge badge--unlock">
        <Icon name="trophy" size={15} />
        {t('results.pathDone')}
      </span>
    );
  if (outcome?.kind === 'needStars')
    return (
      <span className="badge badge--quiet">
        <Icon name="lock" size={13} strokeWidth={2.4} />
        {outcome.next ? t('results.needStars', { count: UNLOCK_STARS, id: outcome.next.id }) : t('results.needStarsLast', { count: UNLOCK_STARS })}
      </span>
    );
  return null;
}
