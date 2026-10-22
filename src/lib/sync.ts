import { syncPush } from './syncPush';
export { syncPush } from './syncPush';
import { db } from '../db/db';
import * as api from './api';
import { AuthSyncError } from './api';
import { probeServerReachability } from './serverReachability';
import { patchSyncState } from './syncState';
import { addAppLog } from './appLogs';
import { setStoredGrants } from './grants';
import {
  writeOperatorSupplyCache,
  writeSupplyCatalog,
  type SupplyPullEntry,
} from './supplyCache';
import { syncAgentesCatalog } from './agentesCatalog';
import { syncAvatarCache } from './avatarCache';
import { syncUtilizadoresCatalog } from './utilizadoresCatalog';
import { toast } from './notifications';
import { syncRepresentantes } from './representantesCache';
import {syncReleasedComplaints} from './syncReleasedComplaints';
import { applyServerDeletions } from './syncDeletions';
import {
  invalidateOfflineCredentials,
  listOfflineCredentialVersions,
} from './offlineCredentialVault';

async function validateCachedOfflineCredentials(): Promise<boolean> {
  const claims = listOfflineCredentialVersions();
  if (claims.length === 0) return true;
  const response = await api.validateOfflineCredentials(claims);
  const invalidated = invalidateOfflineCredentials(response.credentials ?? []);
  if (invalidated.length === 0) return true;

  const currentNif = localStorage.getItem('drcae_officer_nif')?.trim();
  addAppLog('warn', 'auth', 'Credenciais offline revogadas após validação no servidor', {
    nifs: invalidated,
  });
  if (currentNif && invalidated.includes(currentNif)) {
    api.setJwtToken(null);
    window.dispatchEvent(new Event('auth-expired'));
    return false;
  }
  toast.info(
    `${invalidated.length} credencial${invalidated.length === 1 ? '' : 'is'} offline ` +
    `de outro agente ${invalidated.length === 1 ? 'foi removida' : 'foram removidas'} por alteração no servidor.`,
  );
  return true;
}

