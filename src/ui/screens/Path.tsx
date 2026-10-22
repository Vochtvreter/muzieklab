/**
 * Learning path (DESIGN.md §8.2; MVP canvas, Path page, Learning paths): three paths, Rhythm, Read notes and Keys,
 * picked with a switcher (phone, tablet) or path cards (desktop); the app remembers the last one. Each path shows its
 * stars and theory link, the unit spine (done, current, locked) and Start for its next lesson. A unit opens to show its
 * lessons by name, as rows on phone and five tiles on tablet and desktop; the current unit is open. Keys opens after
 * Read notes unit 3.
 */
import { useEffect, useRef, useState } from 'react';
import { lessonSettings } from '../../game/path';
import { noteLessonSettings } from '../../game/notesPath';
import { trackLessons, starsIn, trackStarsIn, unitStarsIn, unitStatesIn, lessonOpen, type Track, type TrackId, type TrackLesson, type UnitState } from '../../game/track';
import { allStars, continueIn, OPENS_AFTER, trackById, trackOpen, TRACKS } from '../../game/tracks';
import type { Progress } from '../../game/storage';
import { SHOWN_STARS } from '../../core/api';
import { t, tx } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { StarsMark } from '../components/Bits';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { starsLabel, starsText } from '../lib/format';
import { Link, type Route } from '../router';
import { useStore } from '../store';
import { useStartNoteLesson } from './notes/start';
import { useStartLesson } from './start';

const GLYPH: Record<TrackId, string> = { rhythm: '𝅘𝅥𝅮', notes: '𝄞', keys: '♯' };
const THEORY: Record<TrackId, Route> = { rhythm: '/learn', notes: '/learn/8', keys: '/learn/9' };

/** One path as the screen shows it. */
interface TrackView {
  track: Track;
  open: boolean;
  states: UnitState[];
  /** The lesson to continue with; null when the path is done or closed. */
  next: TrackLesson | null;
  /** What Start plays: the next lesson, or the last one once the path is done (to play it again). */
  start: TrackLesson | null;
  /** The current unit's number (the last unit once the path is done). */
  unit: number;
  stars: { earned: number; max: number };
}

function trackView(p: Progress, id: TrackId): TrackView {
  const track = trackById(id);
  const open = trackOpen(p, id);
  const next = continueIn(p, id);
  const all = trackLessons(track);
  const states: UnitState[] = open ? unitStatesIn(p, track) : track.units.map(() => 'locked');
  // A closed path stands at its first unit; a finished one at its last.
  const cur = next ? all.find((x) => x.lesson.id === next.id)?.unit : open ? track.units[track.units.length - 1] : track.units[0];
  return {
    track,
    open,
    states,
    next,
    start: next ?? (open ? all[all.length - 1]?.lesson ?? null : null),
    unit: cur?.id ?? 1,
    stars: trackStarsIn(p, track),
  };
}

