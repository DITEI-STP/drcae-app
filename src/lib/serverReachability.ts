let reachable: boolean | null = null;
let lastProbeAt = 0;
const PROBE_TTL_MS = 10_000; // reutilizar resultado por 10s

export async function probeServerReachability(): Promise<boolean> {
  try {
    const res = await fetch('/api/app/health', {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  lastProbeAt = Date.now();
  return reachable;
}

export function isServerReachable(): boolean {
  if (reachable === null) return navigator.onLine;
  return reachable;
}

// Probe com cache: re-usa o resultado recente se disponível
export async function checkServerReachable(): Promise<boolean> {
  const age = Date.now() - lastProbeAt;
  if (reachable !== null && age < PROBE_TTL_MS) return reachable;
  return probeServerReachability();
}
