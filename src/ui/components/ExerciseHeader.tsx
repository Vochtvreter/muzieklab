/**
 * The exercise header (DESIGN.md §9) on Play, Echo, Read notes and Scales, in place of the tab header: the brand, the
 * exercise's title (an eyebrow over a mono line), its progress and the actions (Pause, Quit). Desktop: one row, the
 * progress between the title and the actions (App design canvas, DesktopPlay). Tablet: the progress under the row, the
 * full width (PlayTablet, NoteTablet).
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n';

interface Props {
  /** The tablet header: tighter spacing, the progress under the row. */
  tablet?: boolean;
  eyebrow: ReactNode;
  line: ReactNode;
  progress: {
    label: string;
    /** How far along, 0 to 1: the bar's width. */
    value: number;
    /** The progress bar's aria-valuemax and aria-valuenow. */
    max: number;
    now: number;
  };
  /** Help, Pause, Quit. */
  children: ReactNode;
}

export function ExerciseHeader({ tablet, eyebrow, line, progress, children }: Props): JSX.Element {
  return (
    <header className={'dplay-head' + (tablet ? ' dplay-head--tablet' : '')}>
      <div className="brand brand--static">{t('app.name')}</div>
      <div className="dplay-title">
        <span className="eyebrow">{eyebrow}</span>
        <span className="mono-line">{line}</span>
      </div>
      <div className="progress progress--grow" role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={progress.max} aria-valuenow={progress.now}>
        <div style={{ width: progress.value * 100 + '%' }} />
      </div>
      <div className="dplay-actions">{children}</div>
    </header>
  );
}
