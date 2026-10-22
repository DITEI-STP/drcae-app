import { db, type Firma } from '../db/db';

export async function collectPushFirmas(
  unsynced: Firma[], visits: { firmaId: string }[], seizures: { firmaId: string }[],
): Promise<Firma[]> {
  const firmas = new Map(unsynced.filter(f => f.id).map(f => [f.id!, f]));
  for (const { firmaId } of [...visits, ...seizures]) {
    if (!firmaId || firmas.has(firmaId)) continue;
    const firma = await db.firmas.get(firmaId);
    if (firma) firmas.set(firmaId, firma);
  }
  return [...firmas.values()];
}
