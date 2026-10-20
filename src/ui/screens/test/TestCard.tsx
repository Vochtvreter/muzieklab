/**
 * Test yourself · a card (DESIGN.md §3.6): the question, its glyph and three answers. After a pick the right answer turns
 * green and a wrong pick red, and a panel says when the card is back, explains, and links to its section. The answer is
 * saved at once, so the player can stop at any card (× opens Round done). Due cards come first; after the last one the
 * player can keep going with the others or finish. Keys 1–3 answer and Enter goes on.
 */
import { useEffect } from 'react';
import { daysUntilBack } from '../../../game/leitner';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { useDocTitle, useToday } from '../../hooks';
import { findCard, type Card } from '../../learn/cards';
import { sectionKey } from '../../learn/chapters';
import { Link, navigate } from '../../router';
import { todayIso, useStore, type QuizRun } from '../../store';
import { answerText, chapterRoute } from '../Learn';

/** A check's "Right." text without its first word, as the card's explanation. */
export function explanation(card: Card): string {
  const text = t(`${card.base}.right`);
  const lead = t('test.rightLead');
  return text.startsWith(lead) ? text.slice(lead.length).trimStart() : text;
}

export function TestCard(): JSX.Element | null {
  const { state } = useStore();
  useDocTitle(t('app.docTitle', { page: t('test.title') }));
  const q = state.quiz;
  useEffect(() => {
    if (!q) navigate('/test', { replace: true });
  }, [q]);
  if (!q) return null;
  // A new card gets a fresh view (no pick carried over).
  return <CardView key={q.at} q={q} />;
}

function CardView({ q }: { q: QuizRun }): JSX.Element {
  const { state, dispatch } = useStore();
  const today = useToday(todayIso);
  const card = findCard(q.queue[q.at])!;
  // The answer is in the round, so coming back to this card (from its section) shows it answered.
  const given = q.answers[q.at] as QuizRun['answers'][number] | undefined;
  const pick = given?.pick ?? null;
  const answered = pick !== null;
  const right = q.answers.filter((a) => a.right).length;
  const wrong = q.answers.length - right;
  const dueLeft = Math.max(0, q.due - q.answers.length);
  const more = q.at + 1 < q.queue.length;
  const lastDue = q.at + 1 === q.due && more;
  const texts = card.quiz.answers.map((a) => answerText(card.base, a));

  const choose = (i: number): void => {
    if (answered) return;
    dispatch({ type: 'quizAnswer', pick: i, right: i === card.quiz.right, today });
  };
  const next = (): void => dispatch({ type: 'quizNext' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < texts.length && !answered) choose(i);
      else if (e.key === 'Enter' && answered && more && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const isRight = pick === card.quiz.right;
  const mark = (i: number): string => (!answered ? '' : i === card.quiz.right ? ' is-right' : i === pick ? ' is-wrong' : ' is-dim');
  const state1 = state.progress.cards[card.id];
  const chapterTitle = t(`learn.chapters.${card.chapter}.title`);

  return (
    <ExerciseFrame className="frame--test">
      <div className="page test-play no-scrollbar">
        <div className="test-head">
          <Link to={q.answers.length ? '/test/done' : '/learn'} aria-label={t('test.stop')} className="icon-btn icon-btn--edge-sm">
            <Icon name="close" />
          </Link>
          <div className="test-bar" role="img" aria-label={t('test.dueLeft', { count: dueLeft })}>
            <div style={{ width: (q.due ? Math.min(1, q.answers.length / q.due) : 1) * 100 + '%' }} />
          </div>
          <span className="mono-muted">{dueLeft ? t('test.dueLeft', { count: dueLeft }) : t('test.moreLeft', { count: q.queue.length - q.answers.length })}</span>
        </div>
        <div className="test-sub">
          <span>{t('test.sub')}</span>
          <span>
            <b className="tone-good">{right}</b> {t('test.right')} · <b className="tone-miss">{wrong}</b> {t('test.wrong')}
          </span>
        </div>

        <section className="test-card" aria-labelledby="test-q">
          <div className="test-card-top">
            <span className="test-chip">{t('test.chapterChip', { n: card.chapter, title: chapterTitle })}</span>
            <span className="eyebrow">{t('learn.check')}</span>
          </div>
          <h1 id="test-q" className="test-question">
            {t(`${card.base}.question`)}
          </h1>
          <div aria-hidden="true" className="test-glyph music">
            {card.glyph}
          </div>
          {answered && (
            <div className={'test-result m-in ' + (isRight ? 'is-right' : 'is-wrong')} role="status">
              <b>
                {isRight
                  ? t('test.rightBack', { count: state1 ? daysUntilBack(state1) : 4 })
                  : t('test.wrongBack', { answer: texts[card.quiz.right] })}
              </b>
              <span>{explanation(card)}</span>
              <Link to={chapterRoute(card.chapter)} query={'s=' + (card.section ?? 'check')} className="text-btn test-read">
                {card.section ? t('test.readSection', { id: card.section, title: t(sectionKey(card.section, 'title')) }) : t('test.readChapter', { n: card.chapter })} →
              </Link>
            </div>
          )}
        </section>

        <div role="group" aria-labelledby="test-q" className={'test-answers' + (texts.some((x) => x.length > 4) ? ' test-answers--long' : '')}>
          {texts.map((text, i) => (
            <button key={i} type="button" aria-pressed={pick === i} disabled={answered && pick !== i && i !== card.quiz.right}
              className={'name-btn test-answer' + mark(i)} onClick={() => choose(i)}>
              {text}
            </button>
          ))}
        </div>

        {!answered ? (
          <button type="button" className="btn btn--blocked test-next" disabled>
            {t('test.pick')}
          </button>
        ) : lastDue ? (
          <div className="test-end">
            <span className="muted-text">{t('test.lastDue')}</span>
            <div className="test-end-actions">
              <Link to="/test/done" className="btn btn--outline">
                {t('test.finish')}
              </Link>
              <button type="button" className="btn btn--accent" onClick={next}>
                {t('test.keepGoing')}
              </button>
            </div>
          </div>
        ) : more ? (
          <button type="button" className="btn btn--accent test-next" onClick={next}>
            {t('test.next')}
          </button>
        ) : (
          <Link to="/test/done" className="btn btn--accent test-next">
            {t('test.seeHow')}
          </Link>
        )}
      </div>
    </ExerciseFrame>
  );
}
