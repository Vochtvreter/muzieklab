/** Switch, pick-one segmented control with the sliding highlight, and pick-many chips. */
import { useRef, type CSSProperties, type ReactNode } from 'react';

export function SwitchTrack({ on }: { on: boolean }): JSX.Element {
  return (
    <span className={'switch m-ease' + (on ? ' is-on' : '')} aria-hidden="true">
      <span className="switch-knob m-ease" />
    </span>
  );
}

interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string | number> {
  label: string;
  options: SegOption<T>[];
  value: T;
  onChange(v: T): void;
  className?: string;
  /** Inner padding and gap of the track in px (the thumb math needs them). */
  pad?: number;
  gap?: number;
}

/**
 * Pick-one group (DESIGN.md §9 motion): the thumb is placed on the new choice and slides in from the old one
 * with a transform only (260 ms, cubic-bezier(.2, 0, 0, 1)), as on the canvas.
 */
export function Segmented<T extends string | number>(props: SegmentedProps<T>): JSX.Element {
  const { label, options, value, onChange, className, pad = 4, gap = 4 } = props;
  const n = options.length;
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const move = useRef<{ at: number; n: number; fx: string }>({ at: i, n: 0, fx: '0px' });
  const m = move.current;
  if (m.at !== i) {
    m.fx = `calc(${m.at - i} * (100% + ${gap}px))`;
    m.n += 1;
    m.at = i;
  }
  const w = `((100% - ${2 * pad + (n - 1) * gap}px) / ${n})`;
  const blob: CSSProperties = {
    top: pad,
    bottom: pad,
    left: `calc(${pad}px + ${i} * (${w} + ${gap}px))`,
    right: `calc(${pad}px + ${n - 1 - i} * (${w} + ${gap}px))`,
  };
  const skin = {
    '--fx': m.fx,
    '--fy': '0px',
    '--sw': 1,
    '--sh': 1,
    animation: m.n ? `${m.n % 2 ? 'm-slide-a' : 'm-slide-b'} .26s cubic-bezier(.2,0,0,1)` : undefined,
  } as CSSProperties;
  return (
    <div role="group" aria-label={label} className={'seg' + (className ? ' ' + className : '')}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, padding: pad, gap }}>
      <div aria-hidden="true" className="m-goo">
        <div className="m-blob" style={blob}>
          <div className="m-skin seg-thumb" style={skin} />
        </div>
      </div>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} className={'seg-btn' + (o.value === value ? ' is-on' : '')}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface ChipProps {
  on: boolean;
  onToggle(): void;
  children: ReactNode;
  className?: string;
  label?: string;
  blocked?: boolean;
  describedBy?: string;
}

/** Pick-many chip: aria-pressed, cross-fades on/off; `blocked` greys it out when its meter cannot be filled. */
export function Chip({ on, onToggle, children, className, label, blocked, describedBy }: ChipProps): JSX.Element {
  const cls = ['chip', on ? 'is-on' : '', blocked ? 'is-blocked' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-pressed={on} aria-label={label} aria-describedby={describedBy || undefined} onClick={onToggle}>
      {children}
    </button>
  );
}
