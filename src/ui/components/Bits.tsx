/** Small shared pieces: lesson tiles, the staff with a safety net, the tap pad, the beat counter. */
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { Meter, NotatedBar } from '../../core/api';
import { isUnlocked, type Unit } from '../../game/path';
import type { Progress } from '../../game/storage';
import { Staff, type NoteMark } from '../../render/Staff';
import { t } from '../../i18n';
import { starsText } from '../lib/format';
import { lessonStars, tileStates } from '../lib/lessons';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * The 7.1–7.5 strip. `onFill`: on the slate Continue card (phone, tablet); otherwise on paper (desktop).
 * With `onPick`, unlocked lessons are buttons that start that lesson (replay one for more stars).
 */
export function LessonTiles({ unit, progress, currentId, onFill, onPick }: {
  unit: Unit;
  progress: Progress;
  currentId: string | null;
  onFill: boolean;
  onPick?: (lessonId: string) => void;
}): JSX.Element {
  const states = tileStates(progress, unit, currentId);
  return (
    <div className={'tiles' + (onFill ? ' tiles--fill' : ' tiles--paper')} style={{ gridTemplateColumns: `repeat(${unit.lessons.length}, minmax(0, 1fr))` }}>
      {unit.lessons.map((l, i) => {
        const n = lessonStars(progress, l.id);
        const st = states[i];
        const shown = Math.min(3, n);
        const aria = st === 'current' ? (n ? t('tile.nextStars', { count: shown }) : t('tile.next')) : st === 'done' ? t('tile.done', { count: shown }) : t('tile.notStarted');
        if (onPick && isUnlocked(progress, l.id)) {
          return (
            <button key={l.id} type="button" className={'tile tile--' + st + ' tile--btn'} aria-label={t('tile.play', { id: l.id, state: aria })} onClick={() => onPick(l.id)}>
              <span className="tile-id" aria-hidden="true">{l.id}</span>
              <span className="tile-stars" aria-hidden="true">
                {starsText(n)}
              </span>
            </button>
          );
        }
        return (
          <span key={l.id} className={'tile tile--' + st}>
            <span className="tile-id">{l.id}</span>
            <span className="tile-stars" aria-label={aria} role="img">
              {starsText(n)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

interface StaffBoxProps {
  bars: NotatedBar[];
  meter: Meter;
  barsPerRow: number;
  label: string;
  marks?: Record<number, NoteMark>;
  cursor?: number | null;
}

/** The VexFlow staff; if drawing fails, the text alternative is shown instead of breaking the screen. */
export function StaffBox(props: StaffBoxProps): JSX.Element {
  return (
    <ErrorBoundary resetKey={props.bars} fallback={<p className="staff-fallback">{props.label}</p>}>
      <Staff {...props} />
    </ErrorBoundary>
  );
}

const RING_C = 2 * Math.PI * 66;

interface PadProps {
  progress: number;
  held: boolean;
  label?: ReactNode;
}

/** Phone / tablet tap pad: a quarter-note glyph and "Rhythm", with a ring that fills while you hold. */
export const TapPad = forwardRef<HTMLButtonElement, PadProps>(function TapPad({ progress, held, label }, ref) {
  const dash = (RING_C * Math.max(0, Math.min(1, progress))).toFixed(1);
  return (
    <button ref={ref} type="button" className={'pad' + (held ? ' is-held' : '')} aria-label={t('play.pad')}>
      <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true" className="pad-ring">
        <circle cx="75" cy="75" r="66" fill="none" className="pad-ring-track" strokeWidth="8" />
        <circle cx="75" cy="75" r="66" fill="none" className="pad-ring-fill" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${dash} ${RING_C.toFixed(1)}`} strokeOpacity={progress > 0 ? 1 : 0} transform="rotate(-90 75 75)" />
      </svg>
      <span className="pad-face">
        <span aria-hidden="true" className="pad-glyph">
          𝅘𝅥
        </span>
        <span className="pad-label">{label ?? t('play.padLabel')}</span>
      </span>
    </button>
  );
});

/** Beat counter. Phone: digits with a slate circle that moves to the current beat (120 ms). */
export function BeatRow({ beats, active, label }: { beats: number; active: number | null; label: string }): JSX.Element {
  const style = { '--beat': active ?? 0 } as CSSProperties;
  return (
    <div className="beats" role="img" aria-label={label} style={style}>
      <span className={'beats-dot' + (active === null ? ' is-idle' : '')} aria-hidden="true" />
      {Array.from({ length: beats }, (_, i) => (
        <span key={i} aria-hidden="true" className={'beat' + (i === active ? ' is-on' : '')}>
          {i + 1}
        </span>
      ))}
    </div>
  );
}
