import { describe, expect, it } from 'vitest';
import {
  aplicarPreco,
  precosDaConstatacao,
  produtosVerificados,
  temValor,
} from './priceOwnership';
import type { PrecoPorProduto } from '../pages/nova-visita/context';

const C1 = 'constatacao-1';
const C2 = 'constatacao-2';

describe('aplicarPreco', () => {
  it('atribui a posse à constatação que o levanta', () => {
    const precos = aplicarPreco({}, 7, { retail: '120' }, C1);
    expect(precos[7]).toMatchObject({ retail: '120', constatacaoId: C1 });
  });

  it('deixa sem dono o preço levantado na check list', () => {
    const precos = aplicarPreco({}, 7, { retail: '120' }, null);
    expect(precos[7].constatacaoId).toBeNull();
  });

  it('não reatribui a posse quando outra superfície edita o mesmo preço', () => {
    // É isto que faz a correcção na check list reflectir-se na constatação que o
    // levantou, sem o preço saltar de dono a cada toque.
    const inicial = aplicarPreco({}, 7, { retail: '120' }, C1);
    const corrigido = aplicarPreco(inicial, 7, { retail: '135' }, null);
    expect(corrigido[7]).toMatchObject({ retail: '135', constatacaoId: C1 });

    const doutraConstatacao = aplicarPreco(corrigido, 7, { retail: '140' }, C2);
    expect(doutraConstatacao[7].constatacaoId).toBe(C1);
  });

  it('mantém sem dono o preço que nasceu na check list, mesmo editado numa constatação', () => {
    const inicial = aplicarPreco({}, 7, { retail: '120' }, null);
    const editado = aplicarPreco(inicial, 7, { retail: '150' }, C1);
    expect(editado[7].constatacaoId).toBeNull();
  });

  it('preserva o campo que não foi tocado', () => {
    const inicial = aplicarPreco({}, 7, { gross: '90', retail: '120' }, C1);
    const editado = aplicarPreco(inicial, 7, { retail: '130' }, C1);
    expect(editado[7]).toMatchObject({ gross: '90', retail: '130' });
  });

  it('não altera a entrada de outro produto', () => {
    const precos = aplicarPreco(aplicarPreco({}, 7, { retail: '120' }, C1), 8, { retail: '80' }, C2);
    expect(precos[7].constatacaoId).toBe(C1);
    expect(precos[8].constatacaoId).toBe(C2);
  });
});

describe('precosDaConstatacao', () => {
  const precos: PrecoPorProduto = {
    1: { gross: '', retail: '10', constatacaoId: C1 },
    2: { gross: '', retail: '20', constatacaoId: C2 },
    3: { gross: '', retail: '30', constatacaoId: null },
  };

  it('devolve apenas os da constatação pedida', () => {
    expect(precosDaConstatacao(precos, C1)).toEqual([1]);
    expect(precosDaConstatacao(precos, C2)).toEqual([2]);
  });

  it('não devolve os que nasceram na check list', () => {
    expect(precosDaConstatacao(precos, C1)).not.toContain(3);
  });

  it('devolve vazio sem constatação em aberto', () => {
    expect(precosDaConstatacao(precos, null)).toEqual([]);
  });
});

describe('temValor e produtosVerificados', () => {
  it('não conta um preço vazio nem só com espaços', () => {
    expect(temValor({ gross: '', retail: '' })).toBe(false);
    expect(temValor({ gross: '   ', retail: '  ' })).toBe(false);
    expect(temValor(undefined)).toBe(false);
    expect(temValor({ gross: '90', retail: '' })).toBe(true);
  });

  it('conta o produto verificado venha de onde vier', () => {
    const precos: PrecoPorProduto = {
      1: { gross: '', retail: '10', constatacaoId: C1 },
      2: { gross: '', retail: '', constatacaoId: null },
      3: { gross: '5', retail: '', constatacaoId: null },
    };
    expect(produtosVerificados(precos)).toEqual([1, 3]);
  });
});
