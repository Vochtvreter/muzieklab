/** The How to play, intro, Ready and Pause sheets (phone / tablet) and dialogs (desktop). */
import { useCallback, useEffect, useState } from 'react';
import type { Exercise, Timeline } from '../../core/api';
import { introId, type Intro } from '../../game/intro';
import type { Prefs } from '../../game/storage';
import { t } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { Icon } from '../components/Icon';
import { announce } from '../lib/announce';
import { introFact, introName, introSection, NOTE_GLYPH, REST_GLYPH } from '../lib/intros';
import { Link } from '../router';

/** iPhone and iPad (iPadOS reports itself as a Mac with touch). */
const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * How to play. `hold: false` (tap only, unit 1): only when each note starts counts, so nothing about holding.
 * `echo`: listen first, tap back from memory, the notation shows at the end.
 */
export function HowToContent({ eyebrow, desktop, hold = true, echo = false, onDone }: {
  eyebrow: string;
  desktop: boolean;
  hold?: boolean;
  echo?: boolean;
  onDone(): void;
}): JSX.Element {
  const k = echo ? 'howto.echo.' : hold ? 'howto.' : 'howto.tap.';
  // Echo tap only (before the path teaches holding): its step 2 does not ask to hold.
  const step = (n: number): string => (echo && !hold && n === 2 ? 'howto.echo.step2Tap' : k + 'step' + n);
  return (
    <>
      <div className="sheet-head">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id="howto" className="sheet-title">
          {t('howto.title')}
        </h2>
      </div>
      {hold ? (
      <svg width="350" height="74" viewBox="0 0 350 74" role="img" aria-label={t('howto.diagram')} className="howto-diagram">
        <rect x="18" y="34" width="196" height="16" rx="8" className="d-fill" />
        <rect x="230" y="34" width="100" height="16" rx="8" className="d-empty" />
        <path d="M18 12v14M12 20l6 6 6-6" fill="none" className="d-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M214 26V12M208 18l6-6 6 6" fill="none" className="d-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="30" y="22" fontSize="13" fontWeight="700" className="d-text">
          {t('howto.press')}
        </text>
        <text x="202" y="22" textAnchor="end" fontSize="13" fontWeight="700" className="d-text">
          {t('howto.lift')}
        </text>
        <text x="116" y="46" textAnchor="middle" fontSize="12" fontWeight="700" className="d-on-fill">
          {t('howto.hold')}
        </text>
        <text x="280" y="68" textAnchor="middle" fontSize="12" className="d-muted">
          {t('howto.nextNote')}
        </text>
        <text x="116" y="68" textAnchor="middle" fontSize="12" className="d-muted">
          {t('howto.oneNote')}
        </text>
      </svg>
      ) : (
        <svg width="350" height="74" viewBox="0 0 350 74" role="img" aria-label={t('howto.tap.diagram')} className="howto-diagram">
          <rect x="18" y="34" width="196" height="16" rx="8" className="d-empty" />
          <rect x="230" y="34" width="100" height="16" rx="8" className="d-empty" />
          <path d="M18 12v14M12 20l6 6 6-6" fill="none" className="d-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M230 12v14M224 20l6 6 6-6" fill="none" className="d-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="30" y="22" fontSize="13" fontWeight="700" className="d-text">
            {t('howto.tap.tap')}
          </text>
          <text x="242" y="22" fontSize="13" fontWeight="700" className="d-text">
            {t('howto.tap.tap')}
          </text>
          <text x="116" y="68" textAnchor="middle" fontSize="12" className="d-muted">
            {t('howto.oneNote')}
          </text>
          <text x="280" y="68" textAnchor="middle" fontSize="12" className="d-muted">
            {t('howto.nextNote')}
          </text>
        </svg>
      )}
      <ol className="steps">
        {[1, 2, 3].map((n) => (
          <li key={n}>
            <span className="step-n" aria-hidden="true">
              {n}
            </span>
            <span>{t(step(n))}</span>
          </li>
        ))}
      </ol>
      <span className="sheet-note">{t(desktop ? 'howto.desktop' : 'howto.computer')}</span>
      {isIOS() && <span className="sheet-note">{t('howto.ios')}</span>}
      <button type="button" data-autofocus className="btn btn--accent sheet-cta" onClick={onDone} aria-keyshortcuts={desktop ? 'Escape' : undefined}>
        {t('howto.gotIt')}
        {desktop && <kbd className="kbd kbd--on-fill">{t('pause.esc')}</kbd>}
      </button>
    </>
  );
}

