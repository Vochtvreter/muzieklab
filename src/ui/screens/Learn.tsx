/**
 * Learn (DESIGN.md §9.1): the chapter list with read status, and the reading-notes chapters on their own pages:
 * 8 · Notes on the staff, 9 · Sharps, flats and naturals, 10 · Key signatures. Each section is marked read once it has
 * been on screen and may end with a practice link that opens Read notes set up for it; a chapter ends with a quick
 * check and previous / next links. Chapters 1–7 (rhythm) come with v1.2, chapter 11 (scales) with v1.4.
 *
 * Tablet and desktop use the full width: the chapter list puts its sections in two columns, and a chapter page gets the
 * big chapter number and wider sections. Tablet jumps to a section with a row of chips; desktop has a chapter sidebar.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LETTERS, letterOf, type Alter, type Clef, type Letter, type NoteSettings } from '../../core/api';
import { PitchStaff, type PitchNote } from '../../render/PitchStaff';
import { t } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { letterName, solfegeName } from '../lib/noteText';
import { hashQuery, Link, useHash, type Route } from '../router';
import { useStore } from '../store';

export type ChapterN = 8 | 9 | 10;

/** The chapters built so far, with their sections in order. */
export const CHAPTERS: readonly { n: ChapterN; sections: readonly string[] }[] = [
  { n: 8, sections: ['8.1', '8.2', '8.3', '8.4', '8.5'] },
  { n: 9, sections: ['9.1', '9.2', '9.3', '9.4'] },
  { n: 10, sections: ['10.1', '10.2', '10.3', '10.4'] },
];
/** All chapters in the plan, for "chapter 9 of 11". */
const TOTAL_CHAPTERS = 11;

export const chapterRoute = (n: ChapterN): Route => `/learn/${n}`;
const chapterOf = (id: string): ChapterN => Number(id.split('.')[0]) as ChapterN;
const sectionTitle = (id: string): string => t(`learn.ch${chapterOf(id)}.s${id.split('.')[1]}.title`);
/** The element id a section (or the quick check, 'check') scrolls to. */
const anchor = (id: string): string => 's' + id.replace('.', '-');
/** A jump link to the section already in the address does not change the hash; scroll there anyway. */
const jumpTo = (id: string) => (): void => document.getElementById(anchor(id))?.scrollIntoView({ block: 'start' });

/**
 * Read notes set up for a section, on top of the player's own setup (answer with, notes per round and the timer stay).
 * Sections without one have no practice link.
 */
const C_ONLY: Partial<NoteSettings> = { keys: ['C'], mixKeys: false, extras: 'none' };
export const SECTION_PRACTICE: Record<string, Partial<NoteSettings>> = {
  '8.2': { ...C_ONLY, clefs: ['treble'], range: 'staff' },
  '8.3': { ...C_ONLY, clefs: ['bass'], range: 'staff' },
  '8.4': { ...C_ONLY, clefs: ['treble', 'bass'], range: 'ledger2' },
  '8.5': { ...C_ONLY, clefs: ['treble', 'bass'], range: 'staff', input: 'names' },
  '9.1': { ...C_ONLY, input: 'piano' },
  '9.3': { ...C_ONLY, extras: 'sharps' },
  '9.4': { ...C_ONLY, extras: 'both' },
  '10.1': { keys: ['G'], mixKeys: false, extras: 'none' },
  '10.2': { keys: ['D', 'Bb'], mixKeys: true, extras: 'none' },
  '10.3': { keys: ['G', 'D', 'A', 'F', 'Bb', 'Eb'], mixKeys: true, extras: 'none' },
};

type Status = 'done' | 'reading' | 'new';
function chapterStatus(read: string[], sections: readonly string[]): Status {
  const n = sections.filter((s) => read.includes(s)).length;
  return n === sections.length ? 'done' : n > 0 ? 'reading' : 'new';
}

