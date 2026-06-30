import { getDrcaeAppVersion } from './version';
import { addAppLog } from './appLogs';
import type { AppLogEntry } from './appLogs';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api') + '/app';

// Erro específico para falhas de autenticação durante sync background.
// Ao contrário de um 401 em operações explícitas do utilizador, este erro
// NÃO deve fazer logout — os dados locais estão seguros e o sync tentará novamente.
export class AuthSyncError extends Error {
  constructor() {
    super('AUTH_SYNC_EXPIRED');
    this.name = 'AuthSyncError';
  }
}

export function getJwtToken(): string | null {
  return sessionStorage.getItem('drcae_jwt');
}

export function setJwtToken(token: string | null) {
  if (token) {
    sessionStorage.setItem('drcae_jwt', token);
  } else {
    sessionStorage.removeItem('drcae_jwt');
  }
}

// Fingerprint ou ID estável do dispositivo (salvo no localStorage)
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('drcae_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('drcae_device_id', deviceId);
  }
  return deviceId;
}

export function setDeviceId(deviceId: string): void {
  const normalized = deviceId.trim();
  if (normalized) {
    localStorage.setItem('drcae_device_id', normalized);
    if (typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({
        type: 'DEVICE_ID_UPDATED',
        device_id: normalized,
      }));
    }
  }
}

// Wrapper fetch com injeção de JWT e tratamento automático de expiração (401).
// silent=true: usado pelo sync background — se o refresh falhar, lança AuthSyncError
// em vez de emitir auth-expired, para não fazer logout enquanto há dados locais por sincronizar.
async function request(path: string, options: RequestInit = {}, silent = false): Promise<any> {
  const url = `${API_BASE}/${path}`;
  const headers = new Headers(options.headers || {});

  const token = getJwtToken();
  if (token) {
    headers.set('Authorization', token);
  }
  headers.set('Content-Type', 'application/json');

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && !path.includes('auth/refresh') && !path.includes('auth/login')) {
    // Tentar refresh silencioso via cookie HttpOnly
    const refreshed = await refreshSilent();
    if (refreshed) {
      // Repetir a requisição original com o novo token
      headers.set('Authorization', getJwtToken() || '');
      response = await fetch(url, { ...options, headers });
    } else if (silent) {
      // Sync background: não fazer logout, dados locais estão seguros
      throw new AuthSyncError();
    } else {
      // Operação explícita do utilizador: limpar sessão e notificar
      setJwtToken(null);
      window.dispatchEvent(new Event('auth-expired'));
      throw new Error('Sessão expirada. Faça login novamente.');
    }
  }

  if (response.status === 403) {
    const errJson = await response.json().catch(() => ({}));
    const msg = errJson.message || 'Acesso negado.';
    if (msg.includes('aprovação')) {
      window.dispatchEvent(new CustomEvent('device-pending-approval', { detail: { message: msg } }));
    }
    throw new Error(msg);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Erro HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(errorText);
      errorMessage = errJson.message || errorMessage;
    } catch {}
    if (path !== 'logs') {
      addAppLog('error', 'api', `${options.method || 'GET'} ${path}: ${errorMessage}`, errorText);
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

async function rawRequest(path: string, options: RequestInit = {}, silent = false): Promise<any> {
  const url = `${API_BASE}/${path}`;
  const headers = new Headers(options.headers || {});

  const token = getJwtToken();
  if (token) {
    headers.set('Authorization', token);
  }

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && !path.includes('auth/refresh') && !path.includes('auth/login')) {
    const refreshed = await refreshSilent();
    if (refreshed) {
      headers.set('Authorization', getJwtToken() || '');
      response = await fetch(url, { ...options, headers });
    } else if (silent) {
      throw new AuthSyncError();
    } else {
      setJwtToken(null);
      window.dispatchEvent(new Event('auth-expired'));
      throw new Error('Sessão expirada. Faça login novamente.');
    }
  }

  if (response.status === 403) {
    const errJson = await response.json().catch(() => ({}));
    const msg = errJson.message || 'Acesso negado.';
    if (msg.includes('aprovação')) {
      window.dispatchEvent(new CustomEvent('device-pending-approval', { detail: { message: msg } }));
    }
    throw new Error(msg);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Erro HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(errorText);
      errorMessage = errJson.message || errorMessage;
    } catch {}
    addAppLog('error', 'api-raw', `${options.method || 'GET'} ${path}: ${errorMessage}`, errorText);
    throw new Error(errorMessage);
  }

  return response.json();
}

