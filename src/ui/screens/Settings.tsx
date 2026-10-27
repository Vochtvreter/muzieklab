/**
 * Settings: account (when the API answers, or an account is cached), language, sound, timing (calibrate, leniency),
 * playing (input), display (theme, beat counter), about (what's new, privacy, version, offline, reset). Phone: one
 * column. Tablet and desktop: the sections listed on the left and the cards in two columns (App design canvas,
 * SettingsTablet and SettingsDesktop).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Leniency } from '../../core/api';
import type { Prefs } from '../../game/storage';
import { formatShortDate, getLocale, LOCALES, t } from '../../i18n';
import { applyAudioPrefs } from '../audio';
import { AppShell } from '../components/AppShell';
import { AnalogMetronome, BeatRow } from '../components/Bits';
import { Segmented, SwitchTrack } from '../components/Controls';
import { Icon, type IconName } from '../components/Icon';
import { RowLink, Section, WideSections } from '../components/Rows';
import { useBreakpoint, useDocTitle, useReducedMotion } from '../hooks';
import { announce } from '../lib/announce';
import { RELEASES } from '../lib/changelog';
import { signedMs } from '../lib/format';
import { Link } from '../router';
import { useStore } from '../store';
import { progressSync } from '../sync';
import { AccountSection } from './account/AccountSection';
import pkg from '../../../package.json';

type VolKey = keyof Prefs['volumes'];

export function SettingsScreen(): JSX.Element {
  const { state, dispatch } = useStore();
  const bp = useBreakpoint();
  const [confirm, setConfirm] = useState(false);
  const [wiped, setWiped] = useState(false);
  const resetBtn = useRef<HTMLButtonElement>(null);
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
  const cancelReset = (): void => {
    setConfirm(false);
    // Back to the row button that opened it, as in every confirm (ConfirmAction).
    requestAnimationFrame(() => resetBtn.current?.focus());
  };

  const wide = bp !== 'phone';
  // The Account section shows once the API answered, or with a cached account (AccountSection); the list names it then.
  const hasAccount = !!state.account.me || state.account.api === 'reachable';
  const language = (
    <Section id="language" title={t('settings.language')}>
      <LanguageRow onChange={(code) => set({ language: code })} />
    </Section>
  );
  const sound = (
    <Section id="sound" title={t('settings.sound')}>
      <VolumeRow label={t('settings.metronome')} aria={t('settings.metronomeVolume')} value={prefs.volumes.metronome} on={prefs.metronomeOn}
        onChange={(v) => setVol('metronome', v, 'metronomeOn')} onToggle={() => set({ metronomeOn: !prefs.metronomeOn })} />
      <VolumeRow label={t('settings.playback')} aria={t('settings.playbackVolume')} value={prefs.volumes.rhythm} on onChange={(v) => setVol('rhythm', v)} />
      <VolumeRow label={t('settings.tapSound')} aria={t('settings.tapVolume')} value={prefs.volumes.tap} on={prefs.tapSoundOn}
        onChange={(v) => setVol('tap', v, 'tapSoundOn')} onToggle={() => set({ tapSoundOn: !prefs.tapSoundOn })} />
    </Section>
  );
  const timing = (
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
  );
  const playing = (
    <Section id="playing" title={t('settings.playing')}>
      {/* A choice here replaces whatever the Setup's early-hold switch would put back (holdEarly). */}
      <SegRow label={t('settings.input')} group={t('settings.inputGroup')} value={prefs.holdMode} onChange={(v: Prefs['holdMode']) => set({ holdMode: v, holdEarly: null })}
        hint={t(prefs.holdMode === 'hold' ? 'settings.hintHold' : 'settings.hintTap')}
        options={[
          { value: 'hold', label: t('settings.inputHold') },
          { value: 'tap', label: t('settings.inputTap') },
        ]} first />
    </Section>
  );
  const display = (
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
  );
  const about = (
    <Section id="about" title={t('settings.about')} focusable>
      <Link to="/changelog" className="row-link">
        <span className="row-link-text">
          <b>{t('changelog.title')}</b>
          <span className="row-sub">{t('common.join', { a: t(RELEASES[0].title), b: formatShortDate(RELEASES[0].date) })}</span>
        </span>
        <Icon name="chevron" size={20} className="row-chevron" />
      </Link>
      <RowLink to="/privacy" title={t('settings.privacy')} sub={t('settings.privacySub')} />
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
          <button type="button" ref={resetBtn} className="reset-btn" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={18} />
            <span>{t('settings.reset')}</span>
          </button>
        )}
        {confirm && (
          <div className="reset-confirm m-in" role="alertdialog" aria-labelledby="reset-q" aria-describedby="reset-d" onKeyDown={(e) => {
            if (e.key === 'Escape') cancelReset();
          }}>
            <p className="reset-text">
              <b id="reset-q">{t('settings.resetQuestion')}</b>
              <span id="reset-d">{t(state.account.me ? 'settings.resetDetailAccount' : 'settings.resetDetail')}</span>
            </p>
            <div className="confirm-actions">
              <button type="button" className="small-btn" autoFocus onClick={cancelReset}>
                {t('common.cancel')}
              </button>
              <button type="button" className="small-btn small-btn--danger" onClick={() => {
                dispatch({ type: 'resetProgress' });
                // Signed in, the account's progress is reset too, so another device does not bring it back.
                if (state.account.me) progressSync()?.reset();
                setConfirm(false);
                setWiped(true);
                // The button that was pressed is gone, and so is the row button: the line under it is read out
                // (ui/lib/announce.ts), and the focus goes to the section's heading instead of the page.
                announce(t('settings.resetDone'));
                requestAnimationFrame(() => document.getElementById('h-about')?.focus({ preventScroll: true }));
              }}>
                {t('settings.resetConfirm')}
              </button>
            </div>
          </div>
        )}
        {wiped && (
          <div className="reset-done m-in">
            <Icon name="check" size={18} strokeWidth={2.6} className="tone-good" />
            {t('settings.resetDone')}
          </div>
        )}
      </div>
    </Section>
  );

  if (wide) {
    return (
      <AppShell bp={bp} active="/settings" fill>
        <WideSections.Provider value>
          <div className="page settings-wide no-scrollbar">
            <aside className="set-side">
              <h1 className="page-title">{t('settings.title')}</h1>
              <SectionNav account={hasAccount} />
            </aside>
            <div className="set-col">
              <AccountSection />
              {language}
              {sound}
              {timing}
            </div>
            <div className="set-col">
              {playing}
              {display}
              {about}
            </div>
          </div>
        </WideSections.Provider>
      </AppShell>
    );
  }

  return (
    <AppShell bp={bp} active="/settings">
      <div className="page settings no-scrollbar">
        <div className="settings-head">
          <h1 className="page-title">{t('settings.title')}</h1>
        </div>
        <div className="settings-body">
          <AccountSection />
          {language}
          {sound}
          {timing}
          {playing}
          {display}
          {about}
        </div>
      </div>
    </AppShell>
  );
}

