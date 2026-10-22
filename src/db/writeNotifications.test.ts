import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DrcaeDB, onDatabaseWrite } from './db';
import { setActiveKey } from '../lib/crypto';

const database = new DrcaeDB('write-notifications-test');
let unsubscribe = () => {};
afterEach(async () => {
  unsubscribe();
  database.close();
  await database.delete();
  setActiveKey(null);
});

describe('notificação de escrita após transacção', () => {
  it('permite que a cache de operadores leia outras stores ao sincronizar representantes', async () => {
    setActiveKey({ type: 'fallback', hash: new Uint8Array(32).fill(1) });
    await database.firmas.put({ id: 'firma', name: 'MARINA', nif: '1', district: '', address: '', contact: '', email: '', type: '', representant: '' });
    const reads: Promise<unknown>[] = [];
    unsubscribe = onDatabaseWrite(() => {
      reads.push(database.firmas.toArray().then(() => 'ok', (error: Error) => error.name));
    });
    await database.transaction('rw', database.table('representantes'), async () => {
      await database.representantes.clear();
      await database.representantes.bulkPut([{ id: 'r', firmaId: 'firma', name: 'Representante', docType: 'bi', docNumber: '1' }]);
    });
    expect(reads.length).toBeGreaterThan(0);
    expect(await Promise.all(reads)).toEqual(reads.map(() => 'ok'));
  });
});
