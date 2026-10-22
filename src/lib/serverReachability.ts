let reachable: boolean | null = null;
let lastProbeAt = 0;
const PROBE_TTL_MS = 10_000; // reutilizar resultado por 10s
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
let pendingProbe: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
let stopMonitor: (() => void) | null = null;

function apiUrl(path: string): string {
  return `${API_BASE.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function probeEndpoint(path: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(path), {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

function publish(next: boolean): void {
  if (reachable === next) return;
  reachable = next;
  for (const listener of listeners) listener();
}

export function probeServerReachability(): Promise<boolean> {
  if (pendingProbe) return pendingProbe;
  pendingProbe = (async () => {
    // health pode responder 403 no gateway sem cookie webview válido. Isso
    // não significa ausência de rede: salt é público antes de qualquer login.
    const next = await probeEndpoint('health') || await probeEndpoint('app/auth/salt');
    lastProbeAt = Date.now();
    publish(next);
    return next;
  })().finally(() => { pendingProbe = null; });
  return pendingProbe;
}

export function isServerReachable(): boolean {
  if (reachable === null) return navigator.onLine;
  return reachable;
}

// Só reutilizar sucessos. Uma tentativa de login depois de recuperar rede
// tem de poder sair do modo offline, mesmo sem evento online do browser.
export async function checkServerReachable(): Promise<boolean> {
  const age = Date.now() - lastProbeAt;
  if (reachable === true && age < PROBE_TTL_MS) return true;
  return probeServerReachability();
}

function startMonitor(): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pollId = 0;
  const poll = async () => {
    if (!active) return;
    const currentPoll = ++pollId;
    if (timer) clearTimeout(timer);
    const next = await probeServerReachability();
    if (active && currentPoll === pollId) timer = setTimeout(poll, next ? 30_000 : 10_000);
  };
  const recover = () => { void poll(); };
  const offline = () => { publish(false); recover(); };
  const visible = () => { if (document.visibilityState === 'visible') recover(); };
  window.addEventListener('online', recover);
  window.addEventListener('offline', offline);
  window.addEventListener('focus', recover);
  window.addEventListener('drcae-native-resume', recover);
  document.addEventListener('visibilitychange', visible);
  recover();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
    window.removeEventListener('online', recover);
    window.removeEventListener('offline', offline);
    window.removeEventListener('focus', recover);
    window.removeEventListener('drcae-native-resume', recover);
    document.removeEventListener('visibilitychange', visible);
  };
}

export function subscribeServerReachability(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopMonitor) stopMonitor = startMonitor();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopMonitor?.();
      stopMonitor = null;
    }
  };
}
