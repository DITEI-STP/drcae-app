import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import { db, type Firma, type Visita, type Apreensao, type ApreensaoItem, type Anexo, type Infracao } from '../../db/db';
import { setActiveKey } from '../crypto';
import { syncPull } from '../sync';
import { pullSync } from '../api';

vi.mock('../api', () => ({ pullSync: vi.fn(), AuthSyncError: class extends Error {} }));
vi.mock('../avatarCache', () => ({ syncAvatarCache: vi.fn().mockResolvedValue({pending: 0}) }));
vi.mock('../agentesCatalog', () => ({ syncAgentesCatalog: vi.fn() }));
vi.mock('../utilizadoresCatalog', () => ({ syncUtilizadoresCatalog: vi.fn() }));
vi.mock('../representantesCache', () => ({ syncRepresentantes: vi.fn() }));
vi.mock('../syncReleasedComplaints', () => ({ syncReleasedComplaints: vi.fn().mockResolvedValue(0) }));
afterEach(async () => { db.close(); await db.delete(); setActiveKey(null); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const firma: Firma = { id: 'origin', name: 'Offline', nif: '517842494', address: 'Bobo', district: '', contact: '', email: '', type: '', representant: '', synced: false,
  atividades: [{ id: 'new-activity', atividade: 'Loja nova', local: 'Bobo', ramo: '' }] };
const visit: Visita = { id: 'visit', firmaId: 'origin', date: '2026-10-22', time: '11:00', technicians: [], representante: { name: 'A', docType: 'bi', docNumber: '1' },
  notes: 'Prova offline ainda por enviar', status: 'Regularizado', synced: false };
async function prepare(response: object) {
  vi.stubGlobal('Blob', NodeBlob);
  await db.open();
  setActiveKey({ type: 'fallback', hash: new Uint8Array(32).fill(1) });
  vi.mocked(pullSync).mockResolvedValue({ since_server: '2026-10-22T12:00:00Z', ...response });
}
it('keeps unsent activities when a later pull returns the previous server firm', async () => {
  await prepare({ firmas: [{ ...firma, name: 'Server', atividades: [], synced: true }] });
  await db.firmas.put(firma);
  await syncPull();
  expect(await db.firmas.get('origin')).toEqual(firma);
});
it('keeps a pending inspection and its attachment queued after receiving a server snapshot', async () => {
  await prepare({ visitas: [{ ...visit, notes: 'Old note', synced: true }] });
  await db.visitas.put(visit);
  await db.attachments.put({ id: 'proof', visitaId: 'visit', data: new Blob(['proof']) });
  await syncPull();
  expect(await db.visitas.get('visit')).toEqual(visit);
  expect((await db.attachments.get('proof'))?.data.size).toBe(5);
  expect(await (await db.attachments.get('proof'))?.data.text()).toBe('proof');
});
it('defers a migrated firm tombstone durably until its last offline changes are acknowledged', async () => {
  await prepare({ deleted: { firmas: ['origin'] } });
  await db.firmas.put(firma);
  await syncPull();
  expect(await db.firmas.get('origin')).toEqual(firma);
  await db.firmas.update('origin', { synced: true });
  vi.mocked(pullSync).mockResolvedValue({ since_server: '2026-10-22T12:01:00Z' });
  await syncPull();
  expect(await db.firmas.get('origin')).toBeUndefined();
});
it('preserves pending infractions, attachment metadata and seizures with their items', async () => {
  const infraction: Infracao = {id: 'infraction', visitaId: 'visit', type: 'Offline infraction', severity: 'Grave', synced: false};
  const attachment: Anexo = {id: 'annex', visitaId: 'visit', fileName: 'proof.jpg', fileType: 'image/jpeg', data: '', notes: 'Offline evidence', synced: false};
  const seizure: Apreensao = {id: 'seizure', visitaId: 'visit', firmaId: 'origin', seizedAt: '2026-10-22', custody: 'drcae', settlementStatus: 'pending', note: 'Offline seizure', synced: false};
  const item: ApreensaoItem = {id: 'item', apreensaoId: 'seizure', designation: 'Produto', quantity: 50, custody: 'drcae', synced: false};
  await prepare({infracoes: [{...infraction, type: 'Old', synced: true}], anexos: [{...attachment, url: '/file', synced: true}],
    apreensoes: [{...seizure, note: 'Old', synced: true, itens: [{...item, quantity: 1, synced: true}]}]});
  await db.infracoes.put(infraction); await db.anexos.put(attachment);
  await db.apreensoes.put(seizure); await db.apreensaoItens.put(item);
  await syncPull();
  expect(await db.infracoes.get('infraction')).toEqual(infraction);
  expect(await db.anexos.get('annex')).toEqual(attachment);
  expect(await db.apreensoes.get('seizure')).toEqual(seizure);
  expect(await db.apreensaoItens.get('item')).toEqual(item);
});
