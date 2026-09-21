export interface SyncDeletionDelta {
  firmas?: unknown;
  visitas?: unknown;
  infracoes?: unknown;
  anexos?: unknown;
  apreensoes?: unknown;
}

interface SyncDeletionTable {
  bulkDelete(keys: string[]): Promise<unknown>;
  where(index: string): {
    anyOf(values: string[]): {
      primaryKeys(): Promise<unknown[]>;
    };
  };
}

export interface SyncDeletionDatabase {
  firmas: SyncDeletionTable;
  visitas: SyncDeletionTable;
  constatacoes: SyncDeletionTable;
  infracoes: SyncDeletionTable;
  anexos: SyncDeletionTable;
  attachments: SyncDeletionTable;
  representantes: SyncDeletionTable;
  apreensoes: SyncDeletionTable;
  apreensaoItens: SyncDeletionTable;
  recolhas: SyncDeletionTable;
  recolhaItens: SyncDeletionTable;
  metadata: {
    bulkDelete(keys: string[]): Promise<unknown>;
  };
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

function mergeIds(...values: string[][]): string[] {
  return [...new Set(values.flat())];
}

async function relatedIds(
  table: SyncDeletionTable,
  index: string,
  parentIds: string[],
): Promise<string[]> {
  if (parentIds.length === 0) return [];
  const keys = await table.where(index).anyOf(parentIds).primaryKeys();
  return keys.filter((key): key is string => typeof key === 'string');
}

async function remove(table: { bulkDelete(keys: string[]): Promise<unknown> }, keys: string[]) {
  if (keys.length > 0) await table.bulkDelete(keys);
}

/**
 * Aplica tombstones enviados pelo servidor antes de o cursor de pull avançar.
 *
 * A limpeza de entidades-pai é deliberadamente em cascata: IndexedDB não tem
 * foreign keys e manter filhos de uma visita/apreensão removida deixaria
 * contagens, provas e detalhes órfãos no modo offline.
 */
export async function applyServerDeletions(
  database: SyncDeletionDatabase,
  value: SyncDeletionDelta | undefined | null,
): Promise<number> {
  const deletedFirmas = ids(value?.firmas);
  const deletedVisitas = ids(value?.visitas);
  const directInfracoes = ids(value?.infracoes);
  const directAnexos = ids(value?.anexos);
  const directApreensoes = ids(value?.apreensoes);

  const representantes = await relatedIds(database.representantes, 'firmaId', deletedFirmas);
  const constatacoes = await relatedIds(database.constatacoes, 'visitaId', deletedVisitas);
  const infracoes = mergeIds(
    directInfracoes,
    await relatedIds(database.infracoes, 'visitaId', deletedVisitas),
  );
  const anexos = mergeIds(
    directAnexos,
    await relatedIds(database.anexos, 'visitaId', deletedVisitas),
  );
  const attachments = mergeIds(
    directAnexos,
    await relatedIds(database.attachments, 'visitaId', deletedVisitas),
  );
  const apreensoes = mergeIds(
    directApreensoes,
    await relatedIds(database.apreensoes, 'visitaId', deletedVisitas),
  );
  const apreensaoItens = await relatedIds(database.apreensaoItens, 'apreensaoId', apreensoes);
  const recolhas = await relatedIds(database.recolhas, 'apreensaoId', apreensoes);
  const recolhaItens = await relatedIds(database.recolhaItens, 'recolhaId', recolhas);

  await remove(database.recolhaItens, recolhaItens);
  await remove(database.recolhas, recolhas);
  await remove(database.apreensaoItens, apreensaoItens);
  await remove(database.apreensoes, apreensoes);
  await remove(database.attachments, attachments);
  await remove(database.anexos, anexos);
  await remove(database.infracoes, infracoes);
  await remove(database.constatacoes, constatacoes);
  await remove(database.visitas, deletedVisitas);
  await remove(database.representantes, representantes);
  await remove(database.firmas, deletedFirmas);
  await remove(database.metadata, deletedFirmas.map((id) => `supply_${id}`));

  return (
    deletedFirmas.length +
    deletedVisitas.length +
    directInfracoes.length +
    directAnexos.length +
    directApreensoes.length
  );
}
