/**
 * Settings → What's new (MVP canvas, Settings page: What's new on phone, tablet and desktop).
 * Phone and tablet: the latest release on the accent card, then the earlier releases on a timeline that opens one at a
 * time; All · New · Fixes filters the changes. The tablet uses the full width and splits the latest card in two.
 * Desktop: every release in a list on the left, the chosen one on a card on the right, with Newer and Older under it.
 */
import { useEffect, useRef, useState } from 'react';
import { formatLongDate, formatShortDate, t } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle, type Breakpoint } from '../hooks';
import { countKinds, isPatch, KINDS, RELEASES, type Change, type ChangeKind, type Release } from '../lib/changelog';
import { focusLost } from '../lib/screenFocus';
import { Link } from '../router';
import pkg from '../../../package.json';

type Filter = 'all' | 'new' | 'fix';

const KIND_LABEL: Record<ChangeKind, string> = { new: 'changelog.kindNew', better: 'changelog.kindBetter', fix: 'changelog.kindFix' };
const KIND_COUNT: Record<ChangeKind, string> = { new: 'changelog.countNew', better: 'changelog.countBetter', fix: 'changelog.countFix' };

/** "Oct 18 · 4 new · 1 better" (the desktop card: "October 18, 2026 · 4 new · 1 better") */
function meta(r: Release, changes: Change[], date = formatShortDate): string {
  return [date(r.date), ...countKinds(changes).map((c) => t(KIND_COUNT[c.kind], { count: c.count }))].reduce((a, b) =>
    t('common.join', { a, b }),
  );
}

