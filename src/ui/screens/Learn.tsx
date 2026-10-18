/**
 * Learn (DESIGN.md §9.1): the chapter list with read status, and chapter 8 · Notes on the staff on its own page. Each
 * section is marked read once it has been on screen; the chapter ends with a quick check and a practice link.
 * Chapters 1–7 (rhythm) come with v1.2.
 *
 * Tablet and desktop use the full width: the chapter list puts its sections in two columns, and a chapter page gets the
 * big chapter number and wider sections. Tablet jumps to a section with a row of chips; desktop has a chapter sidebar.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LETTERS, letterOf, type Clef, type Letter } from '../../core/api';
import { PitchStaff, type PitchNote } from '../../render/PitchStaff';
import { t } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { letterName, solfegeName } from '../lib/noteText';
import { hashQuery, Link, useHash } from '../router';
import { useStore } from '../store';

/** Chapter 8's sections, in order. */
export const CH8_SECTIONS = ['8.1', '8.2', '8.3', '8.4', '8.5', '8.6', '8.7'] as const;
const sectionTitle = (id: string): string => t(`learn.ch8.s${id.split('.')[1]}.title`);
/** The element id a section (or the quick check, 'check') scrolls to. */
const anchor = (id: string): string => 's' + id.replace('.', '-');
/** A jump link to the section already in the address does not change the hash; scroll there anyway. */
const jumpTo = (id: string) => (): void => document.getElementById(anchor(id))?.scrollIntoView({ block: 'start' });

