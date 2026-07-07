import { useEffect, useState } from 'react';
import * as api from './api';

type RealtimeEvent = {
  type?: string;
  source?: 'admin' | 'app' | 'system';
};

export function useChatUnread(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    api.getDeviceChatUnreadCount()
      .then((res) => setCount(res.count || 0))
      .catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeEvent | null>).detail;
      if (detail?.type === 'chat.message.created' && detail.source === 'admin') {
        setCount((prev) => prev + 1);
      }
    };
    const readHandler = () => setCount(0);

    window.addEventListener('drcae:realtime-sync', handler);
    window.addEventListener('drcae:chat-read', readHandler);
    return () => {
      window.removeEventListener('drcae:realtime-sync', handler);
      window.removeEventListener('drcae:chat-read', readHandler);
    };
  }, []);

  return count;
}
