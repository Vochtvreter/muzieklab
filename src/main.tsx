import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadPrefs } from './game/storage';
import { resolveLocale, setLocale } from './i18n';
// Fonts are bundled (no Google Fonts request), so they work offline: Latin and Latin Extended (for Dutch and other
// European languages such as Dutch), plus the music symbols the chips and pad use.
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-ext-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-ext-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-ext-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/figtree/latin-ext-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-ext-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-ext-600.css';
import '@fontsource/unbounded/latin-500.css';
import '@fontsource/unbounded/latin-ext-500.css';
import '@fontsource/unbounded/latin-600.css';
import '@fontsource/unbounded/latin-ext-600.css';
import '@fontsource/unbounded/latin-700.css';
import '@fontsource/unbounded/latin-ext-700.css';
import '@fontsource/noto-music/music-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/notes.css';
import './styles/scales.css';

// The saved language, or the device's: set before the first paint so nothing flashes in English.
setLocale(resolveLocale(loadPrefs().language));

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
