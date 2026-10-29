/**
 * Echo mode (DESIGN.md §3.3): the rhythm is played with the notation hidden, the player taps it back from memory,
 * and Results reveals the notation with the timing. `EchoListen` is the listen phase; `EchoCard` stands in for the
 * staff while the player taps (the tapping itself is the normal Play session). On tablet and desktop the listen phase
 * has Play's layout, with the listen card where the staff goes, so the screen looks the same before and after.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { LISTEN_LEAD_IN_S as LEAD_IN_S } from '../../game/stats';
import { t } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { AnalogMetronome, BeatRow, TapPad } from '../components/Bits';
import { ExerciseHeader } from '../components/ExerciseHeader';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import type { ExerciseView } from '../exerciseView';
import { useBreakpoint, useDocTitle, useExerciseLayout, useKeyboardHints, useLingering, useReducedMotion } from '../hooks';
import { metersLabel } from '../lib/format';
import { beatAt, type BeatState } from '../lib/playMath';
import { focusLost } from '../lib/screenFocus';
import { leave, Link } from '../router';
import { useStore, type Run } from '../store';
import { PlayCountRow, PlayDeskRow, type CountProps } from './PlayParts';
import { STOPPED_AUDIO } from './playSession';
import { HowToContent } from './PlaySheets';

/** How often the rhythm can be heard (the first listen included). */
export const ECHO_PLAYS = 2;
const IDLE_BEAT: BeatState = { inBar: null, countIn: false };

/** "Echo · Free practice", "Echo · Lesson 2.3", "Echo · Daily challenge". */
export function echoWhere(where: string): string {
  return t('play.echo.where', { where });
}

/** Pips for the plays left, plus "2 plays left". */
function PlaysLeft({ left }: { left: number }): JSX.Element {
  return (
    <span className="echo-plays">
      <span className="echo-pips" aria-hidden="true">
        {Array.from({ length: ECHO_PLAYS }, (_, i) => (
          <span key={i} className={i < left ? 'is-on' : ''} />
        ))}
      </span>
      {t('play.echo.playsLeft', { count: left })}
    </span>
  );
}

interface ListenProps {
  run: Run;
  view: ExerciseView;
  where: string;
  playsLeft: number;
  /** Start playing on mount (Hear again from the tap phase). */
  autoPlay: boolean;
  onPlayed(): void;
  /** A listen cut off before its end (the app left, the audio stopped): it is not counted. */
  onCancelled(): void;
  onTapBack(): void;
}