// 1. Obter salt
export async function getSalt(): Promise<{ salt: string }> {
  return request('auth/salt');
}

// 1.5. Verificar status de emparelhamento do dispositivo
export async function checkDeviceStatus(): Promise<{ paired: boolean; officer_name: string | null }> {
  const deviceId = getDeviceId();
  return request(`auth/device-status?device_id=${deviceId}`);
}

// 1.6. Emparelhar dispositivo com código
export async function pairDevice(code: string): Promise<{ success: boolean; officer_name: string }> {
  const deviceId = getDeviceId();
  return request('auth/pair', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, code }),
  });
}

// 2. Login
export async function login(nif: string, password: string): Promise<any> {
  const deviceId = getDeviceId();
  const response = await request('auth/login', {
    method: 'POST',
    body: JSON.stringify({ nif, password, device_id: deviceId }),
  });

  if (response.access) {
    setJwtToken(response.access);
  }
  if (response.officer) {
    localStorage.setItem('drcae_officer_info', JSON.stringify(response.officer));
  }
  return response;
}

// 3. Refresh silencioso (usa cookie HttpOnly)
// Singleton: múltiplos 401 simultâneos partilham o mesmo pedido de refresh
let _refreshPromise: Promise<boolean> | null = null;

export function refreshSilent(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function _doRefresh(): Promise<boolean> {
  const deviceId = getDeviceId();
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_id: deviceId }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.access) {
        setJwtToken(data.access);
        return true;
      }
    }
  } catch (err) {
    console.error('Falha no refresh silencioso:', err);
  }
  return false;
}

// 4. Logout
export async function logout(): Promise<void> {
  try {
    await request('auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Erro ao chamar logout no servidor:', err);
  } finally {
    setJwtToken(null);
  }
}

// 5. Pull Sync (silent: falha de auth não faz logout)
export async function pullSync(since: string | null, profile = 'standard'): Promise<any> {
  const deviceId = getDeviceId();
  const params = new URLSearchParams({
    device_id: deviceId,
    profile,
  });
  if (since) {
    params.set('since', since);
  }
  return request(`sync/pull?${params.toString()}`, {}, true);
}

// 6. Push Sync (silent: falha de auth não faz logout)
export async function pushSync(payload: any): Promise<any> {
  return request('sync/push', {
    method: 'POST',
    body: JSON.stringify({
      device_id: getDeviceId(),
      ...payload,
    }),
  }, true);
}

export async function uploadSyncAttachment(input: {
  id: string;
  visitaId: string;
  fileName: string;
  fileType: string;
  blob: Blob;
}): Promise<{
  id: string;
  visitaId: string | null;
  file_ref: string;
  fileName: string;
  fileType: string;
  size: number;
  url?: string;
}> {
  return rawRequest(`sync/attachments/${encodeURIComponent(input.id)}/content`, {
    method: 'POST',
    headers: {
      'Content-Type': input.fileType || 'application/octet-stream',
      'X-Device-Id': getDeviceId(),
      'X-Visita-Id': input.visitaId,
      'X-File-Name': encodeURIComponent(input.fileName),
      'X-File-Type': input.fileType || 'application/octet-stream',
    },
    body: input.blob,
  }, true).catch((err) => {
    addAppLog('error', 'sync-upload', `Falha ao enviar ficheiro ${input.fileName}`, err);
    throw err;
  });
}

export async function pushDeviceLogs(logs: AppLogEntry[]): Promise<{ accepted: string[] }> {
  if (logs.length === 0) return { accepted: [] };
  return request('logs', {
    method: 'POST',
    body: JSON.stringify({
      device_id: getDeviceId(),
      logs: logs.map((entry) => ({
        id: entry.id,
        ts: entry.ts,
        level: entry.level,
        scope: entry.scope,
        message: entry.message,
        details: entry.details,
      })),
    }),
  }, true);
}

