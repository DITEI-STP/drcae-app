import { useEffect, useState } from 'react';

const KIOSK_STATE_KEY = 'drcae_kiosk_state';
const KIOSK_STATE_EVENT = 'drcae-kiosk-state';

function readStoredKioskState(): boolean | null {
  try {
    const raw = localStorage.getItem(KIOSK_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { locked?: unknown };
    return typeof parsed.locked === 'boolean' ? parsed.locked : null;
  } catch {
    return null;
  }
}

/**
 * Modo kiosque do dispositivo, tal como o shell nativo o reporta.
 *
 * `null` significa **desconhecido**, e não «destrancado»: um browser sem shell
 * nativo, ou um APK anterior a esta injecção, nunca dizem nada. Quem consome
 * isto deve exigir `false` explícito antes de oferecer qualquer coisa que
 * dependa de estar fora do kiosque — falhar para o lado seguro, porque
 * oferecer uma saída a um dispositivo trancado é o único erro aqui com
 * consequência real.
 *
 * A verdade continua a viver no nativo: `exitToBackground` recusa em kiosque
 * independentemente do que este valor disser.
 */
export function useKioskLocked(): boolean | null {
  const [locked, setLocked] = useState<boolean | null>(readStoredKioskState);

  useEffect(() => {
    const onState = (event: Event) => {
      const value = (event as CustomEvent).detail?.locked;
      setLocked(typeof value === 'boolean' ? value : null);
    };
    window.addEventListener(KIOSK_STATE_EVENT, onState);
    return () => window.removeEventListener(KIOSK_STATE_EVENT, onState);
  }, []);

  return locked;
}

/**
 * Pede ao shell nativo para pôr a aplicação em segundo plano.
 *
 * Devolve `false` quando não há shell (browser/PWA), quando o APK é anterior a
 * este método, ou quando o nativo recusa por estar em kiosque.
 */
export async function exitAppToBackground(): Promise<boolean> {
  const bridge = (window as unknown as {
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }).ReactNativeWebView;
  if (!bridge) return false;

  try {
    bridge.postMessage(JSON.stringify({ type: 'EXIT_TO_BACKGROUND' }));
    return true;
  } catch {
    return false;
  }
}
