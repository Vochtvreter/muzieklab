/**
 * Test yourself · round done (DESIGN.md §3.6): cards right on the first try, when the right and wrong ones come back,
 * and the weakest chapters with what was missed and a link to read it again. Keep going picks the round up again while
 * it has cards left; otherwise it starts a new round from the setup.
 */
import { useEffect } from 'react';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { useDocTitle } from '../../hooks';
import { findCard } from '../../learn/cards';
import { sectionKey } from '../../learn/chapters';
import { Link, navigate } from '../../router';
import { useStore } from '../../store';
import { chapterRoute } from '../Learn';

interface ChapterScore {
  n: number;
  right: number;
  total: number;
  /** Missed cards: section ids, or null for the chapter's own check. */
  missed: (string | null)[];
}

/** "1, 4 and 8". */
const listText = (items: number[]): string =>
  items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + t('learn.meta.and') + items[items.length - 1];

export function TestDone(): JSX.Element | null {
  const { state, dispatch } = useStore();
  useDocTitle(t('app.docTitle', { page: t('test.done.title') }));
  const q = state.quiz;
  const answers = q?.answers ?? [];
  useEffect(() => {
    if (!answers.length) navigate('/learn', { replace: true });
  }, [answers.length]);
  if (!q || !answers.length) return null;

  const right = answers.filter((a) => a.right).length;
  const total = answers.length;
  const byChapter = new Map<number, ChapterScore>();
  for (const a of answers) {
    const card = findCard(a.id)!;
    const s = byChapter.get(card.chapter) ?? { n: card.chapter, right: 0, total: 0, missed: [] };
    s.total++;
    if (a.right) s.right++;
    else s.missed.push(card.section);
    byChapter.set(card.chapter, s);
  }
  const scores = [...byChapter.values()];
  const weak = scores.filter((s) => s.missed.length).sort((a, b) => a.right / a.total - b.right / b.total || a.n - b.n).slice(0, 3);
  const perfect = scores.filter((s) => !s.missed.length).map((s) => s.n).sort((a, b) => a - b);
  const left = q.queue.length - answers.length;
  const keepGoing = (): void => {
    dispatch({ type: 'quizNext' });
    navigate('/test/play', { replace: true });
  };

  // The first two misses by name, then how many more.
  const missedText = (s: ChapterScore): string => {
    const names = s.missed.map((id) => (id ? `${id} ${t(sectionKey(id, 'title'))}` : t('test.done.chapterCheck')));
    const list = names.slice(0, 2).join(', ');
    return t('test.done.missed', { list: names.length > 2 ? t('test.done.andMore', { list, count: names.length - 2 }) : list });
  };

  return (
    <ExerciseFrame className="frame--results">
      <div className="page results test-done no-scrollbar">
        <div className="screen-head">
          <Link to="/learn" aria-label={t('learn.back')} className="icon-btn icon-btn--edge-sm">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t('test.done.title')}</h1>
            <span className="eyebrow">{t('test.done.sub', { count: total })}</span>
          </div>
        </div>

        <div className="test-score">
          <div className="test-score-big">
            {right}
            <span> / {total}</span>
          </div>
          <div className="muted-text">{t('test.done.score', { pct: Math.round((right / total) * 100) })}</div>
        </div>

        <div className="test-groups">
          <div className="card test-group">
            <div className="test-group-top">
              <span className="test-group-n tone-good">{right}</span>
              <b>{t('test.done.right')}</b>
            </div>
            <div className="test-group-when">
              <Icon name="restart" size={16} />
              <span>
                <b>{t('test.done.rightWhen')}</b>
                <br />
                <span className="muted-text">{t('test.done.rightWhy')}</span>
              </span>
            </div>
          </div>
          <div className="card test-group">
            <div className="test-group-top">
              <span className="test-group-n tone-miss">{total - right}</span>
              <b>{t('test.done.wrong')}</b>
            </div>
            <div className="test-group-when">
              <Icon name="restart" size={16} />
              <span>
                <b>{t('test.done.wrongWhen')}</b>
                <br />
                <span className="muted-text">{t('test.done.wrongWhy')}</span>
              </span>
            </div>
          </div>
        </div>

        {weak.length > 0 && (
          <section className="card test-weak" aria-labelledby="test-weak">
            <div className="test-weak-head">
              <b id="test-weak">{t('test.done.weakest')}</b>
              <span className="muted-text">{t('test.done.firstTry')}</span>
            </div>
            {weak.map((s) => {
              const title = t('test.chapterChip', { n: s.n, title: t(`learn.chapters.${s.n}.title`) });
              const first = s.missed[0];
              return (
                <div key={s.n} className="test-weak-row">
                  <div className="test-weak-text">
                    <div className="test-weak-line">
                      <b>{title}</b>
                      <span className="mono-line">
                        {s.right} / {s.total}
                      </span>
                    </div>
                    <div className="learn-progress-bar" role="img" aria-label={t('test.done.chapterScore', { title, right: s.right, total: s.total })}>
                      <div style={{ width: (s.right / s.total) * 100 + '%' }} />
                    </div>
                    <span className="muted-text">{missedText(s)}</span>
                  </div>
                  <Link to={chapterRoute(s.n)} query={'s=' + (first ?? 'check')} className="btn btn--outline test-weak-read"
                    aria-label={first ? t('test.readSection', { id: first, title: t(sectionKey(first, 'title')) }) : t('test.readChapter', { n: s.n })}>
                    {t('test.done.read')}
                    <Icon name="chevron" size={14} />
                  </Link>
                </div>
              );
            })}
            {perfect.length > 0 && <div className="muted-text test-weak-perfect">{t('test.done.perfectIn', { count: perfect.length, list: listText(perfect) })}</div>}
          </section>
        )}
        {weak.length === 0 && <div className="nfeedback is-right">{t('test.done.allRight')}</div>}

        <div className="results-main test-done-actions">
          <Link to="/learn" className="btn btn--outline">
            {t('test.done.done')}
          </Link>
          {left > 0 ? (
            <button type="button" className="btn btn--accent" onClick={keepGoing}>
              {t('test.keepGoing')}
            </button>
          ) : (
            <Link to="/test" className="btn btn--accent">
              {t('test.done.another')}
            </Link>
          )}
        </div>
      </div>
    </ExerciseFrame>
  );
}
