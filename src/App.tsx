/** Routes and app-wide effects (theme, lang). */
import { lazy, Suspense, useEffect } from 'react';
import { setLocale, t } from './i18n';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { useRoute } from './ui/router';
import { Calibration } from './ui/screens/Calibration';
import { Home } from './ui/screens/Home';
import { PathScreen } from './ui/screens/Path';
import { Play } from './ui/screens/Play';
import { Results } from './ui/screens/Results';
import { SettingsScreen } from './ui/screens/Settings';
import { Setup } from './ui/screens/Setup';
import { StoreProvider, useStore } from './ui/store';

/** The notation test page: development builds only, so it is not shipped. */
const RenderDemo = import.meta.env.DEV ? lazy(() => import('./render/RenderDemo').then((m) => ({ default: m.RenderDemo }))) : null;

/** data-theme on <html> overrides the system scheme (the staff redraws when it changes). */
function useTheme(theme: 'system' | 'light' | 'dark'): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    // Browser chrome colour follows the forced theme too.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-forced]');
    if (theme === 'system') {
      meta?.remove();
    } else {
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.dataset.forced = '';
        document.head.appendChild(meta);
      }
      meta.content = theme === 'dark' ? '#101415' : '#eef1f0';
    }
  }, [theme]);
}

function Screens(): JSX.Element {
  const route = useRoute();
  const { state } = useStore();
  useTheme(state.prefs.theme);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);
  switch (route) {
    case '/path':
      return <PathScreen />;
    case '/setup':
      return <Setup />;
    case '/play':
      return <Play />;
    case '/results':
      return <Results />;
    case '/settings':
      return <SettingsScreen />;
    case '/calibrate':
      return <Calibration />;
    case '/dev/render':
      if (RenderDemo) {
        return (
          <Suspense fallback={null}>
            <RenderDemo />
          </Suspense>
        );
      }
      return <Home />;
    default:
      return <Home />;
  }
}

function Crash(): JSX.Element {
  return (
    <main className="crash">
      <h1 className="page-title">{t('error.title')}</h1>
      <p className="muted-text">{t('error.text')}</p>
      <button type="button" className="btn btn--accent" onClick={() => window.location.reload()}>
        {t('error.reload')}
      </button>
    </main>
  );
}

export function App(): JSX.Element {
  useEffect(() => setLocale('en'), []);
  return (
    <ErrorBoundary fallback={<Crash />}>
      <StoreProvider>
        <Screens />
      </StoreProvider>
    </ErrorBoundary>
  );
}