// Perfil de sincronização atribuído pelo servidor (lido do localStorage).
//
// **Máximo** enquanto o servidor não disser outra coisa: um dispositivo que
// ainda não sincronizou não sabe que perfil tem, e é preferível trazer tudo a
// descobrir no terreno, sem rede, que o histórico ficou no servidor.
export function getServerSyncProfile(): string {
  return localStorage.getItem('drcae_server_sync_profile') || 'maximum';
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
    window.dispatchEvent(new CustomEvent('drcae:sync-profile-updated', {
      detail: { profile: response.sync_profile },
    }));
  }

  // Atualizar privilégios (grants) do agente — refletem alterações feitas
  // no admin (perfil/utilizador) sem exigir novo login. O `grants_state`
  // qualifica a lista: sem ele, ou com `unavailable`, uma lista vazia é
  // ignorada em vez de apagar os menus (ver `mergeGrants`).
  setStoredGrants(response.grants, response.grants_state);

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
          notes: v.notes || existing?.notes,
          atividadeEconomica: v.atividadeEconomica ?? existing?.atividadeEconomica,
          offlineCode: v.offlineCode ?? existing?.offlineCode,
          officialCode: v.officialCode ?? existing?.officialCode,
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

  // Actualizar Anexos (ficheiros capturados em campo por qualquer dispositivo)
  // Só guarda registos que ainda não existem localmente (não sobrepõe capturas locais)
  if (response.anexos && response.anexos.length > 0) {
    for (const a of response.anexos as import('../db/db').Anexo[]) {
      if (!a.id) continue;
      const existing = await db.anexos.get(a.id);
      if (!existing) {
        await db.anexos.put({ ...a, synced: true });
        count++;
      } else {
        // Enriquecer o registo local com o que o servidor tem e falta cá: a URL
        // do ficheiro e a do fotograma. Sem a segunda, um dispositivo que
        // recebeu a fiscalização de outro voltaria a descodificar o vídeo.
        const enriquecer: Partial<import('../db/db').Anexo> = {};
        if (!existing.url && a.url) enriquecer.url = a.url;
        if (!existing.posterUrl && a.posterUrl) enriquecer.posterUrl = a.posterUrl;
        if (Object.keys(enriquecer).length > 0) {
          await db.anexos.update(a.id, { ...enriquecer, synced: true });
        }
      }
    }
  }

  // Guardar livros de cálculo (supplies) em cache local por operador, no
  // mesmo formato que o leitor espera (`{ bookStatus, products }`). Gravar o
  // array cru, como se fazia antes, produzia uma cache que o `NovaVisita`
  // descartava silenciosamente — a etapa de cesta básica aparecia vazia mesmo
  // em dispositivos sincronizados.
  if (Array.isArray(response.supplies) && response.supplies.length > 0) {
    for (const supply of response.supplies as SupplyPullEntry[]) {
      if (!supply.firmaId) continue;
      await writeOperatorSupplyCache(supply.firmaId, {
        bookStatus: supply.bookStatus ?? 'active',
        products: supply.products ?? [],
        source: 'sync',
      });
    }
    count += response.supplies.length;
  }

  // Apreensões e respectivos itens. Autos com obrigação em aberto chegam
  // sempre, independentemente da janela do perfil — é o que permite ao agente
  // fazer a recolha de um depósito antigo, no terreno e sem rede.
  if (Array.isArray(response.apreensoes) && response.apreensoes.length > 0) {
    for (const ap of response.apreensoes as any[]) {
      const { itens, ...auto } = ap;
      await db.apreensoes.put({ ...auto, synced: true });
      for (const it of itens ?? []) {
        await db.apreensaoItens.put({ ...it, apreensaoId: auto.id, synced: true });
      }
    }
    count += response.apreensoes.length;
  }

  // Catálogos de agentes e representantes conhecidos. O servidor qualifica
  // snapshots completos para que uma lista vazia também possa limpar cache
  // obsoleta sem transformar uma falha parcial numa eliminação local.
  await syncAgentesCatalog(response.agentes, response.agentes_state);
  await syncUtilizadoresCatalog(response.utilizadores, response.utilizadores_state);
  await syncRepresentantes(response.representantes, response.representantes_state);
  count += await syncReleasedComplaints(db.denuncias, response);
  const avatarSync = await syncAvatarCache(
    response.avatar_manifest,
    response.avatar_manifest_state,
  );
  if (avatarSync.pending > 0) {
    toast.info(
      `Dados sincronizados; ${avatarSync.pending} avatar${avatarSync.pending === 1 ? '' : 'es'} pendente${avatarSync.pending === 1 ? '' : 's'}.`,
    );
  }

  // Catálogo global de produtos — o modo manual dos operadores sem livro, e a
  // marca de que este dispositivo já sincronizou dados de cesta básica.
  if (Array.isArray(response.supply_catalog?.products)) {
    await writeSupplyCatalog(
      response.supply_catalog.products,
      response.supply_catalog.generated_at ?? null,
    );
  }

  // Aplicar tombstones por último. O servidor filtra os registos com soft
  // delete das listas activas; sem esta lista explícita o dispositivo nunca
  // descobriria que um registo que já tem localmente passou a status = -1.
  // A limpeza também remove filhos locais de uma fiscalização/apreensão
  // eliminada para não deixar contagens e detalhes órfãos no IndexedDB.
  const deletedCount = await applyServerDeletions(db, response.deleted);
  if (deletedCount > 0) {
    count += deletedCount;
    addAppLog('info', 'sync', `${deletedCount} eliminação(ões) do servidor aplicada(s) localmente`);
  }

  // Gravar novo timestamp de sync no metadata apenas depois dos tombstones.
  // Se a limpeza falhar, o cursor não avança e a eliminação volta no pull
  // seguinte, em vez de ficar perdida para sempre.
  await db.metadata.put({
    key: 'last_sync_at',
    value: response.since_server,
  });

  patchSyncState({ pullCount: count, lastSyncAt: response.since_server });

  return count;
}

let isSyncInProgress = false;
let syncRerunRequested = false;

/**
 * Refresca os dados de referência vindos de `asset` na cache local.
 *
 * Partilhado com o arranque de sessão (`App.tsx`), para haver um só sítio a
 * decidir que chaves são escritas — as listas de nacionalidades, tipos de
 * documento, unidades e ramos leem todas daqui.
 *
 * Nunca lança: sem rede, a cache anterior é o comportamento correcto.
 */
