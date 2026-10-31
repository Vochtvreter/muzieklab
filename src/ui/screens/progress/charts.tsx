/**
 * The Progress tab's charts (App design canvas, Mobile · Progress, ProgressTablet and ProgressDesktop): Accuracy · 14
 * days and Timing tendency, a line per day that breaks where a day has no rhythm round, and Minutes this week, a bar per
 * day. Each is an SVG drawn at its card's measured width with the boards' geometry per size (phone, tablet, desktop),
 * role="img" with the whole story in its label, and a <title> on every point. A new player sees a short line instead.
 */
import { useRef, type RefObject } from 'react';
import type { AccuracyView, DayPoint, MinutesView, TimingView, Tendency } from '../../../game/progressView';
import { STEADY_BAND } from '../../../game/progressView';
import { t } from '../../../i18n';
import { useElementWidth } from '../../../render/theme';
import type { Breakpoint } from '../../hooks';
import { andList, rich, signed, signedMs } from '../../lib/format';
import { Card } from './cards';
import { shortDate, spokenMs, weekday } from './text';

/** The line charts per size: the board's viewBox width (until the card is measured) and height, the plot's bottom (its
 *  top is at 10), the date labels' baseline, and how many gridlines the accuracy chart draws. */
const LINE: Record<Breakpoint, { w: number; h: number; bottom: number; dates: number; lines: number }> = {
  phone: { w: 318, h: 150, bottom: 128, dates: 145, lines: 5 },
  tablet: { w: 337, h: 140, bottom: 118, dates: 135, lines: 5 },
  desktop: { w: 362, h: 90, bottom: 68, dates: 85, lines: 3 },
};
const TOP = 10;
/** The first day's x (room for the y labels) and the room after the last day (its value label). */
const LEFT = 34;
const RIGHT = 50;
/** More days than this are counted in a label instead of listed. */
const LIST_DAYS = 6;
/** The least room between the baselines of two of the timing chart's labels (10.5 and 11 px text). */
const LABEL_ROOM = 11;

type Point = { i: number; date: string; value: number; x: number; y: number };

/**
 * One line over the days: a path that starts again after each day without a value (with a tick on the baseline for that
 * day), a dot for a value with no neighbour, the latest value as a larger dot with its label, and a hit circle with a
 * <title> on every value.
 */
function DayLine(props: { days: DayPoint[]; x(i: number): number; y(v: number): number; bottom: number; title(p: Point): string; end(v: number): string }): JSX.Element {
  const { days, x, y, bottom, title, end } = props;
  const pts = days.map((d, i): Point | null => (d.value === null ? null : { i, date: d.date, value: d.value, x: x(i), y: y(d.value) }));
  const path = pts.map((p, i) => (p ? (i > 0 && pts[i - 1] ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) : '')).join('');
  const last = [...pts].reverse().find((p): p is Point => p !== null);
  return (
    <g>
      {days.map((d, i) =>
        d.value === null ? <line key={d.date} x1={x(i)} x2={x(i)} y1={bottom - 4} y2={bottom + 2} className="prog-gap" /> : null,
      )}
      <path d={path} className="prog-line" />
      {pts.map((p, i) => (p && p !== last && !pts[i - 1] && !pts[i + 1] ? <circle key={p.date} cx={p.x} cy={p.y} r={3} className="prog-dot" /> : null))}
      {last && (
        <>
          <circle cx={last.x} cy={last.y} r={4.5} className="prog-end" />
          <text x={last.x + 9} y={last.y + 4} className="prog-end-label">
            {end(last.value)}
          </text>
        </>
      )}
      {pts.map((p) =>
        p ? (
          <circle key={'hit' + p.date} cx={p.x} cy={p.y} r={9} className="prog-hit">
            <title>{title(p)}</title>
          </circle>
        ) : null,
      )}
    </g>
  );
}

/** The first, middle and last date under a line chart. */
function DateAxis({ days, x, y }: { days: DayPoint[]; x(i: number): number; y: number }): JSX.Element {
  const mid = Math.floor(days.length / 2);
  const n = days.length - 1;
  return (
    <g className="prog-axis">
      <text x={x(0)} y={y}>
        {shortDate(days[0].date)}
      </text>
      <text x={x(mid)} y={y} textAnchor="middle">
        {shortDate(days[mid].date)}
      </text>
      <text x={x(n) + 4} y={y} textAnchor="end">
        {shortDate(days[n].date)}
      </text>
    </g>
  );
}

