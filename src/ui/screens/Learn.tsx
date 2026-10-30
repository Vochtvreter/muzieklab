/**
 * Learn (DESIGN.md §9.1): the chapter list with read status, and each chapter on its own page. The chapters are data
 * (`ui/learn/chapters.ts`); this file only lays them out. Each section ends with a quick check, and is marked read once
 * that is answered right; it may also end with a practice link that starts practice set up for it (also opened in a new
 * tab: LearnPractice). A chapter ends with a quick check of its own and previous / next. Examples can be heard
 * (learn/Listen.tsx); leaving the chapter stops the sound.
 *
 * Tablet and desktop use the full width: the chapter list puts its sections in two columns, and a chapter page gets the
 * big chapter number and wider sections. Tablet jumps to a section with a row of chips; desktop has a chapter sidebar.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Letter } from '../../core/api';
import { t } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { Blocks } from '../learn/Blocks';
import { CHAPTERS, findChapter, PLANNED_CHAPTERS, parseNoteName, practiceShows, sectionIds, sectionKey, type Answer, type Chapter, type Quiz, type Section } from '../learn/chapters';
import { stopLearnSound } from '../learn/Listen';
import { announce } from '../lib/announce';
import { letterName, spokenName } from '../lib/noteText';
import { focusHeading } from '../lib/screenFocus';
import { guardFollowUpTap } from '../lib/tapGuard';
import { hashQuery, Link, navigate, openedFrom, parseHash, useHash, type Route } from '../router';
import { todayIso, useStore } from '../store';
import { useStartNotes } from './notes/start';
import { useStartPractice } from './start';

export const chapterRoute = (n: number): Route => `/learn/${n}`;
const sectionTitle = (id: string): string => t(sectionKey(id, 'title'));
/** The element id a section (or the quick check, 'check') scrolls to. */
const anchor = (id: string): string => 's' + id.replace('.', '-');
/**
 * Scrolls to a section and gives it focus, so Tab goes on from there and not from the link left behind (the hash route
 * names no element, so the browser does not move focus itself). A jump link to the section already in the address
 * does not change the hash; it jumps anyway. The route stays the same, so App.tsx does not guard the jump as it does a
 * new screen: a double click's second click, or a double tap's second tap, would press what the jump put under it
 * (on a tablet, 10.3's chip leaves its quick check's answer E♭ there).
 */
const jumpTo = (id: string) => (): void => {
  guardFollowUpTap();
  const el = document.getElementById(anchor(id));
  el?.scrollIntoView({ block: 'start' });
  el?.focus({ preventScroll: true });
};

/**
 * Where the reader is in a chapter (`page`, its scroller): for a link in the chapter's column, the section (or the
 * quick check, 'check') it is in or comes after, so the chapter's end is the quick check; for one around it (the
 * sidebar, the tab bar), or no link, the section at the top of the view: the last one whose top, less the margin
 * jumpTo leaves above it (its own scroll margin and the page's scroll padding), is at or above the top of the view, so
 * jumpTo opens the same view again and the place never moves on.
 * Scrolled to the end, where the last sections cannot reach the top, it is the quick check, which jumpTo scrolls to the
 * end again. Null before the first section.
 */
function placeOf(page: HTMLElement, link: Element | null, ids: string[]): string | null {
  const inColumn = link?.closest('.learn-main') ? link : null;
  const top = page.getBoundingClientRect().top + (parseFloat(getComputedStyle(page).scrollPaddingTop) || 0);
  const end = page.scrollTop > 0 && page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
  const atTop = (el: Element): boolean => end || el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0) <= top + 1;
  let place: string | null = null;
  for (const id of [...ids, 'check']) {
    const el = document.getElementById(anchor(id));
    if (!el) continue;
    if (inColumn ? el.compareDocumentPosition(inColumn) & Node.DOCUMENT_POSITION_FOLLOWING : atTop(el)) place = id;
  }
  return place;
}

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
  // One chapter open at a time: the first one not done yet, or after the browser's Back the one that was open. The
  // tab's place in the history keeps it, beside where the tab was opened from (leave()).
  const [open, setOpen] = useState<number | null>(() => {
    const kept = (window.history.state as { learnOpen?: number | null } | null)?.learnOpen;
    if (kept === null || CHAPTERS.some((c) => c.n === kept)) return kept as number | null;
    return CHAPTERS.find((c) => chapterStatus(read, sectionIds(c)) !== 'done')?.n ?? null;
  });
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, learnOpen: open }, '');
  }, [open]);
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
      </div>
    </AppShell>
  );
}

