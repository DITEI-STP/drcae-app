import { db } from '../db/db';
import * as api from './api';
import { AuthSyncError } from './api';
import { patchSyncState } from './syncState';

// String.fromCharCode(...array) falha com arrays > ~65k elementos.
// Esta versão itera em chunks para suportar ficheiros de qualquer tamanho.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

// Perfil de sincronização atribuído pelo servidor (lido do localStorage)
export function getServerSyncProfile(): string {
  return localStorage.getItem('drcae_server_sync_profile') || 'standard';
}

// Executa o Pull (Download de actualizações)
export async function syncPull(profile?: string): Promise<number> {
  // Obter data da última sincronização bem sucedida do metadata
  const metaLastSync = await db.metadata.get('last_sync_at');
  const since = metaLastSync?.value || null;

  patchSyncState({ phase: 'pulling', pullCount: 0 });

  // Usar sempre o perfil do servidor se disponível
  const activeProfile = profile || getServerSyncProfile();
  const response = await api.pullSync(since, activeProfile);
  let count = 0;

  // Persistir perfil atribuído pelo servidor
  if (response.sync_profile) {
    localStorage.setItem('drcae_server_sync_profile', response.sync_profile);
  }

  // Actualizar Firmas
  if (response.firmas && response.firmas.length > 0) {
    await db.firmas.bulkPut(response.firmas);
    count += response.firmas.length;
  }

  // Actualizar Visitas — merge inteligente: dados do servidor têm precedência,
  // mas campos locais que o servidor não devolve (ou devolve como null/vazio) são preservados.
  // Isto evita a perda de recomendações, produtos, notas e outros campos offline-first.
  if (response.visitas && response.visitas.length > 0) {
    const enriched = await Promise.all(
      response.visitas.map(async (v: any) => {
        const existing = await db.visitas.get(v.id);
        return {
          // 1. Base: dados locais completos (garantia de não apagar nada)
          ...(existing ?? {}),
          // 2. Override: dados do servidor têm precedência sobre locais
          ...v,
          // 3. Preservar campos locais quando o servidor os devolve vazios/ausentes
          recomendacoes: (v.recomendacoes && v.recomendacoes.length > 0)
            ? v.recomendacoes
            : (existing?.recomendacoes ?? []),
          recomendacoesHistoricas: (v.recomendacoesHistoricas && v.recomendacoesHistoricas.length > 0)
            ? v.recomendacoesHistoricas
            : (existing?.recomendacoesHistoricas ?? []),
          produtos: (v.produtos && v.produtos.length > 0)
            ? v.produtos
            : (existing?.produtos ?? []),
          notes: v.notes ?? existing?.notes,
          atividadeEconomica: v.atividadeEconomica ?? existing?.atividadeEconomica,
          offlineCode: v.offlineCode ?? existing?.offlineCode,
          locationAutoCaptured: v.locationAutoCaptured ?? existing?.locationAutoCaptured,
          // 4. Metadados de sync sempre actualizados
          synced: true,
          confirmationStatus: existing?.confirmationStatus ?? 'confirmada',
        };
      })
    );
    await db.visitas.bulkPut(enriched);
    count += enriched.length;
  }

  // Actualizar Infracções
  if (response.infracoes && response.infracoes.length > 0) {
    await db.infracoes.bulkPut(response.infracoes);
    count += response.infracoes.length;
  }

  // Guardar livros de cálculo (supplies) em cache local por operador
  if (response.supplies && response.supplies.length > 0) {
    for (const supply of response.supplies as { firmaId: string; products: any[] }[]) {
      if (supply.firmaId && supply.products.length > 0) {
        await db.table('metadata').put({
          key: `supply_${supply.firmaId}`,
          value: supply.products,
        });
      }
    }
    count += response.supplies.length;
  }

  // Gravar novo timestamp de sync no metadata
  await db.metadata.put({
    key: 'last_sync_at',
    value: response.since_server,
  });

  patchSyncState({ pullCount: count, lastSyncAt: response.since_server });

  return count;
}

