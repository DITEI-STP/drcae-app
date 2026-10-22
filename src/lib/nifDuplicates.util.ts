import type { Firma } from '../db/db';

export function normalizeOperatorNif(nif: string): string {
  return nif.replace(/[\s.-]/g, '');
}
export function findNifDuplicates(firmas: Firma[], nif: string, excludeId?: string): Firma[] {
  const normalized = normalizeOperatorNif(nif);
  if (!normalized) return [];
  return firmas.filter(firma => firma.id !== excludeId && normalizeOperatorNif(firma.nif || '') === normalized);
}
