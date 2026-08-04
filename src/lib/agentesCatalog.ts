// Catálogo oficial de agentes, cadastrado no `drcae-admin` e descarregado no
// `pull`.
//
// Desde a SPEC-07 é o **único** caminho para compor equipa: um agente escrito
// à mão não tem `uid`, não tem NIF, não é rastreável e não pode ser
// correlacionado com nada no admin. Uma acta assinada por «Joao Silva» e outra
// por «João da Silva» eram, para o sistema, duas pessoas diferentes.
//
// Vive em Dexie e não em `localStorage`: é dado de referência sincronizado,
// participa do diagnóstico de sincronização e sobrevive a uma limpeza de
// `localStorage`.
import { db, type Agente } from '../db/db';
import { refreshStoredOfficerAvatar } from './avatarIdentity';

const AGENTES_UPDATED_EVENT = 'drcae:agentes-updated';
/** Chave legada, mantida apenas para a migração única. */
const LEGACY_OFFICERS_KEY = 'drcae_officers_list';

export async function readAgentesCatalog(): Promise<Agente[]> {
  try {
    const rows = await db.agentes.toArray();
    if (rows.length > 0) {
      return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    }
    return await migrateLegacyOfficers();
  } catch {
    return [];
  }
}

/**
 * Substitui o catálogo local pelo que veio do `pull`.
 *
 * Um `pull` sem agentes **não apaga** a lista: pelo mesmo princípio dos grants,
 * uma lista vazia é quase sempre uma falha de resolução, e sem agentes o
 * dispositivo fica impedido de registar seja o que for.
 */
export async function syncAgentesCatalog(
  agentes: Agente[] | undefined | null,
  state: 'complete' | 'unavailable' = 'unavailable',
): Promise<void> {
  if (!Array.isArray(agentes) || state !== 'complete') return;
  try {
    await db.transaction('rw', db.agentes, async () => {
      await db.agentes.clear();
      if (agentes.length > 0) await db.agentes.bulkPut(agentes);
    });
    refreshStoredOfficerAvatar(agentes);
    window.dispatchEvent(new CustomEvent(AGENTES_UPDATED_EVENT));
  } catch {
    /* best-effort — a lista anterior mantém-se */
  }
}

/**
 * Migração única da lista que vivia em `localStorage`. Um dispositivo que
 * actualize o bundle antes de sincronizar não pode ficar sem agentes nenhuns.
 */
async function migrateLegacyOfficers(): Promise<Agente[]> {
  try {
    const raw = localStorage.getItem(LEGACY_OFFICERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      id?: string;
      uid?: string;
      name?: string;
      nif?: string;
      number?: string;
      district?: string;
    }[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const migrated: Agente[] = parsed
      .filter((o) => (o.uid || o.id) && o.name)
      .map((o) => ({
        uid: (o.uid || o.id) as string,
        name: o.name as string,
        nif: o.nif,
        number: o.number,
        district: o.district,
      }));

    if (migrated.length > 0) await db.agentes.bulkPut(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export async function countAgentes(): Promise<number> {
  try {
    return await db.agentes.count();
  } catch {
    return 0;
  }
}
