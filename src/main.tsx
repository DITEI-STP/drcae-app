import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './hooks/useTheme.tsx';
import { addAppLog } from './lib/appLogs.ts';

window.addEventListener('error', (event) => {
  addAppLog('error', 'runtime', event.message, event.error || {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  addAppLog('error', 'runtime', 'Promise rejeitada sem tratamento', event.reason);
});

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
  onRegisterError(error) {
    console.warn('[SW] Falha ao registar service worker:', error);
    addAppLog('warn', 'service-worker', 'Falha ao registar service worker', error);
  },
});

// Aplicar tema guardado antes do render para evitar flash
const savedTheme = localStorage.getItem('drcae_theme') || 'auto';
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
} else {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', systemDark);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