function SectionCard({ section, read, onRight }: { section: Section; read: boolean; onRight(id: string): void }): JSX.Element {
  const { id } = section;
  const h = 'h' + id.replace('.', '-');
  return (
    <section id={anchor(id)} tabIndex={-1} className="card learn-section" aria-labelledby={h}>
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

/**
 * A section's practice: a Read notes round or a rhythm exercise straight away, or the Scales setup, set up for the
 * section on top of the player's own setup. Play and the summary carry ?from=8.2, so Quit and their back arrow return
 * to the section, and the setup they open keeps the preset. `replace` swaps the current screen for it. `needsGesture`:
 * no tap started it, so a rhythm exercise waits on Ready · Start (Read notes and the Scales setup make no sound before
 * a tap anyway).
 */
function useStartSection(): (section: Section, opts?: { replace?: boolean; needsGesture?: boolean }) => void {
  const { state, dispatch } = useStore();
  const startPractice = useStartPractice();
  const startNotes = useStartNotes();
  return (section, { replace, needsGesture } = {}) => {
    const p = section.practice!;
    const query = 'from=' + section.id;
    if ('scales' in p) {
      const settings = { ...state.scaleSettings, ...p.scales };
      dispatch({ type: 'scaleSettings', settings });
      if (settings.keyMode === 'one') dispatch({ type: 'scaleHub', hub: { ...state.scaleHub, key: settings.keys[0] } });
      navigate('/scales/setup', { replace, query });
    } else if ('notes' in p) {
      const settings = { ...state.noteSettings, ...p.notes };
      dispatch({ type: 'noteSettings', settings });
      startNotes(settings, [], { replace, query });
    } else {
      const settings = { ...state.settings, ...p.rhythm };
      dispatch({ type: 'settings', settings });
      // The exercise shows what the section teaches: the extra it turns on (5.1's tie), which the generator only makes
      // likely, and what it names (5.3's dotted eighth). For a tie it has 2 bars at least, also with the player's Bars
      // at 1, which the setup keeps (makeRunShowing).
      startPractice(settings, { replace, query, needsGesture, shows: practiceShows(p) });
    }
  };
}

/**
 * "Practice the treble clef →" starts the section's practice (useStartSection). The browser's Back returns to the
 * section, as the chapter keeps it as the reader's place on the way out (LearnChapter). Opened in a new tab or window
 * (a middle click, or with Ctrl, Cmd or Shift), its own address starts the same practice there.
 */
function PracticeLink({ section }: { section: Section }): JSX.Element {
  const start = useStartSection();
  const click = (e: MouseEvent): void => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    start(section);
  };
  return (
    <Link to="/learn/practice" query={'s=' + section.id} className="text-btn text-btn--link learn-practice" onClick={click}>
      {t(sectionKey(section.id, 'practice'))} →
    </Link>
  );
}

/**
 * #/learn/practice?s=8.2, a practice link's own address (opened in a new tab): starts that section's practice in its
 * place, or opens the Learn tab for a section without practice. No tap led here, so the browser has not let the audio
 * start: a rhythm exercise waits on Ready · Start, as after a reload (counting in at once, it heard nothing and paused).
 */
export function LearnPractice(): null {
  const start = useStartSection();
  const id = hashQuery(useHash()).get('s');
  // A layout effect, so the run it stores is there when the screen it opens first renders (Play without a run goes to
  // the setup), as after a click. Once: in development React runs a new screen's effects twice.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    const section = findChapter(Number(id?.split('.')[0]))?.sections.find((s) => s.id === id);
    if (section?.practice) start(section, { replace: true, needsGesture: true });
    else navigate('/learn', { replace: true });
  }, [id, start]);
  return null;
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

