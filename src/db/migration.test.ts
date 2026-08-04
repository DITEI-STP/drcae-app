import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Subida de esquema do Dexie com dados existentes.
 *
 * Um dispositivo de campo **não** cria a base de raiz: abre uma base v7 já com
 * fiscalizações por sincronizar. Se a subida para v8 falhar, `db.open()`
 * rejeita, todos os `useLiveQuery` falham e o ecrã fica em branco — que é
 * exactamente o sintoma reportado no tablet, e que não se reproduz num browser
 * novo, onde a v8 é criada de raiz.
 */

const V7_STORES = {
  firmas: 'id, synced',
  visitas: 'id, firmaId, synced, offlineCode, officialCode',
  infracoes: 'id, visitaId, synced',
  anexos: 'id, visitaId, synced',
  attachments: 'id, visitaId, synced',
  syncQueue: '++id, entity, action, timestamp',
  metadata: 'key',
};

const V8_STORES = {
  ...V7_STORES,
  agentes: 'uid, district',
  representantes: 'id, firmaId, synced',
  apreensoes: 'id, visitaId, firmaId, synced, settlementStatus',
  apreensaoItens: 'id, apreensaoId, synced, custody',
  recolhas: 'id, apreensaoId, synced',
  recolhaItens: 'id, recolhaId, apreensaoItemId, synced',
};

/**
 * v9 (SPEC-10) não se limita a criar uma store nova: acrescenta índices a
 * stores **já povoadas** (`constatacaoId` em infracoes/anexos/apreensoes,
 * `draftState` em visitas). Reindexar uma store com registos é onde uma subida
 * de esquema falha, e falha em campo — não no browser do programador, onde a
 * base nasce já na versão final.
 */
const V9_STORES = {
  ...V8_STORES,
  visitas: 'id, firmaId, synced, offlineCode, officialCode, draftState',
  constatacoes: 'id, visitaId, synced',
  infracoes: 'id, visitaId, synced, constatacaoId',
  anexos: 'id, visitaId, synced, constatacaoId',
  apreensoes: 'id, visitaId, firmaId, synced, settlementStatus, constatacaoId',
};

/**
 * v10 — provas do rascunho fora do `localStorage`. Aditiva: uma store nova,
 * sem tocar em índices existentes.
 */
const V10_STORES = {
  ...V9_STORES,
  draftAttachments: 'localId, ordem',
};

const V11_STORES = {
  ...V10_STORES,
  utilizadores: 'uid, role, isOfficer',
  avatarFiles: 'ownerUid, avatarUid, version, updatedAt',
};

const DB_NAME = 'drcae_migration_test';

beforeEach(async () => {
  await Dexie.delete(DB_NAME);
});

describe('subida v7 → v8 com dados existentes', () => {
  it('abre sem erro e preserva os registos', async () => {
    const v7 = new Dexie(DB_NAME);
    v7.version(7).stores(V7_STORES);
    await v7.open();
    await v7.table('visitas').add({ id: 'v1', firmaId: 'f1', synced: false });
    await v7.table('metadata').add({ key: 'last_sync_at', value: '2026-07-30' });
    v7.close();

    const v8 = new Dexie(DB_NAME);
    v8.version(7).stores(V7_STORES);
    v8.version(8).stores(V8_STORES);

    await expect(v8.open()).resolves.toBeDefined();

    // Os dados por sincronizar não podem desaparecer numa subida de esquema.
    expect(await v8.table('visitas').count()).toBe(1);
    expect((await v8.table('metadata').get('last_sync_at'))?.value).toBe('2026-07-30');

    // As stores novas existem e estão vazias.
    for (const store of ['agentes', 'representantes', 'apreensoes', 'apreensaoItens', 'recolhas', 'recolhaItens']) {
      expect(await v8.table(store).count()).toBe(0);
    }
    v8.close();
  });

  it('declarar só a v8, sem a v7, também abre sobre uma base v7', async () => {
    // Um dispositivo actualiza o bundle e passa a ver apenas as versões que o
    // código declara. Se a cadeia de versões estiver incompleta, o Dexie tem
    // de conseguir na mesma reconciliar o esquema existente.
    const v7 = new Dexie(DB_NAME);
    v7.version(7).stores(V7_STORES);
    await v7.open();
    await v7.table('firmas').add({ id: 'f1', synced: true });
    v7.close();

    const only8 = new Dexie(DB_NAME);
    only8.version(8).stores(V8_STORES);
    await expect(only8.open()).resolves.toBeDefined();
    expect(await only8.table('firmas').count()).toBe(1);
    only8.close();
  });
});

