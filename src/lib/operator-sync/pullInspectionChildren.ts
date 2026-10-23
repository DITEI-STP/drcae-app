import { db, type Infracao, type Anexo, type Apreensao, type ApreensaoItem } from '../../db/db';
import { preservePending } from './pulled-records.util';

export async function pullInspectionChildren(response: {
  infracoes?: Infracao[]; anexos?: Anexo[]; apreensoes?: (Apreensao & {itens?: ApreensaoItem[]})[];
}): Promise<number> {
  let count = 0;
  // Actualizar Infracções
  if (response.infracoes && response.infracoes.length > 0) {
    const rows = await Promise.all(response.infracoes.map(async (row) =>
      preservePending(row, await db.infracoes.get(row.id!))));
    await db.infracoes.bulkPut(rows);
    count += response.infracoes.length;
  }

  // Actualizar Anexos (ficheiros capturados em campo por qualquer dispositivo)
  // Só guarda registos que ainda não existem localmente (não sobrepõe capturas locais)
  if (response.anexos && response.anexos.length > 0) {
    for (const a of response.anexos) {
      if (!a.id) continue;
      const existing = await db.anexos.get(a.id);
      if (!existing) {
        await db.anexos.put({ ...a, synced: true });
        count++;
      } else if (existing.synced === true) {
        // Enriquecer o registo local com o que o servidor tem e falta cá: a URL
        // do ficheiro e a do fotograma. Sem a segunda, um dispositivo que
        // recebeu a fiscalização de outro voltaria a descodificar o vídeo.
        const enriquecer: Partial<Anexo> = {};
        if (!existing.url && a.url) enriquecer.url = a.url;
        if (!existing.posterUrl && a.posterUrl) enriquecer.posterUrl = a.posterUrl;
        if (Object.keys(enriquecer).length > 0) {
          await db.anexos.update(a.id, { ...enriquecer, synced: true });
        }
      }
    }
  }

  // Apreensões e respectivos itens. Autos com obrigação em aberto chegam
  // sempre, independentemente da janela do perfil — é o que permite ao agente
  // fazer a recolha de um depósito antigo, no terreno e sem rede.
  if (Array.isArray(response.apreensoes) && response.apreensoes.length > 0) {
    for (const ap of response.apreensoes) {
      const { itens, ...auto } = ap;
      const local = await db.apreensoes.get(auto.id!);
      if (local && local.synced !== true) continue;
      await db.apreensoes.put({ ...auto, synced: true });
      for (const it of itens ?? []) {
        const remote = { ...it, apreensaoId: auto.id!, synced: true };
        await db.apreensaoItens.put(preservePending(remote, await db.apreensaoItens.get(it.id!)));
      }
    }
    count += response.apreensoes.length;
  }

  return count;
}
