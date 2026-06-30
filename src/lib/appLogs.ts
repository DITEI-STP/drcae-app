export type AppLogLevel = 'info' | 'warn' | 'error';

export interface AppLogEntry {
  id: string;
  ts: number;
  level: AppLogLevel;
  scope: string;
  message: string;
  details?: string;
  synced?: boolean;
}

const LOG_KEY = 'drcae_app_logs';
const MAX_LOGS = 120;

function serializeDetails(details: unknown): string | undefined {
  if (details == null) return undefined;
  if (details instanceof Error) return details.stack || details.message;
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

export function getAppLogs(): AppLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addAppLog(level: AppLogLevel, scope: string, message: string, details?: unknown): void {
  const entry: AppLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    level,
    scope,
    message,
    details: serializeDetails(details),
    synced: false,
  };
  const next = [entry, ...getAppLogs()].slice(0, MAX_LOGS);
  localStorage.setItem(LOG_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('drcae:app-log', { detail: entry }));
}

export function getPendingAppLogs(): AppLogEntry[] {
  return getAppLogs().filter((entry) => !entry.synced);
}

export function markAppLogsSynced(ids: string[]): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const next = getAppLogs().map((entry) => (
    idSet.has(entry.id) ? { ...entry, synced: true } : entry
  ));
  localStorage.setItem(LOG_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('drcae:app-log-synced'));
}

export function clearAppLogs(): void {
  localStorage.removeItem(LOG_KEY);
  window.dispatchEvent(new Event('drcae:app-log-cleared'));
}