describe('subida v8 → v9 com dados existentes (SPEC-10)', () => {
  it('reindexa stores povoadas sem perder registos', async () => {
    const v8 = new Dexie(DB_NAME);
    v8.version(8).stores(V8_STORES);
    await v8.open();
    await v8.table('visitas').add({ id: 'v1', firmaId: 'f1', synced: false });
    await v8.table('infracoes').add({ id: 'i1', visitaId: 'v1', synced: false });
    await v8.table('anexos').add({ id: 'a1', visitaId: 'v1', synced: false });
    await v8.table('apreensoes').add({ id: 'ap1', visitaId: 'v1', firmaId: 'f1', synced: false });
    v8.close();

    const v9 = new Dexie(DB_NAME);
    v9.version(8).stores(V8_STORES);
    v9.version(9).stores(V9_STORES);
    await expect(v9.open()).resolves.toBeDefined();

    // Fiscalização por sincronizar sobrevive à reindexação, com os filhos.
    expect(await v9.table('visitas').count()).toBe(1);
    expect(await v9.table('infracoes').count()).toBe(1);
    expect(await v9.table('anexos').count()).toBe(1);
    expect(await v9.table('apreensoes').count()).toBe(1);
    expect(await v9.table('constatacoes').count()).toBe(0);
    v9.close();
  });

  it('registos anteriores à v9 não contam como rascunho', async () => {
    // `draftState` ausente é submetido. Se a exclusão de rascunhos fosse
    // escrita como «tudo o que não é 'submitted'», toda a fiscalização
    // anterior à SPEC-10 desaparecia das listagens e do push de uma só vez.
    const v8 = new Dexie(DB_NAME);
    v8.version(8).stores(V8_STORES);
    await v8.open();
    await v8.table('visitas').add({ id: 'antiga', firmaId: 'f1', synced: false });
    v8.close();

    const v9 = new Dexie(DB_NAME);
    v9.version(8).stores(V8_STORES);
    v9.version(9).stores(V9_STORES);
    await v9.open();
    await v9.table('visitas').add({ id: 'rascunho', firmaId: 'f1', draftState: 'draft' });

    const rascunhos = await v9.table('visitas').where('draftState').equals('draft').toArray();
    expect(rascunhos.map((v) => v.id)).toEqual(['rascunho']);
    v9.close();
  });
});

describe('subida v9 → v10 com dados existentes', () => {
  it('cria a store de provas do rascunho sem perder registos', async () => {
    const v9 = new Dexie(DB_NAME);
    v9.version(9).stores(V9_STORES);
    await v9.open();
    await v9.table('visitas').add({ id: 'v1', firmaId: 'f1', synced: false });
    await v9.table('constatacoes').add({ id: 'c1', visitaId: 'v1', synced: false });
    v9.close();

    const v10 = new Dexie(DB_NAME);
    v10.version(9).stores(V9_STORES);
    v10.version(10).stores(V10_STORES);
    await expect(v10.open()).resolves.toBeDefined();

    expect(await v10.table('visitas').count()).toBe(1);
    expect(await v10.table('constatacoes').count()).toBe(1);
    expect(await v10.table('draftAttachments').count()).toBe(0);
    v10.close();
  });

  it('guarda e relê a prova por ordem de captura, com a constatação', async () => {
    // A ordem é o que faz o rascunho reabrir com as provas como estavam, e a
    // constatação é o que as mantém agrupadas — perder qualquer uma torna a
    // recuperação numa lista de fotografias sem contexto.
    const v10 = new Dexie(DB_NAME);
    v10.version(10).stores(V10_STORES);
    await v10.open();
    await v10.table('draftAttachments').bulkPut([
      { localId: 'b', name: 'b.jpg', type: 'image/jpeg', data: new Blob(['b']), constatacaoId: 'c2', ordem: 1 },
      { localId: 'a', name: 'a.jpg', type: 'image/jpeg', data: new Blob(['a']), constatacaoId: 'c1', ordem: 0 },
    ]);

    const lidas = await v10.table('draftAttachments').orderBy('ordem').toArray();
    expect(lidas.map((p) => p.localId)).toEqual(['a', 'b']);
    expect(lidas.map((p) => p.constatacaoId)).toEqual(['c1', 'c2']);
    v10.close();
  });
});

describe('subida v10 → v11 com dados existentes', () => {
  it('adiciona o diretório e os avatares sem tocar nos dados de campo', async () => {
    const v10 = new Dexie(DB_NAME);
    v10.version(10).stores(V10_STORES);
    await v10.open();
    await v10.table('visitas').add({ id: 'v1', firmaId: 'f1', synced: false });
    await v10.table('agentes').add({ uid: 'a1', name: 'Agente Um' });
    v10.close();

    const v11 = new Dexie(DB_NAME);
    v11.version(10).stores(V10_STORES);
    v11.version(11).stores(V11_STORES);
    await expect(v11.open()).resolves.toBeDefined();

    expect(await v11.table('visitas').count()).toBe(1);
    expect(await v11.table('agentes').count()).toBe(1);
    await v11.table('avatarFiles').put({
      ownerUid: 'a1', avatarUid: 'av1', version: 'v1',
      data: new Blob(['png']), mimetype: 'image/png', updatedAt: 1,
    });
    expect((await v11.table('avatarFiles').get('a1'))?.version).toBe('v1');
    v11.close();
  });
});