// Executa o Push (Upload de alterações offline)
export async function syncPush(): Promise<{ pushed: number; errors: string[]; needsAuth?: boolean }> {
  // Buscar registros não sincronizados (synced === false ou synced === 0)
  const unsyncedFirmas = await db.firmas.filter(f => !f.synced).toArray();
  const unsyncedVisitas = await db.visitas.filter(v => !v.synced).toArray();
  const unsyncedInfracoes = await db.infracoes.filter(inf => !inf.synced).toArray();
  const unsyncedAnexos = await db.anexos.filter(a => !a.synced).toArray();

  if (
    unsyncedFirmas.length === 0 &&
    unsyncedVisitas.length === 0 &&
    unsyncedInfracoes.length === 0 &&
    unsyncedAnexos.length === 0
  ) {
    return { pushed: 0, errors: [] };
  }

  // Recolher preços de cesta básica de todas as visitas com produtos
  const prices: any[] = [];
  for (const v of unsyncedVisitas) {
    if (v.produtos && v.produtos.length > 0) {
      for (const p of v.produtos) {
        if (p.product_id && (p.gross || p.retail)) {
          const grossNum = p.gross ? parseFloat(p.gross) : null;
          const retailNum = p.retail ? parseFloat(p.retail) : null;
          // eval: 1=conforme, 0=não conforme, -1=n/a
          let eval_ = -1;
          if (grossNum != null && p.grossPrice != null) eval_ = grossNum <= p.grossPrice ? 1 : 0;
          prices.push({ visitaId: v.id, product_id: p.product_id, gross: grossNum, retail: retailNum, eval: eval_ });
        }
      }
    }
  }

  const pushTotal =
    unsyncedFirmas.length + unsyncedVisitas.length +
    unsyncedInfracoes.length + unsyncedAnexos.length;

  patchSyncState({ phase: 'pushing', pushTotal, pushDone: 0, pushErrors: 0 });

  const payload = {
    firmas: unsyncedFirmas,
    visitas: unsyncedVisitas,
    infracoes: unsyncedInfracoes,
    anexos: unsyncedAnexos.map(a => ({
      ...a,
      data: a.data instanceof ArrayBuffer ? arrayBufferToBase64(a.data) : a.data,
    })),
    prices,
  };

  let response: any;
  try {
    response = await api.pushSync(payload);
  } catch (err) {
    if (err instanceof AuthSyncError) {
      // Sessão expirada durante sync background — dados locais estão seguros,
      // o sync será retentado após re-autenticação do utilizador
      patchSyncState({ phase: 'needs-auth', needsAuth: true });
      return { pushed: 0, errors: [], needsAuth: true };
    }
    patchSyncState({ phase: 'error', errors: [(err as Error).message] });
    throw err;
  }

  // Marcar aceitos como sincronizados
  if (response.accepted && response.accepted.length > 0) {
    const acceptedIds = new Set(response.accepted);
    const now = Date.now();
    const UMA_HORA = 60 * 60 * 1000;

    await db.batchMarkSynced({
      firmaIds: unsyncedFirmas.filter(f => f.id && acceptedIds.has(f.id)).map(f => f.id!),
      visitaUpdates: unsyncedVisitas
        .filter(v => v.id && acceptedIds.has(v.id))
        .map(v => ({ id: v.id!, confirmationStatus: (now - (v.createdAt || 0)) <= UMA_HORA ? 'confirmada' : 'pendente' })),
      infracaoIds: unsyncedInfracoes.filter(i => i.id && acceptedIds.has(i.id)).map(i => i.id!),
      anexoIds: unsyncedAnexos.filter(a => a.id && acceptedIds.has(a.id)).map(a => a.id!),
    });
  }

  const accepted = response.accepted?.length || 0;
  const rejected = (response.errors || []).length;
  patchSyncState({ pushDone: accepted, pushErrors: rejected });

  return {
    pushed: accepted,
    errors: response.errors || [],
  };
}

let isSyncInProgress = false;

// Sincronização Geral (Push -> Pull)
export async function triggerFullSync(profile = 'standard'): Promise<{ pulled: number; pushed: number; errors: string[]; needsAuth?: boolean }> {
  if (isSyncInProgress) {
    return { pulled: 0, pushed: 0, errors: [] };
  }
  isSyncInProgress = true;
  const startedAt = Date.now();
  patchSyncState({ phase: 'pushing', startedAt, endedAt: undefined, errors: [], needsAuth: false });

  try {
    // 1. Push
    const pushRes = await syncPush();

    // Se push falhou por auth, não tentar pull (mesmo motivo de falha)
    if (pushRes.needsAuth) {
      patchSyncState({ phase: 'needs-auth', needsAuth: true, endedAt: Date.now() });
      return { pulled: 0, pushed: 0, errors: [], needsAuth: true };
    }

    // 2. Pull
    let pulled = 0;
    try {
      pulled = await syncPull(profile);
    } catch (err) {
      if (err instanceof AuthSyncError) {
        patchSyncState({ phase: 'needs-auth', needsAuth: true, endedAt: Date.now() });
        return { pulled: 0, pushed: pushRes.pushed, errors: pushRes.errors, needsAuth: true };
      }
      patchSyncState({ phase: 'error', errors: [(err as Error).message], endedAt: Date.now() });
      throw err;
    }

    const endedAt = Date.now();
    patchSyncState({
      phase: 'done',
      endedAt,
      lastPushDone: pushRes.pushed,
      lastPushErrors: pushRes.errors.length,
      lastPullCount: pulled,
      lastDurationMs: endedAt - startedAt,
      errors: pushRes.errors,
    });

    return {
      pulled,
      pushed: pushRes.pushed,
      errors: pushRes.errors,
    };
  } finally {
    isSyncInProgress = false;
  }
}
