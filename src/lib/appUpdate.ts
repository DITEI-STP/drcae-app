// Actualização do bundle web (drcae-app), dentro e fora do shell nativo.
//
// O service worker está registado em modo `autoUpdate`: quando uma versão nova
// é instalada, o workbox activa-a e recarrega a página sozinho. O que faltava
// era *procurar* a versão nova com frequência útil — o kiosque nunca fecha a
// página, pelo que sem estes gatilhos o dispositivo podia ficar semanas com o
// bundle antigo. Aqui centralizamos:
//   • verificação periódica, ao voltar a ficar visível e ao recuperar rede;
//   • verificação manual (ecrã de definições);
//   • delegação ao shell nativo quando não há service worker (origem sem
//     HTTPS, por exemplo) — só o drcae-webview consegue então limpar a cache
//     HTTP e recarregar a app.
import { addAppLog } from './appLogs';

const AUTO_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const MIN_CHECK_GAP_MS = 30 * 1000;

export type AppUpdateResult =
  | 'update-found'   // versão nova a instalar — a app recarrega sozinha
  | 'up-to-date'
  | 'offline'
  | 'unsupported';   // sem service worker e fora do shell nativo

let swRegistration: ServiceWorkerRegistration | null = null;
let lastCheckAt = 0;

export function isNativeWebview(): boolean {
  return /DrcaeWebview\//i.test(navigator.userAgent);
}

export function setUpdateRegistration(registration: ServiceWorkerRegistration): void {
  swRegistration = registration;
}

function requestNativeRelaunch(): boolean {
  const bridge = (window as any).ReactNativeWebView;
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify({ type: 'APP_CHECK_UPDATE' }));
  return true;
}

/**
 * Procura uma versão nova do bundle. `manual` marca os pedidos explícitos do
 * utilizador: ignoram o intervalo mínimo entre verificações e, quando não há
 * service worker, pedem ao shell nativo para limpar a cache e recarregar.
 */
export async function checkForAppUpdate(manual = false): Promise<AppUpdateResult> {
  const now = Date.now();
  if (!manual && now - lastCheckAt < MIN_CHECK_GAP_MS) return 'up-to-date';
  lastCheckAt = now;

  if (!navigator.onLine) return 'offline';

  if (swRegistration) {
    try {
      await swRegistration.update();
    } catch (err) {
      addAppLog('warn', 'app-update', 'Falha ao verificar actualizações do service worker', err);
      return 'offline';
    }
    if (swRegistration.installing || swRegistration.waiting) return 'update-found';
    return 'up-to-date';
  }

  // Sem service worker (origem insegura, por exemplo) a única forma de trocar
  // o bundle é recarregar de rede: no shell nativo isso implica limpar também
  // a cache HTTP da WebView, que só o lado nativo controla.
  if (!manual) return 'unsupported';
  if (requestNativeRelaunch()) return 'update-found';

  window.location.reload();
  return 'update-found';
}

/**
 * Gatilhos automáticos de verificação. Devolve a função de limpeza.
 */
export function startAppUpdateWatcher(): () => void {
  const check = () => { void checkForAppUpdate(); };

  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };

  const interval = window.setInterval(check, AUTO_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', check);
  // O shell nativo avisa quando o dispositivo volta ao primeiro plano ou
  // recupera ligação (ver AppShellScreen), momentos em que vale sempre a pena
  // procurar versão nova.
  window.addEventListener('drcae-native-resume', check);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', check);
    window.removeEventListener('drcae-native-resume', check);
  };
}