export interface Listen {
  playing: boolean;
  toggle(): void;
  /** Stop it and silence the audio (How to play swapped in). */
  stop(): void;
  /** Forget it without touching the audio: the count-in that starts now takes the audio over. */
  halt(): void;
}

/** The intro sheet's Listen: this exercise's rhythm once with the beat, played as Results' Listen does. */
export function useListen(ex: Exercise, timeline: Timeline, prefs: Prefs): Listen {
  const [playing, setPlaying] = useState(false);
  // It stops by itself at the end.
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setPlaying(false), (timeline.totalSeconds + 0.6) * 1000);
    return () => window.clearTimeout(id);
  }, [playing, timeline]);
  const toggle = useCallback(() => {
    const eng = engine();
    if (playing) {
      eng.stop();
      setPlaying(false);
      return;
    }
    unlockAudio();
    applyAudioPrefs(prefs, eng);
    eng.start({ timeline, meter: ex.meter, tempo: ex.tempo, countInBars: 0, metronome: ex.settings.metronome, playRhythm: true, leadIn: 0.15 });
    setPlaying(true);
  }, [playing, prefs, ex, timeline]);
  const stop = useCallback(() => {
    if (playing) engine().stop();
    setPlaying(false);
  }, [playing]);
  const halt = useCallback(() => setPlaying(false), []);
  return { playing, toggle, stop, halt };
}

/** A new symbol's glyph, large: a note or rest as the setup's buttons draw it, a time signature, a dot, a tie, a triplet. */
function IntroGlyph({ intro }: { intro: Intro }): JSX.Element {
  switch (intro.kind) {
    case 'meter': {
      const [top, bottom] = intro.meter.split('/');
      return (
        <span className="intro-glyph intro-glyph--meter" aria-hidden="true">
          <span>{top}</span>
          <span>{bottom}</span>
        </span>
      );
    }
    case 'ties':
      return (
        <span className="intro-glyph intro-glyph--tie" aria-hidden="true">
          <span>{NOTE_GLYPH.quarter}</span>
          <span>{NOTE_GLYPH.quarter}</span>
          <svg viewBox="0 0 24 10" className="intro-tie">
            <path d="M2 2 Q12 11 22 2" />
          </svg>
        </span>
      );
    case 'triplets':
      return (
        <span className="intro-glyph intro-glyph--triplet" aria-hidden="true">
          <span className="intro-three">3</span>
          {[0, 1, 2].map((n) => (
            <span key={n}>{NOTE_GLYPH.eighth}</span>
          ))}
        </span>
      );
    default:
      return (
        <span className="intro-glyph" aria-hidden="true">
          {intro.kind === 'note' ? NOTE_GLYPH[intro.value] : intro.kind === 'rest' ? REST_GLYPH[intro.value] : NOTE_GLYPH.half + '.'}
        </span>
      );
  }
}

/**
 * What the lesson introduces, before its count-in (DESIGN.md §3.1): per new symbol its glyph, name and one fact, with
 * a link to the Learn section that explains it; Listen plays this exercise once, Start begins the count-in.
 */
