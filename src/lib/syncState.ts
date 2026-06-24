/**
 * Store global de estado de sincronização.
 * Permite que qualquer componente observe o progresso em tempo real,
 * independentemente de onde a sincronização foi iniciada (Layout, SettingsPage, login).
 */

export type SyncPhase =
  | 'idle'       // sem sync em curso
  | 'pushing'    // a enviar dados para o servidor
  | 'pulling'    // a receber actualizações do servidor
  | 'done'       // sync concluída com sucesso
  | 'error'      // sync falhou (erro de rede ou servidor)
  | 'needs-auth'; // sessão expirada durante sync

export interface SyncSnapshot {
  phase: SyncPhase;

  // Upload
  pushTotal: number;    // total de itens a enviar
  pushDone: number;     // itens aceites pelo servidor
  pushErrors: number;   // itens rejeitados

  // Download
  pullCount: number;    // registos recebidos do servidor

  // Timing
  startedAt?: number;   // ms (Date.now())
  endedAt?: number;     // ms

  // Erros detalhados
  errors: string[];
  needsAuth: boolean;

  // Resultado da última sync completa
  lastSyncAt?: string;  // ISO string guardado no metadata
  lastPushDone?: number;
  lastPushErrors?: number;
  lastPullCount?: number;
  lastDurationMs?: number;
}

const DEFAULT: SyncSnapshot = {
  phase: 'idle',
  pushTotal: 0,
  pushDone: 0,
  pushErrors: 0,
  pullCount: 0,
  errors: [],
  needsAuth: false,
};

let _state: SyncSnapshot = { ...DEFAULT };
const _listeners = new Set<(s: SyncSnapshot) => void>();
let _notifyScheduled = false;

export function getSyncSnapshot(): SyncSnapshot {
  return _state;
}

export function patchSyncState(patch: Partial<SyncSnapshot>): void {
  _state = { ..._state, ...patch };
  if (!_notifyScheduled) {
    _notifyScheduled = true;
    queueMicrotask(() => {
      _notifyScheduled = false;
      _listeners.forEach(fn => fn(_state));
    });
  }
}

export function resetSyncState(): void {
  patchSyncState({
    phase: 'idle',
    pushTotal: 0,
    pushDone: 0,
    pushErrors: 0,
    pullCount: 0,
    errors: [],
    needsAuth: false,
    startedAt: undefined,
    endedAt: undefined,
  });
}

/** Regista um listener; retorna a função de cancelamento. */
export function subscribeSyncState(fn: (s: SyncSnapshot) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// Hook React para subscrever ao estado de sync (exportado para uso em qualquer componente)
// Importar com: import { useSyncState } from '../lib/syncState'
import { useState, useEffect } from 'react';
export function useSyncState(): SyncSnapshot {
  const [state, setState] = useState<SyncSnapshot>(getSyncSnapshot);
  useEffect(() => {
    setState(getSyncSnapshot());
    return subscribeSyncState(setState);
  }, []);
  return state;
}
