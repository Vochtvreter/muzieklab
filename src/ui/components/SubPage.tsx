/**
 * Frames for the account and admin screens (no board yet; built from Settings' design language):
 * - SubPage: a Settings sub-page, like What's new on phone. The tab bar (phone) or the top header (tablet, desktop)
 *   stays with Settings current, a back arrow and the title head the page, and tablet and desktop keep Settings' 640 px
 *   column.
 * - FocusedPage: a form on its own (Sign in, Accept invite, New password), like Calibrate: no tab bar or header, a back
 *   arrow and the title, in a narrower centred column from 700 px up.
 * Both set the document title.
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { useBreakpoint, useDocTitle } from '../hooks';
import { Link, type Route } from '../router';
import { AppShell, ExerciseFrame } from './AppShell';
import { Icon } from './Icon';

export interface PageProps {
  /** The h1. */
  title: ReactNode;
  /** A muted line under the title ("Choose a password for ann@example.com."). */
  sub?: ReactNode;
  /** The document title's page part ("Account" → "Account · Muzieklab"); the title when that is a string. */
  docTitle?: string;
  /** Where the back arrow goes, and its accessible name. */
  back: Route;
  backLabel: string;
  /** An extra class on `.page`. */
  className?: string;
  /** A button at the end of the title row (the accounts list's Invite someone, from 700 px up). */
  action?: ReactNode;
  children: ReactNode;
}

function Head({ title, sub, back, backLabel, action }: Pick<PageProps, 'title' | 'sub' | 'back' | 'backLabel' | 'action'>): JSX.Element {
  return (
    <div className="screen-head acct-head">
      <Link to={back} aria-label={backLabel} className="icon-btn icon-btn--edge">
        <Icon name="back" />
      </Link>
      {sub ? (
        <div className="screen-head-text">
          <h1 className="screen-title">{title}</h1>
          <p className="acct-sub">{sub}</p>
        </div>
      ) : (
        <h1 className="screen-title">{title}</h1>
      )}
      {action && <div className="acct-head-action">{action}</div>}
    </div>
  );
}

const docTitleOf = (title: ReactNode, docTitle?: string): string => docTitle ?? (typeof title === 'string' ? title : t('app.name'));

/** A Settings sub-page (Account, Privacy, the admin screens). */
export function SubPage({ title, sub, docTitle, back, backLabel, className, action, children }: PageProps): JSX.Element {
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: docTitleOf(title, docTitle) }));
  return (
    <AppShell bp={bp} active="/settings">
      <div className={'page acct no-scrollbar' + (className ? ' ' + className : '')}>
        <Head title={title} sub={sub} back={back} backLabel={backLabel} action={action} />
        {children}
      </div>
    </AppShell>
  );
}

/** A form on its own, without the tab bar or header (Sign in, Accept invite, New password). */
export function FocusedPage({ title, sub, docTitle, back, backLabel, className, children }: PageProps): JSX.Element {
  useDocTitle(t('app.docTitle', { page: docTitleOf(title, docTitle) }));
  return (
    <ExerciseFrame className="frame--form">
      <div className={'page acct acct--focus no-scrollbar' + (className ? ' ' + className : '')}>
        <Head title={title} sub={sub} back={back} backLabel={backLabel} />
        {children}
      </div>
    </ExerciseFrame>
  );
}