// 7. Obter tabelas de referência
export async function getAssets(): Promise<any> {
  return request('assets');
}

// 8. Produtos de Cesta Básica do operador
export async function getOperatorSupply(operatorUid: string): Promise<{ bookStatus: string; products: { id: number; name: string; grossPrice: number | null; retailPrice: number | null }[] }> {
  return request(`operator-supply/${operatorUid}`);
}

// 9. Exportar pacote offline manual
export async function exportPackage(profile = 'standard'): Promise<any> {
  return request('sync/export', {
    method: 'POST',
    body: JSON.stringify({ profile }),
  });
}

export async function getRealtimeConnectionToken(): Promise<{ token: string; channels: string[]; vapidPublicKey?: string | null }> {
  return request('realtime/connection-token', {
    method: 'POST',
    body: JSON.stringify({ device_id: getDeviceId() }),
  });
}

export async function getRealtimeSubscriptionToken(channel: string): Promise<{ token: string }> {
  return request('realtime/subscription-token', {
    method: 'POST',
    body: JSON.stringify({ device_id: getDeviceId(), channel }),
  });
}

export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<{ success: boolean; configured: boolean }> {
  return request('realtime/push-subscription', {
    method: 'POST',
    body: JSON.stringify({
      device_id: getDeviceId(),
      subscription,
    }),
  });
}

// Registo completo com hardware info → devolve webview_signature (fluxo browser directo)
export async function registerDeviceFull(
  code: string,
  alias: string,
  deviceInfo: object,
): Promise<{ device_id?: string; device_code: string; webview_signature: string; session_id: string }> {
  const url = `${API_BASE}/auth/device-register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      device_id: getDeviceId(),
      code: code.trim().toUpperCase(),
      alias: alias.trim() || 'Browser',
      device_info: deviceInfo,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erro ${res.status}`);
  }
  const result = await res.json();
  if (result.device_id) {
    setDeviceId(result.device_id);
  }
  return result;
}

// Troca webview_signature por launch_token (curta duração)
export async function requestLaunchToken(
  webviewSignature: string,
): Promise<{ launch_token: string; expires_in: number }> {
  const url = `${API_BASE}/auth/webview-launch`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webview-Signature': webviewSignature,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erro ${res.status}`);
  }
  return res.json();
}

// Troca launch_token pelo cookie __wvs (Set-Cookie HttpOnly)
export async function performHandshake(launchToken: string): Promise<{ device_id?: string }> {
  const url = `${API_BASE}/auth/webview-handshake`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      launch_token: launchToken,
      app_version: getDrcaeAppVersion(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erro ${res.status}`);
  }
  const result = await res.json();
  if (result.device_id) {
    setDeviceId(result.device_id);
  }
  return result;
}

export async function updateDeviceTeam(team: string): Promise<any> {
  const deviceId = getDeviceId();
  return request('device/team', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, team }),
  });
}

export async function getDeviceChatMessages(limit = 80): Promise<{ messages: any[] }> {
  const params = new URLSearchParams({
    device_id: getDeviceId(),
    limit: String(limit),
  });
  return request(`device/chat/messages?${params.toString()}`);
}

export async function sendDeviceChatMessage(input: {
  message_type?: 'text' | 'audio';
  text_body?: string;
  audio?: {
    uid?: string | null;
    url?: string | null;
    mimetype?: string | null;
    duration_seconds?: number | null;
  };
}) {
  return request('device/chat/message', {
    method: 'POST',
    body: JSON.stringify({
      device_id: getDeviceId(),
      message_type: input.message_type || 'text',
      text_body: input.text_body || null,
      audio: input.audio || null,
    }),
  });
}

export async function uploadChatAudio(file: Blob, filename = 'chat-audio.webm') {
  const token = getJwtToken();
  const formData = new FormData();
  formData.append('file', new File([file], filename, { type: file.type || 'audio/webm' }));
  formData.append('folder', 'realtime-chat/device');
  formData.append('visibility', 'public');

  const headers = new Headers();
  if (token) headers.set('Authorization', token);

  const response = await fetch('/api/storage', {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Erro ${response.status}`);
  }

  return response.json();
}
