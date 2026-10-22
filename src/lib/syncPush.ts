import { collectPushFirmas } from './pushDependencies';
import { db } from '../db/db';
import { isRascunho, rascunhoIds } from './visitaDraft';
import * as api from './api';
import { AuthSyncError } from './api';
import { patchSyncState } from './syncState';
import { addAppLog } from './appLogs';
import { tecnicoNames } from './inspectionModel';
import { ensureAnexoUploadReference } from './syncAttachments';
export async function syncPush(): Promise<{ pushed: number; errors: string[]; needsAuth?: boolean }> {
  const rascunhos = await rascunhoIds();
  const doRascunho = (visitaId: string | undefined) => !!visitaId && rascunhos.has(visitaId);

  const unsyncedFirmas = await db.firmas.filter(f => !f.synced).toArray();
  const unsyncedVisitas = await db.visitas.filter(v => !v.synced && !isRascunho(v)).toArray();
  const unsyncedInfracoes = await db.infracoes.filter(inf => !inf.synced && !doRascunho(inf.visitaId)).toArray();
  const unsyncedAnexos = await db.anexos.filter(a => !a.synced && !doRascunho(a.visitaId)).toArray();
  const unsyncedApreensoes = await db.apreensoes.filter(a => !a.synced && !doRascunho(a.visitaId)).toArray();
  const unsyncedRecolhas = await db.recolhas.filter(r => !r.synced).toArray();
  const unsyncedConstatacoes = await db.constatacoes
    .filter(c => !c.synced && !doRascunho(c.visitaId))
    .toArray();

  const firmasPayload = await collectPushFirmas(unsyncedFirmas, unsyncedVisitas, unsyncedApreensoes);

  if (
    unsyncedFirmas.length === 0 &&
    unsyncedVisitas.length === 0 &&
    unsyncedInfracoes.length === 0 &&
    unsyncedAnexos.length === 0 &&
    unsyncedApreensoes.length === 0 &&
    unsyncedRecolhas.length === 0 &&
    unsyncedConstatacoes.length === 0
  ) {
    return { pushed: 0, errors: [] };
  }

  const apreensoesPayload = await Promise.all(
    unsyncedApreensoes.map(async (ap) => ({
      ...ap,
      itens: await db.apreensaoItens.where('apreensaoId').equals(ap.id!).toArray(),
    })),
  );
  const recolhasPayload = await Promise.all(
    unsyncedRecolhas.map(async (rec) => ({
      ...rec,
      itens: await db.recolhaItens.where('recolhaId').equals(rec.id!).toArray(),
    })),
  );

  const toEval = (num: number | null, book: number | null | undefined): 'conforme' | 'nao_conforme' | null => {
    if (num == null || book == null) return null;
    return num <= book ? 'conforme' : 'nao_conforme';
  };

  const prices: any[] = [];
  for (const v of unsyncedVisitas) {
    if (v.produtos && v.produtos.length > 0) {
      for (const p of v.produtos) {
        if (p.product_id && (p.gross || p.retail)) {
          const grossNum = p.gross ? parseFloat(p.gross) : null;
          const retailNum = p.retail ? parseFloat(p.retail) : null;
          const hasBook = p.grossPrice != null || p.retailPrice != null;
          const mode: 'auto' | 'manual' = hasBook ? 'auto' : 'manual';

          const grossEval = mode === 'auto' ? toEval(grossNum, p.grossPrice) : (p.grossEval ?? null);
          const retailEval = mode === 'auto' ? toEval(retailNum, p.retailPrice) : (p.retailEval ?? null);

          const fieldEvals = [grossEval, retailEval].filter(Boolean);
          let eval_ = -1;
          if (fieldEvals.includes('nao_conforme')) eval_ = 0;
          else if (fieldEvals.includes('conforme')) eval_ = 1;

          const meta = { mode, grossEval, retailEval };
          prices.push({ visitaId: v.id, product_id: p.product_id, gross: grossNum, retail: retailNum, eval: eval_, meta });
        }
      }
    }
  }

  const pushTotal =
    unsyncedFirmas.length + unsyncedVisitas.length +
    unsyncedInfracoes.length + unsyncedAnexos.length;

  patchSyncState({ phase: 'pushing', pushTotal, pushDone: 0, pushErrors: 0 });

  const savedTeam = localStorage.getItem('drcae_equipe');
  const parsedTeam = savedTeam
    ? tecnicoNames(JSON.parse(savedTeam)).join(', ') || null
    : null;
  const anexoPayload: any[] = [];
  const localErrors: string[] = [];
  for (const a of unsyncedAnexos) {
    try {
      const prepared = await ensureAnexoUploadReference(a);
      anexoPayload.push({
        ...prepared,
        file_ref: prepared.file_ref,
        data: prepared.file_ref ? undefined : prepared.data,
      });
    } catch (err) {
      const message = `Anexo ${a.id}: ${(err as Error).message}`;
      localErrors.push(message);
      addAppLog('error', 'sync', message, err);
    }
  }

  const payload = {
    firmas: firmasPayload,
    visitas: unsyncedVisitas,
    infracoes: unsyncedInfracoes,
    anexos: anexoPayload,
    prices,
    apreensoes: apreensoesPayload,
    recolhas: recolhasPayload,
    constatacoes: unsyncedConstatacoes,
    team: parsedTeam,
  };

  let response: any;
  try {
    response = await api.pushSync(payload);
  } catch (err) {
    if (err instanceof AuthSyncError) {
      patchSyncState({ phase: 'needs-auth', needsAuth: true });
      return { pushed: 0, errors: [], needsAuth: true };
    }
    patchSyncState({ phase: 'error', errors: [(err as Error).message] });
    addAppLog('error', 'sync', 'Falha no push para o servidor', err);
    throw err;
  }

  if (response.accepted && response.accepted.length > 0) {
    const acceptedIds = new Set(response.accepted);
    const now = Date.now();
    const UMA_HORA = 60 * 60 * 1000;

    for (const c of unsyncedConstatacoes) {
      if (c.id && acceptedIds.has(c.visitaId)) {
        await db.constatacoes.update(c.id, { synced: true });
      }
    }

    for (const ap of unsyncedApreensoes) {
      if (!ap.id || !acceptedIds.has(ap.id)) continue;
      await db.apreensoes.update(ap.id, { synced: true });
      const itens = await db.apreensaoItens.where('apreensaoId').equals(ap.id).toArray();
      for (const it of itens) {
        if (it.id) await db.apreensaoItens.update(it.id, { synced: true });
      }
    }
    for (const rec of unsyncedRecolhas) {
      if (!rec.id || !acceptedIds.has(rec.id)) continue;
      await db.recolhas.update(rec.id, { synced: true });
      const itens = await db.recolhaItens.where('recolhaId').equals(rec.id).toArray();
      for (const it of itens) {
        if (it.id) await db.recolhaItens.update(it.id, { synced: true });
      }
    }

    await db.batchMarkSynced({
      firmaIds: unsyncedFirmas.filter(f => f.id && acceptedIds.has(f.id)).map(f => f.id!),
      visitaUpdates: unsyncedVisitas
        .filter(v => v.id && acceptedIds.has(v.id))
        .map(v => ({ id: v.id!, confirmationStatus: (now - (v.createdAt || 0)) <= UMA_HORA ? 'confirmada' : 'pendente' })),
      infracaoIds: unsyncedInfracoes.filter(i => i.id && acceptedIds.has(i.id)).map(i => i.id!),
      anexoIds: unsyncedAnexos.filter(a => a.id && acceptedIds.has(a.id)).map(a => a.id!),
    });
  }

  const accepted = response.accepted?.length || 0;
  const allErrors = [...localErrors, ...(response.errors || [])];
  const rejected = allErrors.length;
  if (allErrors.length > 0) {
    addAppLog('error', 'sync', 'Servidor devolveu erros de sincronização', allErrors);
  }
  patchSyncState({ pushDone: accepted, pushErrors: rejected });

  return {
    pushed: accepted,
    errors: allErrors,
  };
}

