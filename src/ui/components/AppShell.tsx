/**
 * Tab screens' frame. Phone: bottom tab bar (active icon in a slate pill). Tablet ≥ 700 px and desktop ≥ 1100 px: a
 * top header with the same items; on desktop the items sit next to the brand, as words only (App design canvas,
 * Desktop · Home). The active item has aria-current="page" (DESIGN.md §9).
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import type { Breakpoint } from '../hooks';
import { Link, type Route } from '../router';
import { Icon, type IconName } from './Icon';

const ITEMS: { to: Route; key: string; icon: IconName }[] = [
  { to: '/', key: 'nav.home', icon: 'home' },
  { to: '/path', key: 'nav.path', icon: 'path' },
  { to: '/learn', key: 'nav.learn', icon: 'book' },
  { to: '/progress', key: 'nav.progress', icon: 'progress' },
  { to: '/settings', key: 'nav.settings', icon: 'sliders' },
];

interface Props {
  bp: Breakpoint;
  active: Route;
  children: ReactNode;
  /** Home on desktop uses the full width instead of the centred 640 px column. */
  wide?: boolean;
  /** Learn uses the full width on tablet as well as on desktop. */
  fill?: boolean;
}

export function AppShell({ bp, active, children, wide, fill }: Props): JSX.Element {
  const items = ITEMS.map((it) => {
    const current = it.to === active;
    return (
      <Link key={it.to} to={it.to} aria-current={current ? 'page' : undefined} className={'nav-item' + (current ? ' is-current' : '')}>
        {bp === 'phone' ? (
          <span className="nav-pill">
            <Icon name={it.icon} size={24} />
          </span>
        ) : bp === 'tablet' ? (
          <Icon name={it.icon} size={20} />
        ) : null}
        {t(it.key)}
      </Link>
    );
  });
  const brand = (
    <Link to="/" className="brand">
      {t('app.name')}
    </Link>
  );

  if (bp !== 'phone') {
    const desk = bp === 'desktop';
    const full = fill || (desk && wide);
    return (
      <div className={'shell shell--top shell--' + bp}>
        <header className={'topbar' + (desk ? ' topbar--desk' : '')}>
          {brand}
          <nav aria-label={t('nav.main')} className="nav nav--top">
            {items}
          </nav>
        </header>
        <main className="shell-main">{full ? children : <div className="column">{children}</div>}</main>
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

/**
 * Exercise screens (setup, play, results, calibration): no nav, content centred in a 640 px column. A `wide` screen
 * uses the whole width on tablet and desktop (up to 1160 px) for its own two-column layout (`.wide`).
 */
export function ExerciseFrame({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }): JSX.Element {
  return (
    <main className={'frame' + (wide ? ' frame--wide' : '') + (className ? ' ' + className : '')}>
      <div className="frame-column">{children}</div>
    </main>
  );
}