export function LearnHub(): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('learn.docTitle') }));
  const read = state.progress.learnRead;
  // One chapter open at a time: the first one not done yet.
  const [open, setOpen] = useState<ChapterN | null>(() => CHAPTERS.find((c) => chapterStatus(read, c.sections) !== 'done')?.n ?? null);
  const all = CHAPTERS.flatMap((c) => c.sections);
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

        {CHAPTERS.map(({ n, sections }) => {
          const status = chapterStatus(read, sections);
          const isOpen = open === n;
          return (
            <div key={n} className="chapter-card">
              <button type="button" className="chapter-row" aria-expanded={isOpen} aria-controls={`ch${n}-sections`}
                onClick={() => setOpen(isOpen ? null : n)}>
                <span className={'chapter-n is-' + status}>{n}</span>
                <span className="chapter-text">
                  <b>{t(`learn.chapters.${n}.title`)}</b>
                  <span>{t(`learn.chapters.${n}.sub`)}</span>
                </span>
                <span className={'chapter-pill is-' + status}>{t('learn.status.' + status)}</span>
              </button>
              <div id={`ch${n}-sections`} className={'m-acc' + (isOpen ? ' is-open' : '')}>
                <div>
                  <div className="chapter-sections" style={{ '--rows': Math.ceil(sections.length / 2) } as CSSProperties}>
                    {sections.map((id) => (
                      <Link key={id} to={chapterRoute(n)} query={'s=' + id} className="chapter-section">
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

const TREBLE_LINES = [30, 32, 34, 36, 38];
const TREBLE_SPACES = [31, 33, 35, 37];
const BASS_LINES = [18, 20, 22, 24, 26];
const BASS_SPACES = [19, 21, 23, 25];
const labelled = (steps: number[]): PitchNote[] => steps.map((step) => ({ step, sign: null, label: letterName(letterOf(step), 0) }));
const names = (steps: number[]): string => steps.map((s) => letterName(letterOf(s), 0)).join(', ');

function Section({ id, children, onSeen }: { id: string; children: ReactNode; onSeen(id: string): void }): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  // Read once its end has been on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const end = el.querySelector('.learn-section-end');
    if (!end) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        onSeen(id);
        io.disconnect();
      }
    });
    io.observe(end);
    return () => io.disconnect();
  }, [id, onSeen]);
  return (
    <section ref={ref} id={anchor(id)} className="card learn-section" aria-labelledby={'h' + id.replace('.', '-')}>
      <h2 id={'h' + id.replace('.', '-')} className="learn-section-title">
        <span className="mono-accent">{id}</span>
        {sectionTitle(id)}
      </h2>
      {children}
      {SECTION_PRACTICE[id] && <PracticeLink id={id} />}
      <span className="learn-section-end" aria-hidden="true" />
    </section>
  );
}

/** "Practice the treble clef →": Read notes setup with the section's settings. */
function PracticeLink({ id }: { id: string }): JSX.Element {
  const { state, dispatch } = useStore();
  const [n, k] = id.split('.');
  return (
    <Link to="/notes" className="text-btn text-btn--link learn-practice"
      onClick={() => dispatch({ type: 'noteSettings', settings: { ...state.noteSettings, ...SECTION_PRACTICE[id] } })}>
      {t(`learn.ch${n}.s${k}.practice`)} →
    </Link>
  );
}

function StaffExample({ title, value, clef, steps, alt }: { title: string; value: string; clef: Clef; steps: number[]; alt: string }): JSX.Element {
  const notes = useMemo(() => labelled(steps), [steps]);
  return (
    <div className="learn-example">
      <div className="learn-example-head">
        <b>{title}</b>
        <span className="mono-accent">{value}</span>
      </div>
      <PitchStaff clef={clef} keyId="C" notes={notes} scale={1.2} room={1.6} label={alt} />
    </div>
  );
}

/** One piano octave, C to B, labelled with letters; `marked` white keys are tinted. */
function PianoDiagram({ alt, marked = [] }: { alt: string; marked?: Letter[] }): JSX.Element {
  return (
    <div className="piano piano--diagram" role="img" aria-label={alt}>
      {LETTERS.map((L) => (
        <span key={L} className={'piano-white' + (marked.includes(L) ? ' is-marked' : '')} aria-hidden="true">
          <span className="piano-label">{letterName(L, 0)}</span>
        </span>
      ))}
      {[1, 2, 4, 5, 6].map((after) => (
        <span key={after} className="piano-black" aria-hidden="true" style={{ '--after': after } as CSSProperties} />
      ))}
    </div>
  );
}

function Tip({ text }: { text: string }): JSX.Element {
  return <div className="learn-aid">{text}</div>;
}

const note = (step: number, sign: Alter | null = null): PitchNote => ({ step, sign });

function Chapter8({ seen }: { seen(id: string): void }): JSX.Element {
  const middleC = useMemo(() => [note(28)], []);
  const ledger = useMemo(() => [26, 27, 28, 40, 41, 42].map((step) => ({ step, sign: null, label: letterName(letterOf(step), 0) + Math.floor(step / 7) })), []);
  return (
    <>
      <Section id="8.1" onSeen={seen}>
        <p>{t('learn.ch8.s1.text')}</p>
        <div className="learn-pair">
          <div className="learn-tile">
            <span aria-hidden="true" className="learn-clef">
              𝄞
            </span>
            <b>{t('learn.ch8.s1.trebleTitle')}</b>
            <span>{t('learn.ch8.s1.trebleText')}</span>
          </div>
          <div className="learn-tile">
            <span aria-hidden="true" className="learn-clef">
              𝄢
            </span>
            <b>{t('learn.ch8.s1.bassTitle')}</b>
            <span>{t('learn.ch8.s1.bassText')}</span>
          </div>
        </div>
        <p>{t('learn.ch8.s1.landmarks')}</p>
      </Section>

      <Section id="8.2" onSeen={seen}>
        <div className="learn-pair learn-pair--staves">
          <StaffExample title={t('learn.ch8.s2.lines')} value="E G B D F" clef="treble" steps={TREBLE_LINES} alt={t('learn.ch8.s2.linesAlt', { names: names(TREBLE_LINES) })} />
          <StaffExample title={t('learn.ch8.s2.spaces')} value="F A C E" clef="treble" steps={TREBLE_SPACES} alt={t('learn.ch8.s2.spacesAlt', { names: names(TREBLE_SPACES) })} />
        </div>
        <Tip text={t('learn.ch8.s2.aid')} />
      </Section>

      <Section id="8.3" onSeen={seen}>
        <div className="learn-pair learn-pair--staves">
          <StaffExample title={t('learn.ch8.s3.lines')} value="G B D F A" clef="bass" steps={BASS_LINES} alt={t('learn.ch8.s3.linesAlt', { names: names(BASS_LINES) })} />
          <StaffExample title={t('learn.ch8.s3.spaces')} value="A C E G" clef="bass" steps={BASS_SPACES} alt={t('learn.ch8.s3.spacesAlt', { names: names(BASS_SPACES) })} />
        </div>
        <Tip text={t('learn.ch8.s3.aid')} />
      </Section>

      <Section id="8.4" onSeen={seen}>
        <p>{t('learn.ch8.s4.text')}</p>
        <div className="learn-pair learn-pair--staves">
          <PitchStaff clef="treble" keyId="C" notes={middleC} slots={2} scale={1.2} room={1.6} label={t('learn.ch8.s4.trebleAlt')} />
          <PitchStaff clef="bass" keyId="C" notes={middleC} slots={2} scale={1.2} room={1.6} label={t('learn.ch8.s4.bassAlt')} />
        </div>
        <PitchStaff clef="treble" keyId="C" notes={ledger} scale={1.2} room={3} label={t('learn.ch8.s4.ledgerAlt')} />
        <Tip text={t('learn.ch8.s4.range')} />
      </Section>

      <Section id="8.5" onSeen={seen}>
        <p>{t('learn.ch8.s5.text')}</p>
        <div className="learn-names">
          {LETTERS.map((L) => (
            <div key={L}>
              <b>{letterName(L, 0)}</b>
              <span>{solfegeName(L, 0)}</span>
            </div>
          ))}
        </div>
        <Tip text={t('learn.ch8.s5.ti')} />
        <p>{t('learn.ch8.s5.game')}</p>
      </Section>
    </>
  );
}

function Chapter9({ seen }: { seen(id: string): void }): JSX.Element {
  const signs = useMemo(() => [{ ...note(31, 1), label: letterName('F', 1) }, { ...note(34, -1), label: letterName('B', -1) }], []);
  const bars = useMemo(() => [note(31, 1), note(31)], []);
  return (
    <>
      <Section id="9.1" onSeen={seen}>
        <div className="learn-pair learn-pair--text">
          <div className="learn-col">
            <p>{t('learn.ch9.s1.text')}</p>
          </div>
          <PianoDiagram alt={t('learn.ch9.s1.pianoAlt')} />
        </div>
        <Tip text={t('learn.ch9.s1.game')} />
      </Section>

      <Section id="9.2" onSeen={seen}>
        <div className="learn-pair learn-pair--text">
          <div className="learn-col">
            <p>{t('learn.ch9.s2.text')}</p>
          </div>
          <PianoDiagram alt={t('learn.ch9.s2.pianoAlt')} marked={['E', 'F', 'B', 'C']} />
        </div>
      </Section>

      <Section id="9.3" onSeen={seen}>
        <ul className="learn-list">
          <li>{t('learn.ch9.s3.point1')}</li>
          <li>{t('learn.ch9.s3.point2')}</li>
          <li>{t('learn.ch9.s3.point3')}</li>
        </ul>
        <PitchStaff clef="treble" keyId="C" notes={signs} scale={1.2} room={1.6} label={t('learn.ch9.s3.staffAlt')} />
        <p>{t('learn.ch9.s3.text')}</p>
      </Section>

      <Section id="9.4" onSeen={seen}>
        <p>{t('learn.ch9.s4.text')}</p>
        <PitchStaff clef="treble" keyId="C" notes={bars} scale={1.2} room={1.6} label={t('learn.ch9.s4.staffAlt')} />
        <p>{t('learn.ch9.s4.after')}</p>
        <Tip text={t('learn.ch9.s4.game')} />
      </Section>
    </>
  );
}

function Chapter10({ seen }: { seen(id: string): void }): JSX.Element {
  const gMajor = useMemo(() => [note(31), note(32), note(38)], []);
  const bars = useMemo(() => [note(38), note(38, 0), note(38)], []);
  return (
    <>
      <Section id="10.1" onSeen={seen}>
        <p>{t('learn.ch10.s1.text1')}</p>
        <PitchStaff clef="treble" keyId="G" notes={gMajor} slots={3} scale={1.2} room={1.6} label={t('learn.ch10.s1.gAlt')} />
        <p>{t('learn.ch10.s1.text2')}</p>
        <p>{t('learn.ch10.s1.text4')}</p>
        <PitchStaff clef="treble" keyId="G" notes={bars} scale={1.2} room={1.6} label={t('learn.ch10.s1.barAlt')} />
      </Section>

      <Section id="10.2" onSeen={seen}>
        <p>{t('learn.ch10.s2.text3')}</p>
        <div className="learn-pair learn-pair--staves">
          <div className="learn-sig">
            <PitchStaff clef="treble" keyId="C#" notes={[]} slots={0} room={1.2} label={t('learn.ch10.s2.sharpsAlt')} />
            <span className="mono-accent">F C G D A E B</span>
          </div>
          <div className="learn-sig">
            <PitchStaff clef="treble" keyId="Cb" notes={[]} slots={0} room={1.2} label={t('learn.ch10.s2.flatsAlt')} />
            <span className="mono-accent">B E A D G C F</span>
          </div>
        </div>
        <Tip text={t('learn.ch10.s2.start')} />
      </Section>

      <Section id="10.3" onSeen={seen}>
        <ul className="learn-list">
          <li>{t('learn.ch10.s3.point1')}</li>
          <li>{t('learn.ch10.s3.point2')}</li>
        </ul>
      </Section>

      <Section id="10.4" onSeen={seen}>
        <p>{t('learn.ch10.s4.point3')}</p>
        <Tip text={t('learn.ch10.s4.game')} />
      </Section>
    </>
  );
}

/** Each chapter's quick check: three answers, one right. */
const QUIZ: Record<ChapterN, { options: [Letter, Alter][]; right: number }> = {
  8: { options: [['G', 0], ['B', 0], ['D', 0]], right: 1 },
  9: { options: [['G', 0], ['G', -1], ['F', -1]], right: 1 },
  10: { options: [['C', 0], ['D', 0], ['C', 1]], right: 1 },
};

function QuickCheck({ n }: { n: ChapterN }): JSX.Element {
  const [pick, setPick] = useState<number | null>(null);
  const { options, right } = QUIZ[n];
  return (
    <section id={anchor('check')} className="card learn-check" aria-labelledby="quiz-q">
      <span className="eyebrow">{t('learn.check')}</span>
      <b id="quiz-q">{t(`learn.ch${n}.quiz.question`)}</b>
      <div className="learn-answers">
        {options.map(([L, alter], i) => (
          <button key={i} type="button" aria-pressed={pick === i}
            className={'name-btn learn-answer' + (pick !== null && i === right ? ' is-right' : pick === i ? ' is-wrong' : '')} onClick={() => setPick(i)}>
            {letterName(L, alter)}
          </button>
        ))}
      </div>
      {pick !== null && (
        <div className={'nfeedback m-in ' + (pick === right ? 'is-right' : 'is-wrong')} role="status">
          {t(pick === right ? `learn.ch${n}.quiz.right` : `learn.ch${n}.quiz.wrong`)}
        </div>
      )}
    </section>
  );
}

export function LearnChapter({ n }: { n: ChapterN }): JSX.Element {
  const { dispatch } = useStore();
  const bp = useBreakpoint();
  const hash = useHash();
  const title = t(`learn.chapters.${n}.title`);
  useDocTitle(t('app.docTitle', { page: title }));
  const seen = useMemo(() => (id: string) => dispatch({ type: 'learnRead', ids: [id] }), [dispatch]);
  const at = CHAPTERS.findIndex((c) => c.n === n);
  const { sections } = CHAPTERS[at];
  const prev = CHAPTERS[at - 1];
  const next = CHAPTERS[at + 1];
  const route = chapterRoute(n);

  // #/learn/10?s=10.2 opens at that section.
  const target = hashQuery(hash).get('s');
  useEffect(() => {
    if (target) jumpTo(target)();
  }, [target]);

  const wide = bp !== 'phone';
  const counter = { n, total: TOTAL_CHAPTERS };

  return (
    <AppShell bp={bp} active="/learn" fill>
      <div className={'page learn-chapter no-scrollbar' + (wide ? ' learn-chapter--wide' : '')}>
        {bp === 'desktop' && (
          <aside className="learn-side">
            <span className="eyebrow">{t('learn.chaptersHead')}</span>
            {CHAPTERS.map((c) =>
              c.n === n ? (
                <nav key={c.n} aria-label={t('learn.jump')} className="learn-side-chapter">
                  <span className="learn-side-title">
                    <span className="learn-side-n">{c.n}</span>
                    {title}
                  </span>
                  {sections.map((id) => (
                    <Link key={id} to={route} query={'s=' + id} onClick={jumpTo(id)}>
                      {id} {sectionTitle(id)}
                    </Link>
                  ))}
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
          </div>
          {bp === 'tablet' && (
            <nav aria-label={t('learn.jump')} className="learn-chips">
              {sections.map((id) => (
                <Link key={id} to={route} query={'s=' + id} onClick={jumpTo(id)} className="learn-chip">
                  <span className="mono-accent">{id}</span> {sectionTitle(id)}
                </Link>
              ))}
            </nav>
          )}

          {n === 8 && <Chapter8 seen={seen} />}
          {n === 9 && <Chapter9 seen={seen} />}
          {n === 10 && <Chapter10 seen={seen} />}

          <QuickCheck n={n} />

          {(prev || next) && (
            <nav className="learn-nav" aria-label={t('learn.chaptersHead')}>
              {prev && (
                <Link to={chapterRoute(prev.n)} className="learn-nav-link">
                  <span className="eyebrow">
                    <span aria-hidden="true">← </span>
                    {t('learn.prev')}
                  </span>
                  <b>
                    {prev.n} · {t(`learn.chapters.${prev.n}.title`)}
                  </b>
                </Link>
              )}
              {next && (
                <Link to={chapterRoute(next.n)} className="learn-nav-link learn-nav-link--next">
                  <span className="eyebrow">
                    {t('learn.next')}
                    <span aria-hidden="true"> →</span>
                  </span>
                  <b>
                    {next.n} · {t(`learn.chapters.${next.n}.title`)}
                  </b>
                </Link>
              )}
            </nav>
          )}

          <div className="learn-end">
            <Link to="/notes" className="btn btn--accent">
              {t('learn.practice')}
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
