/**
 * Settings' building blocks, shared with its sub-pages (Account, Privacy, the admin screens): a section is an uppercase
 * label above a paper card whose rows are split by hairlines; a row link goes to a sub-page with a chevron.
 */
import type { ReactNode } from 'react';
import { Link, type Route } from '../router';
import { Icon } from './Icon';

/** A Settings section: `h2.label` above `.set-card`. `id` makes the heading's id (`h-<id>`), which labels the section. */
export function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <section aria-labelledby={'h-' + id} className={'set-section' + (className ? ' ' + className : '')}>
      <h2 id={'h-' + id} className="label">
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
