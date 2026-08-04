import type { Infracao } from '../db/db';

export interface RecidivismBadge {
  label: string;
  className: string;
}

/**
 * Classifica cada infração de uma firma em incidência (1ª ocorrência),
 * reincidência (2ª) ou multirreincidência (3ª+), agrupando por tipo em
 * ordem cronológica das visitas em que foram constatadas.
 */
export function computeRecidivism(infracoes: Infracao[], visitaSortKey: Map<string, number>): Map<string, number> {
  const counts = new Map<string, number>();
  const occurrences = new Map<string, number>();
  const sorted = [...infracoes].sort(
    (a, b) => (visitaSortKey.get(a.visitaId) ?? 0) - (visitaSortKey.get(b.visitaId) ?? 0)
  );
  for (const inf of sorted) {
    const groupKey = inf.type || inf.id || '';
    const occurrence = (counts.get(groupKey) ?? 0) + 1;
    counts.set(groupKey, occurrence);
    if (inf.id) occurrences.set(inf.id, occurrence);
  }
  return occurrences;
}

/**
 * Distintivo para `occurrence` ocorrências **contando esta**.
 *
 * `0` devolve `null` — ausência de distintivo, não «Incidência». Sem isto,
 * todas as infracções do catálogo nunca aplicadas àquele operador exibiam
 * permanentemente o mesmo rótulo, e o indicador ficava sem valor informativo.
 */
export function recidivismLabel(occurrence: number): RecidivismBadge | null {
  if (occurrence <= 0) return null;
  if (occurrence >= 3) {
    return {
      label: `Multirreincidência (${occurrence}x)`,
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
  }
  if (occurrence === 2) {
    return {
      label: 'Reincidência',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };
  }
  return {
    label: 'Incidência',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  };
}

/**
 * Distintivo de uma linha do catálogo no formulário de nova fiscalização.
 *
 * Em repouso reflecte as `previous` ocorrências anteriores **deste operador**;
 * seleccionada reflecte `previous + 1`, porque o agente está a acrescentar
 * mais uma. Com zero anteriores e não seleccionada, não há distintivo.
 *
 * Função pura, testada — a escala é a mesma da listagem e do drawer de
 * detalhe, que antes divergiam.
 */
export function catalogRecidivismBadge(
  previous: number,
  isSelected: boolean,
): RecidivismBadge | null {
  return recidivismLabel(previous + (isSelected ? 1 : 0));
}
