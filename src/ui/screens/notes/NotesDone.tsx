/**
 * Read notes · round done (DESIGN.md §3.5 Scoring): stars, correct / total, the average time and XP; time per note;
 * the notes that need practice (missed, slow); right answers by sign; and New round / Practice missed notes.
 */
import { useEffect, useRef, useState } from 'react';
import { keySigns, missedIds, roundKeys, SLOW_MS, type KeyId, type NoteAnswer, type RoundResult } from '../../../core/api';
import { levelInfo } from '../../../game/xp';
import { useElementWidth } from '../../../render/theme';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { LevelUpContent } from '../../components/Reward';
import { Sheet } from '../../components/Sheet';
import { useBreakpoint, useDocTitle, useLingering } from '../../hooks';
import { starsLabel } from '../../lib/format';
import { letterName, majorName, octaveName, signWord } from '../../lib/noteText';
import { Link, navigate } from '../../router';
import { useStore, type NoteLast } from '../../store';
import { useStartNotes } from './start';

const shownLevelUp = new WeakSet<NoteLast>();
const secs = (ms: number): string => (ms / 1000).toFixed(1);

export function NotesDone(): JSX.Element | null {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const start = useStartNotes();
  useDocTitle(t('app.docTitle', { page: t('notes.done.docTitle') }));
  const last = state.noteLast;
  useEffect(() => {
    if (!last) navigate('/notes', { replace: true });
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
  const { result: r, run, reward, answers } = last;
  const s = run.settings;
  const keys = roundKeys(s);
  const clefs = s.clefs.length > 1 ? t('notes.setup.clefsBoth').toLowerCase() : t('notes.clefLower.' + s.clefs[0]);
  const keyText = keys.length > 1 ? t('notes.done.keysMix', { count: keys.length }) : majorName(keys[0]);
  const missed = missedIds(run.notes, answers);
  const again = (): void => start(s, [], { replace: true });
  const practise = (): void => start(s, missed, { replace: true });
  const change = (): void => dispatch({ type: 'noteSettings', settings: s });

  return (
    <ExerciseFrame className="frame--results">
      <div className="page results ndone no-scrollbar">
        <div className="screen-head">
          <Link to="/" aria-label={t('notes.done.back')} className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t('notes.done.title')}</h1>
            <span className="muted-text">{t('notes.done.sub', { clefs, keys: keyText })}</span>
          </div>
        </div>

        <div className="score">
          <div className="score-stars" role="img" aria-label={starsLabel(r.stars)}>
            <span className="score-stars-row">
              {[0, 1, 2].map((i) => (
                <span key={i} aria-hidden="true" className={i < r.stars ? 'is-on' : ''}>
                  ★
                </span>
              ))}
            </span>
          </div>
          <div className="score-pct">{t('common.percent', { value: Math.round(r.accuracy) })}</div>
          <div className="muted-text score-sub">
            {r.total === 0 ? t('notes.done.none') : t('notes.done.score', { right: r.right, total: r.total, avg: secs(r.avgMs) })}
            {r.hinted > 0 && ' · ' + t('notes.done.hinted', { count: r.hinted })} · <b className="tone-ink">{t('xp.earned', { count: reward.xp })}</b>
          </div>
        </div>

        {r.total > 0 && <TimeChart answers={answers.slice(0, r.total)} avgMs={r.avgMs} missed={r.total - r.right - r.hinted} />}
        {r.total > 0 && <Needs r={r} />}
        {r.bySign.length > 1 && <BySign r={r} keyId={keys.length === 1 ? keys[0] : null} />}

        <div className="results-actions">
          <div className="results-main">
            <button type="button" className="btn btn--outline" onClick={again}>
              {t('notes.done.newRound')}
            </button>
            {missed.length > 0 ? (
              <button type="button" className="btn btn--accent" onClick={practise}>
                {t('notes.done.practiceMissed')}
              </button>
            ) : (
              <Link to="/notes" className="btn btn--accent" onClick={change}>
                {t('notes.done.change')}
              </Link>
            )}
          </div>
          {missed.length > 0 && (
            <Link to="/notes" className="ghost-btn ndone-change" onClick={change}>
              <Icon name="sliders" size={18} />
              {t('notes.done.change')}
            </Link>
          )}
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

/** One bar per note, its height the answer time (capped at 5 s), coloured right / hint / missed, with the 3 s line. */
function TimeChart({ answers, avgMs, missed }: { answers: NoteAnswer[]; avgMs: number; missed: number }): JSX.Element {
  // Drawn at the card's own width, so the labels keep their size on wide screens.
  const ref = useRef<HTMLDivElement>(null);
  const W = useElementWidth(ref) || 330;
  const H = 72;
  const base = 58;
  const cap = 5000;
  const n = answers.length;
  const slot = (W - 24) / Math.max(1, n);
  const bw = Math.max(3, Math.min(14, slot * 0.6));
  const y = (ms: number): number => base - (Math.min(cap, ms) / cap) * 50;
  return (
    <div className="card ncard">
      <div className="ncard-head">
        <b>{t('notes.done.timeTitle')}</b>
        <span>{t('notes.done.avg', { value: secs(avgMs) })}</span>
      </div>
      <div ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} className="nchart" role="img" aria-label={t('notes.done.chartLabel', { count: n, avg: secs(avgMs), missed })}>
          <line x1={0} x2={W} y1={base} y2={base} className="nchart-base" />
          <line x1={0} x2={W - 24} y1={y(SLOW_MS)} y2={y(SLOW_MS)} className="nchart-slow" />
          <text x={W} y={y(SLOW_MS) + 4} textAnchor="end" className="nchart-text">
            {t('notes.play.seconds', { value: 3 })}
          </text>
          {answers.map((a, i) => (
            <rect key={i} x={i * slot + (slot - bw) / 2} y={y(a.ms)} width={bw} height={Math.max(2, base - y(a.ms))} rx={2.5}
              className={'nchart-bar is-' + (a.outcome === 'right' ? 'right' : a.outcome === 'hinted' ? 'hint' : 'missed')} />
          ))}
          <text x={0} y={H - 2} className="nchart-text">
            1
          </text>
          <text x={(n - 1) * slot + slot / 2} y={H - 2} textAnchor="middle" className="nchart-text">
            {n}
          </text>
        </svg>
      </div>
      <div className="nlegend">
        <span>
          <span className="nlegend-dot is-right" />
          {t('notes.done.legendRight')}
        </span>
        <span>
          <span className="nlegend-dot is-hint" />
          {t('notes.done.legendHint')}
        </span>
        <span>
          <span className="nlegend-dot is-missed" />
          {t('notes.done.legendMissed')}
        </span>
        <span className="nlegend-slow">{t('notes.done.legendSlow')}</span>
      </div>
    </div>
  );
}

function Needs({ r }: { r: RoundResult }): JSX.Element {
  const groups = [
    { key: 'missed', label: t('notes.done.missed'), chips: r.missed.slice(0, 6) },
    { key: 'slow', label: t('notes.done.slow'), chips: r.slow.slice(0, 6) },
  ].filter((g) => g.chips.length > 0);
  return (
    <div className="card ncard">
      <b>{t('notes.done.needs')}</b>
      {groups.length === 0 && <span className="muted-text">{t('notes.done.allGood')}</span>}
      {groups.map((g) => (
        <div key={g.key} className="nchips-row">
          <span className="nchips-label">{g.label}</span>
          <div role="list" aria-label={g.label} className="nchips">
            {g.chips.map((c) => {
              const note = octaveName(c.step, c.alter);
              const aria = g.key === 'missed' ? t('notes.done.missedChip', { note, count: c.count }) : t('notes.done.slowChip', { note, value: secs(c.ms) });
              return (
                <span key={c.id} role="listitem" aria-label={aria} className={'nchip nchip--' + g.key}>
                  <span aria-hidden="true">{note}</span>
                  {g.key === 'missed' && c.count > 1 && <span aria-hidden="true" className="nchip-tag">{t('notes.done.times', { count: c.count })}</span>}
                  {g.key === 'slow' && <span aria-hidden="true" className="nchip-tag">{t('notes.play.seconds', { value: secs(c.ms) })}</span>}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      {groups.length > 0 && <span className="muted-text">{t('notes.done.comeBack')}</span>}
    </div>
  );
}

/** "F, C and G" */
function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const head = items.slice(0, -1).reduce((a, b) => t('common.commaList', { a, b }));
  return t('common.and', { a: head, b: items[items.length - 1] });
}

/** Right answers by sign, and (one key) a tip when misses had the right letter but not the key signature's sign. */
function BySign({ r, keyId }: { r: RoundResult; keyId: KeyId | null }): JSX.Element {
  const signs = keyId ? keySigns(keyId) : [];
  return (
    <div className="card ncard">
      <b>{t('notes.done.bySign')}</b>
      {r.bySign.map((g) => {
        const label =
          g.group === 'key'
            ? signs.length
              ? t('notes.done.groupKey', { names: andList(signs.map((x) => letterName(x.letter, x.alter))) })
              : t('notes.done.groupKeyMany')
            : t(g.group === 'extra' ? 'notes.done.groupExtra' : 'notes.done.groupPlain');
        const pct = g.total ? (g.right / g.total) * 100 : 0;
        return (
          <div key={g.group} className="nsign">
            <div className="nsign-head">
              <span>{label}</span>
              <span className="mono-muted">
                {g.right} / {g.total}
              </span>
            </div>
            <div className="nsign-bar" role="img" aria-label={t('notes.done.groupAria', { label, right: g.right, total: g.total })}>
              <div style={{ width: pct + '%' }} />
            </div>
          </div>
        );
      })}
      {keyId && signs.length > 0 && r.keySignMisses > 0 && (
        <span className="muted-text">
          {t('notes.done.keyTip', {
            count: r.keySignMisses,
            key: majorName(keyId),
            rule: t('notes.done.rule', { letters: andList(signs.map((x) => t('notes.letter.' + x.letter))), signWord: signWord(signs[0].alter) }),
          })}
        </span>
      )}
    </div>
  );
}
