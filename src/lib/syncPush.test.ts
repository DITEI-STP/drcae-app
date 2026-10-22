import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { setActiveKey } from './crypto';
import { syncPush } from './syncPush';
import { pushSync } from './api';

vi.mock('./api', () => ({ pushSync: vi.fn(), AuthSyncError: class extends Error {} }));
afterEach(async () => { db.close(); await db.delete(); setActiveKey(null); vi.clearAllMocks(); });

describe('dependências do push', () => {
  it('reenvia firma já marcada como sincronizada com a fiscalização que ficou pendente', async () => {
    setActiveKey({ type: 'fallback', hash: new Uint8Array(32).fill(1) });
    await db.firmas.put({ id: 'firma-local', name: 'MARINA', nif: '517842494', district: '', address: '', contact: '', email: '', type: '', representant: '', synced: true,
      atividades: [{ id: 'actividade-local', atividade: 'Supermercado', local: 'Bobo Forro', ramo: '' }] });
    await db.visitas.put({ id: 'visita-local', firmaId: 'firma-local', date: '2026-10-21', time: '16:22', technicians: [], representante: { name: 'Representante', docType: 'bi', docNumber: '1' }, status: 'Regularizado', synced: false });
    vi.mocked(pushSync).mockResolvedValue({ accepted: ['firma-local', 'visita-local'], errors: [] });
    const result = await syncPush();
    expect(pushSync).toHaveBeenCalledWith(expect.objectContaining({
      firmas: [expect.objectContaining({ id: 'firma-local', atividades: [expect.objectContaining({ id: 'actividade-local' })] })],
      visitas: [expect.objectContaining({ id: 'visita-local' })],
    }));
    expect(result.errors).toEqual([]);
    expect((await db.visitas.get('visita-local'))?.synced).toBe(true);
  });
});
