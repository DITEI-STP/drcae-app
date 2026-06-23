import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Aplicar tema guardado antes do render para evitar flash
const savedTheme = localStorage.getItem('drcae_theme') || 'light';
document.documentElement.classList.toggle('dark', savedTheme === 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