/** Listen: a big play button, the plays left, the beat counter and the (not yet active) pad. */
export function EchoListen({ run, view, where, playsLeft, autoPlay, onPlayed, onCancelled, onTapBack }: ListenProps): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';
  const tablet = useExerciseLayout() === 'tablet';
  const keys = useKeyboardHints(bp);
  const still = useReducedMotion();
  const ex = run.exercise;
  useDocTitle(t('app.docTitle', { page: t('play.docTitle') }));
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(playsLeft < ECHO_PLAYS);
  const [beat, setBeat] = useState<BeatState>(IDLE_BEAT);
  /** Beats since the first beat, with the fraction: the analog metronome's swing. */
  const [at, setAt] = useState(0);
  const [help, setHelp] = useState<'help' | null>(state.prefs.seenEchoHowTo ? null : 'help');
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const stopLoop = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    timer.current = raf.current = null;
  };

  // The play button keeps the focus while it plays (aria-disabled, not disabled, which would drop it to the page). Once
  // it has played, Tap it back, which comes in under it, takes the focus from it: the player's turn.
  const playButton = useRef<HTMLButtonElement>(null);
  const tapButton = useRef<HTMLButtonElement>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (playing || !pressed.current) return;
    pressed.current = false;
    if (document.activeElement === playButton.current || focusLost()) tapButton.current?.focus({ preventScroll: true });
  }, [playing]);

  const listen = useCallback(() => {
    if (playing || playsLeft <= 0) return;
    pressed.current = document.activeElement === playButton.current;
    unlockAudio();
    const eng = engine();
    applyAudioPrefs(state.prefs, eng);
    stopLoop();
    const started = eng.start({ timeline: view.timeline, meter: ex.meter, tempo: ex.tempo, countInBars: 1, metronome: ex.settings.metronome, playRhythm: true, leadIn: LEAD_IN_S });
    onPlayed();
    setPlaying(true);
    const beatSec = view.timeline.beatSeconds;
    const tick = (): void => {
      const tg = eng.heardNow() - started.exerciseStart;
      const now = beatAt(tg, beatSec, ex.meter.beatsPerBar, ex.meter.beatsPerBar, view.timeline.totalSeconds);
      // A new state only when the beat changes, not every frame; the analog metronome swings with every frame.
      setBeat((b) => (b.inBar === now.inBar && b.countIn === now.countIn ? b : now));
      if (state.prefs.metronomeLook === 'analog') setAt(tg / beatSec);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    timer.current = window.setTimeout(() => {
      stopLoop();
      setBeat(IDLE_BEAT);
      setPlaying(false);
      setHeard(true);
    }, Math.max(0, started.end - eng.now() + 0.25) * 1000);
  }, [playing, playsLeft, state.prefs, view, ex, onPlayed]);

  // Leaving the app or the tab, or the audio stopping under it (an iOS call or Siri, the browser suspended it), cuts
  // the rhythm off: the listen stops and is given back, as the tapping pauses then (playSession.ts).
  useEffect(() => {
    if (!playing) return;
    let cut = false;
    const stop = (): void => {
      if (cut) return;
      cut = true;
      stopLoop();
      engine().stop();
      setBeat(IDLE_BEAT);
      setPlaying(false);
      onCancelled();
    };
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onVis);
    const off = engine().onStateChange((s) => {
      if (STOPPED_AUDIO.has(s)) stop();
    });
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      off();
    };
  }, [playing, onCancelled]);

  // Hear again from the tap phase: play straight away (the tap there was the gesture).
  const autoPlayed = useRef(false);
  useEffect(() => {
    if (autoPlay && !autoPlayed.current) {
      autoPlayed.current = true;
      listen();
    }
  }, [autoPlay, listen]);
  useEffect(
    () => () => {
      stopLoop();
      engine().stop();
    },
    [],
  );

  const quit = (e: MouseEvent): void => {
    e.preventDefault();
    stopLoop();
    engine().stop();
    leave('/');
  };
  const closeHelp = (): void => {
    setHelp(null);
    if (!state.prefs.seenEchoHowTo) dispatch({ type: 'prefs', patch: { seenEchoHowTo: true } });
  };
  // Esc closes How to play and ? opens it again, at every size as on Play (a keyboard on a phone or tablet too; the
  // sheet names the keys on desktop only). Closing it starts no sound here.
  const seen = state.prefs.seenEchoHowTo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && help) {
        e.preventDefault();
        setHelp(null);
        if (!seen) dispatch({ type: 'prefs', patch: { seenEchoHowTo: true } });
      } else if (e.key === '?' && !help) {
        e.preventDefault();
        setHelp('help');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help, seen, dispatch]);
  const { shown: helpShown, closing } = useLingering(help, 240);
  const bars = t('common.bars', { count: ex.bars.length });
  const cue = playing ? t('play.echo.listening') : heard ? t('play.echo.yourTurnCue') : t('play.echo.listenFirst');
  const beatLabel = beat.inBar === null
    ? t('play.beats', { total: ex.meter.beatsPerBar })
    : t(beat.countIn ? 'play.countIn' : 'play.countingBeat', { beat: beat.inBar + 1, total: ex.meter.beatsPerBar });
  // The beat counter Settings asks for, as on Play, so it keeps its look once the tapping starts.
  const analog = state.prefs.metronomeLook === 'analog' && (
    <AnalogMetronome beats={ex.meter.beatsPerBar} active={beat.inBar} at={at} tempo={ex.tempo} label={beatLabel} still={still} />
  );

  const listenBody = (
    <>
      <button ref={playButton} type="button" className={'echo-play' + (playing ? ' is-playing' : '')} disabled={!playing && playsLeft <= 0}
        aria-disabled={playing || undefined} aria-label={t(heard ? 'play.echo.replay' : 'play.echo.play')} onClick={listen}>
        <Icon name="play" size={34} />
      </button>
      <h2 id="echo-listen-title" className="echo-title" aria-live="polite">
        {playing ? t('play.echo.playing') : t('play.echo.listenTitle')}
      </h2>
      <span className="muted-text">{t('play.echo.meta', { bars, meter: metersLabel([ex.meter.id]), bpm: ex.tempo })}</span>
      <PlaysLeft left={playsLeft} />
      {heard && !playing && (
        <button ref={tapButton} type="button" className="btn btn--accent echo-start m-in" onClick={onTapBack}>
          {t('play.echo.start')}
        </button>
      )}
      <p className="sr-only">{t('play.echo.hidden')}</p>
    </>
  );
  const sheet = helpShown && (
    <Sheet variant={desktop ? 'dialog' : 'sheet'} closing={closing} panelKey="help" labelledBy="howto" maxWidth={desktop ? 520 : undefined}>
      <HowToContent eyebrow={t('howto.echo.eyebrow')} desktop={keys} hold={ex.settings.hold} echo onDone={closeHelp} />
    </Sheet>
  );

  if (desktop || tablet) {
    // Play's tablet and desktop layout (Play.tsx): the exercise header, the listen card in the staff card, then the
    // count and the pad, which takes taps once the rhythm is tapped back.
    const count: CountProps = { beats: ex.meter.beatsPerBar, beat, label: beatLabel, countIn: beat.countIn, analog };
    const header = (
      <ExerciseHeader tablet={tablet} eyebrow={where}
        line={
          <>
            {t('play.echo.listen')} · {metersLabel([ex.meter.id])} · <span className="music">𝅘𝅥</span> {t('play.beatEquals', { bpm: ex.tempo })}
          </>
        }
        progress={{ label: t('play.progress'), value: heard ? 0.1 : 0.05, max: 100, now: heard ? 10 : 5 }}>
        <button type="button" className="icon-btn icon-btn--quiet" aria-haspopup="dialog" aria-keyshortcuts={keys ? '?' : undefined}
          aria-label={t(keys ? 'play.helpShortcut' : 'play.help')} title={t(keys ? 'play.helpTitle' : 'play.help')} onClick={() => setHelp('help')}>
          <Icon name="help" size={20} strokeWidth={1.8} />
        </button>
        <Link to="/" className="text-link-btn" onClick={quit}>
          {t('play.quitShort')}
        </Link>
      </ExerciseHeader>
    );
    const card = (
      <div className={'card ' + (desktop ? 'dplay-staff' : 'tplay-staff tplay-staff--echo')}>
        <div className="dplay-staff-inner">
          <section className="echo-card" aria-labelledby="echo-listen-title">
            {listenBody}
          </section>
        </div>
      </div>
    );
    return (
      <div className={desktop ? 'dplay' : 'tframe'}>
        {header}
        <h1 className="sr-only">{t('play.echo.listenTitle')}</h1>
        {desktop ? (
          <main className="dplay-main">
            {card}
            <PlayDeskRow count={count} combo={0} soFar={null} judgement={cue} judgementClass="judgement tone-muted" held={false} ring={0} disabled />
          </main>
        ) : (
          <main className="page tplay-main">
            {card}
            <PlayCountRow count={count} combo={0} />
            <div aria-live="polite" className="judgement judgement--tablet tone-muted">
              {cue}
            </div>
            <TapPad progress={0} held={false} disabled />
          </main>
        )}
        {sheet}
      </div>
    );
  }

  return (
    <ExerciseFrame className="frame--play">
      <div className="page play echo">
        <h1 className="sr-only">{t('play.echo.listenTitle')}</h1>
        <div className="play-top">
          <Link to="/" aria-label={t('play.quit')} className="icon-btn icon-btn--edge-sm" onClick={quit}>
            <Icon name="close" size={22} strokeWidth={2.2} />
          </Link>
          <div className="progress" role="progressbar" aria-label={t('play.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={heard ? 10 : 5}>
            <div style={{ width: (heard ? 10 : 5) + '%' }} />
          </div>
          <button type="button" className="icon-btn icon-btn--quiet icon-btn--narrow icon-btn--edge-sm-r" aria-label={t('play.help')} title={t('play.help')} aria-haspopup="dialog"
            onClick={() => setHelp('help')}>
            <Icon name="help" size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div className="play-info">
          <div className="play-info-left">
            <span className="eyebrow">{where}</span>
            <span className="mono-line mono-line--big">
              {t('play.echo.listen')} · <span className="music">𝅘𝅥</span> {t('play.beatEquals', { bpm: ex.tempo })}
            </span>
          </div>
        </div>

        <section className="card play-staff play-staff--echo echo-card" aria-labelledby="echo-listen-title">
          {listenBody}
        </section>

        {analog || <BeatRow beats={ex.meter.beatsPerBar} active={beat.inBar} countIn={beat.countIn} label={beatLabel} />}
        <div aria-live="polite" className="judgement judgement--phone tone-muted">
          {cue}
        </div>
        <TapPad progress={0} held={false} disabled />
      </div>
      {sheet}
    </ExerciseFrame>
  );
}

/** Tap phase: in place of the staff, "Your turn", the taps so far, Hear again and Done. */
export function EchoCard({ taps, playsLeft, onHearAgain, onDone }: { taps: number; playsLeft: number; onHearAgain(): void; onDone(): void }): JSX.Element {
  return (
    <section className="echo-card echo-card--tap" aria-labelledby="echo-tap-title">
      <span className="eyebrow">{t('play.echo.yourTurn')}</span>
      <h2 id="echo-tap-title" className="echo-title">
        {t('play.echo.nowTap')}
      </h2>
      <span className="echo-count">
        <b>{taps}</b>
        <span className="muted-text">{t('play.echo.tapsSoFar', { count: taps })}</span>
      </span>
      <span className="muted-text">{t('play.echo.fromMemory')}</span>
      <span className="echo-actions">
        <button type="button" className="btn btn--outline" disabled={playsLeft <= 0} onClick={onHearAgain}>
          {playsLeft > 0 ? t('play.echo.hearAgain', { count: playsLeft }) : t('play.echo.noPlays')}
        </button>
        <button type="button" className="btn btn--accent" onClick={onDone}>
          {t('play.echo.done')}
        </button>
      </span>
    </section>
  );
}
