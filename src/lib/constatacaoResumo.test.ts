import { describe, expect, it } from 'vitest';
import { resumirConstatacao, type ResumoInput } from './constatacaoResumo';

const vazio: ResumoInput = {
  infracoes: [],
  itensApreendidos: [],
  produtos: [],
  provas: 0,
};

describe('resumirConstatacao', () => {
  it('usa a descrição quando existe', () => {
    expect(
      resumirConstatacao({ ...vazio, descricao: '  Arca desligada  ', infracoes: ['Conservação'] }),
    ).toBe('Arca desligada');
  });

  it('ignora descrição só com espaços', () => {
    expect(resumirConstatacao({ ...vazio, descricao: '   ', provas: 2 })).toBe('2 provas');
  });

  it('prefere a infracção a tudo o resto', () => {
    // É a infracção que determina o estado da fiscalização, e é por ela que o
    // agente procura o cartão.
    expect(
      resumirConstatacao({
        ...vazio,
        infracoes: ['Conservação inadequada'],
        itensApreendidos: ['Carne'],
        produtos: ['Arroz'],
        provas: 3,
      }),
    ).toBe('Conservação inadequada');
  });

  it('conta as restantes quando há mais do que uma', () => {
    expect(resumirConstatacao({ ...vazio, infracoes: ['Rótulos', 'Higiene', 'Preço'] }))
      .toBe('Rótulos +2');
  });

  it('cai no item apreendido sem infracção', () => {
    expect(resumirConstatacao({ ...vazio, itensApreendidos: ['Carne'], provas: 2 }))
      .toBe('Apreendido: Carne');
  });

  it('cai no produto sem infracção nem apreensão', () => {
    expect(resumirConstatacao({ ...vazio, produtos: ['Arroz'], provas: 1 })).toBe('Preço: Arroz');
  });

  it('cai na contagem de provas em último recurso', () => {
    expect(resumirConstatacao({ ...vazio, provas: 1 })).toBe('1 prova');
    expect(resumirConstatacao({ ...vazio, provas: 4 })).toBe('4 provas');
  });

  it('diz «sem registos» quando não há mesmo nada', () => {
    expect(resumirConstatacao(vazio)).toBe('Sem registos');
  });
});