/** A note answer's name for screen readers, "F sharp" and not the sign, as the piano's keys and Read notes' names. */
function answerSpoken(a: Answer): string | undefined {
  if ('text' in a) return undefined;
  const name = parseNoteName(a.note)!;
  return spokenName(name.letter as Letter, name.alter);
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
    // Read out by the app's live region: the feedback below appears with its text, which not every screen reader reads.
    announce(t(i === quiz.right ? `${base}.right` : `${base}.wrong`));
    if (i === quiz.right) onRight?.();
  };
  const mark = (i: number): string =>
    pick === null ? '' : i === pick ? (i === quiz.right ? ' is-right' : ' is-wrong') : reveal && i === quiz.right ? ' is-right' : '';
  return (
    <>
      <b id={labelId}>{t(`${base}.question`)}</b>
      <div className={'learn-answers' + (long ? ' learn-answers--long' : '')}>
        {texts.map((text, i) => (
          <button key={i} type="button" aria-label={answerSpoken(quiz.answers[i])} aria-pressed={pick === i} className={'name-btn learn-answer' + mark(i)}
            onClick={() => choose(i)}>
            {text}
          </button>
        ))}
      </div>
      {pick !== null ? (
        <div key={pick} className={'nfeedback m-in ' + (pick === quiz.right ? 'is-right' : 'is-wrong')}>
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
    <section id={anchor('check')} tabIndex={-1} className="card learn-check" aria-labelledby="quiz-q">
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
  const passed = useMemo(() => (id: string) => dispatch({ type: 'learnRead', ids: [id], today: todayIso() }), [dispatch]);
  const at = CHAPTERS.indexOf(chapter);
  const prev = CHAPTERS[at - 1];
  const next = CHAPTERS[at + 1];
  const ids = sectionIds(chapter);
  const route = chapterRoute(n);
  // An example still sounding stops when another chapter opens or Learn closes.
  useEffect(() => stopLearnSound, [n]);

  // #/learn/10?s=10.2 opens at that section, and scrolls there again on the next frame: on tablet and desktop the
  // examples' staves are drawn after this, once their width is known, and at the chapter's end, where the page scrolls
  // no further, they would leave it short of the end (elsewhere scroll anchoring keeps the section in place). The
  // browser's Back from a section jumped to, to the chapter's own address, opens its top again, where the reader was,
  // and the heading takes the focus from the section.
  const target = hashQuery(hash).get('s');
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!target) {
      const page = pageRef.current;
      if (page) page.scrollTop = 0;
      if (page?.contains(document.activeElement)) focusHeading();
      return;
    }
    jumpTo(target)();
    const frame = requestAnimationFrame(() => document.getElementById(anchor(target))?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // A link that leaves the chapter (a practice link, the next chapter, the sidebar, the tab bar) first sets its own
  // place in the history to where the reader is (placeOf, ?s=), so the browser's Back opens it there: the chapter is
  // built afresh on the way back, in its own scroller, so the browser cannot restore the place itself. In the capture
  // phase, before the link's own click opens the next screen, which keeps this address as where it came from (leave()).
  // Only the address changes (no hashchange), so the chapter never renders with the new ?s= and jumps on its way out.
  // So does a jump to a section (the sidebar, the chips): Back then returns to where the reader was before it, the
  // chapter's top when that was above the first section, and not to the section jumped to. Not when that place is the
  // section jumped to, as the address would change without the chapter knowing and its next render would jump back
  // there; nor when it is the place this entry was opened from (a chip, above the sections, finds the chapter's top
  // after a jump from it), which would put it in the history twice in a row, and Back would seem to do nothing.
  useEffect(() => {
    const onClick = (e: globalThis.MouseEvent): void => {
      const link = e.target instanceof Element ? e.target.closest('a') : null;
      const href = link?.getAttribute('href') ?? '';
      if (!link || !pageRef.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!href.startsWith('#/') || (link.target && link.target !== '_self')) return;
      const place = placeOf(pageRef.current, link, sectionIds(chapter));
      const query = place ? 's=' + place : undefined;
      const here = '#' + route + (query ? '?' + query : '');
      if (parseHash(href) === route && (href === here || openedFrom(route, query))) return;
      if (window.location.hash !== here) window.history.replaceState(window.history.state, '', here);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [chapter, route]);

  // A phone turned on its side takes the tablet layout (and back), in the same scroller (AppShell), so the answers and
  // an example playing stay; but the text reflows, and the browser does not keep the place through that. The section
  // at the top of the view, and how far into it, is noted as the reader scrolls, and a new width scrolls back there. A
  // scroll the new width makes itself (the page got shorter) is not the reader's.
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof ResizeObserver === 'undefined') return;
    const ids = sectionIds(chapter);
    let width = page.clientWidth;
    let at: { id: string; into: number } | null = null;
    // Measured as jumpTo puts a section at the top: its scroll margin above it, under the page's scroll padding.
    const margin = (el: Element): number => parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const top = (): number => page.getBoundingClientRect().top + (parseFloat(getComputedStyle(page).scrollPaddingTop) || 0);
    const note = (): void => {
      if (page.clientWidth !== width) return;
      const id = placeOf(page, null, ids);
      const el = id ? document.getElementById(anchor(id)) : null;
      // At the end the quick check may sit below the top: the end it is, as jumpTo scrolls there.
      at = id && el ? { id, into: Math.max(0, (top() - el.getBoundingClientRect().top + margin(el)) / el.offsetHeight) } : null;
    };
    const keep = new ResizeObserver(() => {
      if (page.clientWidth === width) return;
      width = page.clientWidth;
      const el = at ? document.getElementById(anchor(at.id)) : null;
      if (!at || !el) return;
      el.scrollIntoView({ block: 'start' });
      page.scrollTop += at.into * el.offsetHeight;
    });
    page.addEventListener('scroll', note, { passive: true });
    keep.observe(page);
    return () => {
      page.removeEventListener('scroll', note);
      keep.disconnect();
    };
  }, [chapter]);

  // On a short screen the sidebar scrolls on its own, and it is built afresh for each chapter: it starts with the open
  // chapter in view (its title, and its sections as far as they fit), the last ones of the list too. Its own scroll
  // only, as scrollIntoView would move the page as well. Again once the fonts are in, which may change the rows.
  const sideRef = useRef<HTMLElement>(null);
  const openRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    let on = true;
    const show = (): void => {
      const side = sideRef.current;
      const open = openRef.current;
      if (!on || !side || !open) return;
      const s = side.getBoundingClientRect();
      const o = open.getBoundingClientRect();
      if (o.bottom > s.bottom) side.scrollTop += Math.min(o.bottom - s.bottom, o.top - s.top);
    };
    show();
    void document.fonts?.ready.then(show);
    return () => {
      on = false;
    };
  }, [n, bp]);

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
      <div ref={pageRef} className={'page learn-chapter no-scrollbar' + (wide ? ' learn-chapter--wide' : '')}>
        {bp === 'desktop' && (
          <aside ref={sideRef} className="learn-side">
            <span className="eyebrow">{t('learn.chaptersHead')}</span>
            {CHAPTERS.map((c) =>
              c === chapter ? (
                <nav key={c.n} ref={openRef} aria-label={t('learn.jump')} className="learn-side-chapter">
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
            <Link to={chapter.practice === 'notes' ? '/notes' : chapter.practice === 'scales' ? '/scales' : '/setup'} query={'from=' + chapter.n} className="btn btn--accent">
              {t(chapter.practice === 'notes' ? 'learn.practice' : chapter.practice === 'scales' ? 'learn.practiceScales' : 'learn.practiceRhythm')}
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
