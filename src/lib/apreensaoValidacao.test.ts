import { describe, expect, it } from 'vitest';
import {
  itemIncompleto,
  itemVazio,
  motivosApreensaoIncompleta,
  motivosDe,
  motivosDosItens,
  type ApreensaoValidavel,
} from './apreensaoValidacao';

const item = (over: Partial<ApreensaoValidavel['itens'][number]> = {}) => ({
  designation: 'Arroz',
  quantity: '10',
  assetSupply: null,
  assetUnit: 1302,
  custody: 'drcae' as const,
  note: '',
  ...over,
});

/** Linha acrescentada e nunca tocada — a que a submissão descarta. */
const vaziaBase = {
  designation: '',
  quantity: '',
  assetSupply: null,
  assetUnit: null,
  note: '',
  custody: null,
} as const;

const base: ApreensaoValidavel = {
  activa: true,
  semInfracao: false,
  justificacao: '',
  itens: [item()],
  trustee: {
    kind: 'operator' as const,
    name: '',
    docType: '',
    docNumber: '',
  },
};

describe('itemVazio / itemIncompleto', () => {
  it('uma linha nunca tocada é vazia e não é incompleta', () => {
    // Resulta de tocar em «Adicionar item» a mais. A submissão descarta-a.
    const vazio = item({ designation: '', quantity: '', assetSupply: null, note: '' });
    expect(itemVazio(vazio)).toBe(true);
    expect(itemIncompleto(vazio)).toBe(false);
  });

  it('uma linha começada sem quantidade é incompleta', () => {
    expect(itemIncompleto(item({ quantity: '' }))).toBe(true);
    expect(itemIncompleto(item({ quantity: '0' }))).toBe(true);
  });

  it('uma linha com produto escolhido mas sem quantidade é incompleta', () => {
    expect(itemIncompleto(item({ designation: '', quantity: '', assetSupply: 7 }))).toBe(true);
  });

  it('uma linha completa não é nenhuma das duas', () => {
    expect(itemVazio(item())).toBe(false);
    expect(itemIncompleto(item())).toBe(false);
  });
});

describe('motivosApreensaoIncompleta', () => {
  it('não exige nada quando a apreensão não está activa', () => {
    expect(motivosApreensaoIncompleta({ ...base, activa: false, itens: [item({ quantity: '' })] }))
      .toEqual([]);
  });

  it('deixa passar um auto completo', () => {
    expect(motivosApreensaoIncompleta(base)).toEqual([]);
  });

  it('deixa passar quando só sobra uma linha vazia', () => {
    // Era este o bloqueio invisível: o agente acrescentava uma linha a mais e
    // ficava preso sem nada no ecrã a explicar porquê.
    const vazio = item({ designation: '', quantity: '', assetSupply: null, note: '' });
    expect(motivosApreensaoIncompleta({ ...base, itens: [item(), vazio] })).toEqual([]);
  });

  it('exige justificação ao apreender sem infracção', () => {
    const motivos = motivosApreensaoIncompleta({ ...base, semInfracao: true });
    expect(motivos.map((m) => m.codigo)).toContain('justificacao');
  });

  it('aceita a apreensão sem infracção quando há justificação', () => {
    expect(
      motivosApreensaoIncompleta({ ...base, semInfracao: true, justificacao: 'Produto sem rótulo.' }),
    ).toEqual([]);
  });

  it('não pede nada quando a guarda fica com a própria firma', () => {
    // O caso corrente da DRCAE: o responsável é o operador que o auto já
    // identifica, e o agente não tem nada a escrever.
    const motivos = motivosApreensaoIncompleta({
      ...base,
      itens: [item({ custody: 'trustee' })],
    });
    expect(motivos).toEqual([]);
  });

  it('exige nome e documento do depositário terceiro', () => {
    const motivos = motivosApreensaoIncompleta({
      ...base,
      trustee: { kind: 'person', name: '', docType: '', docNumber: '' },
      itens: [item({ custody: 'trustee' })],
    });
    expect(motivos.map((m) => m.codigo)).toContain('depositario');
  });

  it('aceita o depositário terceiro completamente identificado', () => {
    const motivos = motivosApreensaoIncompleta({
      ...base,
      trustee: {
        kind: 'person',
        name: 'João Pinto',
        docType: 'bi',
        docNumber: '234567',
      },
      itens: [item({ custody: 'trustee' })],
    });
    expect(motivos).toEqual([]);
  });

  it('não exige depositário terceiro por causa de uma linha vazia', () => {
    const vazio = item({ designation: '', quantity: '', assetSupply: null, note: '', custody: 'trustee' });
    expect(
      motivosApreensaoIncompleta({
        ...base,
        trustee: { kind: 'person', name: '', docType: '', docNumber: '' },
        itens: [item(), vazio],
      }),
    ).toEqual([]);
  });

  it('exige o destino de cada item apreendido', () => {
    // O destino decide-se na tarefa própria, e enquanto não estiver decidido o
    // auto não é um auto: só o depósito gera obrigação de recolha.
    const motivos = motivosApreensaoIncompleta({ ...base, itens: [item({ custody: null })] });
    expect(motivos.map((m) => m.codigo)).toContain('destino');
  });

  it('não pede destino para uma linha vazia', () => {
    expect(
      motivosApreensaoIncompleta({ ...base, itens: [item(), item({ ...vaziaBase })] }),
    ).toEqual([]);
  });

  it('acumula todos os motivos em falta', () => {
    const motivos = motivosApreensaoIncompleta({
      ...base,
      semInfracao: true,
      trustee: { kind: 'person', name: '', docType: '', docNumber: '' },
      itens: [item({ custody: 'trustee' }), item({ quantity: '' })],
    });
    expect(motivos).toHaveLength(3);
  });
});

