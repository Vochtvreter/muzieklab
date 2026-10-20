/**
 * Learn (DESIGN.md §9.1, §3.6). The Learn tab opens on two separate parts: the theory, as a tile per topic, and Test
 * yourself. A topic lists its chapters with read status, and each chapter is its own page. The chapters are data
 * (`ui/learn/chapters.ts`); this file only lays them out. Each section ends with a quick check, and is marked read once
 * that is answered right; it may also end with a practice link that opens practice set up for it. A chapter ends with
 * a quick check of its own and previous / next. Every quick check answered right adds its flash card to Test yourself.
 *
 * Tablet and desktop use the full width: the chapter list puts its sections in two columns, and a chapter page gets the
 * big chapter number and wider sections. Tablet jumps to a section with a row of chips; desktop has a chapter sidebar.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Letter } from '../../core/api';
import { t } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle, useToday } from '../hooks';
import { Blocks } from '../learn/Blocks';
import { countDeck, deckIds } from '../learn/cards';
import { CHAPTERS, PLANNED_CHAPTERS, parseNoteName, sectionIds, sectionKey, topicChapters, TOPICS, type Answer, type Chapter, type Quiz, type Section, type Topic } from '../learn/chapters';
import { letterName } from '../lib/noteText';
import { hashQuery, Link, navigate, useHash, type Route } from '../router';
import { todayIso, useStore } from '../store';

export const chapterRoute = (n: number): Route => `/learn/${n}`;
export const topicRoute = (topic: Topic): Route => `/learn/${topic}`;
const sectionTitle = (id: string): string => t(sectionKey(id, 'title'));
/** The element id a section (or the quick check, 'check') scrolls to. */
const anchor = (id: string): string => 's' + id.replace('.', '-');
/** A jump link to the section already in the address does not change the hash; scroll there anyway. */
const jumpTo = (id: string) => (): void => document.getElementById(anchor(id))?.scrollIntoView({ block: 'start' });

type Status = 'done' | 'reading' | 'new';
function chapterStatus(read: string[], sections: string[]): Status {
  const n = sections.filter((s) => read.includes(s)).length;
  return n === sections.length ? 'done' : n > 0 ? 'reading' : 'new';
}

/** "12 / 28 sections" with its bar. */
function ReadProgress({ read, ids }: { read: string[]; ids: string[] }): JSX.Element {
  const done = ids.filter((s) => read.includes(s)).length;
  return (
    <div className="learn-progress">
      <div className="learn-progress-bar" role="img" aria-label={t('learn.sectionsLabel', { read: done, total: ids.length })}>
        <div style={{ width: (done / ids.length) * 100 + '%' }} />
      </div>
      <span className="mono-muted" aria-hidden="true">
        {t('learn.sections', { read: done, total: ids.length })}
      </span>
    </div>
  );
}