export function LearnHub(): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('learn.docTitle') }));
  const [open, setOpen] = useState(true);
  const read = state.progress.learnRead;
  const readCount = CH8_SECTIONS.filter((s) => read.includes(s)).length;
  const total = CH8_SECTIONS.length;
  const status = readCount === total ? 'done' : readCount > 0 ? 'reading' : 'new';

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

        <div className="chapter-card">
          <button type="button" className="chapter-row" aria-expanded={open} aria-controls="ch8-sections" onClick={() => setOpen(!open)}>
            <span className={'chapter-n is-' + status}>8</span>
            <span className="chapter-text">
              <b>{t('learn.chapters.8.title')}</b>
              <span>{t('learn.chapters.8.sub')}</span>
            </span>
            <span className={'chapter-pill is-' + status}>{t('learn.status.' + status)}</span>
          </button>
          <div id="ch8-sections" className={'m-acc' + (open ? ' is-open' : '')}>
            <div>
              <div className="chapter-sections" style={{ '--rows': Math.ceil(total / 2) } as CSSProperties}>
                {CH8_SECTIONS.map((id) => (
                  <Link key={id} to="/learn/8" query={'s=' + id} className="chapter-section">
                    <span className="mono-accent chapter-section-n">{id}</span>
                    <span className="chapter-section-title">{sectionTitle(id)}</span>
                    {read.includes(id) && <span className="chapter-read">{t('learn.read')}</span>}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
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
      <span className="learn-section-end" aria-hidden="true" />
    </section>
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

export function LearnNotes(): JSX.Element {
  const { dispatch } = useStore();
  const bp = useBreakpoint();
  const hash = useHash();
  useDocTitle(t('app.docTitle', { page: t('learn.chapters.8.title') }));
  const [pick, setPick] = useState<string | null>(null);
  const seen = useMemo(() => (id: string) => dispatch({ type: 'learnRead', ids: [id] }), [dispatch]);

  // #/learn/8?s=8.7 opens at that section.
  const target = hashQuery(hash).get('s');
  useEffect(() => {
    if (target) jumpTo(target)();
  }, [target]);

  const middleC = useMemo(() => [{ step: 28, sign: null }], []);
  const ledger = useMemo(() => [26, 27, 28, 40, 41, 42].map((step) => ({ step, sign: null, label: letterName(letterOf(step), 0) + Math.floor(step / 7) })), []);
  const gMajor = useMemo(() => [31, 32, 38].map((step) => ({ step, sign: null })), []);
  const bars = useMemo(() => [{ step: 38, sign: null }, { step: 38, sign: 0 as const }, { step: 38, sign: null }], []);
  const quiz: Letter[] = ['G', 'B', 'D'];
  const wide = bp !== 'phone';

  return (
    <AppShell bp={bp} active="/learn" fill>
      <div className={'page learn-chapter no-scrollbar' + (wide ? ' learn-chapter--wide' : '')}>
        {bp === 'desktop' && (
          <aside className="learn-side">
            <span className="eyebrow">{t('learn.chaptersHead')}</span>
            <nav aria-label={t('learn.jump')} className="learn-side-chapter">
              <span className="learn-side-title">
                <span className="learn-side-n">8</span>
                {t('learn.chapters.8.title')}
              </span>
              {CH8_SECTIONS.map((id) => (
                <Link key={id} to="/learn/8" query={'s=' + id} onClick={jumpTo(id)}>
                  {id} {sectionTitle(id)}
                </Link>
              ))}
              <Link to="/learn/8" query="s=check" onClick={jumpTo('check')}>
                {t('learn.check')}
              </Link>
            </nav>
            <p className="muted-text learn-side-later">{t('learn.laterNote')}</p>
          </aside>
        )}
        <div className="learn-main">
          {wide ? (
            <span className="eyebrow">
              <Link to="/learn" className="learn-crumb">
                {t('learn.title')}
              </Link>{' '}
              · {t('learn.chapterN', { n: 8 })}
            </span>
          ) : (
            <div className="screen-head">
              <Link to="/learn" aria-label={t('learn.back')} className="icon-btn icon-btn--edge">
                <Icon name="back" />
              </Link>
              <span className="eyebrow">{t('learn.chapterOf', { n: 8 })}</span>
            </div>
          )}
          <div className="learn-intro">
            <h1 className="learn-title">
              <span>8</span> {t('learn.chapters.8.title')}
            </h1>
            <p>{t('learn.ch8.intro')}</p>
          </div>
          {bp === 'tablet' && (
            <nav aria-label={t('learn.jump')} className="learn-chips">
              {CH8_SECTIONS.map((id) => (
                <Link key={id} to="/learn/8" query={'s=' + id} onClick={jumpTo(id)} className="learn-chip">
                  <span className="mono-accent">{id}</span> {sectionTitle(id)}
                </Link>
              ))}
            </nav>
          )}

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
          </Section>

          <Section id="8.2" onSeen={seen}>
            <div className="learn-pair learn-pair--staves">
              <StaffExample title={t('learn.ch8.s2.lines')} value="E G B D F" clef="treble" steps={TREBLE_LINES} alt={t('learn.ch8.s2.linesAlt', { names: names(TREBLE_LINES) })} />
              <StaffExample title={t('learn.ch8.s2.spaces')} value="F A C E" clef="treble" steps={TREBLE_SPACES} alt={t('learn.ch8.s2.spacesAlt', { names: names(TREBLE_SPACES) })} />
            </div>
            <div className="learn-aid">{t('learn.ch8.s2.aid')}</div>
          </Section>

          <Section id="8.3" onSeen={seen}>
            <div className="learn-pair learn-pair--staves">
              <StaffExample title={t('learn.ch8.s3.lines')} value="G B D F A" clef="bass" steps={BASS_LINES} alt={t('learn.ch8.s3.linesAlt', { names: names(BASS_LINES) })} />
              <StaffExample title={t('learn.ch8.s3.spaces')} value="A C E G" clef="bass" steps={BASS_SPACES} alt={t('learn.ch8.s3.spacesAlt', { names: names(BASS_SPACES) })} />
            </div>
            <div className="learn-aid">{t('learn.ch8.s3.aid')}</div>
          </Section>

          <Section id="8.4" onSeen={seen}>
            <p>{t('learn.ch8.s4.text')}</p>
            <div className="learn-pair learn-pair--staves">
              <PitchStaff clef="treble" keyId="C" notes={middleC} slots={2} scale={1.2} room={1.6} label={t('learn.ch8.s4.trebleAlt')} />
              <PitchStaff clef="bass" keyId="C" notes={middleC} slots={2} scale={1.2} room={1.6} label={t('learn.ch8.s4.bassAlt')} />
            </div>
            <PitchStaff clef="treble" keyId="C" notes={ledger} scale={1.2} room={3} label={t('learn.ch8.s4.ledgerAlt')} />
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
            <div className="learn-aid">{t('learn.ch8.s5.ti')}</div>
          </Section>

          <Section id="8.6" onSeen={seen}>
            <div className="learn-pair learn-pair--text">
              <div className="learn-col">
                <p>{t('learn.ch8.s6.text')}</p>
                <ul className="learn-list">
                  <li>{t('learn.ch8.s6.point1')}</li>
                  <li>{t('learn.ch8.s6.point2')}</li>
                </ul>
              </div>
              <div className="piano piano--diagram" role="img" aria-label={t('learn.ch8.s6.pianoAlt')}>
                {LETTERS.map((L) => (
                  <span key={L} className="piano-white" aria-hidden="true">
                    <span className="piano-label">{letterName(L, 0)}</span>
                  </span>
                ))}
                {[1, 2, 4, 5, 6].map((after) => (
                  <span key={after} className="piano-black" aria-hidden="true" style={{ '--after': after } as CSSProperties} />
                ))}
              </div>
            </div>
          </Section>

          <Section id="8.7" onSeen={seen}>
            <p>{t('learn.ch8.s7.text1')}</p>
            <PitchStaff clef="treble" keyId="G" notes={gMajor} slots={3} scale={1.2} room={1.6} label={t('learn.ch8.s7.gAlt')} />
            <p>{t('learn.ch8.s7.text2')}</p>
            <p>{t('learn.ch8.s7.text3')}</p>
            <div className="learn-pair learn-pair--staves">
              <div className="learn-sig">
                <PitchStaff clef="treble" keyId="C#" notes={[]} slots={0} room={1.2} label={t('learn.ch8.s7.sharpsAlt')} />
                <span className="mono-accent">F C G D A E B</span>
              </div>
              <div className="learn-sig">
                <PitchStaff clef="treble" keyId="Cb" notes={[]} slots={0} room={1.2} label={t('learn.ch8.s7.flatsAlt')} />
                <span className="mono-accent">B E A D G C F</span>
              </div>
            </div>
            <ul className="learn-list">
              <li>{t('learn.ch8.s7.point1')}</li>
              <li>{t('learn.ch8.s7.point2')}</li>
              <li>{t('learn.ch8.s7.point3')}</li>
            </ul>
            <p>{t('learn.ch8.s7.text4')}</p>
            <PitchStaff clef="treble" keyId="G" notes={bars} scale={1.2} room={1.6} label={t('learn.ch8.s7.barAlt')} />
          </Section>

          <section id={anchor('check')} className="card learn-check" aria-labelledby="quiz-q">
            <span className="eyebrow">{t('learn.check')}</span>
            <b id="quiz-q">{t('learn.ch8.quiz.question')}</b>
            <div className="learn-answers">
              {quiz.map((a) => (
                <button key={a} type="button" aria-pressed={pick === a}
                  className={'name-btn learn-answer' + (pick && a === 'B' ? ' is-right' : pick === a ? ' is-wrong' : '')} onClick={() => setPick(a)}>
                  {letterName(a, 0)}
                </button>
              ))}
            </div>
            {pick && (
              <div className={'nfeedback m-in ' + (pick === 'B' ? 'is-right' : 'is-wrong')} role="status">
                {t(pick === 'B' ? 'learn.ch8.quiz.right' : 'learn.ch8.quiz.wrong')}
              </div>
            )}
          </section>

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
