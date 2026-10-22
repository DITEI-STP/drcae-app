import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type Firma } from '../db/db';
import { setActiveKey } from './crypto';
import { registerFirma } from './registerFirma';
import { probeServerReachability } from './serverReachability';
import { lookupOperatorsByNif } from './api';
vi.mock('./serverReachability', () => ({ probeServerReachability: vi.fn().mockResolvedValue(false) }));
vi.mock('./api', () => ({ lookupOperatorsByNif: vi.fn() }));
const original: Firma = { id: 'original', nif: '517842494', name: 'MARINA', address: 'Ponta Mina', district: '', contact: '', email: '', type: '', representant: '', synced: true,
  atividades: [{ id: 'activity-old', ramo: 'Comércio', atividade: 'Loja original', local: 'Ponta Mina' }] };
const draft: Firma = { ...original, id: 'new', name: 'MARINA Bobo', synced: false,
  atividades: [{ id: 'activity-new', ramo: 'Comércio', atividade: 'Loja Bobo', local: 'Bobo Forro' }] };
beforeEach(async () => { await db.open(); });
afterEach(async () => { db.close(); await db.delete(); setActiveKey(null); vi.clearAllMocks(); vi.mocked(probeServerReachability).mockResolvedValue(false); });
async function seed() { setActiveKey({ type: 'fallback', hash: new Uint8Array(32).fill(1) }); await db.firmas.put(original); }
describe('prevenção de NIF duplicado no registo offline', () => {
  it('permite continuar deliberadamente com uma nova firma', async () => {
    await seed(); const choose = vi.fn().mockResolvedValue({ action: 'new' });
    expect(await registerFirma(draft, choose)).toBe('new');
    expect(choose).toHaveBeenCalledOnce(); expect(await db.firmas.count()).toBe(2);
  });
  it('cancela sem criar nem alterar firmas', async () => {
    await seed(); expect(await registerFirma(draft, async () => null)).toBe(null);
    expect(await db.firmas.count()).toBe(1); expect((await db.firmas.get('original'))?.synced).toBe(true);
  });
  it('usa o operador existente sem duplicar actividades', async () => {
    await seed(); expect(await registerFirma(draft, async () => ({ action: 'existing', firma: original }))).toBe('original');
    expect(await db.firmas.count()).toBe(1); expect((await db.firmas.get('original'))?.atividades).toHaveLength(1);
  });
  it('acrescenta actividades sem sobrescrever a identificação canónica', async () => {
    await seed(); expect(await registerFirma(draft, async () => ({ action: 'add-activities', firma: original }))).toBe('original');
    const saved = await db.firmas.get('original'); expect(saved?.name).toBe('MARINA'); expect(saved?.synced).toBe(false);
    expect(saved?.atividades?.map(activity => activity.id)).toEqual(['activity-old', 'activity-new']);
  });
  it('consulta o servidor e guarda a firma que não estava na cache quando escolhida', async () => {
    setActiveKey({ type: 'fallback', hash: new Uint8Array(32).fill(1) });
    vi.mocked(probeServerReachability).mockResolvedValue(true);
    vi.mocked(lookupOperatorsByNif).mockResolvedValue({ firmas: [original] });
    expect(await registerFirma(draft, async matches => ({ action: 'existing', firma: matches[0] }))).toBe('original');
    expect(lookupOperatorsByNif).toHaveBeenCalledWith('517842494'); expect(await db.firmas.count()).toBe(1);
  });
});
