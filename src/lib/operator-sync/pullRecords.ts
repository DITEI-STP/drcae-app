import { db, type Firma, type Visita } from '../../db/db';
import { preservePending } from './pulled-records.util';

export async function pullFirmAndVisitRecords(response: {firmas?: Firma[]; visitas?: Visita[]}): Promise<number> {
  let count = 0;
  // Actualizar Firmas
  if (response.firmas && response.firmas.length > 0) {
    const firms = await Promise.all(response.firmas.map(async (firm: Firma) =>
      preservePending(firm, await db.firmas.get(firm.id!))));
    await db.firmas.bulkPut(firms);
    count += response.firmas.length;
  }

  // Actualizar Visitas — merge inteligente: dados do servidor têm precedência,
  // mas campos locais que o servidor não devolve (ou devolve como null/vazio) são preservados.
  // Isto evita a perda de recomendações, produtos, notas e outros campos offline-first.
  if (response.visitas && response.visitas.length > 0) {
    const enriched = await Promise.all(
      response.visitas.map(async (v: Visita) => {
        const existing = await db.visitas.get(v.id);
        return preservePending({
          // 1. Base: dados locais completos (garantia de não apagar nada)
          ...(existing ?? {}),
          // 2. Override: dados do servidor têm precedência sobre locais
          ...v,
          // 3. Preservar campos locais quando o servidor os devolve vazios/ausentes
          recomendacoes: (v.recomendacoes && v.recomendacoes.length > 0)
            ? v.recomendacoes
            : (existing?.recomendacoes ?? []),
          recomendacoesHistoricas: (v.recomendacoesHistoricas && v.recomendacoesHistoricas.length > 0)
            ? v.recomendacoesHistoricas
            : (existing?.recomendacoesHistoricas ?? []),
          produtos: (v.produtos && v.produtos.length > 0)
            ? v.produtos
            : (existing?.produtos ?? []),
          notes: v.notes || existing?.notes,
          atividadeEconomica: v.atividadeEconomica ?? existing?.atividadeEconomica,
          offlineCode: v.offlineCode ?? existing?.offlineCode,
          officialCode: v.officialCode ?? existing?.officialCode,
          locationAutoCaptured: v.locationAutoCaptured ?? existing?.locationAutoCaptured,
          // 4. Metadados de sync sempre actualizados
          synced: true,
          confirmationStatus: existing?.confirmationStatus ?? 'confirmada',
        }, existing);
      })
    );
    await db.visitas.bulkPut(enriched);
    count += enriched.length;
  }

  return count;
}