export async function refreshReferenceAssets(): Promise<void> {
  try {
    const data = await api.getAssets();
    localStorage.setItem('drcae_officers_list', JSON.stringify(data.officers || []));
    localStorage.setItem('drcae_assets', JSON.stringify(data.assets || []));
    localStorage.setItem('drcae_infractions', JSON.stringify(data.infractions || []));
    localStorage.setItem('drcae_branches', JSON.stringify(data.branches || []));
  } catch (err) {
    console.warn('[drcae] Falha ao refrescar dados de referência; a usar cache anterior.', err);
  }
}

// Sincronização Geral (Push -> Pull)
export async function triggerFullSync(profile = 'maximum'): Promise<{ pulled: number; pushed: number; errors: string[]; needsAuth?: boolean }> {
  if (isSyncInProgress) {
    syncRerunRequested = true;
    return { pulled: 0, pushed: 0, errors: [] };
  }
  isSyncInProgress = true;
  let totalPulled = 0;
  let totalPushed = 0;
  const allErrors: string[] = [];

  try {
    do {
      syncRerunRequested = false;
      const startedAt = Date.now();
      patchSyncState({ phase: 'pushing', startedAt, endedAt: undefined, errors: [], needsAuth: false });

      // 1. Push
      const pushRes = await syncPush();
      totalPushed += pushRes.pushed;
      allErrors.push(...pushRes.errors);

      // Se push falhou por auth, não tentar pull (mesmo motivo de falha)
      if (pushRes.needsAuth) {
        patchSyncState({ phase: 'needs-auth', needsAuth: true, endedAt: Date.now() });
        return { pulled: totalPulled, pushed: totalPushed, errors: allErrors, needsAuth: true };
      }

      // 2. Pull
      let pulled = 0;
      try {
        pulled = await syncPull(profile);
      } catch (err) {
        if (err instanceof AuthSyncError) {
          patchSyncState({ phase: 'needs-auth', needsAuth: true, endedAt: Date.now() });
          return { pulled: totalPulled, pushed: totalPushed, errors: allErrors, needsAuth: true };
        }
        patchSyncState({ phase: 'error', errors: [(err as Error).message], endedAt: Date.now() });
        addAppLog('error', 'sync', 'Falha no pull do servidor', err);
        throw err;
      }
      totalPulled += pulled;

      // Confirma no servidor, por versão opaca do token PASSWORD, que cada
      // credencial offline guardada continua ligada à senha em vigor. Nem a
      // senha nem o hash bcrypt/Argon do servidor atravessam esta fronteira.
      if (!(await validateCachedOfflineCredentials())) {
        patchSyncState({ phase: 'needs-auth', needsAuth: true, endedAt: Date.now() });
        return { pulled: totalPulled, pushed: totalPushed, errors: allErrors, needsAuth: true };
      }

      // 3. Dados de referência (`asset`): nacionalidades, tipos de documento,
      // unidades de medida e ramos. Só eram escritos no login, pelo que um
      // tablet com sessão aberta há semanas ficava com o catálogo congelado no
      // dia em que entrou. Falha aqui não é falha de sync: a cache anterior
      // continua válida e o pull já foi contabilizado.
      await refreshReferenceAssets();

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
    } while (syncRerunRequested);

    return {
      pulled: totalPulled,
      pushed: totalPushed,
      errors: allErrors,
    };
  } catch (err) {
    // Rede indisponível e sessão expirada já têm tratamento próprio; o que cai
    // aqui é o inesperado — um método que não existe na tabela, um registo
    // corrompido, uma quota esgotada. Sem este ramo a excepção escapava sem
    // tocar no estado de sincronização nem nos registos técnicos, e a app
    // ficava a dizer que estava tudo bem enquanto nada saía do dispositivo.
    const message = (err as Error)?.message || String(err);
    addAppLog('error', 'sync', `Sincronização interrompida: ${message}`, err);
    patchSyncState({ phase: 'error', endedAt: Date.now(), errors: [...allErrors, message] });
    throw err;
  } finally {
    isSyncInProgress = false;
  }
}

export async function triggerFullSyncIfReachable(profile = 'maximum'): Promise<{ reachable: boolean; pulled: number; pushed: number; errors: string[]; needsAuth?: boolean }> {
  const reachable = await probeServerReachability();
  if (!reachable) {
    return { reachable: false, pulled: 0, pushed: 0, errors: [] };
  }

  const result = await triggerFullSync(profile);
  return { reachable: true, ...result };
}