/** Each change with its kind on a chip in front (earlier releases; the latest card from tablet up). */
function ChangeList({ changes, className }: { changes: Change[]; className: string }): JSX.Element {
  return (
    <ul className={className}>
      {changes.map((c) => (
        <li key={c.text} className="cl-change">
          <span className={'cl-kind cl-kind--' + c.kind}>{t(KIND_LABEL[c.kind])}</span>
          <span>{t(c.text)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Four notes climbing a staff, drawn faintly on the accent card (tablet and desktop). */
function CardStaff({ className }: { className: string }): JSX.Element {
  return (
    <svg viewBox="0 0 300 96" aria-hidden="true" className={className}>
      <path d="M0 32h300M0 44h300M0 56h300M0 68h300M0 80h300" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <g fill="currentColor" fillOpacity="0.32">
        {[70, 130, 190, 250].map((x, i) => (
          <ellipse key={x} cx={x} cy={74 - 12 * i} rx="7.4" ry="5.4" transform={`rotate(-20 ${x} ${74 - 12 * i})`} />
        ))}
      </g>
      <path d="M76.6 72V38M136.6 60V26M196.6 48V14M256.6 36V2" stroke="currentColor" strokeOpacity="0.32" strokeWidth="1.8" />
    </svg>
  );
}

function Current(): JSX.Element {
  return (
    <p className="cl-current">
      <Icon name="check" size={18} strokeWidth={2.6} className="tone-good" />
      {t('changelog.current', { version: pkg.version })}
    </p>
  );
}

export function Changelog(): JSX.Element {
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('changelog.title') }));
  return bp === 'desktop' ? <ChangelogDesk /> : <ChangelogStack bp={bp} />;
}

/** Phone and tablet: the latest card, then the timeline of earlier releases. */
function ChangelogStack({ bp }: { bp: Breakpoint }): JSX.Element {
  const wide = bp !== 'phone';
  const [filter, setFilter] = useState<Filter>('all');
  // The newest earlier release starts open, so the timeline shows what an opened release looks like.
  const [open, setOpen] = useState<string | null>(RELEASES[1]?.version ?? null);

  const shown = RELEASES.map((r) => ({ r, changes: r.changes.filter((c) => filter === 'all' || c.kind === filter) })).filter((x) => x.changes.length);
  const latest = shown[0]?.r === RELEASES[0] ? shown[0] : null;
  const earlier = shown.filter((x) => x.r !== RELEASES[0]);

  return (
    <AppShell bp={bp} active="/settings" fill={wide}>
      <div className={'page changelog no-scrollbar' + (wide ? ' changelog--wide' : '')}>
        <div className="screen-head">
          <Link to="/settings" aria-label={t('changelog.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <h1 className="screen-title">{t('changelog.title')}</h1>
        </div>

        <div className="cl-bar">
          <Current />
          <Segmented label={t('changelog.showGroup')} value={filter} onChange={(v: Filter) => setFilter(v)} className="cl-filter"
            options={[
              { value: 'all', label: t('changelog.showAll') },
              { value: 'new', label: t('changelog.showNew') },
              { value: 'fix', label: t('changelog.showFixes') },
            ]} />
        </div>

        {latest && (
          <article className="cl-latest m-in" aria-labelledby="cl-latest-title">
            <div className="cl-latest-head">
              <div className="cl-latest-tag">
                <span className="eyebrow eyebrow--fill">{t('changelog.latest')}</span>
                <span className="cl-latest-ver">{latest.r.version}</span>
              </div>
              <h2 id="cl-latest-title" className="cl-latest-title">
                {t(latest.r.title)}
              </h2>
              <span className="cl-latest-meta">{meta(latest.r, latest.changes)}</span>
              {wide && <CardStaff className="cl-latest-staff" />}
            </div>
            {wide ? (
              // Tablet: the changes take the right half of the card, each with its kind on a chip (as on desktop).
              <ChangeList changes={latest.changes} className="cl-groups cl-fill-changes" />
            ) : (
              // Phone: one heading per kind instead of a chip on every line, so the text gets the full width.
              <div className="cl-groups">
                {KINDS.map((kind) => {
                  const items = latest.changes.filter((c) => c.kind === kind);
                  if (!items.length) return null;
                  return (
                    <div key={kind} className="cl-group">
                      <h3 className="cl-group-label">{t(KIND_LABEL[kind])}</h3>
                      <ul className="cl-bullets">
                        {items.map((c) => (
                          <li key={c.text}>{t(c.text)}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            {latest.r.action && (
              <Link to={latest.r.action.to} className="cl-try">
                {t(latest.r.action.label)}
                <Icon name="chevron" size={18} strokeWidth={2.2} />
              </Link>
            )}
          </article>
        )}

        {earlier.length > 0 && (
          <section className="cl-earlier" aria-labelledby="cl-earlier-h">
            <h2 id="cl-earlier-h" className="label">
              {t('changelog.earlier')}
            </h2>
            <ol className="cl-timeline">
              {earlier.map(({ r, changes }) => {
                const isOpen = open === r.version;
                const id = 'cl-' + r.version.replace(/\./g, '-');
                return (
                  <li key={r.version} className="cl-release">
                    <button type="button" className="cl-release-row" aria-expanded={isOpen} aria-controls={id}
                      onClick={() => setOpen(isOpen ? null : r.version)}>
                      <span className={'cl-ver' + (isPatch(r.version) ? ' is-patch' : '')}>{r.version}</span>
                      <span className="cl-release-text">
                        <b>{t(r.title)}</b>
                        <span className="row-sub">{meta(r, changes)}</span>
                      </span>
                      <Icon name="chevron" size={20} className={'cl-chevron' + (isOpen ? ' is-open' : '')} />
                    </button>
                    <div id={id} className={'m-acc' + (isOpen ? ' is-open' : '')}>
                      <div>
                        <ChangeList changes={changes} className="cl-changes" />
                        {r.action && (
                          <Link to={r.action.to} className="cl-try-inline">
                            {t(r.action.label)}
                            <Icon name="chevron" size={16} strokeWidth={2.2} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <p className="muted-text cl-footer">{t('changelog.footer')}</p>
      </div>
    </AppShell>
  );
}

/**
 * Desktop: the releases on the left (the list scrolls on its own when it is taller than the window), the chosen one on
 * the right. The latest is the accent card; an older one is a white card named Release or Fix release.
 */
function ChangelogDesk(): JSX.Element {
  const [sel, setSel] = useState(0);
  const page = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const steps = useRef<HTMLDivElement>(null);
  const stepped = useRef(false);
  const r = RELEASES[sel];
  const newer = RELEASES[sel - 1];
  const older = RELEASES[sel + 1];
  const latest = sel === 0;
  const pick = (i: number) => () => {
    setSel(i);
    // A release picked low in the list: bring its card back into view.
    page.current?.scrollTo?.({ top: 0 });
  };
  // Newer at the newest release and Older at the first go away: the step that is left takes the focus of the one
  // pressed, which would otherwise fall to the page.
  const step = (i: number) => (): void => {
    stepped.current = true;
    pick(i)();
  };
  // Newer and Older move the highlight in the list: keep it in view when the list scrolls.
  useEffect(() => {
    nav.current?.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest' });
    if (stepped.current && focusLost()) steps.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    stepped.current = false;
  }, [sel]);

  return (
    <AppShell bp="desktop" active="/settings" fill>
      <div ref={page} className="page changelog changelog--desk no-scrollbar">
        <aside className="cl-side">
          <Link to="/settings" aria-label={t('changelog.back')} className="cl-back">
            <Icon name="back" size={20} />
            {t('nav.settings')}
          </Link>
          <h1 className="screen-title">{t('changelog.title')}</h1>
          <Current />
          <nav ref={nav} aria-label={t('changelog.releases')} className="cl-nav no-scrollbar">
            {RELEASES.map((x, i) => (
              <button key={x.version} type="button" aria-current={i === sel ? 'true' : undefined} onClick={pick(i)}
                className={'cl-nav-item' + (i === sel ? ' is-current' : '')}>
                <span className={'cl-ver' + (isPatch(x.version) ? ' is-patch' : '')}>{x.version}</span>
                <span className="cl-release-text">
                  <b>{t(x.title)}</b>
                  <span className="row-sub">{meta(x, x.changes)}</span>
                </span>
              </button>
            ))}
          </nav>
          <p className="muted-text cl-footer">{t('changelog.footer')}</p>
        </aside>

        <div className="cl-detail">
          <article key={r.version} className={'cl-card m-in' + (latest ? ' cl-card--latest' : '')} aria-labelledby="cl-card-title">
            {latest && <CardStaff className="cl-card-staff" />}
            <div className="cl-latest-tag">
              <span className={'eyebrow' + (latest ? ' eyebrow--fill' : '')}>
                {t(latest ? 'changelog.latest' : isPatch(r.version) ? 'changelog.fixRelease' : 'changelog.release')}
              </span>
              <span className={latest ? 'cl-latest-ver' : 'cl-ver' + (isPatch(r.version) ? ' is-patch' : '')}>{r.version}</span>
            </div>
            <div className="cl-card-head">
              <h2 id="cl-card-title" className="cl-card-title">
                {t(r.title)}
              </h2>
              <span className="cl-card-meta">{meta(r, r.changes, formatLongDate)}</span>
            </div>
            <ChangeList changes={r.changes} className={latest ? 'cl-card-changes cl-fill-changes' : 'cl-card-changes'} />
            {r.action && (
              <Link to={r.action.to} className={latest ? 'cl-try' : 'cl-try-inline'}>
                {t(r.action.label)}
                <Icon name="chevron" size={latest ? 18 : 16} strokeWidth={2.2} />
              </Link>
            )}
          </article>

          <div ref={steps} className="cl-steps">
            {newer && (
              <button type="button" className="cl-step" onClick={step(sel - 1)}>
                <Icon name="back" size={20} />
                <span className="cl-step-text">
                  <span className="cl-step-label">{t('changelog.newer')}</span>
                  <b>
                    <span className="cl-step-ver">{newer.version}</span> {t(newer.title)}
                  </b>
                </span>
              </button>
            )}
            {older && (
              <button type="button" className="cl-step cl-step--older" onClick={step(sel + 1)}>
                <span className="cl-step-text">
                  <span className="cl-step-label">{t('changelog.older')}</span>
                  <b>
                    <span className="cl-step-ver">{older.version}</span> {t(older.title)}
                  </b>
                </span>
                <Icon name="chevron" size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
