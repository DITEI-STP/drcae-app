import { db, type DrcaeDB } from '../../db/db';

/** Apaga a fiscalização local enquanto ela ainda é apenas um rascunho. */
export async function discardInspectionDraft(
  visitaId: string | null,
  database: DrcaeDB = db,
): Promise<void> {
  if (!visitaId) return;

  const visitas = database.table('visitas');
  const constatacoes = database.table('constatacoes');
  const draftAttachments = database.table('draftAttachments');

  await database.transaction('rw', visitas, constatacoes, draftAttachments, async () => {
    const visita = (await visitas.get(visitaId)) as { draftState?: string } | undefined;
    if (visita?.draftState !== 'draft') return;

    const ids = await constatacoes.where('visitaId').equals(visitaId).primaryKeys();
    if (ids.length > 0) await constatacoes.bulkDelete(ids);
    await draftAttachments.clear();
    await visitas.delete(visitaId);
  });
}
