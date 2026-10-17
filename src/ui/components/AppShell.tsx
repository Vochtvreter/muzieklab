/**
 * Tab screens' frame. Phone: bottom tab bar (active icon in a slate pill). Tablet ≥ 700 px: a top header with the
 * same items. Desktop ≥ 1100 px: a left sidebar. The active item has aria-current="page" (DESIGN.md §9).
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import type { Breakpoint } from '../hooks';
import { Link, type Route } from '../router';
import { Icon, type IconName } from './Icon';

const ITEMS: { to: Route; key: string; icon: IconName }[] = [
  { to: '/', key: 'nav.home', icon: 'home' },
  { to: '/path', key: 'nav.path', icon: 'path' },
  { to: '/settings', key: 'nav.settings', icon: 'sliders' },
];

interface Props {
  bp: Breakpoint;
  active: Route;
  children: ReactNode;
  /** Home on desktop uses the full width instead of the centred 640 px column. */
  wide?: boolean;
}

export function AppShell({ bp, active, children, wide }: Props): JSX.Element {
  const items = ITEMS.map((it) => {
    const current = it.to === active;
    return (
      <Link key={it.to} to={it.to} aria-current={current ? 'page' : undefined} className={'nav-item' + (current ? ' is-current' : '')}>
        {bp === 'phone' ? (
          <span className="nav-pill">
            <Icon name={it.icon} size={24} />
          </span>
        ) : (
          <Icon name={it.icon} size={20} />
        )}
        {t(it.key)}
      </Link>
    );
  });
  const brand = (
    <Link to="/" className="brand">
      {t('app.name')}
    </Link>
  );

  if (bp === 'desktop') {
    return (
      <div className="shell shell--desktop">
        <aside className="sidebar">
          {brand}
          <nav aria-label={t('nav.main')} className="nav nav--side">
            {items}
          </nav>
        </aside>
        <main className={'shell-main' + (wide ? ' shell-main--wide' : '')}>{wide ? children : <div className="column">{children}</div>}</main>
      </div>
    );
  }
  if (bp === 'tablet') {
    return (
      <div className="shell shell--tablet">
        <header className="topbar">
          {brand}
          <nav aria-label={t('nav.main')} className="nav nav--top">
            {items}
          </nav>
        </header>
        <main className="shell-main">
          <div className="column">{children}</div>
        </main>
      </div>
    );
  }
  return (
    <div className="shell shell--phone">
      <main className="shell-main">{children}</main>
      <nav aria-label={t('nav.main')} className="nav nav--tabs">
        {items}
      </nav>
    </div>
  );
}

/** Exercise screens (setup, play, results, calibration): no nav, content centred in a 640 px column. */
export function ExerciseFrame({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <main className={'frame' + (className ? ' ' + className : '')}>
      <div className="frame-column">{children}</div>
    </main>
  );
}
