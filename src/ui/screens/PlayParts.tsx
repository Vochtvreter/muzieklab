/**
 * Parts of Play's tablet and desktop layouts that Echo's listen phase shares, so Echo looks the same before and after
 * listening: the desktop row with the key-cap pad and the four stat cards, and the tablet row with the count and the
 * combo (App design canvas, DesktopPlay and PlayTablet).
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { applyAudioPrefs, engine } from '../audio';
import { BeatRow } from '../components/Bits';
import { SwitchTrack } from '../components/Controls';
import type { BeatState } from '../lib/playMath';
import { useStore } from '../store';

/** The beat counter: digits, or the analog metronome when Settings asks for it. */
export interface CountProps {
  beats: number;
  beat: BeatState;
  /** What the counter says to a screen reader ("Counting beat 2 of 4"). */
  label: string;
  /** Before the music's first beat: the card is titled Count-in. */
  countIn: boolean;
  analog?: ReactNode;
}

interface DeskRowProps {
  count: CountProps;
  combo: number;
  soFar: number | null;
  judgement: ReactNode;
  judgementClass: string;
  held: boolean;
  ring: number;
  padRef?: (el: HTMLDivElement | null) => void;
  /** Echo while listening: the pad shows but takes no taps yet. */
  disabled?: boolean;
}

/** Desktop: the key-cap pad with the judgement over it, and the stat cards (count, combo, so far, metronome). */
export function PlayDeskRow({ count, combo, soFar, judgement, judgementClass, held, ring, padRef, disabled }: DeskRowProps): JSX.Element {
  const { state, dispatch } = useStore();
  const metronomeOn = state.prefs.metronomeOn;
  const toggleMetronome = (): void => {
    const prefs = { ...state.prefs, metronomeOn: !metronomeOn };
    dispatch({ type: 'prefs', patch: { metronomeOn: !metronomeOn } });
    applyAudioPrefs(prefs, engine());
  };
  const { beat } = count;
  return (
    <div className="dplay-row">
      <div className={'dpad' + (disabled ? ' is-off' : '')} ref={padRef}>
        <div aria-live="polite" className={judgementClass}>
          {judgement}
        </div>
        <button type="button" className={'keycap' + (held ? ' is-held' : '')} aria-label={t('play.pad')} disabled={disabled}>
          {t('play.padLabel')}
          <span className="keycap-bar" aria-hidden="true">
            <span style={{ width: ring * 100 + '%' }} />
          </span>
        </button>
      </div>
      <div className="dstats">
        <div className="card stat">
          <span className="label">{t(count.countIn ? 'play.countingIn' : 'play.count')}</span>
          {count.analog || (
            <div className={'dbeats' + (beat.countIn ? ' is-count-in' : '')} role="img" aria-label={count.label}>
              {Array.from({ length: count.beats }, (_, i) => (
                <span key={i} aria-hidden="true" className={i === beat.inBar ? 'is-on' : ''}>
                  {i + 1}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card stat">
          <span className="label">{t('play.comboTitle')}</span>
          <span className="stat-big">{t('play.comboValue', { count: combo })}</span>
        </div>
        <div className="card stat">
          <span className="label">{t('play.soFar')}</span>
          <span className="stat-mono">{soFar === null ? t('play.noScore') : t('common.percent', { value: soFar })}</span>
        </div>
        <div className="card stat">
          <span className="label" id="dmetro">
            {t('play.metronome')}
          </span>
          <button type="button" role="switch" aria-checked={metronomeOn} aria-labelledby="dmetro" className="stat-switch" onClick={toggleMetronome}>
            <SwitchTrack on={metronomeOn} />
            {t(metronomeOn ? 'play.on' : 'play.off')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tablet: the count card (its beats centred) and the combo card, between the staff and the pad. */
export function PlayCountRow({ count, combo }: { count: CountProps; combo: number }): JSX.Element {
  return (
    <div className="tplay-row">
      <div className="card tplay-count">
        <span className="label">{t(count.countIn ? 'play.countingIn' : 'play.count')}</span>
        {count.analog || <BeatRow beats={count.beats} active={count.beat.inBar} countIn={count.beat.countIn} label={count.label} />}
      </div>
      <div className="card tplay-combo">
        <span className="label">{t('play.comboTitle')}</span>
        <span className="stat-big">{t('play.comboValue', { count: combo })}</span>
      </div>
    </div>
  );
}
