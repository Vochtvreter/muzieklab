/** Small shared pieces: lesson tiles, the staff with a safety net, the tap pad, the beat counters (digital, analog). */
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { DIAMOND, type Meter, type NotatedBar } from '../../core/api';
import { isUnlocked, type Unit } from '../../game/path';
import type { Progress } from '../../game/storage';
import { Staff, type NoteMark } from '../../render/Staff';
import { t } from '../../i18n';
import { starsLabel, starsText } from '../lib/format';
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
        const aria = st === 'current' ? (n ? t('tile.nextStars', { stars: starsLabel(n) }) : t('tile.next')) : st === 'done' ? starsLabel(n) : t('tile.notStarted');
        if (onPick && isUnlocked(progress, l.id)) {
          return (
            <button key={l.id} type="button" className={'tile tile--' + st + ' tile--btn'} aria-label={t('tile.play', { id: l.id, state: aria })} onClick={() => onPick(l.id)}>
              <span className="tile-id" aria-hidden="true">{l.id}</span>
              <span className="tile-stars" aria-hidden="true">
                <StarsMark stars={n} />
              </span>
            </button>
          );
        }
        return (
          <span key={l.id} className={'tile tile--' + st}>
            <span className="tile-id">{l.id}</span>
            <span className="tile-stars" aria-label={aria} role="img">
              <StarsMark stars={n} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** A lesson's stars as text, or the one diamond star in their place. */
export function StarsMark({ stars }: { stars: number }): JSX.Element {
  return stars === DIAMOND ? <span className="diamond-star">★</span> : <>{starsText(stars)}</>;
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

/** Rod swing either side of upright, in degrees; the pivot sits low on the body as on a pyramid metronome. */
const SWING_DEG = 26;
const PIVOT = { x: 32, y: 58 };
const ROD = 52;
const tipX = (deg: number): number => PIVOT.x + ROD * Math.sin((deg * Math.PI) / 180);
const TIP_Y = PIVOT.y - ROD * Math.cos((SWING_DEG * Math.PI) / 180);

interface AnalogProps {
  beats: number;
  active: number | null;
  /** Beat position with its fraction (beat 0 = first beat; negative in the count-in). */
  at: number;
  tempo: number;
  label: string;
  /** Reduced motion: the rod jumps to the side of each beat instead of swinging. */
  still?: boolean;
}

/**
 * Analog beat counter: a pyramid metronome whose rod reaches one end of its swing on every beat (the end mark lights,
 * in gold on beat 1), with the beat number and a dot per beat beside it. The weight rides higher on the rod at slower
 * tempos, as on a real one. Upright and at rest before the count-in and after the end.
 */
export function AnalogMetronome({ beats, active, at, tempo, label, still }: AnalogProps): JSX.Element {
  const idle = active === null;
  const side = Math.floor(at + 1e-6) % 2 === 0 ? -1 : 1;
  const deg = idle ? 0 : still ? side * SWING_DEG : -SWING_DEG * Math.cos(Math.PI * at);
  const tick = !idle && at - Math.floor(at + 1e-6) < 0.15;
  const bobY = 14 + (Math.max(0, Math.min(1, (tempo - 40) / 160)) * 30);
  const mark = (s: -1 | 1): string => 'analog-end' + (tick && side === s ? (active === 0 ? ' is-down' : ' is-on') : '');
  return (
    <div className={'beats beats--analog' + (idle ? ' is-idle' : '')} role="img" aria-label={label}>
      <svg viewBox="0 0 64 72" aria-hidden="true" className="analog">
        <path className="analog-body" d="M23 5 H41 L53 65 H11 Z" />
        <path className="analog-face" d="M27.5 11 H36.5 L41 52 H23 Z" />
        {[18, 25, 32, 39, 46].map((y) => (
          <line key={y} className="analog-scale" x1={30} x2={34} y1={y} y2={y} />
        ))}
        <rect className="analog-base" x={7} y={64} width={50} height={6} rx={3} />
        <circle className={mark(-1)} cx={tipX(-SWING_DEG)} cy={TIP_Y} r={2.6} />
        <circle className={mark(1)} cx={tipX(SWING_DEG)} cy={TIP_Y} r={2.6} />
        <g className="analog-rod" transform={`rotate(${deg.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`}>
          <line x1={PIVOT.x} y1={PIVOT.y} x2={PIVOT.x} y2={PIVOT.y - ROD} />
          <rect className="analog-bob" x={PIVOT.x - 6} y={bobY - 4} width={12} height={8} rx={2} />
        </g>
        <circle className="analog-pivot" cx={PIVOT.x} cy={PIVOT.y} r={3} />
      </svg>
      <span className="analog-count" aria-hidden="true">
        <b>{idle ? '–' : active + 1}</b>
        <span className="analog-dots">
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} className={i === active ? 'is-on' : ''} />
          ))}
        </span>
      </span>
    </div>
  );
}
