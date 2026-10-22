import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppRealtime } from './realtime';

vi.mock('./api', () => ({ getJwtToken: vi.fn().mockReturnValue(null) }));

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('retoma a sincronização quando o probe confirmou rede mas o browser ainda diz offline', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  localStorage.setItem('drcae_realtime_pending_sync', '1');
  const onSyncRequested = vi.fn().mockResolvedValue(undefined);
  function Consumer() {
    useAppRealtime({ enabled: true, onSyncRequested });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(createElement(Consumer)));
    expect(onSyncRequested).toHaveBeenCalledOnce();
    expect(localStorage.getItem('drcae_realtime_pending_sync')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
