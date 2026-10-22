import { db, type Firma } from '../db/db';
import { lookupOperatorsByNif } from './api';
import { probeServerReachability } from './serverReachability';
import { addAppLog } from './appLogs';
import { findNifDuplicates, normalizeOperatorNif } from './nifDuplicates.util';

export type NifDecision = { action: 'new' } | { action: 'existing' | 'add-activities'; firma: Firma } | null;
export async function registerFirma(
  draft: Firma,
  choose: (matches: Firma[]) => Promise<NifDecision>,
): Promise<string | null> {
  const nif = normalizeOperatorNif(draft.nif);
  const local = findNifDuplicates(await db.firmas.toArray(), nif, draft.id);
  const matches = new Map(local.filter(f => f.id).map(f => [f.id!, f]));
  if (/^\d{9}$/.test(nif) && await probeServerReachability()) {
    try {
      const remote = await lookupOperatorsByNif(nif);
      for (const firma of remote.firmas) if (firma.id && !matches.has(firma.id)) matches.set(firma.id, firma);
    } catch (error) { addAppLog('warn', 'nova-firma', 'Verificação remota do NIF indisponível; usada a cache local.', error); }
  }
  const decision = matches.size ? await choose([...matches.values()]) : { action: 'new' } as const;
  if (!decision) return null;
  if (decision.action === 'new') {
    if (!draft.id) throw new Error('Firma sem identificador.');
    await db.firmas.add({ ...draft, nif });
    return draft.id;
  }
  const id = decision.firma.id;
  if (!id || !matches.has(id)) throw new Error('Operador seleccionado inválido.');
  const existing = await db.firmas.get(id) || decision.firma;
  if (decision.action === 'add-activities') {
    const currentIds = new Set(existing.atividades?.map(activity => activity.id));
    const activities = (draft.atividades || []).filter(activity => !currentIds.has(activity.id));
    if (!activities.length) throw new Error('Registe pelo menos uma actividade nova.');
    await db.firmas.put({ ...existing, atividades: [...(existing.atividades || []), ...activities], synced: false });
  } else if (!(await db.firmas.get(id))) {
    await db.firmas.put(existing);
  }
  return id;
}
