import { useEffect, useRef } from 'react';
import { Centrifuge } from 'centrifuge';
import * as api from './api';
import { registerAppPush } from './push';

type RealtimeEvent = {
  id: string;
  type: string;
  source: 'admin' | 'app' | 'system';
  deviceId?: string | null;
  needsSync?: string[];
};

type UseAppRealtimeOptions = {
  enabled: boolean;
  officerUid?: string | null;
  onSyncRequested: () => Promise<unknown>;
};

const PENDING_SYNC_KEY = 'drcae_realtime_pending_sync';

export function useAppRealtime({ enabled, officerUid, onSyncRequested }: UseAppRealtimeOptions) {
  const syncRef = useRef(onSyncRequested);
  const debounceRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    syncRef.current = onSyncRequested;
  }, [onSyncRequested]);

  useEffect(() => {
    const runPending = () => {
      if (!enabled || !navigator.onLine || runningRef.current) return;
      if (localStorage.getItem(PENDING_SYNC_KEY) !== '1') return;
      runningRef.current = true;
      Promise.resolve(syncRef.current())
        .then(() => localStorage.removeItem(PENDING_SYNC_KEY))
        .catch(() => localStorage.setItem(PENDING_SYNC_KEY, '1'))
        .finally(() => {
          runningRef.current = false;
        });
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.pendingSync) {
        localStorage.setItem(PENDING_SYNC_KEY, '1');
        runPending();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runPending();
    };
    const handleOnline = () => runPending();

    if (new URLSearchParams(window.location.search).get('realtimeSync') === '1') {
      localStorage.setItem(PENDING_SYNC_KEY, '1');
      const url = new URL(window.location.href);
      url.searchParams.delete('realtimeSync');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', runPending);
    window.addEventListener('online', handleOnline);
    runPending();

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', runPending);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !officerUid || !api.getJwtToken()) return;

    let cancelled = false;
    let centrifuge: Centrifuge | null = null;

    const scheduleSync = (event?: RealtimeEvent) => {
      if (event?.source === 'app' && event.deviceId === api.getDeviceId()) return;
      localStorage.setItem(PENDING_SYNC_KEY, '1');
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        if (!navigator.onLine || runningRef.current) return;
        runningRef.current = true;
        Promise.resolve(syncRef.current())
          .then(() => localStorage.removeItem(PENDING_SYNC_KEY))
          .catch(() => localStorage.setItem(PENDING_SYNC_KEY, '1'))
          .finally(() => {
            runningRef.current = false;
          });
      }, 900);
    };

    const connect = async () => {
      const connection = await api.getRealtimeConnectionToken();
      if (cancelled) return;

      void registerAppPush(connection.vapidPublicKey);

      const client = new Centrifuge(resolveCentrifugoUrl(), {
        token: connection.token,
        getToken: async () => (await api.getRealtimeConnectionToken()).token,
      });
      centrifuge = client;

      for (const channel of connection.channels) {
        const subscription = client.newSubscription(channel, {
          getToken: async () => (await api.getRealtimeSubscriptionToken(channel)).token,
        });
        subscription.on('publication', (ctx) => scheduleSync(ctx.data as RealtimeEvent));
        subscription.subscribe();
      }

      client.on('connected', () => scheduleSync());
      client.connect();
    };

    connect().catch((err) => {
      console.warn('[drcae] Falha ao iniciar realtime:', err);
    });

    return () => {
      cancelled = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      centrifuge?.disconnect();
    };
  }, [enabled, officerUid]);
}

function resolveCentrifugoUrl() {
  const configured = import.meta.env.VITE_CENTRIFUGO_URL || '/connection/websocket';
  if (/^wss?:\/\//i.test(configured)) return configured;
  if (/^https?:\/\//i.test(configured)) {
    return configured.replace(/^http/i, 'ws');
  }
  const path = configured.startsWith('/') ? configured : `/${configured}`;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
