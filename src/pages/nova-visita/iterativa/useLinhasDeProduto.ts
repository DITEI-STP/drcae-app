import { useMemo } from 'react';
import { useNovaVisitaForm, type ItemApreensaoForm } from '../context';
import { aplicarPreco } from '../../../lib/priceOwnership';
import { linhasDaConstatacao, type LinhaProduto } from '../../../lib/produtosDaConstatacao';
import { unitOptions } from '../../../lib/units';

/**
 * As linhas de produto da constatação em aberto, e o que se lhes pode fazer.
 *
 * Fica separado do componente porque é onde vivem as duas escritas que não são
 * simétricas: o **preço** é um mapa de uma entrada por produto, partilhado com a
 * check list da cesta básica, e a **apreensão** é uma lista com uma entrada por
 * parte apreendida. A leitura reconcilia-as (`lib/produtosDaConstatacao.ts`); a
 * escrita tem de continuar a respeitar a forma de cada uma.
 */
export function useLinhasDeProduto() {
  const {
    produtosPrices,
    setProdutosPrices,
    apreensaoItens,
    setApreensaoItens,
    supplyProducts,
    supplyStatus,
    constatacaoActivaId,
  } = useNovaVisitaForm();

  const nomeDoProduto = (id: number) =>
    supplyProducts.find((p) => p.id === id)?.name ?? `Produto ${id}`;

  const linhas = linhasDaConstatacao(
    produtosPrices,
    apreensaoItens,
    constatacaoActivaId,
    nomeDoProduto,
  );

  const unidades = useMemo(() => unitOptions(), []);

  const jaNaLinha = new Set(linhas.map((l) => l.assetSupply));
  const opcoesDeProduto = supplyProducts
    .filter((p) => !jaNaLinha.has(p.id))
    .map((p) => ({
      value: String(p.id),
      label: p.name,
      hint: p.retailPrice != null ? `livro: ${p.retailPrice}` : undefined,
    }));

  const escreverPreco = (productId: number, campo: 'gross' | 'retail', valor: string) =>
    setProdutosPrices((prev) =>
      aplicarPreco(prev, productId, { [campo]: valor }, constatacaoActivaId),
    );

  const avaliarPreco = (
    productId: number,
    campo: 'grossEval' | 'retailEval',
    valor: 'conforme' | 'nao_conforme',
  ) =>
    setProdutosPrices((prev) =>
      aplicarPreco(
        prev,
        productId,
        { [campo]: prev[productId]?.[campo] === valor ? undefined : valor },
        constatacaoActivaId,
      ),
    );

  /**
   * Parte apreendida por preencher. Nasce **sem destino**: para onde vai é a
   * pergunta da tarefa própria da tela, e respondê-la aqui por omissão era o
   * que fazia sair «recolhido pela DRCAE» em autos onde a mercadoria ficou na
   * loja (ver `lib/destinoApreensao.ts`).
   */
  const parteNova = (
    assetSupply: number | null,
    designation: string,
  ): ItemApreensaoForm => ({
    constatacaoId: constatacaoActivaId,
    assetSupply,
    designation,
    quantity: '',
    assetUnit: null,
    custody: null,
    note: '',
  });

  const acrescentarParte = (linha: LinhaProduto) =>
    setApreensaoItens((prev) => [...prev, parteNova(linha.assetSupply, linha.designation)]);

  /** Desfaz a apreensão do produto: sem partes, não há nada apreendido. */
  const removerApreensao = (linha: LinhaProduto) => {
    const remover = new Set(linha.partes);
    setApreensaoItens((prev) => prev.filter((_, i) => !remover.has(i)));
  };

  const editarParte = (index: number, patch: Partial<ItemApreensaoForm>) =>
    setApreensaoItens((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const removerParte = (index: number) =>
    setApreensaoItens((prev) => prev.filter((_, i) => i !== index));

  const removerLinha = (linha: LinhaProduto) => {
    const remover = new Set(linha.partes);
    if (remover.size > 0) setApreensaoItens((prev) => prev.filter((_, i) => !remover.has(i)));
    if (linha.assetSupply == null) return;
    setProdutosPrices((prev) => {
      // Só se apaga o preço que esta constatação levantou: o da check list é de
      // outra origem e sobrevive à linha que o estava a mostrar.
      if ((prev[linha.assetSupply!]?.constatacaoId ?? null) !== constatacaoActivaId) return prev;
      const copia = { ...prev };
      delete copia[linha.assetSupply!];
      return copia;
    });
  };

  /** Produto do catálogo: entra pelo preço, e apreender é o passo seguinte. */
  const adicionarDoCatalogo = (productId: number) => escreverPreco(productId, 'retail', '');

  /** Sem id de catálogo não há onde guardar preço: nasce já apreendido. */
  const adicionarNaoCatalogado = (designation: string) =>
    setApreensaoItens((prev) => [...prev, parteNova(null, designation)]);

  return {
    linhas,
    produtosPrices,
    apreensaoItens,
    supplyProducts,
    constatacaoActivaId,
    unitOptions: unidades,
    opcoesDeProduto,
    /** Sem livro em vigor não há referência: a conformidade é classificada à mão. */
    semLivro: supplyStatus === 'none',
    temApreensao: linhas.some((l) => l.partes.length > 0),
    escreverPreco,
    avaliarPreco,
    removerApreensao,
    acrescentarParte,
    editarParte,
    removerParte,
    removerLinha,
    adicionarDoCatalogo,
    adicionarNaoCatalogado,
  };
}
