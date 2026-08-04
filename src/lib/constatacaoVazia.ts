import type { PrecoPorProduto } from '../pages/nova-visita/context';
import { temValor } from './priceOwnership';
import type { RecomendacaoEmitida } from './recomendacoes';

/**
 * Constatação sem nada dentro (SPEC-10 §8).
 *
 * O cartão nasce ao primeiro toque na paleta, antes de o agente saber se vai
 * mesmo registar alguma coisa. Um toque enganado, ou uma folha aberta e
 * cancelada, deixa para trás um cartão que não descreve nada e não agrupa nada
 * — e esse não pode viajar para o servidor nem contar para a cobertura.
 *
 * A regra vive aqui, e não em cada sítio que precisa dela, porque são três: o
 * fecho de um cartão para abrir o seguinte, a limpeza feita na submissão e a
 * contagem de cobertura que a acompanha. Escrita três vezes, uma delas ficava
 * para trás na próxima vez que se acrescentasse um tipo de registo.
 *
 * Substitui a heurística anterior de «houve actividade», que marcava o cartão
 * assim que uma folha era aberta: uma folha aberta e revertida deixava o cartão
 * vazio para sempre, protegido por um sinal que já não correspondia a nada.
 */

/** Qualquer registo que saiba de que constatação veio. */
interface ComConstatacao {
  constatacaoId?: string | null;
}

/**
 * As cinco fontes de registo de uma fiscalização.
 *
 * Vivem no estado do formulário e não no Dexie — é por isso que a pergunta «o
 * que está pendurado nesta constatação?» não se responde com uma consulta.
 */
export interface RegistosDaFiscalizacao {
  anexos: ComConstatacao[];
  infracoes: ComConstatacao[];
  apreensaoItens: ComConstatacao[];
  recomendacoes: RecomendacaoEmitida[];
  produtosPrices: PrecoPorProduto;
}

export function temRegistos(
  constatacaoId: string | null | undefined,
  registos: RegistosDaFiscalizacao,
): boolean {
  if (!constatacaoId) return false;
  const meu = (item: ComConstatacao) => item.constatacaoId === constatacaoId;
  return (
    registos.anexos.some(meu) ||
    registos.infracoes.some(meu) ||
    registos.apreensaoItens.some(meu) ||
    registos.recomendacoes.some(meu) ||
    // Um preço só conta depois de ter valor: a linha nasce vazia quando o
    // produto é escolhido, e antes de o agente escrever um número não é um
    // levantamento — é uma linha aberta.
    Object.values(registos.produtosPrices).some((preco) => meu(preco) && temValor(preco))
  );
}

export function constatacaoVazia(
  constatacao: { id?: string; descricao?: string | null },
  registos: RegistosDaFiscalizacao,
): boolean {
  if (constatacao.descricao?.trim()) return false;
  return !temRegistos(constatacao.id, registos);
}
