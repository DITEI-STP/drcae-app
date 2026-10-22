import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import * as api from './api';

vi.mock('./api', () => ({
  getJwtToken: vi.fn().mockReturnValue(null),
  getDeviceId: vi.fn().mockReturnValue('device-test'),
  getSalt: vi.fn().mockResolvedValue({ salt: 'test' }),
  login: vi.fn().mockRejectedValue(new Error('Pedido online recebido')),
}));
vi.mock('./offlineCredentialVault', () => ({
  OFFLINE_VAULT_MARKER: 'test-vault',
  getOfflineCredential: vi.fn().mockReturnValue(null),
}));
vi.mock('./crypto', () => ({ deriveKey: vi.fn(), setActiveKey: vi.fn() }));

describe('recuperação de rede no login nativo', () => {
  let root: Root;
  let host: HTMLDivElement;
  let online: boolean;
  beforeEach(() => {
    vi.mocked(api.getDeviceId).mockReturnValue('device-test');
    vi.mocked(api.getJwtToken).mockReturnValue(null);
    vi.mocked(api.login).mockRejectedValue(new Error('Pedido online recebido'));
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('DrcaeWebview/1.0');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('test-vault', 'device-test');
    online = false;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return { ok: true };
    }));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks();
  });

  async function mountLogin() {
    await act(async () => { root.render(createElement(App)); });
    expect(host.textContent).toContain('Modo Offline');
  }

  it('recupera com aviso nativo mesmo que navigator.onLine continue falso', async () => {
    await mountLogin();
    online = true;
    await act(async () => window.dispatchEvent(new Event('drcae-native-resume')));
    expect(host.textContent).toContain('Conectado ao Servidor');
    expect(navigator.onLine).toBe(false);
  });

  it('recupera por polling quando WiFi continua ligada e não há evento online', async () => {
    await mountLogin();
    online = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(host.textContent).toContain('Conectado ao Servidor');
  });

  it('revalida imediatamente no evento online sem esperar a cache expirar', async () => {
    await mountLogin();
    online = true;
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(host.textContent).toContain('Conectado ao Servidor');
  });

  it('envia login online para agente sem credenciais offline após a rede voltar', async () => {
    await mountLogin();
    online = true;
    const inputs = host.querySelectorAll('input');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(inputs[0], '123456789');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setValue.call(inputs[1], 'password');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(api.login).toHaveBeenCalledWith('123456789', 'password');
    expect(host.textContent).not.toContain('Sem credenciais offline para este agente');
  });
});
