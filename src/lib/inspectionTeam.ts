import type { Agente, Tecnico } from '../db/db';
import { normalizeTecnicos } from './inspectionModel';

export function loggedOfficerFromStorage(): Tecnico | null {
  try {
    const officer = JSON.parse(localStorage.getItem('drcae_officer_info') || 'null');
    if (!officer?.uid || !officer?.name) return null;
    return { uid: officer.uid, name: officer.name, number: officer.number || undefined };
  } catch {
    return null;
  }
}

export function ensureLoggedOfficer(
  team: Tecnico[] | string[] | null | undefined,
  loggedOfficer: Tecnico | null,
): Tecnico[] {
  const normalized = normalizeTecnicos(team);
  if (!loggedOfficer?.uid) return normalized;
  return [loggedOfficer, ...normalized.filter((member) => member.uid !== loggedOfficer.uid)];
}

export function selectableOfficers(
  officers: Agente[],
  loggedOfficer: Tecnico | null,
): Agente[] {
  return loggedOfficer?.uid
    ? officers.filter((officer) => officer.uid !== loggedOfficer.uid)
    : officers;
}
