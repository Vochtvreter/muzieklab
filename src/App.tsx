/** Routes and app-wide effects (theme, language). */
import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import type { SkillId } from './game/storage';
import { resolveLocale, setLocale, t } from './i18n';
import { Announcer } from './ui/components/Announcer';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { FeedbackTool } from './ui/feedback/FeedbackTool';
import { focusHeading, focusLost } from './ui/lib/screenFocus';
import { routeParam, useRoute } from './ui/router';
import { AccountScreen } from './ui/screens/account/Account';
import { AcceptInvite, NewPassword } from './ui/screens/account/LinkPassword';
import { Privacy } from './ui/screens/account/Privacy';
import { SignIn } from './ui/screens/account/SignIn';
import { AdminAccount } from './ui/screens/admin/AdminAccount';
import { AdminAccounts } from './ui/screens/admin/AdminAccounts';
import { AdminClosures } from './ui/screens/admin/AdminClosures';
import { AdminFeedback } from './ui/screens/admin/AdminFeedback';
import { AdminFeedbackReport } from './ui/screens/admin/AdminFeedbackReport';
import { AdminInvite } from './ui/screens/admin/AdminInvite';
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
import { ProgressScreen } from './ui/screens/progress/Progress';
import { SkillDetail } from './ui/screens/progress/SkillDetail';
import { Skills } from './ui/screens/progress/Skills';
import { Play } from './ui/screens/Play';
import { Results } from './ui/screens/Results';
import { ScalesDone } from './ui/screens/scales/ScalesDone';
import { ScalesHub } from './ui/screens/scales/ScalesHub';
import { ScalesKey } from './ui/screens/scales/ScalesKey';
import { ScalesPlay } from './ui/screens/scales/ScalesPlay';
import { ScalesSetup } from './ui/screens/scales/ScalesSetup';
import { SettingsScreen } from './ui/screens/Settings';
import { Setup } from './ui/screens/Setup';
import { StoreProvider, useStore } from './ui/store';
import { useProgressSync } from './ui/sync';

/** The notation test page: development builds only, so it is not shipped. */
const RenderDemo = import.meta.env.DEV ? lazy(() => import('./render/RenderDemo').then((m) => ({ default: m.RenderDemo }))) : null;

/** The test site names the branch it was built from (deploy-test.yml), so a tester knows what they are trying. */
const BRANCH = import.meta.env.VITE_DEPLOY_BRANCH;

/**
 * data-theme on <html> overrides the system scheme (the staff redraws when it changes). A layout effect, so it is set
 * before the screens paint, not a frame after them in the device's theme; index.html sets it before the app loads.
 */
function useTheme(theme: 'system' | 'light' | 'dark'): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    // Browser chrome colour follows the forced theme too: the browser takes the first theme-color meta that matches, and
    // one of index.html's two always matches the device, so the forced one goes first (index.html may have added it).
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-forced]');
    if (theme === 'system') {
      meta?.remove();
    } else {
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.dataset.forced = '';
        document.head.insertBefore(meta, document.querySelector('meta[name="theme-color"]'));
      }
      meta.content = theme === 'dark' ? '#101415' : '#eef1f0';
    }
  }, [theme]);
}

function Screens(): JSX.Element {
  const { state } = useStore();
  useTheme(state.prefs.theme);
  // Progress on the account, while someone is signed in (BACKEND-PLAN.md §6).
  useProgressSync();
  // t() reads module state: switch the catalog before the screens render, and remount them on a change so text kept
  // in state or memos is redone in the new language.
  const locale = resolveLocale(state.prefs.language);
  setLocale(locale);
  // The feedback tool sits over every screen, in feedback mode only (docs/FEEDBACK-LOOP.md).
  return (
    <>
      <Route key={locale} />
      <FeedbackTool />
    </>
  );
}

function Route(): JSX.Element {
  const route = useRoute();
  // A new screen puts focus on its heading: the control that led there went with the old screen, so focus would fall
  // to the page and a screen reader would hear nothing of the new one (Results after a run). Not on the first screen,
  // whose page load is read out, nor when the new screen took focus itself (a field, a sheet).
  const shown = useRef(route);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (shown.current === route) return;
    shown.current = route;
    if (focusLost()) focusHeading();
  }, [route]);
  if (route.startsWith('/learn/')) {
    const chapter = findChapter(Number(route.slice('/learn/'.length)));
    return chapter ? <LearnChapter key={chapter.n} chapter={chapter} /> : <LearnHub />;
  }
  // Routes with a token or an id (the router has checked its form): a new one is a new screen.
  const invite = routeParam(route, '/invite/');
  if (invite) return <AcceptInvite key={invite} token={invite} />;
  const reset = routeParam(route, '/reset/');
  if (reset) return <NewPassword key={reset} token={reset} />;
  const accountId = routeParam(route, '/admin/account/');
  if (accountId) return <AdminAccount key={accountId} id={accountId} />;
  const reportId = routeParam(route, '/admin/feedback/');
  if (reportId) return <AdminFeedbackReport key={reportId} id={reportId} />;
  const skill = routeParam(route, '/progress/skills/');
  if (skill) return <SkillDetail key={skill} skill={skill as SkillId} />;
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
    case '/scales':
      return <ScalesHub />;
    case '/scales/setup':
      return <ScalesSetup />;
    case '/scales/key':
      return <ScalesKey />;
    case '/scales/play':
      return <ScalesPlay />;
    case '/scales/done':
      return <ScalesDone />;
    case '/learn':
      return <LearnHub />;
    case '/progress':
      return <ProgressScreen />;
    case '/progress/skills':
      return <Skills />;
    case '/signin':
      return <SignIn />;
    case '/account':
      return <AccountScreen />;
    case '/privacy':
      return <Privacy />;
    case '/admin':
      return <AdminAccounts />;
    case '/admin/invite':
      return <AdminInvite />;
    case '/admin/deleted':
      return <AdminClosures />;
    case '/admin/feedback':
      return <AdminFeedback />;
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
      {/* Screen-reader announcements (ui/lib/announce.ts): outside the screens, so it is there before any text. */}
      <Announcer />
      {BRANCH && (
        <div className="branch-badge">{BRANCH}</div>
      )}
    </ErrorBoundary>
  );
}
