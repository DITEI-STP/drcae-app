import { describe, expect, it } from 'vitest';
import {
  clearSyncedServerCache,
  hasClearableSyncCache,
  type SyncCacheDatabase,
} from './syncCache';

type Row = { id?: string; synced?: boolean };

class FakeTable {
  constructor(public rows: Row[]) {}

  filter(predicate: (row: Row) => boolean) {
    return {
      toArray: async () => this.rows.filter(predicate),
    };
  }

  async bulkDelete(ids: string[]) {
    const idSet = new Set(ids);
    this.rows = this.rows.filter((row) => !row.id || !idSet.has(row.id));
  }
}

class FakeMetadata {
  deletedKeys: string[] = [];

  async delete(key: string) {
    this.deletedKeys.push(key);
  }
}

function fakeDatabase(): {
  database: SyncCacheDatabase;
  tables: Record<'firmas' | 'visitas' | 'infracoes' | 'anexos' | 'attachments', FakeTable>;
  metadata: FakeMetadata;
} {
  const tables = {
    firmas: new FakeTable([{ id: 'firma-sync', synced: true }, { id: 'firma-local', synced: false }]),
    visitas: new FakeTable([{ id: 'visita-sync', synced: true }, { id: 'visita-local', synced: false }]),
    infracoes: new FakeTable([{ id: 'inf-sync', synced: true }, { id: 'inf-local', synced: false }]),
    anexos: new FakeTable([{ id: 'anexo-sync', synced: true }, { id: 'anexo-local', synced: false }]),
    attachments: new FakeTable([{ id: 'anexo-sync' }, { id: 'anexo-local' }]),
  };
  const metadata = new FakeMetadata();

  return {
    database: { ...tables, metadata } as unknown as SyncCacheDatabase,
    tables,
    metadata,
  };
}

describe('sync cache reset', () => {
  it('considera o cursor incremental como cache que ainda pode ser limpa', () => {
    expect(hasClearableSyncCache({
      syncedFirmas: 0,
      syncedVisitas: 0,
      syncedInfracoes: 0,
      syncedAnexos: 0,
      lastSyncAt: '2026-09-21T10:00:00.000Z',
    })).toBe(true);

    expect(hasClearableSyncCache({
      syncedFirmas: 0,
      syncedVisitas: 0,
      syncedInfracoes: 0,
      syncedAnexos: 0,
      lastSyncAt: null,
    })).toBe(false);
  });

  it('remove apenas dados sincronizados e reinicia o cursor do pull', async () => {
    const { database, tables, metadata } = fakeDatabase();

    await expect(clearSyncedServerCache(database)).resolves.toBe(4);

    expect(metadata.deletedKeys).toEqual(['last_sync_at']);
    expect(tables.firmas.rows).toEqual([{ id: 'firma-local', synced: false }]);
    expect(tables.visitas.rows).toEqual([{ id: 'visita-local', synced: false }]);
    expect(tables.infracoes.rows).toEqual([{ id: 'inf-local', synced: false }]);
    expect(tables.anexos.rows).toEqual([{ id: 'anexo-local', synced: false }]);
    expect(tables.attachments.rows).toEqual([{ id: 'anexo-local' }]);
  });
});
