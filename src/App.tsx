/** Routes and app-wide effects (theme, language). */
import { lazy, Suspense, useEffect } from 'react';
import { resolveLocale, setLocale, t } from './i18n';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { useRoute } from './ui/router';
import { Calibration } from './ui/screens/Calibration';
import { Changelog } from './ui/screens/Changelog';
import { Home } from './ui/screens/Home';
import { findChapter } from './ui/learn/chapters';
import { LearnChapter, LearnHub } from './ui/screens/Learn';
import { NotesDone } from './ui/screens/notes/NotesDone';
import { NotesKey } from './ui/screens/notes/NotesKey';
import { NotesPlay } from './ui/screens/notes/NotesPlay';
import { NotesSetup } from './ui/screens/notes/NotesSetup';
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
  const { state } = useStore();
  useTheme(state.prefs.theme);
  // t() reads module state: switch the catalog before the screens render, and remount them on a change so text kept
  // in state or memos is redone in the new language.
  const locale = resolveLocale(state.prefs.language);
  setLocale(locale);
  return <Route key={locale} />;
}

function Route(): JSX.Element {
  const route = useRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);
  if (route.startsWith('/learn/')) {
    const chapter = findChapter(Number(route.slice('/learn/'.length)));
    return chapter ? <LearnChapter key={chapter.n} chapter={chapter} /> : <LearnHub />;
  }
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
    case '/changelog':
      return <Changelog />;
    case '/notes':
      return <NotesSetup />;
    case '/notes/key':
      return <NotesKey />;
    case '/notes/play':
      return <NotesPlay />;
    case '/notes/done':
      return <NotesDone />;
    case '/learn':
      return <LearnHub />;
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
  return (
    <ErrorBoundary fallback={<Crash />}>
      <StoreProvider>
        <Screens />
      </StoreProvider>
    </ErrorBoundary>
  );
}
