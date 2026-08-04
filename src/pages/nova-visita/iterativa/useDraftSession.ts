import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateId, type Constatacao } from '../../../db/db';
import {
  constatacaoVazia,
  type RegistosDaFiscalizacao,
} from '../../../lib/constatacaoVazia';
import { useNovaVisitaForm } from '../context';

/**
 * Sessão de rascunho da modalidade iterativa (SPEC-10 §8).
 *
 * As constatações são escritas no Dexie no momento em que existem, sob uma
 * visita em `draftState: 'draft'` — um tablet que morra a meio de um armazém
 * reabre com elas onde estavam. Os registos que se lhes penduram (infracções,
 * provas, apreensões, preços) vivem no estado do formulário até à submissão, e
 * é por isso que apagá-los é trabalho de estado e não de base de dados.
 *
 * O rascunho não é empurrado para o servidor — o filtro vive num ponto único,
 * em `lib/visitaDraft.ts` e no push.
 */
export interface DraftSession {
  constatacoes: Constatacao[];
  activa: Constatacao | null;
  abrir: () => Promise<string>;
  fechar: (id: string, vazia: boolean) => Promise<void>;
  reabrir: (id: string) => Promise<void>;
  descrever: (id: string, descricao: string) => Promise<void>;
  descartar: (id: string) => Promise<void>;
}

export function useDraftSession(
  visitaId: string | null,
  location: { lat: number; lng: number } | null,
  origem: Constatacao['origem'] = 'agente',
): DraftSession {
  const {
    setInfracoes,
    setAnexos,
    setApreensaoItens,
    setProdutosPrices,
  } = useNovaVisitaForm();

  const constatacoes =
    useLiveQuery(
      async () =>
        visitaId
          ? (await db.constatacoes.where('visitaId').equals(visitaId).toArray()).sort(
              (a: Constatacao, b: Constatacao) => a.ordem - b.ordem,
            )
          : [],
      [visitaId],
      [],
    ) ?? [];

  // Uma constatação em aberto, no máximo. É o que faz a paleta de acções ter um
  // destino evidente sem o agente ter de o escolher.
  const activa = constatacoes.find((c) => !c.closedAt) ?? null;

  const abrir = async (): Promise<string> => {
    if (!visitaId) throw new Error('Rascunho de fiscalização inexistente.');

    // Lido do Dexie e não da consulta viva: «Nova constatação» fecha a corrente
    // e abre a seguinte no mesmo gesto, e nesse instante a consulta viva ainda
    // devolve a que acabou de ser fechada. Confiar nela devolvia o cartão
    // anterior em vez de abrir um novo — e a numeração repetia-se.
    const existentes = await db.constatacoes.where('visitaId').equals(visitaId).toArray();
    const emAberto = existentes.find((c: Constatacao) => !c.closedAt);
    if (emAberto?.id) return emAberto.id;

    const id = generateId();
    await db.constatacoes.add({
      id,
      visitaId,
      ordem: existentes.length + 1,
      geolocation: location,
      origem,
      createdAt: Date.now(),
      synced: false,
    });
    return id;
  };

  /**
   * @param vazia decidido pelo chamador com `lib/constatacaoVazia.ts`, que lê o
   *   estado do formulário — é lá que vivem as provas, infracções, apreensões
   *   e preços de um cartão, e não no Dexie. Um cartão vazio é apagado em vez
   *   de fechado: sobreviver a um toque enganado não é serviço nenhum.
   */
  const fechar = async (id: string, vazia: boolean) => {
    if (vazia) {
      // `bulkDelete` e não `delete`: a tabela é uma `EncryptedTable`, que não
      // expõe `delete` — chamá-lo lançava `TypeError` e a constatação ficava.
      await db.constatacoes.bulkDelete([id]);
      return;
    }
    await db.constatacoes.update(id, { closedAt: Date.now(), synced: false });
  };

  const reabrir = async (id: string) => {
    await db.constatacoes.update(id, { closedAt: undefined, synced: false });
  };

  const descrever = async (id: string, descricao: string) => {
    await db.constatacoes.update(id, { descricao, synced: false });
  };

  const descartar = async (id: string) => {
    // Os filhos perdem o agrupamento mas **não** são apagados: uma prova ou um
    // item apreendido no terreno sobrevivem ao cartão que os juntava. Quem os
    // detém é o estado do formulário, não o Dexie.
    const desmarcar = <T extends { constatacaoId?: string | null }>(lista: T[]) =>
      lista.map((item) => (item.constatacaoId === id ? { ...item, constatacaoId: null } : item));

    setInfracoes(desmarcar);
    setAnexos(desmarcar);
    setApreensaoItens(desmarcar);
    setProdutosPrices((prev) => {
      const proximo = { ...prev };
      for (const chave of Object.keys(proximo)) {
        const produto = Number(chave);
        if (proximo[produto]?.constatacaoId === id) {
          proximo[produto] = { ...proximo[produto], constatacaoId: null };
        }
      }
      return proximo;
    });

    await db.constatacoes.bulkDelete([id]);
  };

  return { constatacoes, activa, abrir, fechar, reabrir, descrever, descartar };
}

/**
 * Apaga as constatações que ficaram sem nada, imediatamente antes da submissão.
 *
 * O cartão nasce ao primeiro toque na paleta e o agente não tem obrigação de
 * arrumar o que abriu por engano. Sem esta limpeza, um cartão vazio contava
 * para `cobertura.constatacoes` e viajava no push como se fosse um achado —
 * ler «4 constatações» numa fiscalização com três é pior do que não ter o
 * número.
 *
 * Corre no fecho e não ao sair da tela de propósito: o agente pode submeter
 * sem voltar a passar por lá, e um `useEffect` de desmontagem com `StrictMode`
 * apagaria o cartão em desenvolvimento a meio do trabalho.
 */
export async function purgarConstatacoesVazias(
  visitaId: string,
  registos: RegistosDaFiscalizacao,
): Promise<void> {
  const constatacoes = await db.constatacoes.where('visitaId').equals(visitaId).toArray();
  const vazias = constatacoes
    .filter((c: Constatacao) => !!c.id && constatacaoVazia(c, registos))
    .map((c: Constatacao) => c.id!);
  if (vazias.length > 0) await db.constatacoes.bulkDelete(vazias);
}
