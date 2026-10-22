/** v1.1 rewards: the level and XP line, the daily challenge's date tile, Copy code and the level-up sheet. */
import { useEffect, useState } from 'react';
import { UNLOCK_STARS, type LessonOutcome } from '../../game/track';
import { levelInfo, RANKS, type LevelInfo } from '../../game/xp';
import { dateParts, t } from '../../i18n';
import { useReducedMotion } from '../hooks';
import { Icon } from './Icon';

const rankName = (info: LevelInfo): string => t('rank.' + info.rank);

/** "Level 7 · Measure   1445 / 1500 XP", the gold XP bar and "55 XP to level 8". */
export function XpLine({ info, fill, hideToNext }: { info: LevelInfo; fill?: number; hideToNext?: boolean }): JSX.Element {
  const pct = fill ?? (info.span > 0 ? info.into / info.span : 0);
  return (
    <div className="xp">
      <div className="xp-row">
        <span className="xp-level">
          <b>{t('xp.level', { level: info.level })}</b>
          {t('xp.rankLine', { rank: rankName(info) })}
        </span>
        <span className="xp-of">{t('xp.ofSpan', { into: info.into, span: info.span })}</span>
      </div>
      <div className="xp-bar" role="img" aria-label={t('xp.bar', { into: info.into, span: info.span })}>
        <div style={{ width: Math.max(0, Math.min(1, pct)) * 100 + '%' }} />
      </div>
      {!hideToNext && <div className="xp-next">{t('xp.toNext', { count: info.span - info.into, next: info.level + 1 })}</div>}
    </div>
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
 * Copy code: a quiet button that copies the exercise code (T44-HQE-RQ-4B-80-7K2QF) and says Copied for two seconds.
 * The code is not shown; its title has it.
 */
export function CodeCopy({ code, className }: { code: string; className: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);
  const copy = (): void => {
    const done = (): void => setCopied(true);
    try {
      const p = navigator.clipboard?.writeText(code);
      if (p) p.then(done, () => undefined);
    } catch {
      /* no clipboard: nothing to copy to */
    }
  };
  return (
    <button type="button" className={className + ' copy-btn' + (copied ? ' is-copied' : '')} title={t('results.copyTitle', { code })} onClick={copy}>
      {copied ? <Icon name="check" size={18} strokeWidth={2.6} className="m-in" /> : <Icon name="copy" size={18} />}
      <span aria-live="polite">{t(copied ? 'results.copied' : 'results.copyCode')}</span>
    </button>
  );
}

/**
 * Level up (bottom sheet / dialog): the new level's badge, the rank ladder and the XP line, which fills the old
 * level, then starts the new one (520 ms, 1200 ms; at once with reduced motion).
 */
export function LevelUpContent({ xpBefore, xpAfter, onDone }: { xpBefore: number; xpAfter: number; onDone(): void }): JSX.Element {
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
        <XpLine info={after} hideToNext />
        <div className="xp-next">{t('levelUp.into', { count: after.into, level: after.level })}</div>
      </div>
    ) : (
      <XpLine info={stage === 1 ? { ...before, into: before.span } : before} fill={stage === 1 ? 1 : undefined} hideToNext />
    );
  return (
    <>
      <div className="levelup-head">
        <span className="level-badge" aria-hidden="true">
          {after.level}
        </span>
        <span className="levelup-text">
          <span className="eyebrow levelup-eyebrow">{t('levelUp.eyebrow')}</span>
          <h2 id="leveluptitle" className="sheet-title">
            {t('levelUp.title', { level: after.level, rank: rankName(after) })}
          </h2>
          <span className="muted-text levelup-sub">
            {newRank ? t('levelUp.newRank', { rank: rankName(before) }) : t('levelUp.sameRank', { level: before.level })}
          </span>
        </span>
      </div>
      <ol className="ranks" aria-label={t('levelUp.ranks')}>
        {RANKS.map((r) => (
          <li key={r} aria-current={r === after.rank ? 'step' : undefined} className={r === after.rank ? 'is-current' : ''}>
            {t('rank.' + r)}
          </li>
        ))}
      </ol>
      <div className="levelup-line">{line}</div>
      <button type="button" data-autofocus className="btn btn--accent sheet-cta" onClick={onDone}>
        {t('levelUp.continue')}
      </button>
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
