import { describe, expect, it } from 'vitest';
import {
  adicionarRecomendacao,
  alternarRecomendacao,
  contarPendentesPorResponder,
  contarPendentesRespondidas,
  contarRecomendacoes,
  normalizarRecomendacoes,
  removerRecomendacao,
  temRecomendacao,
  textosDeRecomendacoes,
  type RecomendacaoEmitida,
} from './recomendacoes';

const emitidas: RecomendacaoEmitida[] = [
  { texto: 'Reforçar a higiene do balcão', constatacaoId: 'c1' },
  { texto: 'Afixar a tabela de preços', constatacaoId: 'c2' },
  { texto: 'Rever o lacre das caixas', constatacaoId: 'c1' },
];

describe('normalizarRecomendacoes', () => {
  it('lê o rascunho antigo, de textos soltos, sem constatação', () => {
    expect(normalizarRecomendacoes(['Afixar a tabela', 'Rever o lacre'])).toEqual([
      { texto: 'Afixar a tabela', constatacaoId: null },
      { texto: 'Rever o lacre', constatacaoId: null },
    ]);
  });

  it('preserva a constatação no formato novo', () => {
    expect(normalizarRecomendacoes([{ texto: 'Afixar', constatacaoId: 'c9' }])).toEqual([
      { texto: 'Afixar', constatacaoId: 'c9' },
    ]);
  });

  it('tolera formatos misturados no mesmo rascunho', () => {
    expect(normalizarRecomendacoes(['Solto', { texto: 'Agrupado', constatacaoId: 'c1' }])).toEqual([
      { texto: 'Solto', constatacaoId: null },
      { texto: 'Agrupado', constatacaoId: 'c1' },
    ]);
  });

  it('descarta vazios, espaços e repetições', () => {
    expect(normalizarRecomendacoes(['  Afixar  ', 'Afixar', '', '   ', null, 7])).toEqual([
      { texto: 'Afixar', constatacaoId: null },
    ]);
  });

  it('devolve lista vazia para o que não é array', () => {
    expect(normalizarRecomendacoes(undefined)).toEqual([]);
    expect(normalizarRecomendacoes(null)).toEqual([]);
    expect(normalizarRecomendacoes('Afixar')).toEqual([]);
  });
});

describe('textosDeRecomendacoes', () => {
  it('devolve o formato gravado na visita e enviado no push', () => {
    expect(textosDeRecomendacoes(emitidas)).toEqual([
      'Reforçar a higiene do balcão',
      'Afixar a tabela de preços',
      'Rever o lacre das caixas',
    ]);
  });
});

describe('alternarRecomendacao', () => {
  it('acrescenta com a constatação em aberto', () => {
    const saida = alternarRecomendacao([], 'Afixar a tabela', 'c4');
    expect(saida).toEqual([{ texto: 'Afixar a tabela', constatacaoId: 'c4' }]);
  });

  it('deixa a constatação a nulo quando não há nenhuma aberta (stepper)', () => {
    expect(alternarRecomendacao([], 'Afixar a tabela')).toEqual([
      { texto: 'Afixar a tabela', constatacaoId: null },
    ]);
  });

  it('retira quando já está emitida, mesmo a partir de outra constatação', () => {
    const saida = alternarRecomendacao(emitidas, 'Afixar a tabela de preços', 'c1');
    expect(temRecomendacao(saida, 'Afixar a tabela de preços')).toBe(false);
    expect(saida).toHaveLength(2);
  });

  it('não duplica a mesma recomendação noutra constatação', () => {
    const saida = alternarRecomendacao(
      [{ texto: 'Afixar', constatacaoId: 'c1' }],
      'Afixar',
      'c2',
    );
    expect(saida).toEqual([]);
  });

  it('ignora texto vazio', () => {
    expect(alternarRecomendacao(emitidas, '   ', 'c1')).toBe(emitidas);
  });
});

describe('adicionarRecomendacao', () => {
  it('acrescenta o texto livre à constatação em aberto', () => {
    const saida = adicionarRecomendacao([], 'Reforçar o lacre', 'c7');
    expect(saida).toEqual([{ texto: 'Reforçar o lacre', constatacaoId: 'c7' }]);
  });

  it('não retira quando já existe — ao contrário de alternar', () => {
    const saida = adicionarRecomendacao(emitidas, 'Afixar a tabela de preços', 'c1');
    expect(saida).toBe(emitidas);
  });
});

describe('removerRecomendacao', () => {
  it('retira pelo texto, venha de que constatação vier', () => {
    const saida = removerRecomendacao(emitidas, 'Rever o lacre das caixas');
    expect(textosDeRecomendacoes(saida)).toEqual([
      'Reforçar a higiene do balcão',
      'Afixar a tabela de preços',
    ]);
  });
});

describe('contarRecomendacoes', () => {
  it('conta as emitidas a partir daquela constatação', () => {
    expect(contarRecomendacoes(emitidas, 'c1')).toBe(2);
    expect(contarRecomendacoes(emitidas, 'c2')).toBe(1);
  });

  it('não conta as de outras constatações — dois cartões não parecem iguais', () => {
    expect(contarRecomendacoes(emitidas, 'c3')).toBe(0);
  });

  it('não conta as do stepper, que não têm constatação', () => {
    expect(contarRecomendacoes([{ texto: 'Solta', constatacaoId: null }], 'c1')).toBe(0);
  });

  it('devolve zero sem constatação em aberto', () => {
    expect(contarRecomendacoes(emitidas, undefined)).toBe(0);
    expect(contarRecomendacoes(emitidas, null)).toBe(0);
  });
});

describe('recomendações anteriores por responder', () => {
  it('conta como respondida tanto o sim como o não', () => {
    expect(
      contarPendentesRespondidas([{ atendida: true }, { atendida: false }]),
    ).toBe(2);
  });

  it('não conta a que nunca foi tocada nem a que foi desmarcada', () => {
    // `undefined` é o registo que chegou do histórico sem resposta; `null` é o
    // que o agente marcou e voltou a desmarcar. As duas são por responder.
    expect(contarPendentesRespondidas([{}, { atendida: null }])).toBe(0);
  });

  it('subtrai as respondidas ao total de pendentes agrupadas', () => {
    expect(contarPendentesPorResponder(3, [{ atendida: true }])).toBe(2);
    expect(contarPendentesPorResponder(2, [{ atendida: true }, { atendida: false }])).toBe(0);
  });

  it('nunca devolve negativo', () => {
    // O histórico traz uma entrada por origem e o total vem já agrupado por
    // texto: a mesma recomendação repetida em três visitas dá três respostas
    // para um só grupo, e a subtracção crua ficava negativa.
    expect(
      contarPendentesPorResponder(1, [
        { atendida: true },
        { atendida: true },
        { atendida: true },
      ]),
    ).toBe(0);
  });
});
