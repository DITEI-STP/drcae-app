import { db } from '../db/db';
import * as api from './api';

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

  // Actualizar Visitas
  if (response.visitas && response.visitas.length > 0) {
    await db.visitas.bulkPut(response.visitas);
    count += response.visitas.length;
  }

  // Actualizar Infracções
  if (response.infracoes && response.infracoes.length > 0) {
    await db.infracoes.bulkPut(response.infracoes);
    count += response.infracoes.length;
  }

  // Gravar novo timestamp de sync no metadata
  await db.metadata.put({
    key: 'last_sync_at',
    value: response.since_server,
  });

  return count;
}

// Executa o Push (Upload de alterações offline)
export async function syncPush(): Promise<{ pushed: number; errors: string[] }> {
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

  const response = await api.pushSync(payload);

  // Marcar aceitos como sincronizados
  if (response.accepted && response.accepted.length > 0) {
    const acceptedIds = new Set(response.accepted);

    // Actualizar status nas tabelas locais
    for (const f of unsyncedFirmas) {
      if (f.id && acceptedIds.has(f.id)) {
        await db.firmas.update(f.id, { synced: true });
      }
    }
    for (const v of unsyncedVisitas) {
      if (v.id && acceptedIds.has(v.id)) {
        await db.visitas.update(v.id, { synced: true });
      }
    }
    for (const inf of unsyncedInfracoes) {
      if (inf.id && acceptedIds.has(inf.id)) {
        await db.infracoes.update(inf.id, { synced: true });
      }
    }
    for (const a of unsyncedAnexos) {
      if (a.id && acceptedIds.has(a.id)) {
        await db.anexos.update(a.id, { synced: true });
      }
    }
  }

  return {
    pushed: response.accepted?.length || 0,
    errors: response.errors || [],
  };
}

// Sincronização Geral (Push -> Pull)
export async function triggerFullSync(profile = 'standard'): Promise<{ pulled: number; pushed: number; errors: string[] }> {
  // 1. Push
  const pushRes = await syncPush();
  
  // 2. Pull
  const pulled = await syncPull(profile);

  return {
    pulled,
    pushed: pushRes.pushed,
    errors: pushRes.errors,
  };
}
