import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('recuperação da ligação ao servidor', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('revalida a rede ao tentar login sem reutilizar o resultado offline anterior', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    const network = await import('./serverReachability');
    expect(await network.checkServerReachable()).toBe(false);

    // Outro agente não tem credenciais offline: a decisão tem de usar a rede
    // que voltou, mesmo sem evento online da Android WebView.
    fetch.mockResolvedValue({ ok: true });
    expect(await network.checkServerReachable()).toBe(true);
  });

  it('usa o endpoint público quando health responde HTTP 403 em vez de lançar', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const network = await import('./serverReachability');
    expect(await network.probeServerReachability()).toBe(true);
    expect(fetch.mock.calls[1][0]).toBe('/api/app/auth/salt');
  });

  it('partilha o probe entre login, cabeçalho e sincronização concorrentes', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const network = await import('./serverReachability');
    expect(await Promise.all([network.probeServerReachability(), network.probeServerReachability()])).toEqual([true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