/** The Learn tab: the theory as topic tiles, and Test yourself apart from it (DESIGN.md §3.6). */
export function LearnHub(): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const today = useToday(todayIso);
  useDocTitle(t('app.docTitle', { page: t('learn.docTitle') }));
  const read = state.progress.learnRead;
  const deck = deckIds(state.progress);
  const counts = countDeck(deck, state.progress.cards, today);
  const start = (): void => {
    dispatch({ type: 'quizStart', chapters: CHAPTERS.map((c) => c.n), today });
    navigate('/test/play');
  };

  return (
    <AppShell bp={bp} active="/learn" fill>
      <div className={'page learn learn-home no-scrollbar' + (bp !== 'phone' ? ' learn--wide' : '')}>
        <div className="learn-head">
          <h1 className="page-title">{t('learn.title')}</h1>
          <p className="muted-text learn-sub">{t('learn.sub')}</p>
        </div>
        <ReadProgress read={read} ids={CHAPTERS.flatMap(sectionIds)} />

        <div className="learn-home-grid">
          <section aria-labelledby="learn-theory" className="learn-home-part">
            <h2 id="learn-theory" className="eyebrow learn-home-h">
              {t('learn.theory')}
            </h2>
            <nav aria-label={t('learn.topicsLabel')} className="topic-tiles">
              {TOPICS.map(({ id, glyph }) => {
                const chapters = topicChapters(id);
                const ids = chapters.flatMap(sectionIds);
                const done = ids.filter((s) => read.includes(s)).length;
                return (
                  <Link key={id} to={topicRoute(id)} className="topic-tile">
                    <span aria-hidden="true" className="topic-icon music">
                      {glyph}
                    </span>
                    <span className="topic-text">
                      <b>{t(`learn.topics.${id}.title`)}</b>
                      <span>
                        {t('learn.topicChapters', { from: chapters[0].n, to: chapters[chapters.length - 1].n })} · {t(`learn.topics.${id}.sub`)}
                      </span>
                    </span>
                    <span className="topic-progress">
                      <span className="learn-progress-bar" aria-hidden="true">
                        <span style={{ width: (done / ids.length) * 100 + '%' }} />
                      </span>
                      <span className="mono-muted">{t('learn.sections', { read: done, total: ids.length })}</span>
                    </span>
                  </Link>
                );
              })}
              <div className="topic-tile is-later" aria-disabled="true">
                <span aria-hidden="true" className="topic-icon">
                  <svg width="30" height="26" viewBox="0 0 34 30">
                    <g fill="none" stroke="currentColor" strokeWidth="2">
                      <ellipse cx="5" cy="25" rx="4" ry="3" />
                      <ellipse cx="13" cy="19" rx="4" ry="3" />
                      <ellipse cx="21" cy="12" rx="4" ry="3" />
                      <ellipse cx="29" cy="5" rx="4" ry="3" />
                    </g>
                  </svg>
                </span>
                <span className="topic-text">
                  <span className="topic-title-row">
                    <b>{t('learn.topics.scales.title')}</b>
                    <span className="chapter-pill is-later">{t('learn.status.later')}</span>
                  </span>
                  <span>{t('learn.topics.scales.sub')}</span>
                </span>
              </div>
            </nav>
          </section>

          <section aria-labelledby="learn-test" className="learn-home-part">
            <h2 id="learn-test" className="eyebrow learn-home-h">
              {t('learn.checkPart')}
            </h2>
            <div className="test-panel">
              <div className="test-panel-head">
                <span aria-hidden="true" className="test-panel-icon">
                  <Icon name="cards" size={24} />
                </span>
                <span className="test-panel-text">
                  <span className="test-panel-title">
                    <b>{t('test.title')}</b>
                    {counts.due > 0 && <span className="chapter-pill is-reading">{t('test.duePill', { count: counts.due })}</span>}
                  </span>
                  <span className="muted-text">{t(counts.total ? 'test.panelText' : 'test.panelEmpty')}</span>
                </span>
              </div>
              {counts.total > 0 && (
                <>
                  <span className="test-panel-stats">
                    <span>{t('test.inDeck', { count: counts.total })}</span>
                    <span>{t('test.dueToday', { count: counts.due })}</span>
                  </span>
                  <div className="test-panel-actions">
                    <Link to="/test" className="btn btn--outline">
                      {t('test.choose')}
                    </Link>
                    <button type="button" className="btn btn--accent" onClick={start}>
                      {counts.due ? t('test.startDue', { count: counts.due }) : t('test.start')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/** A topic's chapters (Rhythm: chapters 1–7), each a card that opens into its sections. */
export function LearnTopic({ topic }: { topic: Topic }): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  const title = t(`learn.topics.${topic}.title`);
  useDocTitle(t('app.docTitle', { page: title }));
  const read = state.progress.learnRead;
  const chapters = topicChapters(topic);
  // One chapter open at a time: the first one not done yet.
  const [open, setOpen] = useState<number | null>(() => chapters.find((c) => chapterStatus(read, sectionIds(c)) !== 'done')?.n ?? null);

  return (
    <AppShell bp={bp} active="/learn" fill>
      <div className={'page learn no-scrollbar' + (bp !== 'phone' ? ' learn--wide' : '')}>
        <div className="learn-head">
          <Link to="/learn" className="text-btn learn-back">
            <Icon name="back" size={20} />
            {t('learn.title')}
          </Link>
          <h1 className="page-title">{title}</h1>
          <p className="muted-text learn-sub">
            {t('learn.topicChapters', { from: chapters[0].n, to: chapters[chapters.length - 1].n })} · {t(`learn.topics.${topic}.intro`)}
          </p>
        </div>
        <ReadProgress read={read} ids={chapters.flatMap(sectionIds)} />

        {chapters.map((c) => {
          const ids = sectionIds(c);
          const status = chapterStatus(read, ids);
          const isOpen = open === c.n;
          return (
            <div key={c.n} className="chapter-card">
              <button type="button" className="chapter-row" aria-expanded={isOpen} aria-controls={`ch${c.n}-sections`}
                onClick={() => setOpen(isOpen ? null : c.n)}>
                <span className={'chapter-n is-' + status}>{c.n}</span>
                <span className="chapter-text">
                  <b>{t(`learn.chapters.${c.n}.title`)}</b>
                  <span>{t(`learn.chapters.${c.n}.sub`)}</span>
                </span>
                <span className={'chapter-pill is-' + status}>{t('learn.status.' + status)}</span>
              </button>
              <div id={`ch${c.n}-sections`} className={'m-acc' + (isOpen ? ' is-open' : '')}>
                <div>
                  <div className="chapter-sections" style={{ '--rows': Math.ceil(ids.length / 2) } as CSSProperties}>
                    {ids.map((id) => (
                      <Link key={id} to={chapterRoute(c.n)} query={'s=' + id} className="chapter-section">
                        <span className="mono-accent chapter-section-n">{id}</span>
                        <span className="chapter-section-title">{sectionTitle(id)}</span>
                        {read.includes(id) && <span className="chapter-read">{t('learn.read')}</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function SectionCard({ section, read, onRight }: { section: Section; read: boolean; onRight(id: string): void }): JSX.Element {
  const { id } = section;
  const h = 'h' + id.replace('.', '-');
  return (
    <section id={anchor(id)} className="card learn-section" aria-labelledby={h}>
      <h2 id={h} className="learn-section-title">
        <span className="mono-accent">{id}</span>
        {sectionTitle(id)}
      </h2>
      <Blocks id={id} blocks={section.blocks} />
      <SectionCheck section={section} read={read} onRight={onRight} />
      {section.practice && <PracticeLink section={section} />}
    </section>
  );
}

/** The section's quick check: a right answer marks the section read. A wrong one says why, without giving the answer away. */
function SectionCheck({ section, read, onRight }: { section: Section; read: boolean; onRight(id: string): void }): JSX.Element {
  const { id } = section;
  const q = 'q' + id.replace('.', '-');
  return (
    <div className="learn-check learn-check--section" role="group" aria-labelledby={q}>
      <span className="learn-check-head">
        <span className="eyebrow">{t('learn.check')}</span>
        {read && <span className="chapter-read">{t('learn.read')}</span>}
      </span>
      <QuickCheck base={sectionKey(id, 'check')} quiz={section.check} labelId={q} onRight={() => onRight(id)}
        hint={read ? undefined : t('learn.checkHint')} />
    </div>
  );
}

/** "Practice the treble clef →": Read notes or Free practice, set up for the section on top of the player's own setup. */
function PracticeLink({ section }: { section: Section }): JSX.Element {
  const { state, dispatch } = useStore();
  const p = section.practice!;
  const start = (): void => {
    if ('notes' in p) dispatch({ type: 'noteSettings', settings: { ...state.noteSettings, ...p.notes } });
    else dispatch({ type: 'settings', settings: { ...state.settings, ...p.rhythm } });
  };
  return (
    <Link to={'notes' in p ? '/notes' : '/setup'} className="text-btn text-btn--link learn-practice" onClick={start}>
      {t(sectionKey(section.id, 'practice'))} →
    </Link>
  );
}

/** "1, 4 and 5". */
const listText = (items: number[]): string =>
  items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + t('learn.meta.and') + items[items.length - 1];

/** The line under the intro: "Builds on chapters 1 and 2 · Path units 2, 3, 5"; the first chapter says "Start here". */
function chapterMeta(c: Chapter): string {
  const parts: string[] = [];
  if (c.builds?.length) parts.push(t('learn.meta.builds', { count: c.builds.length, list: listText(c.builds) }));
  else if (c === CHAPTERS[0]) parts.push(t('learn.meta.start'));
  if (c.units?.length) parts.push(t('learn.meta.units', { count: c.units.length, list: c.units.join(', ') }));
  return parts.join(' · ');
}

/** `base` is where the quiz's texts live: 'learn.ch5.quiz' for a chapter, 'learn.ch5.s2.check' for section 5.2. */
export function answerText(base: string, a: Answer): string {
  if ('text' in a) return t(`${base}.${a.text}`);
  const name = parseNoteName(a.note)!;
  return letterName(name.letter as Letter, name.alter);
}

/**
 * The question, its answers and the feedback. With `reveal` a wrong pick also marks the right answer (the chapter's
 * check); without it, you try again (a section's).
 */
function QuickCheck({ base, quiz, labelId, reveal, hint, onRight }: { base: string; quiz: Quiz; labelId: string; reveal?: boolean; hint?: string; onRight?(): void }): JSX.Element {
  const [pick, setPick] = useState<number | null>(null);
  const texts = quiz.answers.map((a) => answerText(base, a));
  // Note names and numbers sit in a row; answers in words get a row each.
  const long = texts.some((x) => x.length > 4);
  const choose = (i: number): void => {
    setPick(i);
    if (i === quiz.right) onRight?.();
  };
  const mark = (i: number): string =>
    pick === null ? '' : i === pick ? (i === quiz.right ? ' is-right' : ' is-wrong') : reveal && i === quiz.right ? ' is-right' : '';
  return (
    <>
      <b id={labelId}>{t(`${base}.question`)}</b>
      <div className={'learn-answers' + (long ? ' learn-answers--long' : '')}>
        {texts.map((text, i) => (
          <button key={i} type="button" aria-pressed={pick === i} className={'name-btn learn-answer' + mark(i)} onClick={() => choose(i)}>
            {text}
          </button>
        ))}
      </div>
      {pick !== null ? (
        <div key={pick} className={'nfeedback m-in ' + (pick === quiz.right ? 'is-right' : 'is-wrong')} role="status">
          {t(pick === quiz.right ? `${base}.right` : `${base}.wrong`)}
        </div>
      ) : (
        hint && <span className="muted-text">{hint}</span>
      )}
    </>
  );
}

/** The chapter's own quick check; a right answer adds its card to Test yourself. */
function ChapterCheck({ chapter }: { chapter: Chapter }): JSX.Element {
  const { dispatch } = useStore();
  return (
    <section id={anchor('check')} className="card learn-check" aria-labelledby="quiz-q">
      <span className="eyebrow">{t('learn.check')}</span>
      <QuickCheck base={`learn.ch${chapter.n}.quiz`} quiz={chapter.quiz} labelId="quiz-q" reveal onRight={() => dispatch({ type: 'learnQuiz', n: chapter.n })} />
    </section>
  );
}

function ChapterCard({ chapter, dir }: { chapter: Chapter; dir: 'prev' | 'next' }): JSX.Element {
  return (
    <Link to={chapterRoute(chapter.n)} className={'learn-nav-link' + (dir === 'next' ? ' learn-nav-link--next' : '')}>
      <span className="eyebrow">
        {dir === 'prev' && <span aria-hidden="true">← </span>}
        {t('learn.' + dir)}
        {dir === 'next' && <span aria-hidden="true"> →</span>}
      </span>
      <b>
        {chapter.n} · {t(`learn.chapters.${chapter.n}.title`)}
      </b>
    </Link>
  );
}

export function LearnChapter({ chapter }: { chapter: Chapter }): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const hash = useHash();
  const { n } = chapter;
  const title = t(`learn.chapters.${n}.title`);
  useDocTitle(t('app.docTitle', { page: title }));
  const read = state.progress.learnRead;
  const passed = useMemo(() => (id: string) => dispatch({ type: 'learnRead', ids: [id] }), [dispatch]);
  const at = CHAPTERS.indexOf(chapter);
  const prev = CHAPTERS[at - 1];
  const next = CHAPTERS[at + 1];
  const ids = sectionIds(chapter);
  const route = chapterRoute(n);

  // #/learn/10?s=10.2 opens at that section.
  const target = hashQuery(hash).get('s');
  useEffect(() => {
    if (target) jumpTo(target)();
  }, [target]);

  const wide = bp !== 'phone';
  const counter = { n, total: PLANNED_CHAPTERS };
  const meta = chapterMeta(chapter);
  const sectionLinks = (className?: string): ReactNode =>
    ids.map((id) => (
      <Link key={id} to={route} query={'s=' + id} onClick={jumpTo(id)} className={className}>
        {className ? <span className="mono-accent">{id}</span> : id} {sectionTitle(id)}
      </Link>
    ));

  return (
    <AppShell bp={bp} active="/learn" fill>
      <div className={'page learn-chapter no-scrollbar' + (wide ? ' learn-chapter--wide' : '')}>
        {bp === 'desktop' && (
          <aside className="learn-side">
            <span className="eyebrow">{t('learn.chaptersHead')}</span>
            {CHAPTERS.map((c) =>
              c === chapter ? (
                <nav key={c.n} aria-label={t('learn.jump')} className="learn-side-chapter">
                  <span className="learn-side-title">
                    <span className="learn-side-n">{c.n}</span>
                    {title}
                  </span>
                  {sectionLinks()}
                  <Link to={route} query="s=check" onClick={jumpTo('check')}>
                    {t('learn.check')}
                  </Link>
                </nav>
              ) : (
                <Link key={c.n} to={chapterRoute(c.n)} className="learn-side-other">
                  <span className="learn-side-n">{c.n}</span>
                  {t(`learn.chapters.${c.n}.title`)}
                </Link>
              ),
            )}
            <p className="muted-text learn-side-later">{t('learn.laterNote')}</p>
          </aside>
        )}
        <div className="learn-main">
          {wide ? (
            <span className="eyebrow">
              <Link to="/learn" className="learn-crumb">
                {t('learn.title')}
              </Link>{' '}
              ·{' '}
              <Link to={topicRoute(chapter.practice)} className="learn-crumb">
                {t(`learn.topics.${chapter.practice}.title`)}
              </Link>{' '}
              · {t('learn.chapterN', counter)}
            </span>
          ) : (
            <div className="screen-head">
              <Link to={topicRoute(chapter.practice)} aria-label={t('learn.backTo', { topic: t(`learn.topics.${chapter.practice}.title`) })} className="icon-btn icon-btn--edge">
                <Icon name="back" />
              </Link>
              <span className="eyebrow">{t('learn.chapterOf', counter)}</span>
            </div>
          )}
          <div className="learn-intro">
            <h1 className="learn-title">
              <span>{n}</span> {title}
            </h1>
            <p>{t(`learn.ch${n}.intro`)}</p>
            {meta && <span className="muted-text">{meta}</span>}
          </div>
          {bp === 'tablet' && (
            <nav aria-label={t('learn.jump')} className="learn-chips">
              {sectionLinks('learn-chip')}
            </nav>
          )}

          {chapter.sections.map((s) => (
            <SectionCard key={s.id} section={s} read={read.includes(s.id)} onRight={passed} />
          ))}

          <ChapterCheck key={n} chapter={chapter} />

          {(prev || next) && (
            <nav className="learn-nav" aria-label={t('learn.chaptersHead')}>
              {prev && <ChapterCard chapter={prev} dir="prev" />}
              {next && <ChapterCard chapter={next} dir="next" />}
            </nav>
          )}

          <div className="learn-end">
            <Link to={chapter.practice === 'notes' ? '/notes' : '/setup'} className="btn btn--accent">
              {t(chapter.practice === 'notes' ? 'learn.practice' : 'learn.practiceRhythm')}
            </Link>
            <Link to={topicRoute(chapter.practice)} className="ghost-btn learn-all">
              {t('learn.all')}
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
