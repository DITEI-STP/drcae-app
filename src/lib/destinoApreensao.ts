import { itemVazio, type ItemApreensaoValidavel } from './apreensaoValidacao';

/**
 * O destino do que foi apreendido, como tarefa da tela (SPEC-10 §6.3).
 *
 * Apreender e decidir o destino são dois momentos diferentes do mesmo acto: o
 * agente que está a contar sacos numa prateleira sabe a quantidade e a unidade,
 * e ainda não sabe o que a viatura leva. Perguntar-lhe as duas coisas no mesmo
 * formulário fazia-o escolher «recolhido» por omissão e corrigir mais tarde —
 * quando se lembrasse.
 *
 * Por isso o formulário do produto regista **quantidade e unidade**, e o
 * destino de cada parte apreendida passa a ser uma tarefa por fechar, contada à
 * vista na tela como as outras.
 */

/** Item apreendido que já conta para a tarefa, com o índice na lista original. */
export interface ItemDestinavel<T extends ItemApreensaoValidavel> {
  index: number;
  item: T;
}

/**
 * O que precisa de destino: tudo o que foi apreendido e não é linha por
 * preencher. O critério é o mesmo da validação (`itemVazio`), ou a tarefa
 * pediria destino para linhas que a submissão descarta.
 */
export function itensDestinaveis<T extends ItemApreensaoValidavel>(
  itens: T[],
): ItemDestinavel<T>[] {
  return itens
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => !itemVazio(item));
}

export interface ProgressoDestinos {
  total: number;
  definidos: number;
}

export function progressoDestinos(itens: ItemApreensaoValidavel[]): ProgressoDestinos {
  const destinaveis = itensDestinaveis(itens);
  return {
    total: destinaveis.length,
    definidos: destinaveis.filter(({ item }) => item.custody != null).length,
  };
}
