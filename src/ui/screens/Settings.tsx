/**
 * Settings: language, sound, timing (calibrate, leniency), playing (input), display (theme, beat counter), about
 * (what's new, version, offline, reset).
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { Leniency } from '../../core/api';
import type { Prefs } from '../../game/storage';
import { formatShortDate, getLocale, LOCALES, t } from '../../i18n';
import { applyAudioPrefs } from '../audio';
import { AppShell } from '../components/AppShell';
import { AnalogMetronome, BeatRow } from '../components/Bits';
import { Segmented, SwitchTrack } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle, useReducedMotion } from '../hooks';
import { RELEASES } from '../lib/changelog';
import { signedMs } from '../lib/format';
import { Link } from '../router';
import { useStore } from '../store';
import pkg from '../../../package.json';

type VolKey = keyof Prefs['volumes'];

export function SettingsScreen(): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const [confirm, setConfirm] = useState(false);
  const [wiped, setWiped] = useState(false);
  useDocTitle(t('app.docTitle', { page: t('settings.title') }));
  const prefs = state.prefs;
  const set = (patch: Partial<Prefs>): void => dispatch({ type: 'prefs', patch });

  // Sound changes apply to the engine right away (a playing Listen or the next start).
  useEffect(() => {
    try {
      applyAudioPrefs(prefs);
    } catch (e) {
      console.error(e);
    }
  }, [prefs]);

  const setVol = (k: VolKey, v: number, sw?: 'metronomeOn' | 'tapSoundOn'): void =>
    set({ volumes: { ...prefs.volumes, [k]: v / 100 }, ...(sw ? { [sw]: true } : {}) });

  const offline = useOfflineReady();

  return (
    <AppShell bp={bp} active="/settings">
      <div className="page settings no-scrollbar">
        <div className="settings-head">
          <h1 className="page-title">{t('settings.title')}</h1>
        </div>
        <div className="settings-body">
          <Section id="language" title={t('settings.language')}>
            <LanguageRow onChange={(code) => set({ language: code })} />
          </Section>

          <Section id="sound" title={t('settings.sound')}>
            <VolumeRow label={t('settings.metronome')} aria={t('settings.metronomeVolume')} value={prefs.volumes.metronome} on={prefs.metronomeOn}
              onChange={(v) => setVol('metronome', v, 'metronomeOn')} onToggle={() => set({ metronomeOn: !prefs.metronomeOn })} />
            <VolumeRow label={t('settings.playback')} aria={t('settings.playbackVolume')} value={prefs.volumes.rhythm} on onChange={(v) => setVol('rhythm', v)} />
            <VolumeRow label={t('settings.tapSound')} aria={t('settings.tapVolume')} value={prefs.volumes.tap} on={prefs.tapSoundOn}
              onChange={(v) => setVol('tap', v, 'tapSoundOn')} onToggle={() => set({ tapSoundOn: !prefs.tapSoundOn })} />
          </Section>

          <Section id="timing" title={t('settings.timing')}>
            <Link to="/calibrate" className="row-link">
              <span className="row-link-text">
                <b>{t('settings.calibrate')}</b>
                <span className="row-sub">
                  {prefs.calibratedAt ? (
                    <>
                      <span className="mono-accent">{signedMs(prefs.calibrationMs)}</span> · {t('settings.calibrated', { date: formatShortDate(prefs.calibratedAt) })}
                    </>
                  ) : (
                    t('settings.notCalibrated')
                  )}
                </span>
              </span>
              <Icon name="chevron" size={20} className="row-chevron" />
            </Link>
            <SegRow label={t('settings.leniency')} group={t('settings.leniencyGroup')} value={prefs.leniency} onChange={(v: Leniency) => set({ leniency: v })}
              hint={t({ strict: 'settings.hintStrict', normal: 'settings.hintNormal', relaxed: 'settings.hintRelaxed' }[prefs.leniency])}
              options={[
                { value: 'strict', label: t('settings.strict') },
                { value: 'normal', label: t('settings.normal') },
                { value: 'relaxed', label: t('settings.relaxed') },
              ]} />
          </Section>

          <Section id="playing" title={t('settings.playing')}>
            {/* A choice here replaces whatever the Setup's early-hold switch would put back (holdEarly). */}
            <SegRow label={t('settings.input')} group={t('settings.inputGroup')} value={prefs.holdMode} onChange={(v: Prefs['holdMode']) => set({ holdMode: v, holdEarly: null })}
              hint={t(prefs.holdMode === 'hold' ? 'settings.hintHold' : 'settings.hintTap')}
              options={[
                { value: 'hold', label: t('settings.inputHold') },
                { value: 'tap', label: t('settings.inputTap') },
              ]} first />
          </Section>

          <Section id="display" title={t('settings.display')}>
            <SegRow label={t('settings.theme')} group={t('settings.themeGroup')} value={prefs.theme} onChange={(v: Prefs['theme']) => set({ theme: v })}
              hint={t({ system: 'settings.hintThemeSystem', light: 'settings.hintThemeLight', dark: 'settings.hintThemeDark' }[prefs.theme])}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]} first />
            <SegRow label={t('settings.metronomeLook')} group={t('settings.metronomeLookGroup')} value={prefs.metronomeLook}
              onChange={(v: Prefs['metronomeLook']) => set({ metronomeLook: v })}
              hint={t(prefs.metronomeLook === 'analog' ? 'settings.hintAnalog' : 'settings.hintDigital')}
              options={[
                { value: 'digital', label: t('settings.lookDigital') },
                { value: 'analog', label: t('settings.lookAnalog') },
              ]}>
              <LookPreview look={prefs.metronomeLook} />
            </SegRow>
          </Section>

          <Section id="about" title={t('settings.about')}>
            <Link to="/changelog" className="row-link">
              <span className="row-link-text">
                <b>{t('changelog.title')}</b>
                <span className="row-sub">{t('common.join', { a: t(RELEASES[0].title), b: formatShortDate(RELEASES[0].date) })}</span>
              </span>
              <Icon name="chevron" size={20} className="row-chevron" />
            </Link>
            <div className="about-row">
              <span className="about-version">
                <b>{t('settings.version')}</b>
                <span className="mono-muted">{pkg.version}</span>
                {import.meta.env.VITE_DEPLOY_BRANCH && (
                  <span className="mono-muted about-branch" title={t('settings.branch')}>{import.meta.env.VITE_DEPLOY_BRANCH}</span>
                )}
              </span>
              <span className={'offline' + (offline ? '' : ' is-off')}>
                {offline && <Icon name="check" size={16} strokeWidth={2.6} className="tone-good" />}
                {t(offline ? 'settings.offline' : 'settings.online')}
              </span>
            </div>
            <div className="reset-row">
              {!confirm && !wiped && (
                <button type="button" className="reset-btn" onClick={() => setConfirm(true)}>
                  <Icon name="trash" size={18} />
                  <span>{t('settings.reset')}</span>
                </button>
              )}
              {confirm && (
                <div className="reset-confirm m-in" role="alertdialog" aria-labelledby="reset-q" aria-describedby="reset-d">
                  <p className="reset-text">
                    <b id="reset-q">{t('settings.resetQuestion')}</b>
                    <span id="reset-d">{t('settings.resetDetail')}</span>
                  </p>
                  <button type="button" className="small-btn" autoFocus onClick={() => setConfirm(false)}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" className="small-btn small-btn--danger" onClick={() => {
                    dispatch({ type: 'resetProgress' });
                    setConfirm(false);
                    setWiped(true);
                  }}>
                    {t('settings.resetConfirm')}
                  </button>
                </div>
              )}
              {wiped && (
                <div className="reset-done m-in" role="status">
                  <Icon name="check" size={18} strokeWidth={2.6} className="tone-good" />
                  {t('settings.resetDone')}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): JSX.Element {
  return (
    <section aria-labelledby={'h-' + id} className="set-section">
      <h2 id={'h-' + id} className="label">
        {title}
      </h2>
      <div className="set-card">{children}</div>
    </section>
  );
}

interface VolumeRowProps {
  label: string;
  aria: string;
  value: number;
  on: boolean;
  onChange(v: number): void;
  onToggle?(): void;
}

function VolumeRow({ label, aria, value, on, onChange, onToggle }: VolumeRowProps): JSX.Element {
  const pct = Math.round(value * 100);
  return (
    <div className="vol-row">
      <b className="vol-label">{label}</b>
      <div className={'vol-slider m-ease' + (on ? '' : ' is-dim')}>
        <input type="range" min={0} max={100} step={5} value={pct} aria-label={aria} aria-valuetext={t('common.percent', { value: pct })}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="vol-value">{t('common.percent', { value: pct })}</span>
      </div>
      {onToggle ? (
        <button type="button" role="switch" aria-checked={on} aria-label={label} className="vol-switch" onClick={onToggle}>
          <SwitchTrack on={on} />
        </button>
      ) : (
        <span aria-hidden="true" className="vol-switch" />
      )}
    </div>
  );
}

interface SegRowProps<T extends string> {
  label: string;
  group: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
  hint: string;
  first?: boolean;
  /** See Segmented: the choice to slide in from on mount. */
  from?: T;
  /** Shown under the hint, e.g. a preview of the choice. */
  children?: ReactNode;
}

function SegRow<T extends string>({ label, group, value, options, onChange, hint, first, from, children }: SegRowProps<T>): JSX.Element {
  return (
    <div className={'seg-row' + (first ? ' is-first' : '')}>
      <div className="seg-row-line">
        <b className="seg-row-label">{label}</b>
        <Segmented label={group} value={value} options={options} onChange={onChange} from={from} className="seg--settings" />
      </div>
      <span aria-live="polite" className="row-sub">
        {hint}
      </span>
      {children}
    </div>
  );
}

/** Up to three languages fit the segmented control; with more, the row becomes a drop-down list. */
const SEGMENTED_LOCALES = 3;

/**
 * The language the row last showed. A new language remounts the screens (App.tsx), so the control starts over; this
 * lets its thumb slide in from the old language like the other rows.
 */
let shownLocale: string | undefined;

/** Settings → Language: every catalog in src/i18n, each named in its own language. Shows the language in use. */
function LanguageRow({ onChange }: { onChange(code: string): void }): JSX.Element {
  const value = getLocale();
  useEffect(() => {
    shownLocale = value;
  }, [value]);
  if (LOCALES.length <= SEGMENTED_LOCALES) {
    return (
      <SegRow label={t('settings.language')} group={t('settings.languageGroup')} value={value} onChange={onChange} hint={t('settings.hintLanguage')}
        options={LOCALES.map((l) => ({ value: l.code, label: l.name }))} from={shownLocale} first />
    );
  }
  return (
    <div className="seg-row is-first">
      <div className="seg-row-line">
        <label htmlFor="language" className="seg-row-label">
          <b>{t('settings.language')}</b>
        </label>
        <select id="language" className="lang-select" value={value} onChange={(e) => onChange(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <span className="row-sub">{t('settings.hintLanguage')}</span>
    </div>
  );
}

const PREVIEW_BPM = 80;
const PREVIEW_BEATS = 4;

/** Beat counter: the chosen look ticking silently in 4/4 at 80 BPM, as it will look on Play. */
function LookPreview({ look }: { look: Prefs['metronomeLook'] }): JSX.Element {
  const still = useReducedMotion();
  const [at, setAt] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      setAt(((now - t0) / 1000) * (PREVIEW_BPM / 60));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const active = Math.floor(at + 1e-6) % PREVIEW_BEATS;
  return (
    <div className="look-preview" aria-hidden="true">
      {look === 'analog' ? (
        <AnalogMetronome beats={PREVIEW_BEATS} active={active} at={at} tempo={PREVIEW_BPM} label="" still={still} />
      ) : (
        <BeatRow beats={PREVIEW_BEATS} active={active} label="" />
      )}
      <span className="look-preview-tempo">
        <span className="music">𝅘𝅥</span> {t('play.beatEquals', { bpm: PREVIEW_BPM })}
      </span>
    </div>
  );
}

/** True once a service worker controls the page (the app works offline); updates when it takes over. */
function useOfflineReady(): boolean {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  const [ready, setReady] = useState(() => !!sw?.controller);
  useEffect(() => {
    if (!sw) return;
    const update = (): void => setReady(!!sw.controller);
    sw.addEventListener('controllerchange', update);
    return () => sw.removeEventListener('controllerchange', update);
  }, [sw]);
  return ready;
}
