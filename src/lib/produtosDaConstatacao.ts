import type { ItemApreensaoForm, PrecoPorProduto } from '../pages/nova-visita/context';
import { precosDaConstatacao } from './priceOwnership';

/**
 * O produto como o agente o vê dentro de uma constatação (SPEC-10 §5).
 *
 * Preço e apreensão eram duas superfícies e duas listas, e o agente que
 * encontrava um produto acima do tecto e o apreendia tinha de o escolher duas
 * vezes, em dois sítios, com o mesmo nome. Aqui são um só objecto: **o
 * produto**, com o que se leu do preço e o que se levou dele.
 *
 * As duas formas de dados por baixo não mudam, e não podiam: `produtosPrices` é
 * um mapa de uma entrada por produto, partilhado com a check list da cesta
 * básica, e `apreensaoItens` é uma lista onde o mesmo produto aparece uma vez
 * por parte apreendida — «levar dez sacos e deixar quarenta à guarda» é o caso
 * que motiva o auto, não a excepção. A linha reconcilia-as; não as substitui.
 */

export interface LinhaProduto {
  /** Identidade do produto dentro da constatação. */
  chave: string;
  assetSupply: number | null;
  designation: string;
  /**
   * Partes apreendidas deste produto — índices em `apreensaoItens`, na ordem da
   * lista original. São várias porque a mesma quantidade pode seguir caminhos
   * diferentes; o **destino** de cada uma decide-se na tarefa própria da tela,
   * e não aqui (ver `lib/destinoApreensao.ts`).
   */
  partes: number[];
  /**
   * Produto do catálogo. Só ele tem onde guardar preço: `produtosPrices` é
   * chaveado pelo id do catálogo, e um produto que a DRCAE ainda não catalogou
   * não tem esse id — pode ser apreendido, não pode ser cotado.
   */
  catalogado: boolean;
}

/**
 * Duas entradas descrevem o mesmo produto quando partilham o id do catálogo.
 *
 * Sem id, resta a designação — normalizada, porque «Arroz» e «arroz » escritos
 * em dois momentos são a mesma coisa para quem está na loja.
 */
export function chaveDoProduto(assetSupply: number | null, designation: string): string {
  return assetSupply != null ? `cat:${assetSupply}` : `livre:${designation.trim().toLowerCase()}`;
}

export function linhasDaConstatacao(
  produtosPrices: PrecoPorProduto,
  apreensaoItens: ItemApreensaoForm[],
  constatacaoId: string | null,
  nomeDoProduto: (id: number) => string,
): LinhaProduto[] {
  if (!constatacaoId) return [];

  const linhas = new Map<string, LinhaProduto>();

  // Preços primeiro: são os produtos que a constatação já reclamou como seus.
  for (const id of precosDaConstatacao(produtosPrices, constatacaoId)) {
    const chave = chaveDoProduto(id, '');
    linhas.set(chave, {
      chave,
      assetSupply: id,
      designation: nomeDoProduto(id),
      partes: [],
      catalogado: true,
    });
  }

  apreensaoItens.forEach((item, index) => {
    if (item.constatacaoId !== constatacaoId) return;
    const assetSupply = item.assetSupply ?? null;
    const chave = chaveDoProduto(assetSupply, item.designation);
    const existente = linhas.get(chave);
    if (existente) {
      existente.partes.push(index);
      return;
    }
    linhas.set(chave, {
      chave,
      assetSupply,
      designation: assetSupply != null ? nomeDoProduto(assetSupply) : item.designation,
      partes: [index],
      catalogado: assetSupply != null,
    });
  });

  return [...linhas.values()];
}

/** Painel do cartão do produto: o que se lê, ou o que se levou. */
export type PainelProduto = 'preco' | 'apreensao';

/**
 * Com que painel abre o cartão de um produto.
 *
 * O cartão mostra um de cada vez — preço e apreensão respondem a perguntas
 * diferentes, e juntas transformavam um produto que o agente só queria cotar
 * num formulário de dez campos. Qual abre não se pergunta: deriva-se do que o
 * produto já é.
 *
 * Produto não catalogado não tem onde guardar preço, e só pode abrir na
 * apreensão. Produto que entrou na constatação por ter sido apreendido abre no
 * que o trouxe. O resto abre no preço, que é o caso corrente.
 */
export function painelInicialDoProduto(
  linha: Pick<LinhaProduto, 'catalogado' | 'partes'>,
  temPreco: boolean,
): PainelProduto {
  if (!linha.catalogado) return 'apreensao';
  if (linha.partes.length > 0 && !temPreco) return 'apreensao';
  return 'preco';
}

/**
 * Preço registado na check list da cesta básica, e não nesta constatação.
 *
 * Existe **um** valor por produto — o preço praticado é um facto do
 * estabelecimento, não da constatação. Quando a linha aparece por causa de uma
 * apreensão e o preço já vinha da check list, editá-lo aqui edita esse mesmo
 * valor, e o agente tem de o saber antes de lhe tocar.
 */
export function precoDeOutraOrigem(
  produtosPrices: PrecoPorProduto,
  linha: LinhaProduto,
  constatacaoId: string | null,
): boolean {
  if (linha.assetSupply == null) return false;
  const entrada = produtosPrices[linha.assetSupply];
  if (!entrada) return false;
  return (entrada.constatacaoId ?? null) !== constatacaoId;
}
