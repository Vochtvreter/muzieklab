/**
 * Learning path (DESIGN.md §8.2; MVP canvas, Path page): one path that learns notes and rhythm together. The header
 * counts its stars; under it the current unit and the theory link, the unit spine (done, current, locked) and Start for
 * the next lesson. A note unit brings in one note (sol, mi, fa, la, do, re, si) to read, write and hear; rhythm units
 * take turns with them. A unit opens to show its lessons by name, as rows on phone and five tiles on tablet and
 * desktop; the current unit is open. Locked units show a lock and their title; what opens them is said once, under the
 * first. Desktop: the header and a summary card beside the units.
 */
import { useEffect, useRef, useState } from 'react';
import { lessonOpen, starsOf, trackLessons, unitStatesIn, unitStarsIn, type Track, type UnitState } from '../../game/track';
import { allStars, LEARNING_PATH, pathNext, type PathLesson, type PathUnit } from '../../game/tracks';
import type { Progress } from '../../game/storage';
import { SHOWN_STARS } from '../../core/api';
import { t, tx } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { StarsMark } from '../components/Bits';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { starsLabel } from '../lib/format';
import { Link } from '../router';
import { useStore } from '../store';
import { useStartPathLesson } from './start';

/** The path as the screen shows it. */
interface PathView {
  track: Track<PathLesson>;
  states: UnitState[];
  /** The lesson to continue with; null when the path is done. */
  next: PathLesson | null;
  /** What Start plays: the next lesson, or the last one once the path is done (to play it again). */
  start: PathLesson | null;
  /** The current unit (the last unit once the path is done). */
  unit: PathUnit;
  stars: { earned: number; max: number };
}

function pathView(p: Progress): PathView {
  const track = LEARNING_PATH;
  const next = pathNext(p);
  const all = trackLessons(track);
  const cur = (next ? all.find((x) => x.lesson.id === next.id)?.unit : track.units[track.units.length - 1]) as PathUnit;
  return { track, states: unitStatesIn(p, track), next, start: next ?? all[all.length - 1]?.lesson ?? null, unit: cur, stars: allStars(p) };
}

export function PathScreen(): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  const play = useStartPathLesson();
  useDocTitle(t('app.docTitle', { page: t('path.title') }));
  const p = state.progress;
  const v = pathView(p);

  const head = (
    <div className="path-head">
      <h1 className="page-title">{t('path.title')}</h1>
      <span className="mono-muted" role="img" aria-label={t('path.totalsLabel', { stars: v.stars.earned, total: v.stars.max })}>
        {t('path.totals', { stars: v.stars.earned, total: v.stars.max })}
      </span>
    </div>
  );
  const units = <Units view={v} progress={p} tiles={bp !== 'phone'} onPlay={(id) => play(id)} />;
  const action = v.start && (
    <button type="button" className="btn btn--accent path-start" onClick={() => play(v.start!.id)}>
      {t('path.start', { id: v.start.id })}
    </button>
  );

  if (bp === 'desktop') {
    return (
      <AppShell bp={bp} active="/path" wide>
        <div className="page path path--desk">
          <div className="path-side">
            {head}
            <PathCard view={v} />
          </div>
          <section className="path-main" aria-labelledby="track-title">
            <div className="path-main-head">
              <div className="path-main-text">
                <h2 id="track-title" className="path-track-title">
                  {t('path.unitTitle', { id: v.unit.id, title: tx(v.unit.titleKey) })}
                </h2>
                <PathInfo view={v} />
              </div>
              {action}
            </div>
            {units}
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bp={bp} active="/path" fill>
      <div className={'page path' + (bp === 'tablet' ? ' path--tablet' : '')}>
        {head}
        <PathInfo view={v} />
        {units}
        {action}
      </div>
    </AppShell>
  );
}

/** Desktop: where the path stands, with a bar of its stars, and what it practises. */
function PathCard({ view: v }: { view: PathView }): JSX.Element {
  const pct = v.stars.max ? (v.stars.earned / v.stars.max) * 100 : 0;
  return (
    <div className="track-card is-on path-card-desk">
      <span className="track-card-top">
        <span aria-hidden="true" className="track-card-glyph">
          𝄞
        </span>
        <span className="track-card-text">
          <b>{t('path.summaryTitle')}</b>
          <span className="track-card-meta">{t('path.summary')}</span>
        </span>
      </span>
      <span className="track-card-bottom">
        <span className="track-card-bar" aria-hidden="true">
          <span style={{ width: pct + '%' }} />
        </span>
        <span className="mono-muted" aria-hidden="true">
          {v.next ? t('path.trackMeta', { unit: v.unit.id, total: v.track.units.length }) : t('path.trackDone')}
        </span>
      </span>
    </div>
  );
}

/** Where the path stands ("Unit 5 of 26 · 40 / 390 ★") and the Learn link. */
function PathInfo({ view: v }: { view: PathView }): JSX.Element {
  const n = { unit: v.unit.id, total: v.track.units.length, stars: v.stars.earned, max: v.stars.max };
  return (
    <div className="track-info">
      <span className="mono-muted" role="img" aria-label={t(v.next ? 'path.trackStarsLabel' : 'path.trackStarsDoneLabel', n)}>
        {v.next ? t('path.trackStars', n) : t('path.trackStarsDone', n)}
      </span>
      <Link to="/learn" className="track-theory">
        {t('path.theoryAll')}
        <Icon name="chevronSmall" size={15} strokeWidth={2.4} />
      </Link>
    </div>
  );
}

