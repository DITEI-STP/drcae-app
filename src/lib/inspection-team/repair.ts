import { pushSync } from '../api';

export async function repairInspectionTeams(ids: unknown): Promise<void> {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (ids.some((id) => typeof id !== 'string')) throw new Error('Lista de equipas inválida.');
  const uniqueIds = [...new Set<string>(ids)];
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const batch = uniqueIds.slice(start, start + 100);
    const response = await pushSync({ inspectionTeams: batch });
    const accepted = new Set(response.acceptedInspectionTeams ?? []);
    if (response.errors?.length || batch.some((id) => !accepted.has(id))) {
      throw new Error('Não foi possível re-sincronizar a equipa de todas as fiscalizações deste dispositivo.');
    }
  }
}