const SECTIONS: { id: string; icon: IconName }[] = [
  { id: 'account', icon: 'person' },
  { id: 'language', icon: 'globe' },
  { id: 'sound', icon: 'speaker' },
  { id: 'timing', icon: 'stopwatch' },
  { id: 'playing', icon: 'pad' },
  { id: 'display', icon: 'contrast' },
  { id: 'about', icon: 'info' },
];
const NAV_PAD = 6;
const NAV_ITEM = 46;
const NAV_GAP = 4;

/**
 * Tablet and desktop: the sections listed on the left (App design canvas, SettingsTablet and SettingsDesktop). A pick
 * brings its card into view and moves focus to it; the highlight slides there like any pick-one group (DESIGN.md §9).
 */
function SectionNav({ account }: { account: boolean }): JSX.Element {
  const still = useReducedMotion();
  const sections = account ? SECTIONS : SECTIONS.filter((x) => x.id !== 'account');
  // The picked section by its id: Account can come into the list later (once the API answers), moving the others down.
  // Until one is picked the first is current, so that is Account once it is there.
  const [picked, setPicked] = useState<string | null>(null);
  const at = picked ? Math.max(0, sections.findIndex((x) => x.id === picked)) : 0;
  const move = useRef({ at, n: 0, fy: '0px' });
  const m = move.current;
  if (m.at !== at) {
    m.fy = `calc(${m.at - at} * (100% + ${NAV_GAP}px))`;
    m.n += 1;
    m.at = at;
  }
  const blob: CSSProperties = { left: NAV_PAD, right: NAV_PAD, top: `calc(${NAV_PAD}px + ${at} * ${NAV_ITEM + NAV_GAP}px)`, height: NAV_ITEM };
  const skin = {
    '--fx': '0px',
    '--fy': m.fy,
    '--sw': 1,
    '--sh': 1,
    animation: m.n ? `${m.n % 2 ? 'm-slide-a' : 'm-slide-b'} .26s cubic-bezier(.2,0,0,1)` : undefined,
  } as CSSProperties;
  const pick = (id: string): void => {
    setPicked(id);
    const el = document.getElementById('set-' + id);
    el?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
  };
  return (
    <nav aria-label={t('settings.sections')} className="set-nav" style={{ padding: NAV_PAD, gap: NAV_GAP }}>
      <div aria-hidden="true" className="m-goo">
        <div className="m-blob" style={blob}>
          <div className="m-skin set-nav-thumb" style={skin} />
        </div>
      </div>
      {sections.map((sec, i) => (
        <button key={sec.id} type="button" aria-current={i === at ? 'true' : undefined} className={'set-nav-item' + (i === at ? ' is-current' : '')}
          style={{ height: NAV_ITEM }} onClick={() => pick(sec.id)}>
          <Icon name={sec.icon} size={20} />
          {t('settings.' + sec.id)}
        </button>
      ))}
    </nav>
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
  options: { value: T; label: string; lang?: string }[];
  onChange(v: T): void;
  hint: string;
  first?: boolean;
  /** See Segmented: the choice to slide in from on mount. */
  from?: T;
  /** See Segmented: focus the chosen button on mount. */
  autoFocus?: boolean;
  /** Shown under the hint, e.g. a preview of the choice. */
  children?: ReactNode;
}

function SegRow<T extends string>({ label, group, value, options, onChange, hint, first, from, autoFocus, children }: SegRowProps<T>): JSX.Element {
  return (
    <div className={'seg-row' + (first ? ' is-first' : '')}>
      <div className="seg-row-line">
        <b className="seg-row-label">{label}</b>
        <Segmented label={group} value={value} options={options} onChange={onChange} from={from} autoFocus={autoFocus} className="seg--settings" />
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

/**
 * Set when this row switched the language. The remount takes the focused button away, so the new control gets the
 * focus back; after a language that changes elsewhere (another tab, the account), the heading takes it (App.tsx).
 */
let refocusLanguage = false;

/** Settings → Language: every catalog in src/i18n, each named in its own language. Shows the language in use. */
function LanguageRow({ onChange }: { onChange(code: string): void }): JSX.Element {
  const value = getLocale();
  const refocus = refocusLanguage;
  useEffect(() => {
    shownLocale = value;
  }, [value]);
  useEffect(() => {
    refocusLanguage = false;
  }, []);
  const pick = (code: string): void => {
    // The language in use, picked again, remounts nothing: the flag would wait for the next visit to Settings.
    if (code !== value) refocusLanguage = true;
    onChange(code);
  };
  if (LOCALES.length <= SEGMENTED_LOCALES) {
    return (
      <SegRow label={t('settings.language')} group={t('settings.languageGroup')} value={value} onChange={pick} hint={t('settings.hintLanguage')}
        options={LOCALES.map((l) => ({ value: l.code, label: l.name, lang: l.code }))} from={shownLocale} autoFocus={refocus} first />
    );
  }
  return (
    <div className="seg-row is-first">
      <div className="seg-row-line">
        <label htmlFor="language" className="seg-row-label">
          <b>{t('settings.language')}</b>
        </label>
        <select id="language" className="lang-select" value={value} autoFocus={refocus} onChange={(e) => pick(e.target.value)}>
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
