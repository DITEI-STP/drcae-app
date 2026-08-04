import { describe, expect, it } from 'vitest';
import {
  constatacaoDoMotivo,
  impedeAvancar,
  pendenciasDaTela,
  type ItemComConstatacao,
} from './pendenciasDaTela';
import type { MotivoApreensao } from './apreensaoValidacao';

const item = (over: Partial<ItemComConstatacao> = {}): ItemComConstatacao => ({
  constatacaoId: 'c1',
  designation: 'Arroz',
  quantity: '10',
  assetSupply: null,
  assetUnit: 1302,
  custody: 'drcae',
  note: '',
  ...over,
});

const motivo = (codigo: string, texto = 'texto'): MotivoApreensao =>
  ({ codigo, texto }) as MotivoApreensao;

const base = {
  motivos: [],
  apreensaoItens: [],
  produtosTotal: 0,
  produtosVerificados: 0,
  recomendacoesPorResponder: 0,
};

describe('pendenciasDaTela', () => {
  it('não devolve nada quando não falta nada', () => {
    expect(pendenciasDaTela(base)).toEqual([]);
  });

  it('encaminha destino e depositário para a tarefa da apreensão', () => {
    const pendencias = pendenciasDaTela({
      ...base,
      motivos: [motivo('destino'), motivo('depositario')],
      apreensaoItens: [item({ custody: null })],
    });
    expect(pendencias.map((p) => p.alvo)).toEqual(['tarefa-apreensao', 'tarefa-apreensao']);
    // A tarefa é da fiscalização inteira: não há constatação a comutar.
    expect(pendencias.every((p) => p.constatacaoId === null)).toBe(true);
  });

  it('encaminha cada campo em falta para a constatação que o contém', () => {
    // O motivo é global, a folha de Produtos é de uma constatação só: abrir a
    // errada leva o agente a uma lista onde o problema não está.
    const pendencias = pendenciasDaTela({
      ...base,
      motivos: [motivo('item-quantidade')],
      apreensaoItens: [
        item({ constatacaoId: 'c1' }),
        item({ constatacaoId: 'c7', quantity: '' }),
      ],
    });
    expect(pendencias[0]).toMatchObject({ alvo: 'produtos', constatacaoId: 'c7' });
  });

  it('encaminha o fundamento para a primeira constatação com apreensão', () => {
    const pendencias = pendenciasDaTela({
      ...base,
      motivos: [motivo('justificacao')],
      apreensaoItens: [item({ constatacaoId: 'c3' })],
    });
    expect(pendencias[0]).toMatchObject({ alvo: 'produtos', constatacaoId: 'c3' });
  });

  it('aceita o item sem dona — o cartão pode ter sido descartado', () => {
    const pendencias = pendenciasDaTela({
      ...base,
      motivos: [motivo('item-quantidade')],
      apreensaoItens: [item({ constatacaoId: null, quantity: '' })],
    });
    expect(pendencias[0].constatacaoId).toBeNull();
  });

  it('põe as recomendações por responder no fim, e como aviso', () => {
    const pendencias = pendenciasDaTela({
      ...base,
      motivos: [motivo('destino')],
      recomendacoesPorResponder: 2,
    });
    expect(pendencias.map((p) => p.tom)).toEqual(['bloqueio', 'aviso']);
    expect(pendencias[1].texto).toContain('2 recomendações');
  });

  it('ignora motivo sem encaminhamento conhecido', () => {
    // Um motivo novo no validador não pode produzir uma linha com um botão que
    // não abre nada — aparece quando alguém lhe der destino.
    expect(pendenciasDaTela({ ...base, motivos: [motivo('desconhecido')] })).toEqual([]);
  });
});

describe('impedeAvancar', () => {
  it('impede com qualquer bloqueio', () => {
    const pendencias = pendenciasDaTela({ ...base, motivos: [motivo('destino')] });
    expect(impedeAvancar(pendencias)).toBe(true);
  });

  it('não impede quando só há avisos', () => {
    // Responder às recomendações é dever de revisão, não requisito do auto.
    const pendencias = pendenciasDaTela({ ...base, recomendacoesPorResponder: 1 });
    expect(impedeAvancar(pendencias)).toBe(false);
  });
});

describe('constatacaoDoMotivo', () => {
  it('ignora linhas nunca preenchidas ao procurar a dona', () => {
    const vazio = item({ constatacaoId: 'c9', designation: '', quantity: '', note: '' });
    expect(constatacaoDoMotivo('justificacao', [vazio, item({ constatacaoId: 'c2' })])).toBe('c2');
  });
});

describe('preços do livro em vigor', () => {
  it('avisa quando ficam preços por verificar', () => {
    const pendencias = pendenciasDaTela({ ...base, produtosTotal: 12, produtosVerificados: 5 });
    expect(pendencias[0]).toMatchObject({ codigo: 'precos', tom: 'aviso', alvo: 'tarefa-precos' });
    expect(pendencias[0].texto).toContain('7 preços');
    // Avisa e não impede: percorrer o livro inteiro nem sempre cabe na visita.
    expect(impedeAvancar(pendencias)).toBe(false);
  });

  it('não avisa quando o livro foi todo percorrido', () => {
    expect(pendenciasDaTela({ ...base, produtosTotal: 12, produtosVerificados: 12 })).toEqual([]);
  });

  it('não avisa quando o operador não tem livro', () => {
    // Sem livro não há lista fechada por percorrer — não é lacuna nenhuma.
    expect(pendenciasDaTela({ ...base, produtosTotal: 0, produtosVerificados: 0 })).toEqual([]);
  });

  it('vem depois dos impedimentos e antes das recomendações', () => {
    const pendencias = pendenciasDaTela({
      ...base,
      motivos: [motivo('destino')],
      produtosTotal: 3,
      produtosVerificados: 0,
      recomendacoesPorResponder: 1,
    });
    expect(pendencias.map((p) => p.codigo)).toEqual(['destino', 'precos', 'recomendacoes']);
  });
});

describe('encaminhamento por campo', () => {
  it('leva cada motivo à parte a que falta esse campo', () => {
    // Sem isto, o atalho da unidade abria a constatação onde faltava a
    // quantidade — e o agente não encontrava lá o campo que o alerta nomeou.
    const itens = [
      item({ constatacaoId: 'c1', quantity: '' }),
      item({ constatacaoId: 'c2', assetUnit: null }),
      item({ constatacaoId: 'c3', designation: '' }),
    ];
    const alvo = (codigo: string) =>
      pendenciasDaTela({ ...base, motivos: [motivo(codigo)], apreensaoItens: itens })[0]
        .constatacaoId;

    expect(alvo('item-quantidade')).toBe('c1');
    expect(alvo('item-unidade')).toBe('c2');
    expect(alvo('item-produto')).toBe('c3');
  });
});
