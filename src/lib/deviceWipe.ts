// Apaga todo o estado local do dispositivo (dados de negócio + sessão),
// usado sempre que o dispositivo é desassociado/reemparelhado com outro
// ambiente — sem isto, registos Dexie de firmas/visitas do servidor
// anterior sobrevivem e o próximo sync falha por referenciarem operadores
// que não existem no novo servidor.
//
// device_id (identidade física do tablet) e a preferência de tema NÃO são
// apagados — não são "dados de negócio" e o admin do novo ambiente ainda
// deve reconhecer o mesmo dispositivo físico ao aprová-lo.
import { db } from '../db/db';
import { clearPairingCredentials } from './pairing';

const PRESERVED_LOCALSTORAGE_KEYS = new Set(['drcae_theme', 'drcae_device_id']);

export async function wipeLocalState(): Promise<void> {
  try {
    await db.delete();
  } catch (err) {
    console.error('[drcae] Falha ao apagar a base de dados local:', err);
  }

  clearPairingCredentials();

  for (const key of Object.keys(localStorage)) {
    if (!PRESERVED_LOCALSTORAGE_KEYS.has(key)) {
      localStorage.removeItem(key);
    }
  }

  sessionStorage.clear();

  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch (err) {
      console.error('[drcae] Falha ao limpar caches do service worker:', err);
    }
  }
}

declare global {
  interface Window {
    __drcaeWipeLocalState?: () => void;
  }
}

// Ponte para o shell nativo (drcae-webview/React Native): quando o admin
// revoga o dispositivo, o shell corre
// `window.__drcaeWipeLocalState && window.__drcaeWipeLocalState()` via
// injectJavaScript antes de mostrar novamente o ecrã de emparelhamento.
window.__drcaeWipeLocalState = () => {
  void wipeLocalState().finally(() => window.location.reload());
};
