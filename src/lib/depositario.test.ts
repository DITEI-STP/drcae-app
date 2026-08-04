import { describe, expect, it } from 'vitest';
import { descreveDepositario, resumoDepositario } from './depositario';

describe('descreveDepositario', () => {
  it('com a guarda na firma, o custodiante é o operador e o nome é o assinante', () => {
    expect(
      descreveDepositario({
        trusteeKind: 'operator',
        trusteeName: 'Maria Costa',
        firmaName: 'Comercial ABC, Lda',
      }),
    ).toEqual({
      custodiante: 'Comercial ABC, Lda',
      assinante: 'Maria Costa',
      terceiro: false,
    });
  });

  it('com depositário terceiro, o custodiante é a pessoa', () => {
    expect(
      descreveDepositario({
        trusteeKind: 'person',
        trusteeName: 'João Pinto',
        firmaName: 'Comercial ABC, Lda',
      }),
    ).toEqual({
      custodiante: 'João Pinto',
      assinante: null,
      terceiro: true,
    });
  });

  it('auto anterior à distinção é lido como guarda da firma', () => {
    // É o mesmo que a migração escreveu: nunca houve depósito em terceiro
    // nestes registos, e marcá-los como tal inventaria um facto.
    const d = descreveDepositario({
      trusteeName: 'Maria Costa',
      firmaName: 'Comercial ABC, Lda',
    });
    expect(d.terceiro).toBe(false);
    expect(d.custodiante).toBe('Comercial ABC, Lda');
  });

  it('não deixa o custodiante em branco', () => {
    expect(descreveDepositario({}).custodiante).toBe('Operador económico');
    expect(
      descreveDepositario({ trusteeKind: 'person', trusteeName: '  ' })
        .custodiante,
    ).toBe('Depositário não identificado');
  });
});

describe('resumoDepositario', () => {
  it('distingue a firma do terceiro numa linha só', () => {
    expect(
      resumoDepositario({
        trusteeKind: 'operator',
        trusteeName: 'Maria Costa',
        firmaName: 'Comercial ABC, Lda',
      }),
    ).toBe('Fiel depositário: Comercial ABC, Lda · assinou Maria Costa');

    expect(
      resumoDepositario({ trusteeKind: 'person', trusteeName: 'João Pinto' }),
    ).toBe('Fiel depositário: João Pinto (terceiro)');
  });

  it('omite o assinante quando não foi registado', () => {
    expect(resumoDepositario({ firmaName: 'Comercial ABC, Lda' })).toBe(
      'Fiel depositário: Comercial ABC, Lda',
    );
  });
});
