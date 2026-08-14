import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrcaeDB } from './db';
import { setActiveKey, type AppCryptoKey } from '../lib/crypto';

const oldKey: AppCryptoKey = { type: 'fallback', hash: new Uint8Array(32).fill(1) };
const newKey: AppCryptoKey = { type: 'fallback', hash: new Uint8Array(32).fill(2) };
const database = new DrcaeDB('drcae_rekey_test');

afterEach(async () => {
  database.close();
  await database.delete();
  setActiveKey(null);
});

describe('migração para a chave partilhada do dispositivo', () => {
  it('preserva registos por sincronizar e deixa de aceitar a chave antiga', async () => {
    setActiveKey(oldKey);
    await database.visitas.put({
      id: 'visita-1',
      firmaId: 'firma-1',
      date: '2026-08-13',
      time: '10:00',
      technicians: [],
      representante: { name: 'Representante', docType: 'bi', docNumber: '1' },
      status: 'Pendente',
      synced: false,
      notes: 'prova por enviar',
    });
    await database.setupOfflineCanary();

    await database.rekeyEncryptedData(oldKey, newKey);

    expect(await database.verifyOfflineKey()).toBe(true);
    expect((await database.visitas.get('visita-1'))?.notes).toBe('prova por enviar');
    setActiveKey(oldKey);
    const expectedFailure = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await database.verifyOfflineKey()).toBe(false);
    expectedFailure.mockRestore();
  });
});