export function PathScreen(): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const startRhythm = useStartLesson();
  const startNotes = useStartNoteLesson();
  useDocTitle(t('app.docTitle', { page: t('path.title') }));
  const p = state.progress;
  const id = state.prefs.pathTrack;
  const views = TRACKS.map((x) => trackView(p, x.id));
  const cur = views.find((v) => v.track.id === id) ?? views[0];
  const totals = allStars(p);
  const pick = (to: TrackId): void => dispatch({ type: 'prefs', patch: { pathTrack: to } });
  const play = (lessonId: string): void => (id === 'rhythm' ? startRhythm(lessonId) : startNotes(id, lessonId));
  // On a short screen the page scrolls to the current unit when the Path opens; picking another path keeps the
  // switcher (and the focused chip) in view. Child effects run first, so the first Units still sees `true`.
  const opening = useRef(true);
  useEffect(() => {
    opening.current = false;
  }, []);

  const head = (
    <div className="path-head">
      <h1 className="page-title">{t('path.title')}</h1>
      <span className="mono-muted" role="img" aria-label={t('path.allTotalsLabel', { stars: totals.earned, total: totals.max })}>
        {t('path.totals', { stars: totals.earned, total: totals.max })}
      </span>
    </div>
  );
  const units = <Units key={id} view={cur} progress={p} tiles={bp !== 'phone'} scrollPage={opening.current} onPlay={play} />;
  // Start, or (Keys while it is closed) the way to the path that opens it. One <button> in both cases, so keyboard
  // focus stays on it when Go to Read notes switches the path.
  const after = OPENS_AFTER[id];
  const action = cur.start ? (
    <button type="button" className="btn btn--accent path-start" onClick={() => play(cur.start!.id)}>
      {t('path.start', { id: cur.start.id })}
    </button>
  ) : after ? (
    <button type="button" className="btn btn--outline path-start" onClick={() => pick(after.track)}>
      {t('path.toTrack', { track: t('path.track.' + after.track) })}
    </button>
  ) : null;

  if (bp === 'desktop') {
    return (
      <AppShell bp={bp} active="/path" wide>
        <div className="page path path--desk">
          <div className="path-side">
            {head}
            <div role="group" aria-label={t('path.paths')} className="track-cards">
              {views.map((v) => (
                <TrackCard key={v.track.id} view={v} on={v === cur} onPick={pick} />
              ))}
            </div>
          </div>
          <section className="path-main" aria-labelledby="track-title">
            <div className="path-main-head">
              <div className="path-main-text">
                <h2 id="track-title" className="path-track-title">
                  {t('path.track.' + id)}
                </h2>
                <TrackInfo view={cur} />
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
        <div role="group" aria-label={t('path.paths')} className="track-switch">
          {views.map((v) => (
            <TrackChip key={v.track.id} view={v} on={v === cur} onPick={pick} />
          ))}
        </div>
        <TrackInfo view={cur} />
        {units}
        {action}
      </div>
    </AppShell>
  );
}

/** "Unit 7 of 8", "All done" or "Locked": where a path stands, for the switcher and the cards. */
function trackMeta(v: TrackView, long: boolean): string {
  if (!v.open) return t('path.trackLocked');
  if (!v.next) return t('path.trackDone');
  const n = { unit: v.unit, total: v.track.units.length };
  const u = v.track.units.find((x) => x.id === v.unit);
  return long && u ? t('path.cardMeta', { ...n, title: tx(u.titleKey) }) : t('path.trackMeta', n);
}

function TrackChip({ view: v, on, onPick }: { view: TrackView; on: boolean; onPick(id: TrackId): void }): JSX.Element {
  const id = v.track.id;
  return (
    <button type="button" aria-pressed={on} className={'track-chip' + (on ? ' is-on' : '')} onClick={() => onPick(id)}>
      <span className="track-chip-name">
        <span aria-hidden="true" className="track-glyph">
          {GLYPH[id]}
        </span>
        {t('path.trackShort.' + id)}
      </span>
      <span className="track-chip-meta">
        {!v.open && <Icon name="lock" size={12} strokeWidth={2.4} />}
        {trackMeta(v, false)}
      </span>
    </button>
  );
}

function TrackCard({ view: v, on, onPick }: { view: TrackView; on: boolean; onPick(id: TrackId): void }): JSX.Element {
  const id = v.track.id;
  const pct = v.stars.max ? (v.stars.earned / v.stars.max) * 100 : 0;
  return (
    <button type="button" aria-pressed={on} className={'track-card' + (on ? ' is-on' : '')} onClick={() => onPick(id)}>
      <span className="track-card-top">
        <span aria-hidden="true" className="track-card-glyph">
          {GLYPH[id]}
        </span>
        <span className="track-card-text">
          <b>{t('path.track.' + id)}</b>
          <span className="track-card-meta">
            {!v.open && <Icon name="lock" size={12} strokeWidth={2.4} />}
            {v.open ? trackMeta(v, true) : t('path.opensAfter', { unit: OPENS_AFTER[id]?.unit ?? 0 })}
          </span>
        </span>
      </span>
      <span className="track-card-bottom">
        <span className="track-card-bar" aria-hidden="true">
          <span style={{ width: pct + '%' }} />
        </span>
        <span className="mono-muted" aria-hidden="true">
          {t('path.totals', { stars: v.stars.earned, total: v.stars.max })}
        </span>
        <span className="sr-only">{t('path.trackStarsLabel', { stars: v.stars.earned, max: v.stars.max })}</span>
      </span>
    </button>
  );
}

