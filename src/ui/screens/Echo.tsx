/**
 * Echo mode (DESIGN.md §3.3): the rhythm is played with the notation hidden, the player taps it back from memory,
 * and Results reveals the notation with the timing. `EchoListen` is the listen phase; `EchoCard` stands in for the
 * staff while the player taps (the tapping itself is the normal Play session).
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { t } from '../../i18n';
import { applyAudioPrefs, engine, unlockAudio } from '../audio';
import { ExerciseFrame } from '../components/AppShell';
import { BeatRow, TapPad } from '../components/Bits';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import type { ExerciseView } from '../exerciseView';
import { useBreakpoint, useDocTitle, useKeyboardHints, useLingering } from '../hooks';
import { metersLabel } from '../lib/format';
import { beatAt } from '../lib/playMath';
import { Link, navigate } from '../router';
import { useStore, type Run } from '../store';
import { HowToContent } from './PlaySheets';

/** How often the rhythm can be heard (the first listen included). */
export const ECHO_PLAYS = 2;
const LEAD_IN_S = 0.3;

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
  onTapBack(): void;
}

/** Listen: a big play button, the plays left, the beat counter and the (not yet active) pad. */
export function EchoListen({ run, view, where, playsLeft, autoPlay, onPlayed, onTapBack }: ListenProps): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const keys = useKeyboardHints(bp);
  const ex = run.exercise;
  useDocTitle(t('app.docTitle', { page: t('play.docTitle') }));
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(playsLeft < ECHO_PLAYS);
  const [beat, setBeat] = useState<number | null>(null);
  const [help, setHelp] = useState<'help' | null>(state.prefs.seenEchoHowTo ? null : 'help');
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const stopLoop = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    timer.current = raf.current = null;
  };

  const listen = useCallback(() => {
    if (playsLeft <= 0) return;
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
      setBeat(beatAt(tg, beatSec, ex.meter.beatsPerBar, ex.meter.beatsPerBar, view.timeline.totalSeconds).inBar);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    timer.current = window.setTimeout(() => {
      stopLoop();
      setBeat(null);
      setPlaying(false);
      setHeard(true);
    }, Math.max(0, started.end - eng.now() + 0.25) * 1000);
  }, [playsLeft, state.prefs, view, ex, onPlayed]);

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
    navigate('/', { replace: true });
  };
  const closeHelp = (): void => {
    setHelp(null);
    if (!state.prefs.seenEchoHowTo) dispatch({ type: 'prefs', patch: { seenEchoHowTo: true } });
  };
  // Desktop: Esc closes How to play and ? opens it again, as the sheet says (closing it starts no sound here).
  const seen = state.prefs.seenEchoHowTo;
  useEffect(() => {
    if (!keys) return;
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
  }, [keys, help, seen, dispatch]);
  const { shown: helpShown, closing } = useLingering(help, 240);
  const bars = t('common.bars', { count: ex.bars.length });
  const cue = playing ? t('play.echo.listening') : heard ? t('play.echo.yourTurnCue') : t('play.echo.listenFirst');
  const beatLabel = beat === null ? t('play.beats', { total: ex.meter.beatsPerBar }) : t('play.countingBeat', { beat: beat + 1, total: ex.meter.beatsPerBar });

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
          <button type="button" className={'echo-play' + (playing ? ' is-playing' : '')} disabled={playing || playsLeft <= 0}
            aria-label={t(heard ? 'play.echo.replay' : 'play.echo.play')} onClick={listen}>
            <Icon name="play" size={34} />
          </button>
          <h2 id="echo-listen-title" className="echo-title" aria-live="polite">
            {playing ? t('play.echo.playing') : t('play.echo.listenTitle')}
          </h2>
          <span className="muted-text">{t('play.echo.meta', { bars, meter: metersLabel([ex.meter.id]), bpm: ex.tempo })}</span>
          <PlaysLeft left={playsLeft} />
          {heard && !playing && (
            <button type="button" className="btn btn--accent echo-start m-in" onClick={onTapBack}>
              {t('play.echo.start')}
            </button>
          )}
          <p className="sr-only">{t('play.echo.hidden')}</p>
        </section>

        <BeatRow beats={ex.meter.beatsPerBar} active={beat} label={beatLabel} />
        <div aria-live="polite" className="judgement judgement--phone tone-muted">
          {cue}
        </div>
        <TapPad progress={0} held={false} disabled />
      </div>
      {helpShown && (
        <Sheet variant={bp === 'desktop' ? 'dialog' : 'sheet'} closing={closing} panelKey="help" labelledBy="howto" maxWidth={bp === 'desktop' ? 520 : undefined}>
          <HowToContent eyebrow={t('howto.echo.eyebrow')} desktop={keys} hold={ex.settings.hold} echo onDone={closeHelp} />
        </Sheet>
      )}
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