/** The days without a value, listed or counted, for a chart's label. */
function gapsText(gaps: string[], listKey: string, countKey: string): string {
  if (gaps.length === 0) return '';
  return gaps.length > LIST_DAYS ? t(countKey, { count: gaps.length }) : t(listKey, { days: andList(gaps.map(shortDate)) });
}

/**
 * A chart's box and the width to draw at: the box's, measured (the board's width until then). Only the chart components
 * call it, so it mounts with its box: a card that shows its empty line first and gets data later (an account sync while
 * the tab is open) still measures its chart and follows the window.
 */
function useBoxWidth(fallback: number, min: number): { ref: RefObject<HTMLDivElement>; w: number } {
  const ref = useRef<HTMLDivElement>(null);
  return { ref, w: Math.max(min, useElementWidth(ref) || fallback) };
}

const pct = (v: number): string => t('common.percent', { value: v });

/** Accuracy · 14 days: rhythm accuracy per day, with the mean over the days played. */
export function AccuracyCard({ data, size }: { data: AccuracyView; size: Breakpoint }): JSX.Element {
  return (
    <Card id="acc-title" title={t('progress.accuracy.title')}
      meta={data.mean !== null && rich('progress.accuracy.average', {}, { value: <b>{pct(data.mean)}</b> })}>
      {data.mean === null ? <p className="prog-empty">{t('progress.accuracy.empty')}</p> : <AccuracyChart data={data} size={size} />}
    </Card>
  );
}

