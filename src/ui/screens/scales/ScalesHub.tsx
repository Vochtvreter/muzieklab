/**
 * Scales hub (DESIGN.md §3.7): the circle of fifths with a Major / Minor switch, how many scales have two stars, and
 * the selected key: its notes, stars, *Options* and *Practice*, plus *Go round the circle*. A Home page: the tab bar
 * with Home current on phone, the top header on tablet and desktop, where the circle and the selected key sit side by
 * side (App design canvas, Tablet and Desktop · Scales). Opened from Learn chapter 11's Practice button (?from=11),
 * Learn is current, its back arrow returns to the chapter, and the setup and the rounds it opens keep that.
 */
import {
  CIRCLE,
  MINOR_TYPES,
  circlePosition,
  doneCounts,
  keySigns,
  majorLevel,
  minorLevel,
  scaleId,
  scaleNotes,
  type KeyId,
  type ScaleSettings,
  type ScaleType,
} from '../../../core/api';
import { t } from '../../../i18n';
import { PitchStaff } from '../../../render/PitchStaff';
import { AppShell } from '../../components/AppShell';
import { CircleOfFifths, type Ring } from '../../components/CircleOfFifths';
import { Segmented } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { useBreakpoint, useDocTitle, useKeyboardHints } from '../../hooks';
import { useLearnReturn } from '../../lib/learnReturn';
import { keySignsAria, letterName } from '../../lib/noteText';
import { keyName, noteName, noteSpoken } from '../../lib/scaleText';
import { Link, navigate } from '../../router';
import { useStore } from '../../store';
import { useStartScales } from './start';

/** "★★☆" with its spoken form. */
function Stars({ n, className }: { n: number; className?: string }): JSX.Element {
  return (
    <span role="img" aria-label={t('scales.starsAria', { count: n })} className={'scale-stars' + (className ? ' ' + className : '')}>
      <span aria-hidden="true">{'★'.repeat(n)}</span>
      <span aria-hidden="true" className="scale-stars-off">
        {'★'.repeat(3 - n)}
      </span>
    </span>
  );
}

