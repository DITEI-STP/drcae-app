import type { PrecoPorProduto } from '../pages/nova-visita/context';

/**
 * Posse do preço levantado numa fiscalização (SPEC-10 §5).
 *
 * Existe **um** valor por produto: o preço praticado é um facto do
 * estabelecimento, não da constatação, e duas leituras contraditórias do mesmo
 * produto tornariam impossível dizer qual vale para a comparação com o livro e
 * para a acta.
 *
 * O que a constatação ganha é **posse**, não uma cópia:
 *
 * - levantado dentro de uma constatação → fica com o `constatacaoId` dela, e é
 *   visível nas duas superfícies (na constatação e na check list);
 * - levantado na check list da cesta básica → nasce sem dono, e não aparece em
 *   constatação nenhuma;
 * - o dono é fixado na criação e **nunca reatribuído** — é isso que faz uma
 *   correcção feita depois na check list reflectir-se na constatação que o
 *   levantou, sem nunca o derramar para as outras.
 */

export type PrecoEntrada = PrecoPorProduto[number];

export interface AlteracaoPreco {
  gross?: string;
  retail?: string;
  grossEval?: 'conforme' | 'nao_conforme';
  retailEval?: 'conforme' | 'nao_conforme';
}

/**
 * Aplica uma alteração de preço preservando a posse.
 *
 * @param origem constatação a partir da qual a edição está a ser feita, ou
 *   `null` quando vem da check list.
 */
export function aplicarPreco(
  precos: PrecoPorProduto,
  productId: number,
  alteracao: AlteracaoPreco,
  origem: string | null,
): PrecoPorProduto {
  const actual = precos[productId];
  const proximo: PrecoEntrada = {
    gross: '',
    retail: '',
    ...actual,
    ...alteracao,
    // A posse é do primeiro que o levantou. Reatribuí-la faria um preço saltar
    // de constatação sempre que alguém lhe tocasse noutro sítio.
    constatacaoId: actual ? (actual.constatacaoId ?? null) : origem,
  };
  return { ...precos, [productId]: proximo };
}

/** Um preço só é visível dentro da constatação que o levantou. */
export function precosDaConstatacao(
  precos: PrecoPorProduto,
  constatacaoId: string | null,
): number[] {
  if (!constatacaoId) return [];
  return Object.entries(precos)
    .filter(([, valor]) => valor?.constatacaoId === constatacaoId)
    .map(([id]) => Number(id));
}

/** Um preço conta como levantado quando tem pelo menos um dos dois valores. */
export function temValor(entrada: PrecoEntrada | undefined): boolean {
  return !!entrada && (!!entrada.gross?.trim() || !!entrada.retail?.trim());
}

/** Produtos com preço levantado, venham de onde vierem — é o que a check list conta. */
export function produtosVerificados(precos: PrecoPorProduto): number[] {
  return Object.entries(precos)
    .filter(([, valor]) => temValor(valor))
    .map(([id]) => Number(id));
}
