import { db, type DrcaeDB } from '../db/db';

export type SyncCacheDatabase = Pick<
  DrcaeDB,
  'firmas' | 'visitas' | 'infracoes' | 'anexos' | 'attachments' | 'metadata'
>;

export interface SyncCacheSnapshot {
  syncedFirmas: number;
  syncedVisitas: number;
  syncedInfracoes: number;
  syncedAnexos: number;
  lastSyncAt?: string | null;
}

export function hasClearableSyncCache(snapshot: SyncCacheSnapshot): boolean {
  return snapshot.syncedFirmas
    + snapshot.syncedVisitas
    + snapshot.syncedInfracoes
    + snapshot.syncedAnexos > 0
    || Boolean(snapshot.lastSyncAt);
}

export async function clearSyncedServerCache(
  database: SyncCacheDatabase = db,
): Promise<number> {
  const syncedFirmas = await database.firmas.filter((row) => row.synced === true).toArray();
  const syncedVisitas = await database.visitas.filter((row) => row.synced === true).toArray();
  const syncedInfracoes = await database.infracoes.filter((row) => row.synced === true).toArray();
  const syncedAnexos = await database.anexos.filter((row) => row.synced === true).toArray();

  // Invalida primeiro o cursor incremental. Mesmo que uma eliminação local
  // falhe depois, o próximo pull volta a ser completo e consegue reconstruir
  // o cache a partir dos dados activos do servidor.
  await database.metadata.delete('last_sync_at');

  await database.firmas.bulkDelete(syncedFirmas.map((row) => row.id!));
  await database.visitas.bulkDelete(syncedVisitas.map((row) => row.id!));
  await database.infracoes.bulkDelete(syncedInfracoes.map((row) => row.id!));
  await database.anexos.bulkDelete(syncedAnexos.map((row) => row.id!));
  await database.attachments.bulkDelete(syncedAnexos.map((row) => row.id!)).catch(() => {});

  return syncedFirmas.length + syncedVisitas.length + syncedInfracoes.length + syncedAnexos.length;
}
