import { db, type Anexo } from '../db/db';
import { isRascunho, rascunhoIds } from './visitaDraft';
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
import { tecnicoNames } from './inspectionModel';
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

async function legacyAnexoDataToBase64(anexo: Anexo): Promise<string> {
  if (typeof anexo.data === 'string' && anexo.data.trim()) return anexo.data;
  if (anexo.data instanceof ArrayBuffer) return arrayBufferToBase64(anexo.data);
  if (anexo.data instanceof Blob) return arrayBufferToBase64(await anexo.data.arrayBuffer());
  throw new Error('Anexo sem dados locais válidos.');
}

async function ensureAnexoUploadReference(anexo: Anexo): Promise<Anexo> {
  if (anexo.file_ref) return anexo;
  if (anexo.id) {
    const attachment = await db.attachments.get(anexo.id);
    if (attachment?.data) {
      const upload = await api.uploadSyncAttachment({
        id: anexo.id,
        visitaId: anexo.visitaId,
        fileName: anexo.fileName,
        fileType: anexo.fileType || 'application/octet-stream',
        blob: attachment.data,
      });
      // O fotograma segue com o anexo, uma vez. Falhar aqui não pode impedir
      // a prova de subir: perde-se a miniatura, que é conveniência, não a
      // prova, que é o documento.
      let posterFields: { poster_ref?: string; posterUrl?: string } = {};
      if (attachment.poster) {
        try {
          const enviado = await api.uploadSyncAttachmentPoster({
            id: anexo.id,
            visitaId: anexo.visitaId,
            blob: attachment.poster,
          });
          posterFields = { poster_ref: enviado.file_ref, posterUrl: enviado.url };
        } catch (err) {
          addAppLog('warn', 'sync', `Fotograma do anexo ${anexo.id} não foi enviado`, err);
        }
      }

      const updates = {
        file_ref: upload.file_ref,
        uploadSize: upload.size,
        url: upload.url || anexo.url,
        data: '',
        ...posterFields,
      };
      await db.anexos.update(anexo.id, updates);
      return { ...anexo, ...updates };
    }
  }

  return {
    ...anexo,
    data: await legacyAnexoDataToBase64(anexo),
  };
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

// Executa o Push (Upload de alterações offline)
export async function syncPush(): Promise<{ pushed: number; errors: string[]; needsAuth?: boolean }> {
  // Ponto de estrangulamento único do rascunho (SPEC-10 §8): uma fiscalização
  // por concluir e tudo o que já se lhe pendurou tem `synced: false` como
  // qualquer registo por sincronizar, e sem este filtro seguiria para o
  // servidor a meio de estar a ser preenchida no terreno.
  const rascunhos = await rascunhoIds();
  const doRascunho = (visitaId: string | undefined) => !!visitaId && rascunhos.has(visitaId);

  // Buscar registros não sincronizados (synced === false ou synced === 0)
  const unsyncedFirmas = await db.firmas.filter(f => !f.synced).toArray();
  const unsyncedVisitas = await db.visitas.filter(v => !v.synced && !isRascunho(v)).toArray();
  const unsyncedInfracoes = await db.infracoes.filter(inf => !inf.synced && !doRascunho(inf.visitaId)).toArray();
  const unsyncedAnexos = await db.anexos.filter(a => !a.synced && !doRascunho(a.visitaId)).toArray();
  const unsyncedApreensoes = await db.apreensoes.filter(a => !a.synced && !doRascunho(a.visitaId)).toArray();
  const unsyncedRecolhas = await db.recolhas.filter(r => !r.synced).toArray();
  const unsyncedConstatacoes = await db.constatacoes
    .filter(c => !c.synced && !doRascunho(c.visitaId))
    .toArray();

  if (
    unsyncedFirmas.length === 0 &&
    unsyncedVisitas.length === 0 &&
    unsyncedInfracoes.length === 0 &&
    unsyncedAnexos.length === 0 &&
    unsyncedApreensoes.length === 0 &&
    unsyncedRecolhas.length === 0 &&
    unsyncedConstatacoes.length === 0
  ) {
    return { pushed: 0, errors: [] };
  }

  // Os itens viajam dentro do respectivo auto: o servidor cria auto e itens na
  // mesma transacção lógica, e deduplica por `app_uid`. Enviá-los como
  // entidades soltas abriria a porta a um auto sem itens, que o backend recusa.
  const apreensoesPayload = await Promise.all(
    unsyncedApreensoes.map(async (ap) => ({
      ...ap,
      itens: await db.apreensaoItens.where('apreensaoId').equals(ap.id!).toArray(),
    })),
  );
  const recolhasPayload = await Promise.all(
    unsyncedRecolhas.map(async (rec) => ({
      ...rec,
      itens: await db.recolhaItens.where('recolhaId').equals(rec.id!).toArray(),
    })),
  );

  // Recolher preços de cesta básica de todas as visitas com produtos.
  // Conformidade é calculada por campo (grosso/retalho separadamente) para
  // que o admin possa mostrar qual dos dois está irregular — `eval` (0/1/-1)
  // continua a ser guardado como resumo agregado do produto para compatibilidade
  // com código existente (ex.: classificação de estado da fiscalização).
  const toEval = (num: number | null, book: number | null | undefined): 'conforme' | 'nao_conforme' | null => {
    if (num == null || book == null) return null;
    return num <= book ? 'conforme' : 'nao_conforme';
  };

  const prices: any[] = [];
  for (const v of unsyncedVisitas) {
    if (v.produtos && v.produtos.length > 0) {
      for (const p of v.produtos) {
        if (p.product_id && (p.gross || p.retail)) {
          const grossNum = p.gross ? parseFloat(p.gross) : null;
          const retailNum = p.retail ? parseFloat(p.retail) : null;
          const hasBook = p.grossPrice != null || p.retailPrice != null;
          const mode: 'auto' | 'manual' = hasBook ? 'auto' : 'manual';

          // Modo automático — operador tem livro de cálculo em vigor, compara
          // cada campo preenchido com o preço de referência. Modo manual —
          // sem livro, usa a classificação que o agente já escolheu em
          // NovaVisita.tsx STEP 6.
          const grossEval = mode === 'auto' ? toEval(grossNum, p.grossPrice) : (p.grossEval ?? null);
          const retailEval = mode === 'auto' ? toEval(retailNum, p.retailPrice) : (p.retailEval ?? null);

          const fieldEvals = [grossEval, retailEval].filter(Boolean);
          let eval_ = -1;
          if (fieldEvals.includes('nao_conforme')) eval_ = 0;
          else if (fieldEvals.includes('conforme')) eval_ = 1;

          const meta = { mode, grossEval, retailEval };
          prices.push({ visitaId: v.id, product_id: p.product_id, gross: grossNum, retail: retailNum, eval: eval_, meta });
        }
      }
    }
  }

  const pushTotal =
    unsyncedFirmas.length + unsyncedVisitas.length +
    unsyncedInfracoes.length + unsyncedAnexos.length;

  patchSyncState({ phase: 'pushing', pushTotal, pushDone: 0, pushErrors: 0 });

  const savedTeam = localStorage.getItem('drcae_equipe');
  // `.join()` sobre a equipa em formato novo produzia «[object Object]».
  const parsedTeam = savedTeam
    ? tecnicoNames(JSON.parse(savedTeam)).join(', ') || null
    : null;
  const anexoPayload: any[] = [];
  const localErrors: string[] = [];
  for (const a of unsyncedAnexos) {
    try {
      const prepared = await ensureAnexoUploadReference(a);
      anexoPayload.push({
        ...prepared,
        file_ref: prepared.file_ref,
        data: prepared.file_ref ? undefined : prepared.data,
      });
    } catch (err) {
      const message = `Anexo ${a.id}: ${(err as Error).message}`;
      localErrors.push(message);
      addAppLog('error', 'sync', message, err);
    }
  }

  const payload = {
    firmas: unsyncedFirmas,
    visitas: unsyncedVisitas,
    infracoes: unsyncedInfracoes,
    anexos: anexoPayload,
    prices,
    apreensoes: apreensoesPayload,
    recolhas: recolhasPayload,
    constatacoes: unsyncedConstatacoes,
    team: parsedTeam,
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
    addAppLog('error', 'sync', 'Falha no push para o servidor', err);
    throw err;
  }

  // Marcar aceitos como sincronizados
  if (response.accepted && response.accepted.length > 0) {
    const acceptedIds = new Set(response.accepted);
    const now = Date.now();
    const UMA_HORA = 60 * 60 * 1000;

    // A constatação segue a sorte da fiscalização que agrupa: o servidor
    // deduplica-a por `app_uid`, pelo que reenviá-la por engano é inofensivo,
    // ao passo que dá-la por sincronizada sem a visita ter sido aceite deixaria
    // o agrupamento no dispositivo e nunca mais no servidor.
    for (const c of unsyncedConstatacoes) {
      if (c.id && acceptedIds.has(c.visitaId)) {
        await db.constatacoes.update(c.id, { synced: true });
      }
    }

    // Os autos aceites e os respectivos itens deixam de estar pendentes.
    for (const ap of unsyncedApreensoes) {
      if (!ap.id || !acceptedIds.has(ap.id)) continue;
      await db.apreensoes.update(ap.id, { synced: true });
      const itens = await db.apreensaoItens.where('apreensaoId').equals(ap.id).toArray();
      for (const it of itens) {
        if (it.id) await db.apreensaoItens.update(it.id, { synced: true });
      }
    }
    for (const rec of unsyncedRecolhas) {
      if (!rec.id || !acceptedIds.has(rec.id)) continue;
      await db.recolhas.update(rec.id, { synced: true });
      const itens = await db.recolhaItens.where('recolhaId').equals(rec.id).toArray();
      for (const it of itens) {
        if (it.id) await db.recolhaItens.update(it.id, { synced: true });
      }
    }

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
  const allErrors = [...localErrors, ...(response.errors || [])];
  const rejected = allErrors.length;
  if (allErrors.length > 0) {
    addAppLog('error', 'sync', 'Servidor devolveu erros de sincronização', allErrors);
  }
  patchSyncState({ pushDone: accepted, pushErrors: rejected });

  return {
    pushed: accepted,
    errors: allErrors,
  };
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
