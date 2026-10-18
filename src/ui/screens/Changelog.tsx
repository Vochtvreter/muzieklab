/**
 * Settings → What's new: the latest release on the accent card, its changes grouped by kind, then the earlier
 * releases on a timeline that opens one at a time. All · New · Fixes filters the changes everywhere.
 */
import { useState } from 'react';
import { formatShortDate, t } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { countKinds, isPatch, KINDS, RELEASES, type Change, type ChangeKind, type Release } from '../lib/changelog';
import { Link } from '../router';
import pkg from '../../../package.json';

type Filter = 'all' | 'new' | 'fix';

const KIND_LABEL: Record<ChangeKind, string> = { new: 'changelog.kindNew', better: 'changelog.kindBetter', fix: 'changelog.kindFix' };
const KIND_COUNT: Record<ChangeKind, string> = { new: 'changelog.countNew', better: 'changelog.countBetter', fix: 'changelog.countFix' };

/** "Oct 18 · 4 new · 1 better" */
function meta(r: Release, changes: Change[]): string {
  return [formatShortDate(r.date), ...countKinds(changes).map((c) => t(KIND_COUNT[c.kind], { count: c.count }))].reduce((a, b) =>
    t('common.join', { a, b }),
  );
}

export function Changelog(): JSX.Element {
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('changelog.title') }));
  const [filter, setFilter] = useState<Filter>('all');
  // The newest earlier release starts open, so the timeline shows what an opened release looks like.
  const [open, setOpen] = useState<string | null>(RELEASES[1]?.version ?? null);

  const shown = RELEASES.map((r) => ({ r, changes: r.changes.filter((c) => filter === 'all' || c.kind === filter) })).filter((x) => x.changes.length);
  const latest = shown[0]?.r === RELEASES[0] ? shown[0] : null;
  const earlier = shown.filter((x) => x.r !== RELEASES[0]);

  return (
    <AppShell bp={bp} active="/settings">
      <div className="page changelog no-scrollbar">
        <div className="screen-head">
          <Link to="/settings" aria-label={t('changelog.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <h1 className="screen-title">{t('changelog.title')}</h1>
        </div>

        <div className="cl-bar">
          <p className="cl-current">
            <Icon name="check" size={18} strokeWidth={2.6} className="tone-good" />
            {t('changelog.current', { version: pkg.version })}
          </p>
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
            </div>
            {/* One heading per kind instead of a tag on every line: on the filled card the text gets the full width. */}
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
                        <ul className="cl-changes">
                          {changes.map((c) => (
                            <li key={c.text} className="cl-change">
                              <span className={'cl-kind cl-kind--' + c.kind}>{t(KIND_LABEL[c.kind])}</span>
                              <span>{t(c.text)}</span>
                            </li>
                          ))}
                        </ul>
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