describe('motivosDe', () => {
  it('deixa em cada ecrã só o que lá se resolve', () => {
    // O produto não tem onde identificar o fiel depositário; a tarefa do
    // destino não tem onde escrever a quantidade.
    const motivos = motivosApreensaoIncompleta({
      ...base,
      trustee: { kind: 'person', name: '', docType: '', docNumber: '' },
      itens: [item({ custody: 'trustee' }), item({ quantity: '' })],
    });
    expect(motivosDe(motivos, ['item-quantidade']).map((m) => m.codigo)).toEqual([
      'item-quantidade',
    ]);
    expect(motivosDe(motivos, ['destino', 'depositario']).map((m) => m.codigo)).toEqual([
      'depositario',
    ]);
  });
});

describe('motivosDosItens', () => {
  it('nomeia o produto a que falta a quantidade', () => {
    // «Há item sem designação ou sem quantidade» descrevia a regra, não o
    // problema: com dez produtos registados, era preciso abri-los um a um.
    const motivos = motivosDosItens([item({ designation: 'Arroz', quantity: '' })]);
    expect(motivos).toEqual([
      { codigo: 'item-quantidade', texto: 'Falta a quantidade apreendida de «Arroz».' },
    ]);
  });

  it('junta os produtos numa lista legível', () => {
    const motivos = motivosDosItens([
      item({ designation: 'Arroz', quantity: '' }),
      item({ designation: 'Óleo', quantity: '0' }),
    ]);
    expect(motivos[0].texto).toBe('Faltam as quantidades apreendidas de «Arroz» e «Óleo».');
  });

  it('resume quando são muitos', () => {
    const motivos = motivosDosItens(
      ['Arroz', 'Óleo', 'Açúcar', 'Farinha', 'Sal'].map((designation) =>
        item({ designation, quantity: '' }),
      ),
    );
    expect(motivos[0].texto).toContain('mais 2');
  });

  it('dá motivo próprio à parte sem produto', () => {
    const motivos = motivosDosItens([item({ designation: '', quantity: '5' })]);
    expect(motivos.map((m) => m.codigo)).toEqual(['item-produto']);
  });

  it('exige a unidade de quem já tem quantidade', () => {
    // «10» não é quantidade apreendida: são dez sacos ou dez quilos, e é a
    // unidade que permite reconciliar a recolha com o que ficou em depósito.
    const motivos = motivosDosItens([item({ assetUnit: null })]);
    expect(motivos).toEqual([
      { codigo: 'item-unidade', texto: 'Falta a unidade de medida de «Arroz».' },
    ]);
  });

  it('não pede unidade a quem ainda não tem quantidade', () => {
    const motivos = motivosDosItens([item({ quantity: '', assetUnit: null })]);
    expect(motivos.map((m) => m.codigo)).toEqual(['item-quantidade']);
  });

  it('devolve um motivo por campo, e não uma frase só', () => {
    const motivos = motivosDosItens([
      item({ designation: 'Arroz', quantity: '' }),
      item({ designation: '', quantity: '5' }),
      item({ designation: 'Óleo', assetUnit: null }),
    ]);
    expect(motivos.map((m) => m.codigo)).toEqual([
      'item-produto',
      'item-quantidade',
      'item-unidade',
    ]);
  });

  it('não devolve nada quando não falta nada', () => {
    expect(motivosDosItens([item()])).toEqual([]);
    expect(motivosDosItens([item({ ...vaziaBase })])).toEqual([]);
  });
});
