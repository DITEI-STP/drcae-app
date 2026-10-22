import { useSyncExternalStore } from 'react';
import { isServerReachable, subscribeServerReachability } from '../lib/serverReachability';

/** Mesmo monitor no login e na aplicação desbloqueada, incluindo WebView. */
export function useServerReachability(): boolean {
  return useSyncExternalStore(subscribeServerReachability, isServerReachable);
}