/** The accuracy line on the board's 60–100% scale, with its gridlines and dates. */
function AccuracyChart({ data, size }: { data: AccuracyView; size: Breakpoint }): JSX.Element {
  const g = LINE[size];
  const { ref, w } = useBoxWidth(g.w, LEFT + RIGHT + 60);
  const values = data.days.flatMap((d) => (d.value === null ? [] : [d.value]));
  // The board's 60–100% scale, opened down to 20% or 0% when a day was lower.
  const min = Math.min(...values, 100);
  const lo = min >= 60 ? 60 : min >= 20 ? 20 : 0;
  const x = (i: number): number => LEFT + (i * (w - LEFT - RIGHT)) / (data.days.length - 1);
  const y = (v: number): number => g.bottom - ((v - lo) / (100 - lo)) * (g.bottom - TOP);
  const grid = Array.from({ length: g.lines }, (_, k) => lo + (k * (100 - lo)) / (g.lines - 1));
  const first = data.first;
  const peak = data.peak;
  const label = t('progress.accuracy.label', {
    from: shortDate(data.days[0].date),
    to: shortDate(data.days[data.days.length - 1].date),
    trend:
      first && peak && peak.date !== first.date && (peak.value as number) > (first.value as number)
        ? t('progress.accuracy.rise', { first: first.value, peak: peak.value, date: shortDate(peak.date) })
        : peak && peak.date !== data.days[data.days.length - 1].date
          ? t('progress.accuracy.high', { peak: peak.value, date: shortDate(peak.date) })
          : '',
    today: data.today === null ? '' : t('progress.accuracy.today', { value: data.today }),
    gaps: gapsText(data.gaps, 'progress.accuracy.gaps', 'progress.accuracy.gapCount'),
    mean: data.mean ?? 0,
  });
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${g.h}`} className="prog-chart" role="img" aria-label={label}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={LEFT} x2={w - RIGHT} y1={y(v)} y2={y(v)} className="prog-gridline" />
            <text x={28} y={y(v) + 4} textAnchor="end" className="prog-axis">
              {pct(v)}
            </text>
          </g>
        ))}
        <DayLine days={data.days} x={x} y={y} bottom={g.bottom} end={pct}
          title={(p) => t('progress.accuracy.point', { date: shortDate(p.date), value: p.value })} />
        <DateAxis days={data.days} x={x} y={g.dates} />
      </svg>
    </div>
  );
}

/** "Was rushing (−52 ms). A little early is normal.": where the timing started in the 14 days, and how it is now. */
function timingCaption(data: TimingView): string {
  const now = data.latest?.value ?? 0;
  const nowKey: Record<Tendency, string> = {
    steady: now < 0 ? 'progress.timing.nowEarly' : 'progress.timing.nowSteady',
    rushing: 'progress.timing.nowRushing',
    dragging: 'progress.timing.nowDragging',
  };
  const parts: string[] = [];
  if (data.first && data.firstTendency && data.firstTendency !== 'steady' && data.first.date !== data.latest?.date) {
    parts.push(t('progress.timing.was', { word: t('progress.timing.word.' + data.firstTendency), value: signedMs(data.first.value as number) }));
  }
  if (data.tendency) parts.push(t(nowKey[data.tendency]));
  return parts.join(' ');
}

/** Timing tendency: the mean offset of the hit notes per day (late up, early down), with the steady band. */
export function TimingCard({ data, size }: { data: TimingView; size: Breakpoint }): JSX.Element {
  const latest = data.latest;
  return (
    <Card id="tend-title" title={t('progress.timing.title')}
      meta={latest && data.tendency && (
        <>
          <b className="prog-meta-word">{t('progress.timing.tendency.' + data.tendency)}</b> · <span className="prog-meta-mono">{signedMs(latest.value as number)}</span>
        </>
      )}>
      {!latest ? (
        <p className="prog-empty">{t('progress.timing.empty')}</p>
      ) : (
        <>
          <TimingChart data={data} size={size} />
          <p className="prog-caption">{timingCaption(data)}</p>
        </>
      )}
    </Card>
  );
}

/** The timing line on the board's −70 to +50 ms, with the steady band, the zero line and the dates. */
function TimingChart({ data, size }: { data: TimingView; size: Breakpoint }): JSX.Element {
  const g = LINE[size];
  const { ref, w } = useBoxWidth(g.w, LEFT + RIGHT + 60);
  const values = data.days.flatMap((d) => (d.value === null ? [] : [d.value]));
  // The board's −70 to +50 ms, opened up when a day was further out.
  const lo = Math.min(-70, Math.floor((Math.min(...values, 0) - 10) / 10) * 10);
  const hi = Math.max(50, Math.ceil((Math.max(...values, 0) + 10) / 10) * 10);
  const x = (i: number): number => LEFT + (i * (w - LEFT - RIGHT)) / (data.days.length - 1);
  const y = (ms: number): number => g.bottom - ((ms - lo) / (hi - lo)) * (g.bottom - TOP);
  const latest = data.latest;
  const first = data.first;
  const today = data.days[data.days.length - 1].date;
  const when = (date: string): string => (date === today ? t('progress.timing.today') : t('progress.timing.on', { date: shortDate(date) }));
  const label =
    latest && data.tendency
      ? t('progress.timing.label', {
          from: shortDate(data.days[0].date),
          to: shortDate(today),
          trend:
            first && data.firstTendency && first.date !== latest.date
              ? t('progress.timing.trend', {
                  first: spokenMs(first.value as number),
                  word: t('progress.timing.word.' + data.firstTendency),
                  latest: spokenMs(latest.value as number),
                  when: when(latest.date),
                })
              : t('progress.timing.trendOne', { latest: spokenMs(latest.value as number), when: when(latest.date) }),
          where: data.tendency,
          lo: spokenMs(STEADY_BAND.from, false),
          hi: spokenMs(STEADY_BAND.to),
        })
      : '';
  const right = w - RIGHT;
  // A wider range squeezes the band's lines together (the 90 px desktop chart most): each keeps its label only clear
  // of the labels kept before it, 0 first, and the band's word stays above the zero line, or is left out.
  const labelled = [0, STEADY_BAND.to, STEADY_BAND.from].reduce<number[]>(
    (kept, v) => (kept.every((k) => Math.abs(y(k) - y(v)) >= LABEL_ROOM) ? [...kept, v] : kept),
    [],
  );
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${g.h}`} className="prog-chart" role="img" aria-label={label}>
        <rect x={LEFT} y={y(STEADY_BAND.to)} width={right - LEFT} height={y(STEADY_BAND.from) - y(STEADY_BAND.to)} rx={4} className="prog-band" />
        {[STEADY_BAND.to, 0, STEADY_BAND.from].map((v) => (
          <g key={v}>
            <line x1={LEFT} x2={right} y1={y(v)} y2={y(v)} className={v === 0 ? 'prog-zero' : 'prog-gridline'} />
            {labelled.includes(v) && (
              <text x={28} y={y(v) + 4} textAnchor="end" className="prog-axis">
                {signed(v)}
              </text>
            )}
          </g>
        ))}
        <DayLine days={data.days} x={x} y={y} bottom={g.bottom} end={signedMs}
          title={(p) => t('progress.timing.point', { date: shortDate(p.date), value: signedMs(p.value) })} />
        {/* Over the line: a steady one ends in the band's word at the right, a dragging one starts at the top left, a
            rushing one ends at the bottom right. */}
        {y(0) - y(STEADY_BAND.to) >= LABEL_ROOM && (
          <text x={right - 6} y={Math.min(y(STEADY_BAND.to) + 14, y(0))} textAnchor="end" className="prog-chart-note prog-chart-note--band">
            {t('progress.timing.band')}
          </text>
        )}
        <text x={LEFT + 6} y={TOP + 11} className="prog-chart-note prog-chart-note--over">
          {t('progress.timing.late')}
        </text>
        <text x={right - 6} y={g.bottom - 5} textAnchor="end" className="prog-chart-note prog-chart-note--over">
          {t('progress.timing.early')}
        </text>
        <DateAxis days={data.days} x={x} y={g.dates} />
      </svg>
    </div>
  );
}