/** The chosen path's stars and its theory link. */
function TrackInfo({ view: v }: { view: TrackView }): JSX.Element {
  const id = v.track.id;
  const n = { unit: v.unit, total: v.track.units.length, stars: v.stars.earned, max: v.stars.max };
  return (
    <div className="track-info">
      <span className="mono-muted" role="img" aria-label={t('path.trackStarsLabel', n)}>
        {v.open && !v.next ? t('path.trackStarsDone', n) : t('path.trackStars', n)}
      </span>
      <Link to={THEORY[id]} className="track-theory">
        {t('path.theory.' + id)}
        <Icon name="chevronSmall" size={15} strokeWidth={2.4} />
      </Link>
    </div>
  );
}

/** "Next: lesson 7.3 · Dotted quarter + eighth · 80 BPM" (rhythm) or "… · 20 notes" (Read notes, Keys). */
function nextLine(id: TrackId, lesson: TrackLesson): string {
  const base = { lesson: lesson.id, title: tx(lesson.title) };
  if (id === 'rhythm') return t('path.next', { ...base, bpm: lessonSettings(lesson.id).tempo });
  return t('path.nextNotes', { ...base, count: noteLessonSettings(id, lesson.id)?.count ?? 0 });
}

function Units({ view: v, progress: p, tiles, scrollPage, onPlay }: {
  view: TrackView;
  progress: Progress;
  tiles: boolean;
  /** The list does not scroll (a short screen): scroll the page instead. */
  scrollPage: boolean;
  onPlay(id: string): void;
}): JSX.Element {
  const { track, states } = v;
  const id = track.id;
  const curUnit = states.indexOf('current');
  // The current unit is open; any open unit can be opened instead, or closed.
  const [openUnit, setOpenUnit] = useState<number | null>(curUnit >= 0 ? track.units[curUnit].id : null);
  const list = useRef<HTMLOListElement>(null);
  // Show the current unit (unit 7 is below the fold on a phone): the list scrolls, or on a short screen the page.
  useEffect(() => {
    const box = list.current;
    const el = box?.querySelector('.unit--current');
    const scroller = box && box.scrollHeight > box.clientHeight ? box : scrollPage ? box?.closest<HTMLElement>('.page') : null;
    if (!el || !scroller || scroller.scrollHeight <= scroller.clientHeight) return;
    scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
  }, []);
  const after = OPENS_AFTER[id];

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
        const panel = `unit-${id}-${u.id}`;
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
                    const n = starsIn(p, id, l.id);
                    const label = t('path.playLesson', { id: l.id, title: tx(l.title), stars: starsLabel(n) });
                    // Open lessons can be played again, e.g. to turn two stars into three.
                    return lessonOpen(p, track, l.id) ? (
                      <button key={l.id} type="button" className={'lesson-stars' + (n ? ' has-stars' : '')} title={label} aria-label={label}
                        onClick={() => onPlay(l.id)}>
                        <StarsMark stars={n} />
                      </button>
                    ) : (
                      <span key={l.id} role="img" className="lesson-stars is-locked" aria-label={t('path.lockedLesson', { id: l.id })}>
                        {starsText(n)}
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
              {st === 'current' && v.next && <div className="unit-sub">{nextLine(id, v.next)}</div>}
              {st === 'locked' && (i > 0 || after) && (
                <div className="unit-sub">
                  <Icon name="lock" size={13} strokeWidth={2.4} />
                  <span>{i === 0 && after ? t('path.opensAfter', { unit: after.unit }) : t('path.unlocks', { unit: track.units[i - 1]?.id ?? u.id })}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A unit's lessons by name: rows (phone) or five tiles (tablet, desktop). Open lessons start on a tap. */
function Lessons({ unit, view: v, progress: p, tiles, onPlay }: {
  unit: Track['units'][number];
  view: TrackView;
  progress: Progress;
  tiles: boolean;
  onPlay(id: string): void;
}): JSX.Element {
  const id = v.track.id;
  return (
    <ol className={tiles ? 'lesson-tiles' : 'lesson-rows'}>
      {unit.lessons.map((l) => {
        const n = starsIn(p, id, l.id);
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
