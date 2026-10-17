/** The How to play and Pause sheets (phone / tablet) and dialogs (desktop). */
import { t } from '../../i18n';
import { Icon } from '../components/Icon';

export function HowToContent({ eyebrow, desktop, onDone }: { eyebrow: string; desktop: boolean; onDone(): void }): JSX.Element {
  return (
    <>
      <div className="sheet-head">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id="howto" className="sheet-title">
          {t('howto.title')}
        </h2>
      </div>
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
      <ol className="steps">
        {[1, 2, 3].map((n) => (
          <li key={n}>
            <span className="step-n" aria-hidden="true">
              {n}
            </span>
            <span>{t('howto.step' + n)}</span>
          </li>
        ))}
      </ol>
      <span className="sheet-note">{t(desktop ? 'howto.desktop' : 'howto.computer')}</span>
      <button type="button" className="btn btn--accent sheet-cta" onClick={onDone} aria-keyshortcuts={desktop ? 'Escape' : undefined}>
        {t('howto.gotIt')}
        {desktop && <kbd className="kbd kbd--on-fill">{t('pause.esc')}</kbd>}
      </button>
    </>
  );
}

interface PauseProps {
  context: string;
  desktop: boolean;
  lesson: boolean;
  onResume(): void;
  onRestart(): void;
  onHelp(): void;
  onSettings(): void;
  onQuit(): void;
}

export function PauseContent(p: PauseProps): JSX.Element {
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
        <span>{t('pause.note')}</span>
      </div>
      <button type="button" className="btn btn--accent sheet-cta" onClick={p.onResume} aria-keyshortcuts={p.desktop ? 'Escape' : undefined}>
        <Icon name="play" size={18} />
        {t('pause.resume')}
        {p.desktop && <kbd className="kbd kbd--on-fill">{t('pause.esc')}</kbd>}
      </button>
    </>
  );
}
