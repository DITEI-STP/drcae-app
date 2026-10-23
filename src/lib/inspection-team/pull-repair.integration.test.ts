import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db, type Visita } from '../../db/db';
import { setActiveKey } from '../crypto';
import { syncPull } from '../sync';
import { pullSync, pushSync } from '../api';

vi.mock('../api', () => ({ pullSync: vi.fn(), pushSync: vi.fn(), AuthSyncError: class extends Error {} }));
vi.mock('../avatarCache', () => ({ syncAvatarCache: vi.fn().mockResolvedValue({ pending: 0 }) }));
vi.mock('../agentesCatalog', () => ({ syncAgentesCatalog: vi.fn() }));
vi.mock('../utilizadoresCatalog', () => ({ syncUtilizadoresCatalog: vi.fn() }));
vi.mock('../representantesCache', () => ({ syncRepresentantes: vi.fn() }));
vi.mock('../syncReleasedComplaints', () => ({ syncReleasedComplaints: vi.fn().mockResolvedValue(0) }));

beforeEach(async () => { await db.open(); });
afterEach(async () => { db.close(); await db.delete(); setActiveKey(null); vi.clearAllMocks(); });
const foreignVisit: Visita = {
  id: 'received', firmaId: 'firm', date: '2026-10-23', time: '10:00',
  technicians: [{ uid: 'colleague', name: 'Colega' }], representante: 'Representante',
  status: 'Regularizado', synced: true,
};

it('re-sincroniza automaticamente todo o histórico indicado pelo servidor sem reenviar visitas recebidas nem anexos', async () => {
  setActiveKey({ type: 'fallback', hash: new Uint8Array(32).fill(1) });
  await db.visitas.put(foreignVisit);
  await db.anexos.put({ id: 'proof', visitaId: 'received', fileName: 'proof.jpg', fileType: 'image/jpeg', data: 'proof', notes: '', synced: true });
  vi.mocked(pullSync).mockResolvedValue({ since_server: '2026-10-23T10:00:00Z', inspection_team_repairs: ['own-old-not-in-cache'] });
  vi.mocked(pushSync).mockResolvedValue({ acceptedInspectionTeams: ['own-old-not-in-cache'] });
  await syncPull('economy');
  expect(pushSync).toHaveBeenCalledExactlyOnceWith({ inspectionTeams: ['own-old-not-in-cache'] });
  expect(await db.visitas.get('received')).toEqual(foreignVisit);
  expect((await db.anexos.get('proof'))?.data).toBe('proof');
  expect((await db.metadata.get('last_sync_at'))?.value).toBe('2026-10-23T10:00:00Z');
});

it('retoma após falha de rede e não volta a reparar depois da confirmação do servidor', async () => {
  setActiveKey({ type: 'fallback', hash: new Uint8Array(32).fill(1) });
  vi.mocked(pullSync).mockResolvedValue({ since_server: '2026-10-23T10:00:00Z', inspection_team_repairs: ['own'] });
  vi.mocked(pushSync).mockRejectedValueOnce(new Error('offline'));
  await expect(syncPull()).rejects.toThrow('offline');
  expect(await db.metadata.get('last_sync_at')).toBeUndefined();
  vi.mocked(pushSync).mockResolvedValue({ acceptedInspectionTeams: ['own'] });
  await syncPull();
  vi.mocked(pullSync).mockResolvedValue({ since_server: '2026-10-23T10:01:00Z', inspection_team_repairs: [] });
  await syncPull();
  expect(pushSync).toHaveBeenCalledTimes(2);
});
