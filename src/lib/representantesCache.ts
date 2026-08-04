// Representantes conhecidos por operador, descarregados no `pull`.
//
// Alimentam os chips seleccionáveis do passo 1 da nova fiscalização. Existem
// como entidade sincronizada — e não derivados das fiscalizações locais —
// porque um representante habitual não pode desaparecer da lista só porque a
// última fiscalização dele caiu fora da janela do perfil de sync.
import { addAppLog } from './appLogs';
import { db, type RepresentanteFirma } from '../db/db';

const REPRESENTANTES_UPDATED_EVENT = 'drcae:representantes-updated';

/** Representantes conhecidos de uma firma, mais recentes primeiro. */
export async function readRepresentantesDaFirma(
  firmaId: string,
): Promise<RepresentanteFirma[]> {
  try {
    const rows = await db.representantes.where('firmaId').equals(firmaId).toArray();
    return rows.sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''));
  } catch {
    return [];
  }
}

/**
 * Substitui o cache de representantes pelo que veio do `pull`.
 *
 * Uma lista vazia não apaga nada, pela mesma razão dos grants e dos agentes:
 * é quase sempre uma falha de resolução, e os chips são a única defesa contra
 * o agente voltar a escrever o nome à mão.
 */
export async function syncRepresentantes(
  representantes: RepresentanteFirma[] | undefined | null,
): Promise<void> {
  if (!Array.isArray(representantes) || representantes.length === 0) return;
  try {
    // A transacção recebe a tabela do Dexie e não `db.representantes`: este é o
    // envolvente de cifra, e o Dexie recusa-o como argumento de `transaction` —
    // erro que ficava engolido pelo `catch` e deixava a lista por gravar.
    await db.transaction('rw', db.table('representantes'), async () => {
      await db.representantes.clear();
      await db.representantes.bulkPut(representantes);
    });
    window.dispatchEvent(new CustomEvent(REPRESENTANTES_UPDATED_EVENT));
  } catch (err) {
    // A lista anterior mantém-se, mas a falha tem de aparecer: engolida em
    // silêncio, deixava o campo do representante vazio no terreno sem nenhum
    // rasto de porquê — foi exactamente o que aconteceu.
    addAppLog('error', 'sync', 'Falha ao gravar representantes vindos do pull', err);
  }
}

/**
 * Regista localmente um representante novo, para ficar disponível como chip na
 * fiscalização seguinte mesmo antes de sincronizar. É assim que a lista se
 * alimenta (R8.6): o servidor confirma-o no push, com o número de documento
 * como chave de desduplicação.
 */
export async function rememberRepresentante(
  firmaId: string,
  representante: { name: string; docType: string; docNumber: string; role?: string },
): Promise<void> {
  const name = representante.name.trim();
  const docNumber = representante.docNumber.trim();
  if (!name || !docNumber) return;

  try {
    // O filtro corre sobre registos decifrados: `docNumber` é campo cifrado, e
    // um filtro sobre o registo em bruto nunca encontraria nada.
    const existing = (
      await db.representantes.where('firmaId').equals(firmaId).toArray()
    ).find((r: RepresentanteFirma) => r.docNumber === docNumber);

    const record: RepresentanteFirma = {
      id: existing?.id ?? `local-${firmaId}-${docNumber}`,
      firmaId,
      name,
      docType: representante.docType,
      docNumber,
      role: representante.role,
      lastSeenAt: new Date().toISOString(),
      synced: false,
    };
    await db.representantes.put(record);
    window.dispatchEvent(new CustomEvent(REPRESENTANTES_UPDATED_EVENT));
  } catch (err) {
    // Sem registo, um representante que nunca chega a ser memorizado é
    // indistinguível de um operador que nunca teve nenhum.
    addAppLog('error', 'sync', 'Falha ao memorizar o representante do acto', err);
  }
}

export async function countRepresentantes(): Promise<number> {
  try {
    return await db.representantes.count();
  } catch {
    return 0;
  }
}
