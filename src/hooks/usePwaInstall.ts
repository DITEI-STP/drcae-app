import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capturado fora do ciclo React para não perder o evento antes de qualquer componente montar
let _deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new CustomEvent('pwa-install-available'));
});

const DISMISSED_KEY = 'drcae:pwa-install-dismissed';

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(
    !!_deferredPrompt && !localStorage.getItem(DISMISSED_KEY),
  );
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const onAvailable = () => {
      if (!localStorage.getItem(DISMISSED_KEY)) setCanInstall(true);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
    };
    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!_deferredPrompt) return;
    await _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      _deferredPrompt = null;
      setCanInstall(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setCanInstall(false);
  };

  return { canInstall, isInstalled, install, dismiss };
}
