import { describe, expect, it } from 'vitest';
import {
  applyServerDeletions,
  type SyncDeletionDatabase,
} from './syncDeletions';

type Row = Record<string, unknown> & { id?: string; key?: string };

class FakeTable {
  constructor(public rows: Row[]) {}

  async bulkDelete(keys: string[]) {
    const keySet = new Set(keys);
    this.rows = this.rows.filter((row) => !keySet.has(String(row.id ?? row.key ?? '')));
  }

  where(index: string) {
    return {
      anyOf: (values: string[]) => ({
        primaryKeys: async () => {
          const valueSet = new Set(values);
          return this.rows
            .filter((row) => valueSet.has(String(row[index] ?? '')))
            .map((row) => String(row.id ?? row.key ?? ''));
        },
      }),
    };
  }
}

type TestDatabase = { [K in keyof SyncDeletionDatabase]: FakeTable };

function database(overrides: Partial<Record<keyof SyncDeletionDatabase, Row[]>> = {}): TestDatabase {
  const names: Array<keyof SyncDeletionDatabase> = [
    'firmas', 'visitas', 'constatacoes', 'infracoes', 'anexos', 'attachments',
    'representantes', 'apreensoes', 'apreensaoItens', 'recolhas', 'recolhaItens',
    'metadata',
  ];
  return Object.fromEntries(
    names.map((name) => [name, new FakeTable(overrides[name] ?? [])]),
  ) as TestDatabase;
}

describe('applyServerDeletions', () => {
  it('remove uma firma e caches derivados sem apagar visitas históricas', async () => {
    const db = database({
      firmas: [{ id: 'firma-1' }, { id: 'firma-2' }],
      visitas: [{ id: 'visita-1', firmaId: 'firma-1' }],
      representantes: [{ id: 'rep-1', firmaId: 'firma-1' }],
      metadata: [{ key: 'supply_firma-1' }, { key: 'other' }],
    });

    expect(await applyServerDeletions(db, { firmas: ['firma-1'] })).toBe(1);
    expect(db.firmas.rows).toEqual([{ id: 'firma-2' }]);
    expect(db.representantes.rows).toEqual([]);
    expect(db.metadata.rows).toEqual([{ key: 'other' }]);
    expect(db.visitas.rows).toEqual([{ id: 'visita-1', firmaId: 'firma-1' }]);
  });

  it('remove os filhos locais de visitas e apreensões eliminadas', async () => {
    const db = database({
      visitas: [{ id: 'visita-1' }],
      constatacoes: [{ id: 'const-1', visitaId: 'visita-1' }],
      infracoes: [
        { id: 'inf-1', visitaId: 'visita-1' },
        { id: 'inf-2', visitaId: 'visita-2' },
      ],
      anexos: [{ id: 'anexo-1', visitaId: 'visita-1' }],
      attachments: [{ id: 'anexo-1', visitaId: 'visita-1' }],
      apreensoes: [{ id: 'apr-1', visitaId: 'visita-1' }],
      apreensaoItens: [{ id: 'item-1', apreensaoId: 'apr-1' }],
      recolhas: [{ id: 'rec-1', apreensaoId: 'apr-1' }],
      recolhaItens: [{ id: 'rec-item-1', recolhaId: 'rec-1' }],
    });

    expect(await applyServerDeletions(db, {
      visitas: ['visita-1'],
      infracoes: ['inf-2'],
    })).toBe(2);

    for (const table of [
      db.visitas, db.constatacoes, db.infracoes, db.anexos, db.attachments,
      db.apreensoes, db.apreensaoItens, db.recolhas, db.recolhaItens,
    ]) {
      expect(table.rows).toEqual([]);
    }
  });
});
