import { useRegisterSW } from 'virtual:pwa-register/react';

export function useSwUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (!registration) return;
      // Verifica actualizações a cada hora enquanto o app está aberto
      setInterval(() => registration.update(), 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.warn('[SW] Falha ao registar service worker:', error);
    },
  });

  return { needRefresh, updateServiceWorker };
}
