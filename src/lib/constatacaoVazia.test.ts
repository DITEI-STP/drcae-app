import { describe, expect, it } from 'vitest';
import { constatacaoVazia, temRegistos, type RegistosDaFiscalizacao } from './constatacaoVazia';

const vazios: RegistosDaFiscalizacao = {
  anexos: [],
  infracoes: [],
  apreensaoItens: [],
  recomendacoes: [],
  produtosPrices: {},
};

describe('temRegistos', () => {
  it('é falso sem constatação', () => {
    expect(temRegistos(null, vazios)).toBe(false);
    expect(temRegistos(undefined, vazios)).toBe(false);
  });

  it('encontra registo em cada uma das cinco fontes', () => {
    expect(temRegistos('c1', { ...vazios, anexos: [{ constatacaoId: 'c1' }] })).toBe(true);
    expect(temRegistos('c1', { ...vazios, infracoes: [{ constatacaoId: 'c1' }] })).toBe(true);
    expect(temRegistos('c1', { ...vazios, apreensaoItens: [{ constatacaoId: 'c1' }] })).toBe(true);
    expect(
      temRegistos('c1', { ...vazios, recomendacoes: [{ texto: 'x', constatacaoId: 'c1' }] }),
    ).toBe(true);
    expect(
      temRegistos('c1', {
        ...vazios,
        produtosPrices: { 7: { gross: '', retail: '100', constatacaoId: 'c1' } },
      }),
    ).toBe(true);
  });

  it('ignora registos de outra constatação', () => {
    expect(
      temRegistos('c1', {
        ...vazios,
        anexos: [{ constatacaoId: 'c2' }],
        infracoes: [{ constatacaoId: null }],
      }),
    ).toBe(false);
  });

  it('não conta um preço sem valor nenhum', () => {
    // A linha nasce vazia quando o produto é escolhido na folha. Contá-la aqui
    // faria um produto escolhido por engano proteger a constatação da limpeza.
    expect(
      temRegistos('c1', {
        ...vazios,
        produtosPrices: { 7: { gross: '', retail: '', constatacaoId: 'c1' } },
      }),
    ).toBe(false);
  });

  it('conta o preço com qualquer um dos dois valores', () => {
    expect(
      temRegistos('c1', {
        ...vazios,
        produtosPrices: { 7: { gross: '50', retail: '', constatacaoId: 'c1' } },
      }),
    ).toBe(true);
  });
});

describe('constatacaoVazia', () => {
  it('é vazia sem descrição e sem registos', () => {
    expect(constatacaoVazia({ id: 'c1' }, vazios)).toBe(true);
  });

  it('a descrição sozinha basta para não ser vazia', () => {
    expect(constatacaoVazia({ id: 'c1', descricao: 'Prateleira sem preços' }, vazios)).toBe(false);
  });

  it('descrição só de espaços não conta', () => {
    expect(constatacaoVazia({ id: 'c1', descricao: '   ' }, vazios)).toBe(true);
  });

  it('um registo sozinho basta para não ser vazia', () => {
    // O agente fotografa primeiro e escreve depois — quando escreve. Apagar
    // aqui levaria a prova consigo.
    expect(
      constatacaoVazia({ id: 'c1' }, { ...vazios, anexos: [{ constatacaoId: 'c1' }] }),
    ).toBe(false);
  });

  it('constatação sem id nunca tem registos, mas a descrição continua a valer', () => {
    expect(constatacaoVazia({ descricao: 'algo' }, vazios)).toBe(false);
    expect(constatacaoVazia({}, vazios)).toBe(true);
  });
});
