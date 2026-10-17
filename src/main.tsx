import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setLocale } from './i18n';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

setLocale('en');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
