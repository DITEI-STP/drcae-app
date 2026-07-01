import type { Infracao } from '../db/db';

/**
 * Classifica cada infração de uma firma em incidente (1ª ocorrência),
 * reincidente (2ª) ou multi-reincidente (3ª+), agrupando por tipo em
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

export function recidivismLabel(occurrence: number): { label: string; className: string } {
  if (occurrence >= 3) {
    return {
      label: `Multirreincidente (${occurrence}x)`,
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
  }
  if (occurrence === 2) {
    return {
      label: 'Reincidente',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };
  }
  return {
    label: 'Incidente',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  };
}
