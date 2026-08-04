import { describe, expect, it } from 'vitest';
import type { ItemApreensaoForm, PrecoPorProduto } from '../pages/nova-visita/context';
import {
  chaveDoProduto,
  linhasDaConstatacao,
  painelInicialDoProduto,
  precoDeOutraOrigem,
} from './produtosDaConstatacao';

const nomes: Record<number, string> = { 7: 'Arroz', 9: 'Óleo' };
const nomeDoProduto = (id: number) => nomes[id] ?? `Produto ${id}`;

function item(patch: Partial<ItemApreensaoForm>): ItemApreensaoForm {
  return {
    constatacaoId: 'c1',
    assetSupply: null,
    designation: '',
    quantity: '',
    assetUnit: null,
    custody: 'drcae',
    note: '',
    ...patch,
  };
}

describe('chaveDoProduto', () => {
  it('usa o id do catálogo quando existe', () => {
    expect(chaveDoProduto(7, 'seja o que for')).toBe('cat:7');
  });

  it('normaliza a designação do não catalogado', () => {
    // O mesmo produto escrito em dois momentos não pode dar duas linhas.
    expect(chaveDoProduto(null, ' Arroz ')).toBe(chaveDoProduto(null, 'arroz'));
  });
});

describe('linhasDaConstatacao', () => {
  it('devolve vazio sem constatação em aberto', () => {
    expect(linhasDaConstatacao({}, [], null, nomeDoProduto)).toEqual([]);
  });

  it('cria linha para o produto com preço, sem partes apreendidas', () => {
    const precos: PrecoPorProduto = { 7: { gross: '', retail: '120', constatacaoId: 'c1' } };
    const [linha] = linhasDaConstatacao(precos, [], 'c1', nomeDoProduto);
    expect(linha).toMatchObject({
      chave: 'cat:7',
      assetSupply: 7,
      designation: 'Arroz',
      partes: [],
      catalogado: true,
    });
  });

  it('junta preço e apreensão do mesmo produto numa só linha', () => {
    // É o ponto do formulário fundido: um produto, não duas entradas com o
    // mesmo nome em dois ecrãs.
    const precos: PrecoPorProduto = { 7: { gross: '', retail: '120', constatacaoId: 'c1' } };
    const itens = [item({ assetSupply: 7, designation: 'Arroz', quantity: '10' })];
    const linhas = linhasDaConstatacao(precos, itens, 'c1', nomeDoProduto);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].partes).toEqual([0]);
  });

  it('agrupa várias partes do mesmo produto', () => {
    // «Levar dez e deixar quarenta à guarda» é o caso que motiva o auto.
    const itens = [
      item({ assetSupply: 7, designation: 'Arroz', quantity: '10', custody: 'drcae' }),
      item({ assetSupply: 7, designation: 'Arroz', quantity: '40', custody: 'trustee' }),
    ];
    const linhas = linhasDaConstatacao({}, itens, 'c1', nomeDoProduto);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].partes).toEqual([0, 1]);
  });

  it('guarda os índices da lista original, não os da constatação', () => {
    // Os índices são o que o formulário usa para editar o item certo; contar a
    // partir da constatação escreveria noutro item.
    const itens = [
      item({ constatacaoId: 'c2', assetSupply: 9, designation: 'Óleo' }),
      item({ assetSupply: 7, designation: 'Arroz' }),
    ];
    const linhas = linhasDaConstatacao({}, itens, 'c1', nomeDoProduto);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].partes).toEqual([1]);
  });

  it('mantém o não catalogado como linha própria, sem preço', () => {
    const itens = [item({ assetSupply: null, designation: 'Farinha a granel' })];
    const [linha] = linhasDaConstatacao({}, itens, 'c1', nomeDoProduto);
    expect(linha.catalogado).toBe(false);
    expect(linha.designation).toBe('Farinha a granel');
  });

  it('ignora preços e itens de outras constatações', () => {
    const precos: PrecoPorProduto = { 9: { gross: '', retail: '80', constatacaoId: 'c2' } };
    const itens = [item({ constatacaoId: 'c2', assetSupply: 9, designation: 'Óleo' })];
    expect(linhasDaConstatacao(precos, itens, 'c1', nomeDoProduto)).toEqual([]);
  });

  it('ignora o preço sem dono — é da check list, não da constatação', () => {
    const precos: PrecoPorProduto = { 7: { gross: '', retail: '120', constatacaoId: null } };
    expect(linhasDaConstatacao(precos, [], 'c1', nomeDoProduto)).toEqual([]);
  });
});

describe('precoDeOutraOrigem', () => {
  const linha = { chave: 'cat:7', assetSupply: 7, designation: 'Arroz', partes: [0], catalogado: true };

  it('assinala o preço que veio da check list', () => {
    // A linha só existe por causa da apreensão; o preço já era da check list, e
    // editá-lo aqui edita o mesmo valor.
    const precos: PrecoPorProduto = { 7: { gross: '', retail: '120', constatacaoId: null } };
    expect(precoDeOutraOrigem(precos, linha, 'c1')).toBe(true);
  });

  it('não assinala o preço desta constatação', () => {
    const precos: PrecoPorProduto = { 7: { gross: '', retail: '120', constatacaoId: 'c1' } };
    expect(precoDeOutraOrigem(precos, linha, 'c1')).toBe(false);
  });

  it('não assinala quando ainda não há preço nenhum', () => {
    expect(precoDeOutraOrigem({}, linha, 'c1')).toBe(false);
  });

  it('não se aplica ao não catalogado', () => {
    const semId = { ...linha, assetSupply: null, catalogado: false };
    expect(precoDeOutraOrigem({}, semId, 'c1')).toBe(false);
  });
});

describe('painelInicialDoProduto', () => {
  it('abre no preço o produto do catálogo', () => {
    // O caso corrente: o agente entra no produto para o cotar.
    expect(painelInicialDoProduto({ catalogado: true, partes: [] }, false)).toBe('preco');
  });

  it('abre na apreensão o produto não catalogado', () => {
    // Não tem id de catálogo, e por isso não tem onde guardar preço.
    expect(painelInicialDoProduto({ catalogado: false, partes: [0] }, false)).toBe('apreensao');
  });

  it('abre na apreensão o produto que entrou por ter sido apreendido', () => {
    expect(painelInicialDoProduto({ catalogado: true, partes: [0] }, false)).toBe('apreensao');
  });

  it('abre no preço o produto que tem as duas coisas', () => {
    // Com preço levantado, é ele que identifica o produto na constatação.
    expect(painelInicialDoProduto({ catalogado: true, partes: [0] }, true)).toBe('preco');
  });
});