export function IntroContent({ title, intros, listen, onStart }: { title: string; intros: Intro[]; listen: Listen; onStart(): void }): JSX.Element {
  return (
    <>
      <div className="sheet-head">
        <span className="eyebrow">{t('intro.eyebrow')}</span>
        <h2 id="introtitle" className="sheet-title">
          {title}
        </h2>
      </div>
      <ul className="intro-list">
        {intros.map((i) => {
          const name = introName(i);
          const section = introSection(i);
          return (
            <li key={introId(i)} className="intro-item">
              <IntroGlyph intro={i} />
              <span className="intro-text">
                <span>
                  <b>{name}</b> · {introFact(i)}
                </span>
                <Link to={`/learn/${Number(section.split('.')[0])}`} query={'s=' + section} className="text-btn text-btn--link intro-learn"
                  aria-label={t('intro.learnMoreLabel', { name })}>
                  {t('intro.learnMore')} →
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="intro-actions">
        <button type="button" className={'btn btn--outline' + (listen.playing ? ' is-on' : '')} aria-pressed={listen.playing} title={t('intro.listenTitle')}
          onClick={listen.toggle}>
          {listen.playing ? <Icon name="stop" size={18} className="m-in" /> : <Icon name="speaker" size={18} />}
          {t(listen.playing ? 'intro.stop' : 'intro.listen')}
        </button>
        <button type="button" data-autofocus className="btn btn--accent" onClick={onStart}>
          <Icon name="play" size={18} />
          {t('ready.start')}
        </button>
      </div>
    </>
  );
}

/**
 * Shown when Play opens without a tap (a reload, Back / Forward): browsers only start the audio after one. Also before
 * a lesson other than the one finished last, so the player can read the new rhythm before the count-in.
 */
export function ReadyContent({ context, detail, onStart }: { context: string; detail: string; onStart(): void }): JSX.Element {
  return (
    <>
      <div className="sheet-head">
        <span className="eyebrow">{context}</span>
        <h2 id="readytitle" className="sheet-title">
          {t('ready.title')}
        </h2>
      </div>
      <p className="sheet-text">{detail}</p>
      {/* No Esc shortcut here: Esc is not a gesture browsers accept for starting audio. Enter or Space on the button is. */}
      <button type="button" data-autofocus className="btn btn--accent sheet-cta" onClick={onStart}>
        <Icon name="play" size={18} />
        {t('ready.start')}
      </button>
    </>
  );
}

interface PauseProps {
  context: string;
  /** The audio was interrupted (a call, Siri, the browser): say so instead of the count-in note. */
  interrupted?: boolean;
  desktop: boolean;
  lesson: boolean;
  onResume(): void;
  onRestart(): void;
  onHelp(): void;
  onSettings(): void;
  onQuit(): void;
}

export function PauseContent(p: PauseProps): JSX.Element {
  // Why it paused is read out as the sheet comes up with the focus on Resume, through the app's one live region
  // (ui/lib/announce.ts): a role="status" put in already holding its text is not read by every screen reader.
  useEffect(() => {
    if (p.interrupted) announce(t('pause.interrupted'));
  }, [p.interrupted]);
  return (
    <>
      <div className="sheet-head">
        <span className="eyebrow">{p.context}</span>
        <h2 id="pausetitle" className="sheet-title">
          {t('pause.title')}
        </h2>
      </div>
      <div className="menu">
        <button type="button" className="menu-item" onClick={p.onRestart}>
          <span className="menu-icon">
            <Icon name="restart" size={20} />
          </span>
          {t('pause.restart')}
        </button>
        <button type="button" className="menu-item" onClick={p.onHelp} aria-keyshortcuts={p.desktop ? '?' : undefined}>
          <span className="menu-icon">
            <Icon name="help" size={20} />
          </span>
          {t('pause.howto')}
          {p.desktop && <kbd className="kbd menu-end">{t('pause.question')}</kbd>}
        </button>
        <button type="button" className="menu-item" onClick={p.onSettings}>
          <span className="menu-icon">
            <Icon name="sliders" size={20} />
          </span>
          {t('pause.settings')}
          <Icon name="chevronSmall" size={18} className="menu-end menu-chevron" />
        </button>
        <button type="button" className="menu-item" onClick={p.onQuit}>
          <span className="menu-icon">
            <Icon name="quit" size={20} />
          </span>
          {t(p.lesson ? 'pause.quitLesson' : 'pause.quitPractice')}
          <Icon name="chevronSmall" size={18} className="menu-end menu-chevron" />
        </button>
      </div>
      <div className="sheet-note sheet-note--icon">
        <Icon name="metronome" size={18} strokeWidth={1.8} />
        <span>{t(p.interrupted ? 'pause.interrupted' : 'pause.note')}</span>
      </div>
      {/* After an interruption Esc cannot restart the audio (not a user-activation key): no Esc shortcut then. */}
      <button type="button" data-autofocus className="btn btn--accent sheet-cta" onClick={p.onResume} aria-keyshortcuts={p.desktop && !p.interrupted ? 'Escape' : undefined}>
        <Icon name="play" size={18} />
        {t('pause.resume')}
        {p.desktop && !p.interrupted && <kbd className="kbd kbd--on-fill">{t('pause.esc')}</kbd>}
      </button>
    </>
  );
}