function Units({ view: v, progress: p, tiles, onPlay }: { view: PathView; progress: Progress; tiles: boolean; onPlay(id: string): void }): JSX.Element {
  const { track, states } = v;
  const curUnit = states.indexOf('current');
  // The current unit is open; any open unit can be opened instead, or closed.
  const [openUnit, setOpenUnit] = useState<number | null>(curUnit >= 0 ? track.units[curUnit].id : null);
  const list = useRef<HTMLOListElement>(null);
  // Show the current unit (unit 7 is below the fold on a phone): the list scrolls, or on a short screen the page.
  useEffect(() => {
    const box = list.current;
    const el = box?.querySelector('.unit--current');
    const scroller = box && box.scrollHeight > box.clientHeight ? box : box?.closest<HTMLElement>('.page');
    if (!el || !scroller || scroller.scrollHeight <= scroller.clientHeight) return;
    scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
  }, []);
  // What opens the locked units is said once, under the first of them; the others show a lock and their title.
  const firstLocked = states.indexOf('locked');

  return (
    <ol ref={list} className="units m-scroll" aria-label={t('path.units')}>
      {track.units.map((u, i) => {
        const st = states[i];
        const isOpen = st !== 'locked' && openUnit === u.id;
        // "3/4", "1♯", "Mix" in the display face; two signs ("♯♭", "𝄞𝄢") a size smaller.
        const isText = /[0-9A-Za-z]/.test(u.glyph);
        const isPair = !isText && [...u.glyph].length === 2;
        const title = t('path.unitTitle', { id: u.id, title: tx(u.titleKey) });
        const score = { stars: unitStarsIn(p, track, u.id), max: u.lessons.length * SHOWN_STARS };
        const panel = `unit-${u.id}`;
        return (
          <li key={u.id} className={'unit unit--' + st}>
            <div className="unit-rail">
              <div aria-hidden="true" className={'unit-node unit-node--' + st + (isText ? ' unit-node--text' : isPair ? ' unit-node--pair' : '')}>
                {u.glyph}
              </div>
              <div className={'unit-spine' + (i === track.units.length - 1 ? ' is-last' : st === 'done' ? ' is-done' : '')} />
            </div>
            <div className="unit-body">
              {st === 'locked' ? (
                <div className="unit-head">
                  <span className="unit-title">{title}</span>
                  <span className="sr-only">{t('path.trackLocked')}</span>
                  <Icon name="lock" size={15} strokeWidth={2.4} className="unit-lock" />
                </div>
              ) : (
                <button type="button" className="unit-head" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpenUnit(isOpen ? null : u.id)}>
                  <span className="unit-title">{title}</span>
                  <span className="unit-score" aria-hidden="true">
                    {t('path.unitScore', score)}
                  </span>
                  <span className="sr-only">{t('path.unitScoreLabel', score)}</span>
                  <Icon name="chevronSmall" size={18} strokeWidth={2.2} className="unit-chevron" />
                </button>
              )}
              {st !== 'locked' && !isOpen && (
                <div className="unit-stars">
                  {u.lessons.map((l) => {
                    const n = starsOf(p, track, l);
                    const label = t('path.playLesson', { id: l.id, title: tx(l.title), stars: starsLabel(n) });
                    // Open lessons can be played again, e.g. to turn two stars into three.
                    return lessonOpen(p, track, l.id) ? (
                      <button key={l.id} type="button" className={'lesson-stars' + (n ? ' has-stars' : '')} title={label} aria-label={label}
                        onClick={() => onPlay(l.id)}>
                        <StarsMark stars={n} />
                      </button>
                    ) : (
                      <span key={l.id} role="img" className="lesson-stars is-locked" aria-label={t('path.lockedLesson', { id: l.id })}>
                        <StarsMark stars={n} />
                      </span>
                    );
                  })}
                </div>
              )}
              {st !== 'locked' && (
                <div id={panel} className={'m-acc' + (isOpen ? ' is-open' : '')}>
                  <div>
                    <Lessons unit={u} view={v} progress={p} tiles={tiles} onPlay={onPlay} />
                  </div>
                </div>
              )}
              {i === firstLocked && i > 0 && <div className="unit-sub">{t('path.unlocks', { unit: track.units[i - 1].id })}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A unit's lessons by name: rows (phone) or five tiles (tablet, desktop). Open lessons start on a tap. */
function Lessons({ unit, view: v, progress: p, tiles, onPlay }: {
  unit: Track<PathLesson>['units'][number];
  view: PathView;
  progress: Progress;
  tiles: boolean;
  onPlay(id: string): void;
}): JSX.Element {
  return (
    <ol className={tiles ? 'lesson-tiles' : 'lesson-rows'}>
      {unit.lessons.map((l) => {
        const n = starsOf(p, v.track, l);
        const title = tx(l.title);
        const open = lessonOpen(p, v.track, l.id);
        const st = !open ? 'locked' : l.id === v.next?.id ? 'current' : n > 0 ? 'done' : 'open';
        const body = (
          <>
            <span className="lesson-id">{l.id}</span>
            <span className="lesson-title">{title}</span>
            <span className="lesson-mark" aria-hidden="true">
              {open ? <StarsMark stars={n} /> : <Icon name="lock" size={13} strokeWidth={2.4} />}
            </span>
          </>
        );
        return (
          <li key={l.id}>
            {open ? (
              <button type="button" className={'lesson-item is-' + st} aria-label={t('path.playLesson', { id: l.id, title, stars: starsLabel(n) })}
                aria-current={st === 'current' ? 'step' : undefined} onClick={() => onPlay(l.id)}>
                {body}
              </button>
            ) : (
              <span role="img" className="lesson-item is-locked" aria-label={t('path.lockedLessonTitled', { id: l.id, title })}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
