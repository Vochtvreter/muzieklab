/**
 * Test yourself setup (DESIGN.md §3.6): tick the chapters to test. A round has no set length (the player stops when they
 * like), so there is no round size to pick. A chapter's row counts the cards in the deck: its quick checks answered
 * right in Learn.
 */
import { useState } from 'react';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { useDocTitle, useToday } from '../../hooks';
import { countDeck, deckIds, findCard } from '../../learn/cards';
import { CHAPTERS } from '../../learn/chapters';
import { Link, navigate } from '../../router';
import { todayIso, useStore } from '../../store';

export function TestSetup(): JSX.Element {
  const { state, dispatch } = useStore();
  const today = useToday(todayIso);
  useDocTitle(t('app.docTitle', { page: t('test.title') }));
  const deck = deckIds(state.progress);
  const rows = CHAPTERS.map((c) => ({ n: c.n, ids: deck.filter((id) => findCard(id)!.chapter === c.n) }));
  const withCards = rows.filter((r) => r.ids.length).map((r) => r.n);
  // The last round's chapters, else every chapter with cards.
  const [chosen, setChosen] = useState<number[]>(() => state.quiz?.chapters.filter((n) => withCards.includes(n)) ?? withCards);
  const toggle = (n: number): void => setChosen((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n].sort((a, b) => a - b)));
  const due = countDeck(rows.filter((r) => chosen.includes(r.n)).flatMap((r) => r.ids), state.progress.cards, today).due;
  const start = (): void => {
    dispatch({ type: 'quizStart', chapters: chosen, today });
    navigate('/test/play');
  };

  return (
    <ExerciseFrame className="frame--setup">
      <div className="page setup test-setup no-scrollbar">
        <div className="screen-head">
          <Link to="/learn" aria-label={t('learn.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <h1 className="screen-title">{t('test.title')}</h1>
          {withCards.length > 0 && (
            <button type="button" className="text-btn" onClick={() => setChosen(withCards)}>
              {t('test.chaptersRead')}
            </button>
          )}
        </div>

        {withCards.length === 0 ? (
          <div className="card test-empty">
            <p className="muted-text">{t('test.panelEmpty')}</p>
            <Link to="/learn" className="btn btn--accent">
              {t('test.toLearn')}
            </Link>
          </div>
        ) : (
          <div className="field">
            <div className="label label--split" id="test-chapters">
              <span>{t('learn.chaptersHead')}</span>
              <span className="label-value">{t('test.chosen', { count: chosen.length })}</span>
            </div>
            <div className="card test-chapters" role="group" aria-labelledby="test-chapters">
              {rows.map(({ n, ids }) => {
                const on = chosen.includes(n);
                return (
                  <button key={n} type="button" role="checkbox" aria-checked={on} disabled={!ids.length} className={'test-chapter' + (on ? ' is-on' : '')}
                    onClick={() => toggle(n)}>
                    <span aria-hidden="true" className="test-box">
                      {on && <Icon name="check" size={16} />}
                    </span>
                    <span className="mono-accent test-chapter-n">{n}</span>
                    <span className="test-chapter-title">{t(`learn.chapters.${n}.title`)}</span>
                    <span className="muted-text test-chapter-count">{ids.length ? t('test.cards', { count: ids.length }) : t('test.noCards')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {withCards.length > 0 &&
          (chosen.length ? (
            <button type="button" className="btn btn--accent start-btn" onClick={start}>
              {due ? t('test.startDue', { count: due }) : t('test.start')}
            </button>
          ) : (
            <button type="button" className="btn btn--blocked start-btn" disabled>
              {t('test.chooseOne')}
            </button>
          ))}
      </div>
    </ExerciseFrame>
  );
}