/** The bar chart per size: the board's viewBox width and height, the baseline, the tallest bar's room, the day labels. */
const BARS: Record<Breakpoint, { w: number; h: number; base: number; room: number; days: number }> = {
  phone: { w: 318, h: 110, base: 90, room: 72, days: 106 },
  tablet: { w: 337, h: 108, base: 88, room: 70, days: 104 },
  desktop: { w: 362, h: 84, base: 64, room: 46, days: 80 },
};
/** The scale fits this many minutes (more, and the tallest bar sets it). */
const MIN_SCALE = 20;

/** Minutes this week: a bar per day from Monday, today's labelled Today; the days still to come have no bar. */
export function MinutesCard({ data, size }: { data: MinutesView; size: Breakpoint }): JSX.Element {
  return (
    <Card id="min-title" title={t('progress.minutes.title')} meta={data.total > 0 && rich('progress.minutes.total', {}, { value: <b>{data.total}</b> })}>
      {data.total === 0 ? <p className="prog-empty">{t('progress.minutes.empty')}</p> : <MinutesChart data={data} size={size} />}
    </Card>
  );
}

/** The week's bars, each with its minutes above it and its day below. */
function MinutesChart({ data, size }: { data: MinutesView; size: Breakpoint }): JSX.Element {
  const g = BARS[size];
  const { ref, w } = useBoxWidth(g.w, 160);
  const slot = (w - 8) / 7;
  const bw = slot * 0.52;
  const per = g.room / Math.max(MIN_SCALE, ...data.days.map((d) => d.minutes ?? 0));
  const days = data.days.map((d, i) => ({ ...d, i, short: weekday(d.date, 'short'), long: weekday(d.date, 'long') }));
  const label = t('progress.minutes.label', {
    days: andList(
      days
        .filter((d) => d.minutes !== null)
        .map((d) => t(d.i === data.todayIndex ? 'progress.minutes.dayToday' : 'progress.minutes.day', { day: d.long, value: d.minutes as number })),
    ),
    total: data.total,
  });
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${g.h}`} className="prog-chart" role="img" aria-label={label}>
        <line x1={4} x2={w - 4} y1={g.base + 0.5} y2={g.base + 0.5} className="prog-base" />
        {days.map((d) => {
          const cx = 4 + slot * (d.i + 0.5);
          const isToday = d.i === data.todayIndex;
          const h = (d.minutes ?? 0) * per;
          const top = g.base - h;
          const r = Math.min(4, h / 2, bw / 2);
          const x0 = cx - bw / 2;
          const x1 = cx + bw / 2;
          return (
            <g key={d.date}>
              {h > 0 && (
                <path d={`M${x0} ${g.base}V${top + r}Q${x0} ${top} ${x0 + r} ${top}H${x1 - r}Q${x1} ${top} ${x1} ${top + r}V${g.base}Z`} className="prog-bar" />
              )}
              {d.minutes !== null && (
                <>
                  <text x={cx} y={top - 5} textAnchor="middle" className="prog-bar-value">
                    {d.minutes}
                  </text>
                  <rect x={cx - slot / 2} y={0} width={slot} height={g.base} className="prog-hit">
                    <title>{t('progress.minutes.bar', { day: d.short, value: d.minutes })}</title>
                  </rect>
                </>
              )}
              <text x={cx} y={g.days} textAnchor="middle" className={'prog-bar-day' + (isToday ? ' is-today' : '')}>
                {isToday ? t('progress.minutes.today') : d.short}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
