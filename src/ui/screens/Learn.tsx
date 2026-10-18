/**
 * Learn (DESIGN.md §9.1): the chapter list with read status, and each chapter on its own page. The chapters are data
 * (`ui/learn/chapters.ts`); this file only lays them out. Each section ends with a quick check, and is marked read once
 * that is answered right; it may also end with a practice link that opens practice set up for it. A chapter ends with
 * a quick check of its own and previous / next.
 *
 * Tablet and desktop use the full width: the chapter list puts its sections in two columns, and a chapter page gets the
 * big chapter number and wider sections. Tablet jumps to a section with a row of chips; desktop has a chapter sidebar.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Letter } from '../../core/api';
import { t } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { Blocks } from '../learn/Blocks';
import { CHAPTERS, PLANNED_CHAPTERS, parseNoteName, sectionIds, sectionKey, type Answer, type Chapter, type Quiz, type Section } from '../learn/chapters';
import { letterName } from '../lib/noteText';
import { hashQuery, Link, useHash, type Route } from '../router';
import { useStore } from '../store';

export const chapterRoute = (n: number): Route => `/learn/${n}`;
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

export function LearnHub(): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('learn.docTitle') }));
  const read = state.progress.learnRead;
  // One chapter open at a time: the first one not done yet.
  const [open, setOpen] = useState<number | null>(() => CHAPTERS.find((c) => chapterStatus(read, sectionIds(c)) !== 'done')?.n ?? null);
  const all = CHAPTERS.flatMap(sectionIds);
  const readCount = all.filter((s) => read.includes(s)).length;
  const total = all.length;

  return (
    <AppShell bp={bp} active="/learn" fill>
      <div className={'page learn no-scrollbar' + (bp !== 'phone' ? ' learn--wide' : '')}>
        <div className="learn-head">
          <h1 className="page-title">{t('learn.title')}</h1>
          <p className="muted-text learn-sub">{t('learn.sub')}</p>
        </div>
        <div className="learn-progress">
          <div className="learn-progress-bar" role="img" aria-label={t('learn.sectionsLabel', { read: readCount, total })}>
            <div style={{ width: (readCount / total) * 100 + '%' }} />
          </div>
          <span className="mono-muted" aria-hidden="true">
            {t('learn.sections', { read: readCount, total })}
          </span>
        </div>

        {CHAPTERS.map((c) => {
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
        <p className="muted-text learn-later">{t('learn.laterNote')}</p>
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
function answerText(base: string, a: Answer): string {
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

function ChapterCheck({ chapter }: { chapter: Chapter }): JSX.Element {
  return (
    <section id={anchor('check')} className="card learn-check" aria-labelledby="quiz-q">
      <span className="eyebrow">{t('learn.check')}</span>
      <QuickCheck base={`learn.ch${chapter.n}.quiz`} quiz={chapter.quiz} labelId="quiz-q" reveal />
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
              · {t('learn.chapterN', counter)}
            </span>
          ) : (
            <div className="screen-head">
              <Link to="/learn" aria-label={t('learn.back')} className="icon-btn icon-btn--edge">
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
            <Link to="/learn" className="ghost-btn learn-all">
              {t('learn.all')}
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
