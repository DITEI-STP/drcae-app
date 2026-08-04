import type { Agente } from '../db/db';

export const OFFICER_INFO_KEY = 'drcae_officer_info';
export const OFFICER_INFO_UPDATED_EVENT = 'drcae:officer-info-updated';

export interface StoredOfficerInfo {
  uid?: string;
  name?: string;
  photoUrl?: string;
  photoVersion?: string;
  avatarOwnerUid?: string;
  avatarUid?: string;
  avatarVersion?: string;
  avatarDownloadUrl?: string;
  [key: string]: unknown;
}

const AVATAR_FIELDS = [
  'photoUrl',
  'photoVersion',
  'avatarOwnerUid',
  'avatarUid',
  'avatarVersion',
  'avatarDownloadUrl',
] as const;

export function readStoredOfficerInfo(): StoredOfficerInfo | null {
  try {
    const raw = localStorage.getItem(OFFICER_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Índice único reutilizado pelos cartões da equipa para evitar buscas por linha. */
export function indexAgentAvatars(agents: Agente[]): Map<string, Agente> {
  return new Map(agents.filter((agent) => !!agent.uid).map((agent) => [agent.uid, agent]));
}

/**
 * O login é apenas um snapshot. O pull é autoritativo para a identidade visual:
 * se o admin substituiu o avatar durante a sessão, actualiza a referência que
 * o cabeçalho lê e avisa os componentes já montados.
 */
export function refreshStoredOfficerAvatar(agents: Agente[]): boolean {
  const current = readStoredOfficerInfo();
  if (!current?.uid) return false;
  const synced = indexAgentAvatars(agents).get(current.uid);
  if (!synced) return false;

  const changed = AVATAR_FIELDS.some((field) => current[field] !== synced[field]);
  if (!changed) return false;

  const next: StoredOfficerInfo = { ...current };
  for (const field of AVATAR_FIELDS) next[field] = synced[field];

  try {
    localStorage.setItem(OFFICER_INFO_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(OFFICER_INFO_UPDATED_EVENT, { detail: next }));
  return true;
}