export function ScalesHub(): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const kbd = useKeyboardHints(bp);
  const start = useStartScales();
  const { back, carry } = useLearnReturn();
  // The tab it was opened from is current (DESIGN.md §9): Home, or Learn from chapter 11.
  const fromTab = back ? '/learn' : '/';
  useDocTitle(t('app.docTitle', { page: t('scales.title') }));
  const { tab, key } = state.scaleHub;
  const minor = tab === 'minor';
  const stars = state.progress.scales.stars;
  const s = state.scaleSettings;

  const pick = (k: KeyId, ring: Ring): void => dispatch({ type: 'scaleHub', hub: { tab: ring, key: k } });
  const types: ScaleType[] = minor ? (s.types.some((x) => x !== 'major') ? s.types.filter((x) => x !== 'major') : [...MINOR_TYPES]) : ['major'];
  const preset = (patch: Partial<ScaleSettings>): ScaleSettings => ({ ...s, keyMode: 'one', keys: [key], types, ...patch });
  const options = (): void => dispatch({ type: 'scaleSettings', settings: preset({}) });
  const practise = (): void => start(preset({}), { query: carry });
  const roundTheCircle = (): void => {
    dispatch({ type: 'scaleSettings', settings: preset({ keyMode: 'circle' }) });
    navigate('/scales/setup', { query: carry });
  };

  const counts = doneCounts(stars);
  const others = CIRCLE[circlePosition(key)].filter((x) => x !== key);
  const title = keyName(key, minor);
  const sub =
    t(minor ? 'scales.hub.relMajor' : 'scales.hub.relMinor', { name: keyName(key, !minor) }) +
    (others.length ? t(kbd ? 'scales.hub.clickAgain' : 'scales.hub.tapAgain', { name: keyName(others[0], minor) }) : '');
  const notes = scaleNotes({ key, type: minor ? 'natural' : 'major' });
  const signs = keySigns(key);
  const level = minor ? minorLevel(stars, key) : majorLevel(stars, key);
  const formStars = (type: ScaleType): number => stars[scaleId({ key, type })] ?? 0;
  const practiceLabel = t('scales.hub.practice', { name: title });

  const switcher = (
    <Segmented<Ring> label={t('scales.hub.ring')} value={tab} className="hub-switch" onChange={(v) => pick(key, v)}
      options={[
        { value: 'major', label: t('scales.hub.major') },
        { value: 'minor', label: t('scales.hub.minor') },
      ]} />
  );
  const legend = (
    <div className="hub-legend">
      <span>
        <b>{t('scales.hub.doneCount', { done: minor ? counts.minor : counts.major, total: minor ? 45 : 15 })}</b>{' '}
        {t(minor ? 'scales.hub.doneMinor' : 'scales.hub.doneMajor')}
      </span>
      <span className="hub-legend-keys" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n}>
            <span className={'hub-dot is-l' + n} />
            {'★'.repeat(n)}
          </span>
        ))}
      </span>
    </div>
  );
  const circle = <CircleOfFifths tab={tab} selected={key} stars={stars} onPick={pick} />;
  // Shown with their signs, said in words: a screen reader reads a sign as a symbol or skips it.
  const noteChips = (
    <div className="hub-notes" role="list" aria-label={t('scales.hub.notesAria', { notes: notes.map(noteSpoken).join(', ') })}>
      {notes.map((n, i) => (
        <span key={i} role="listitem" aria-label={noteSpoken(n)} className={'hub-note' + (n.alter !== 0 ? ' is-sign' : '')}>
          <span aria-hidden="true">{noteName(n)}</span>
        </span>
      ))}
    </div>
  );
  const buttons = (
    <div className="hub-buttons">
      <Link to="/scales/setup" query={carry} className="btn btn--outline" onClick={options}>
        {t('scales.hub.options')}
      </Link>
      <button type="button" className="btn btn--accent" onClick={practise}>
        {practiceLabel}
      </button>
    </div>
  );
  const round = (
    <button type="button" className="card hub-round" onClick={roundTheCircle}>
      <Icon name="restart" size={26} className="hub-round-icon" />
      <span className="hub-round-text">
        <b>{t(minor ? 'scales.hub.roundMinor' : 'scales.hub.roundMajor')}</b>
        <span>{t(minor ? 'scales.hub.roundMinorSub' : 'scales.hub.roundMajorSub')}</span>
      </span>
      <Icon name="chevron" size={18} className="row-chevron" />
    </button>
  );
  const head = (
    <div className="screen-head screen-head--link hub-head">
      <Link to={back?.to ?? '/'} query={back?.query} aria-label={back ? t('learn.backToChapter', { n: back.chapter }) : t('scales.hub.back')}
        className="icon-btn icon-btn--edge">
        <Icon name="back" />
      </Link>
      <h1 className="screen-title hub-title">{t('scales.title')}</h1>
      <Link to="/learn/11" className={bp === 'phone' ? 'text-btn text-btn--link' : 'hub-learn'}>
        {t('scales.hub.learn')}
        {bp !== 'phone' && <Icon name="chevron" size={16} />}
      </Link>
    </div>
  );

  if (bp === 'phone') {
    return (
      <AppShell bp={bp} active={fromTab}>
        <div className="page hub no-scrollbar">
          {head}
          {switcher}
          {legend}
          {circle}
          <section aria-label={t('scales.hub.selected')} className="card hub-panel">
            <div className="hub-panel-head">
              <span className="hub-panel-title">
                <b>{title}</b>
                <span>{sub}</span>
              </span>
              <Stars n={level} />
            </div>
            {noteChips}
            {buttons}
          </section>
          {round}
        </div>
      </AppShell>
    );
  }

  const sigCount = signs.length === 0 ? t('scales.hub.sigNone') : t(signs[0].alter > 0 ? 'scales.hub.sharps' : 'scales.hub.flats', { count: signs.length });
  const sigBox = (
    <div className="hub-box hub-sig">
      <span className="label">{t('scales.hub.keySig')}</span>
      <div className="hub-sig-staff" role="img" aria-label={t('scales.hub.sigAria', { signs: keySignsAria(key) })}>
        <PitchStaff clef="treble" keyId={key} notes={[]} slots={0} room={1.4} />
      </div>
      <span className="hub-sig-foot">
        <b>{sigCount}</b>
        {signs.length > 0 && <span className="mono-accent">{signs.map((x) => letterName(x.letter, x.alter)).join(' ')}</span>}
      </span>
    </div>
  );
  const mastery = (
    <div className="hub-box hub-mastery">
      <span className="label">{t('scales.hub.mastery')}</span>
      {minor ? (
        MINOR_TYPES.map((type) => (
          <div key={type} className="hub-form">
            <b>{t('scales.type.' + type)}</b>
            <Stars n={formStars(type)} />
          </div>
        ))
      ) : (
        <div className="hub-mastery-big">
          <Stars n={formStars('major')} className="scale-stars--big" />
          <b>{t('scales.hub.majorScale')}</b>
        </div>
      )}
    </div>
  );
  const selHead = (
    <div className="hub-sel-head">
      <h2>{title}</h2>
      <span>{sub}</span>
    </div>
  );
  const notesBlock = (
    <div className="hub-notes-block">
      <span className="label">{t('scales.hub.notes')}</span>
      {noteChips}
    </div>
  );
  const circleCol = (
    <section aria-label={t('scales.hub.circle')} className="hub-circle-col">
      <div className="hub-circle-top">
        {switcher}
        {legend}
      </div>
      {circle}
    </section>
  );

  return (
    <AppShell bp={bp} active={fromTab} wide fill>
      <div className={'page hub hub--wide hub--' + bp + ' no-scrollbar'}>
        {head}
        {bp === 'tablet' ? (
          <>
            <div className="hub-row">
              {circleCol}
              <section aria-label={t('scales.hub.selected')} className="card hub-sel">
                {selHead}
                {sigBox}
                {mastery}
              </section>
            </div>
            <section aria-label={t('scales.hub.practise')} className="card hub-practise">
              {notesBlock}
              {buttons}
            </section>
            {round}
          </>
        ) : (
          <div className="hub-row">
            {circleCol}
            <div className="hub-side">
              <section aria-label={t('scales.hub.selected')} className="card hub-sel">
                {selHead}
                <div className="hub-boxes">
                  {sigBox}
                  {mastery}
                </div>
                {notesBlock}
                {buttons}
              </section>
              {round}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

