// Privilege enforcement for drcae-app — mirrors drcae-admin's
// src/utils/grants.ts, but scoped to the `app:page:*` / `app:transaction:*`
// resource families. The backend hands over the officer's current grant
// keys at login (auth/login) and on every sync pull (sync/pull), so the
// app can gate its own menus/actions the same way the admin SPA does.
//
// A navegação inteira é filtrada por esta lista, pelo que uma lista vazia
// deixa o agente sem menus, no terreno, sem caminho de recuperação dentro do
// kiosque. Duas salvaguardas evitam isso: a lista nunca é substituída por
// vazio a não ser que o servidor o afirme explicitamente
// (`grants_state: 'revoked'`), e existe um snapshot por agente que o login
// offline consegue repor sem servidor.
import { useEffect, useState } from 'react';
import { addAppLog } from './appLogs';

const GRANTS_STORAGE_KEY = 'drcae_app_grants';
const GRANTS_LKG_PREFIX = 'drcae_app_grants_lkg_';
const GRANTS_UPDATED_EVENT = 'drcae:grants-updated';

/**
 * Qualificador emitido pelo backend a acompanhar `grants` — ver `GrantsState`
 * em `grant-access.util.ts` do lado do servidor.
 *
 * - `complete`    — lista fidedigna, aplicar tal e qual.
 * - `revoked`     — o agente perdeu efectivamente os acessos.
 * - `unavailable` — o servidor não conseguiu resolver a sessão; ignorar.
 */
export type GrantsState = 'complete' | 'revoked' | 'unavailable';

export interface GrantsSnapshot {
  grants: string[];
  at: number;
}

export interface GrantsMergeResult {
  grants: string[];
  applied: boolean;
  reason: string;
}

/**
 * Decide que lista aplicar. Função pura e testada — é o ponto onde um engano
 * volta a deixar dispositivos sem navegação.
 *
 * A regra: uma lista vazia só substitui uma lista boa quando vem com
 * `revoked`. Sem qualificador — backend antigo, resposta truncada, proxy a
 * devolver corpo parcial — o vazio é tratado como não-fidedigno e a cache
 * mantém-se. O backend valida cada operação de qualquer forma, pelo que
 * manter menus a mais é estritamente menos grave do que deixar um agente
 * legítimo sem aplicação a meio de uma fiscalização.
 */
export function mergeGrants(
  current: string[],
  incoming: string[] | undefined | null,
  state?: GrantsState | null,
): GrantsMergeResult {
  if (state === 'unavailable') {
    return { grants: current, applied: false, reason: 'unavailable' };
  }
  if (!Array.isArray(incoming)) {
    return { grants: current, applied: false, reason: 'absent' };
  }
  if (incoming.length > 0) {
    return { grants: incoming, applied: true, reason: state ?? 'complete' };
  }
  if (state === 'revoked') {
    return { grants: [], applied: true, reason: 'revoked' };
  }
  if (current.length === 0) {
    // Já estava vazia — aplicar não muda nada e evita um estado «pendente».
    return { grants: [], applied: true, reason: 'empty-both' };
  }
  return { grants: current, applied: false, reason: 'unqualified-empty' };
}

function lkgKey(nif: string): string {
  return `${GRANTS_LKG_PREFIX}${nif}`;
}

function emit(list: string[]): void {
  window.dispatchEvent(
    new CustomEvent(GRANTS_UPDATED_EVENT, { detail: { grants: list } }),
  );
}

/**
 * Aplica uma lista vinda do servidor. `state` é o `grants_state` da resposta;
 * a sua ausência significa backend antigo e é tratada como não-fidedigna para
 * listas vazias.
 */
export function setStoredGrants(
  grants: string[] | undefined | null,
  state?: GrantsState | null,
): void {
  const current = getStoredGrants();
  const { grants: next, applied, reason } = mergeGrants(current, grants, state);

  if (!applied) {
    addAppLog(
      'warn',
      'grants',
      'Lista de privilégios vazia ignorada — cache mantida',
      { reason, state: state ?? null, cached: current.length },
    );
    return;
  }

  const lost = current.filter((key) => !next.includes(key));
  if (lost.length > 0) {
    addAppLog('warn', 'grants', 'Lista de privilégios encolheu', {
      reason,
      state: state ?? null,
      lost,
      before: current.length,
      after: next.length,
      device_id: localStorage.getItem('drcae_device_id'),
    });
  }

  localStorage.setItem(GRANTS_STORAGE_KEY, JSON.stringify(next));

  // Snapshot «last known good» por agente: é a fonte do restauro no login
  // offline, onde não há servidor para reemitir a lista.
  const nif = localStorage.getItem('drcae_officer_nif');
  if (nif && next.length > 0) {
    const snapshot: GrantsSnapshot = { grants: next, at: Date.now() };
    localStorage.setItem(lkgKey(nif), JSON.stringify(snapshot));
  }

  emit(next);
}

export function getStoredGrants(): string[] {
  try {
    const raw = localStorage.getItem(GRANTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Snapshot da última lista fidedigna conhecida deste agente. */
export function getGrantsSnapshot(nif: string): GrantsSnapshot | null {
  try {
    const raw = localStorage.getItem(lkgKey(nif));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.grants) ? (parsed as GrantsSnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Repõe os privilégios a partir do snapshot do agente. Usado pelo login
 * offline, onde não há resposta do servidor: a assinatura local e o canário
 * da cache já provaram que é este agente — a mesma prova que autoriza
 * decifrar todos os dados de fiscalização guardados no dispositivo.
 *
 * Devolve `true` se restaurou alguma coisa.
 */
export function restoreGrantsFromSnapshot(nif: string): boolean {
  const snapshot = getGrantsSnapshot(nif);
  if (!snapshot || snapshot.grants.length === 0) return false;
  localStorage.setItem(GRANTS_STORAGE_KEY, JSON.stringify(snapshot.grants));
  addAppLog('info', 'grants', 'Privilégios repostos do snapshot local', {
    count: snapshot.grants.length,
    at: new Date(snapshot.at).toISOString(),
  });
  emit(snapshot.grants);
  return true;
}

/**
 * Limpa a lista activa. O snapshot por agente **sobrevive** de propósito: o
 * logout offline apagava a lista e o login offline seguinte nunca a repunha,
 * deixando o dispositivo sem menus e sem rede para os recuperar.
 */
export function clearStoredGrants(): void {
  localStorage.removeItem(GRANTS_STORAGE_KEY);
  emit([]);
}

/** Descarta também o snapshot — usado ao desemparelhar/limpar o dispositivo. */
export function forgetGrantsSnapshot(nif: string): void {
  localStorage.removeItem(lkgKey(nif));
}

export function hasAppGrant(key: string): boolean {
  return getStoredGrants().includes(key);
}

/**
 * Alguma das chaves está concedida. Uma lista de chaves vazia devolve
 * `false`, alinhado com `hasAppGrant` — devolver `true` transformava uma
 * exigência vazia num passe livre, armadilha para quem adicionasse gating
 * novo.
 */
export function hasAnyAppGrant(keys: string[]): boolean {
  if (keys.length === 0) return false;
  const grants = getStoredGrants();
  return keys.some((k) => grants.includes(k));
}

/** Reactive grants list — updates whenever login/sync refreshes them. */
export function useAppGrants(): string[] {
  const [grants, setGrants] = useState<string[]>(() => getStoredGrants());

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ grants: string[] }>).detail;
      setGrants(detail?.grants ?? getStoredGrants());
    };
    window.addEventListener(GRANTS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(GRANTS_UPDATED_EVENT, onUpdate);
  }, []);

  return grants;
}
