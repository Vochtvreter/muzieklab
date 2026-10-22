/**
 * Read notes · round done (DESIGN.md §3.5 Scoring): stars, correct / total, the average time and XP; time per note;
 * the notes that need practice (missed, slow); right answers by sign; and New round / Practice missed notes. After a
 * Read notes or Keys lesson (§8.2): the lesson and its unit, what it did for the path, and Next lesson once it has two
 * stars.
 */
import { useEffect, useRef, useState } from 'react';
import { keySigns, missedIds, roundKeys, scoreRound, SLOW_MS, type KeyId, type NoteAnswer, type RoundResult } from '../../../core/api';
import { noteTrack } from '../../../game/notesPath';
import { findTrackLesson, outcomeIn, UNLOCK_STARS } from '../../../game/track';
import { OPENS_AFTER, trackOpen } from '../../../game/tracks';
import { levelInfo } from '../../../game/xp';
import { useElementWidth } from '../../../render/theme';
import { t, tx } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { LevelUpContent, OutcomeBadge } from '../../components/Reward';
import { Sheet } from '../../components/Sheet';
import { useBreakpoint, useDocTitle, useLingering } from '../../hooks';
import { starsLabel } from '../../lib/format';
import { useLearnReturn } from '../../lib/learnReturn';
import { letterName, majorName, octaveName, signWord } from '../../lib/noteText';
import { Link, navigate } from '../../router';
import { useStore, type NoteLast } from '../../store';
import { useStartNoteLesson, useStartNotes } from './start';

const shownLevelUp = new WeakSet<NoteLast>();
const secs = (ms: number): string => (ms / 1000).toFixed(1);

export function NotesDone(): JSX.Element | null {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const start = useStartNotes();
  const startLesson = useStartNoteLesson();
  // A round started from a Learn section (?from=8.2): Back returns there; a new round and the setup keep it.
  const { back, carry } = useLearnReturn();
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
  // A lesson's score counts notes left unanswered as missed; the time chart and the notes to practise show the ones answered.
  const d = run.lesson ? scoreRound(run.notes, answers) : r;
  const s = run.settings;
  const keys = roundKeys(s);
  const clefs = s.clefs.length > 1 ? t('notes.setup.clefsBoth').toLowerCase() : t('notes.clefLower.' + s.clefs[0]);
  const keyText = keys.length > 1 ? t('notes.done.keysMix', { count: keys.length }) : majorName(keys[0]);
  const missed = missedIds(run.notes, answers);
  const again = (): void => start(s, [], { replace: true, query: carry });
  const practise = (): void => start(s, missed, { replace: true, query: carry });
  const change = (): void => dispatch({ type: 'noteSettings', settings: s });
  // A lesson: what the round did for its path, and the lesson Next starts.
  const lesson = run.lesson;
  const track = lesson && noteTrack(lesson.track);
  const where = lesson && track ? findTrackLesson(track, lesson.id) : null;
  const outcome = lesson && track ? outcomeIn(state.progress, track, lesson.id, last.lessonStarsBefore) : null;
  const goOn = outcome?.continueId && track ? findTrackLesson(track, outcome.continueId)?.lesson ?? null : null;
  const replay = (id: string): void => {
    if (lesson) startLesson(lesson.track, id, { replace: true });
  };
  // Two stars on the last lesson the Keys path waits for open it (it was closed before this round).
  const keysAfter = OPENS_AFTER.keys;
  const opensKeys =
    !!keysAfter && lesson?.track === keysAfter.track && where?.unit.id === keysAfter.unit && last.lessonStarsBefore < UNLOCK_STARS && trackOpen(state.progress, 'keys');
  const outcomeBadge = outcome && outcome.kind !== 'passed' ? <OutcomeBadge outcome={outcome} /> : null;

  return (
    <ExerciseFrame className="frame--results">
      <div className="page results ndone no-scrollbar">
        <div className="screen-head">
          <Link to={lesson ? '/path' : (back?.to ?? '/')} query={lesson ? undefined : back?.query}
            aria-label={lesson ? t('notes.done.lessonBack') : back ? t('learn.backToChapter', { n: back.chapter }) : t('notes.done.back')} className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{lesson ? t('notes.done.lessonTitle', { id: lesson.id }) : t('notes.done.title')}</h1>
            <span className="muted-text">
              {lesson && where
                ? t('notes.done.lessonSub', { track: t('path.track.' + lesson.track), unit: tx(where.unit.titleKey) })
                : t('notes.done.sub', { clefs, keys: keyText })}
            </span>
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
            {d.total === 0 ? t('notes.done.none') : t('notes.done.score', { right: r.right, total: r.total, avg: secs(d.avgMs) })}
            {r.hinted > 0 && ' · ' + t('notes.done.hinted', { count: r.hinted })} · <b className="tone-ink">{t('xp.earned', { count: reward.xp })}</b>
          </div>
        </div>

        {(outcomeBadge || opensKeys) && (
          <div className="badges">
            {outcomeBadge}
            {opensKeys && (
              <span className="badge badge--unlock">
                <Icon name="unlock" size={15} />
                {t('notes.done.keysOpen')}
              </span>
            )}
          </div>
        )}

        {d.total > 0 && <TimeChart answers={answers.slice(0, d.total)} avgMs={d.avgMs} missed={d.total - d.right - d.hinted} />}
        {/* Skipped with nothing missed or slow among the notes answered: no "every note right" over a lesson score that counts the rest. */}
        {d.total > 0 && (d.total === r.total || d.missed.length + d.slow.length > 0) && <Needs r={d} />}
        {d.bySign.length > 1 && <BySign r={d} keyId={keys.length === 1 ? keys[0] : null} />}

        {lesson ? (
          // A lesson: New round plays it again (new notes); Next lesson once it has two stars, else back to the path.
          <div className="results-actions">
            <div className="results-main">
              {goOn ? (
                <button type="button" className="btn btn--outline" onClick={() => replay(lesson.id)}>
                  {t('notes.done.newRound')}
                </button>
              ) : (
                <Link to="/path" className="btn btn--outline">
                  {t('notes.done.toPath')}
                </Link>
              )}
              {goOn ? (
                <button type="button" className="btn btn--accent" aria-label={t('results.nextLessonLabel', { id: goOn.id, title: tx(goOn.title) })}
                  onClick={() => replay(goOn.id)}>
                  {t('results.nextLesson')}
                </button>
              ) : (
                <button type="button" className="btn btn--accent" onClick={() => replay(lesson.id)}>
                  {t('notes.done.newRound')}
                </button>
              )}
            </div>
          </div>
        ) : (
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
                <Link to="/notes" query={carry} className="btn btn--accent" onClick={change}>
                  {t('notes.done.change')}
                </Link>
              )}
            </div>
            {missed.length > 0 && (
              <Link to="/notes" query={carry} className="ghost-btn ndone-change" onClick={change}>
                <Icon name="sliders" size={18} />
                {t('notes.done.change')}
              </Link>
            )}
          </div>
        )}
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
