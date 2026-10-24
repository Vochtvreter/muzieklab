/**
 * Settings' building blocks, shared with its sub-pages (Account, Privacy, the admin screens): a section is an uppercase
 * label above a paper card whose rows are split by hairlines; a row link goes to a sub-page with a chevron.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { Link, type Route } from '../router';
import { Icon } from './Icon';

/**
 * Settings on tablet and desktop (App design canvas, SettingsTablet and SettingsDesktop): its sections are cards with
 * their title inside, in two columns beside a list of the sections, which brings a card (`set-<id>`) into view and gives
 * it focus. Settings provides it; the sub-pages keep the phone's sections at every size.
 */
export const WideSections = createContext(false);

/**
 * A Settings section: `h2.label` above `.set-card`. `id` makes the heading's id (`h-<id>`), which labels the section.
 * `focusable`: the heading can take focus from a script (tabIndex -1), to put focus at the section's start.
 */
export function Section({ id, title, children, className, focusable }: { id: string; title: string; children: ReactNode; className?: string; focusable?: boolean }): JSX.Element {
  const wide = useContext(WideSections);
  if (wide) {
    return (
      <section id={'set-' + id} tabIndex={-1} aria-labelledby={'h-' + id} className={'set-section set-section--card' + (className ? ' ' + className : '')}>
        <div className="set-card">
          <h2 id={'h-' + id} className="set-card-title" tabIndex={focusable ? -1 : undefined}>
            {title}
          </h2>
          {children}
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby={'h-' + id} className={'set-section' + (className ? ' ' + className : '')}>
      <h2 id={'h-' + id} className="label" tabIndex={focusable ? -1 : undefined}>
        {title}
      </h2>
      <div className="set-card">{children}</div>
    </section>
  );
}

export interface RowLinkProps {
  to: Route;
  query?: string;
  /** The bold first line. */
  title: ReactNode;
  /** The muted line under it. */
  sub?: ReactNode;
  /** A third line (the accounts list: a status pill and the roles). */
  meta?: ReactNode;
  className?: string;
}

/** A card row that opens a sub-page: the title, a muted line, and a chevron. */
export function RowLink({ to, query, title, sub, meta, className }: RowLinkProps): JSX.Element {
  return (
    <Link to={to} query={query} className={'row-link' + (className ? ' ' + className : '')}>
      <span className="row-link-text">
        <b>{title}</b>
        {sub && <span className="row-sub">{sub}</span>}
        {meta && <span className="row-meta">{meta}</span>}
      </span>
      <Icon name="chevron" size={20} className="row-chevron" />
    </Link>
  );
}
