import { useNovaVisitaForm } from '../context';
import { precosDaConstatacao, temValor } from '../../../lib/priceOwnership';
import { constatacaoVazia } from '../../../lib/constatacaoVazia';
import { linhasDaConstatacao } from '../../../lib/produtosDaConstatacao';
import { resumirConstatacao } from '../../../lib/constatacaoResumo';
import { contarRecomendacoes } from '../../../lib/recomendacoes';
import type { AccaoConstatacao } from './PaletaAccoes';
import type { Constatacao } from '../../../db/db';

export type Contagens = Partial<Record<AccaoConstatacao, number>>;

/**
 * Contagens e resumo por constatação (SPEC-10 §8).
 *
 * Tudo o que o agente regista traz o `constatacaoId` de onde foi registado, o
 * que permite ao cartão dizer o que tem lá dentro em vez de repetir o total da
 * fiscalização — que era o que fazia dois cartões diferentes parecerem iguais.
 */
export function useContagens() {
  const {
    infracoes,
    anexos,
    apreensaoItens,
    produtosPrices,
    recomendacoes,
    supplyProducts,
  } = useNovaVisitaForm();

  const contar = (id: string | undefined): Contagens => {
    if (!id) return {};
    return {
      foto: anexos.filter((a) => a.constatacaoId === id).length,
      infraccao: infracoes.filter((i) => i.constatacaoId === id).length,
      // Conta **produtos**, não linhas de preço mais itens apreendidos: o mesmo
      // produto cotado e levado em dois destinos é um produto, e o badge que
      // dissesse «3» sobre uma constatação com um produto lia-se como avaria.
      produtos: linhasDaConstatacao(produtosPrices, apreensaoItens, id, () => '').length,
      recomendacao: contarRecomendacoes(recomendacoes, id),
    };
  };

  const resumir = (constatacao: Constatacao): string => {
    const id = constatacao.id;
    return resumirConstatacao({
      descricao: constatacao.descricao,
      infracoes: infracoes.filter((i) => i.constatacaoId === id).map((i) => i.type),
      itensApreendidos: apreensaoItens
        .filter((it) => it.constatacaoId === id && it.designation.trim())
        .map((it) => it.designation.trim()),
      produtos: precosDaConstatacao(produtosPrices, id ?? null)
        .filter((p) => temValor(produtosPrices[p]))
        .map((p) => supplyProducts.find((s) => s.id === p)?.name ?? `Produto ${p}`),
      provas: anexos.filter((a) => a.constatacaoId === id).length,
    });
  };

  /**
   * Cartão sem descrição e sem nada pendurado — o que se apaga em vez de
   * fechar. Vive aqui, ao lado das contagens, porque são as mesmas cinco fontes:
   * separá-los deixava duas leituras do mesmo cartão que podiam discordar.
   */
  const vazia = (constatacao: Constatacao): boolean =>
    constatacaoVazia(constatacao, {
      anexos,
      infracoes,
      apreensaoItens,
      recomendacoes,
      produtosPrices,
    });

  return { contar, resumir, vazia };
}
