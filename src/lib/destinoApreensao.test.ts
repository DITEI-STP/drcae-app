import { describe, expect, it } from 'vitest';
import { itensDestinaveis, progressoDestinos } from './destinoApreensao';
import type { ItemApreensaoValidavel } from './apreensaoValidacao';

const item = (over: Partial<ItemApreensaoValidavel> = {}): ItemApreensaoValidavel => ({
  designation: 'Arroz',
  quantity: '10',
  assetSupply: null,
  custody: null,
  note: '',
  ...over,
});

const vazio = item({ designation: '', quantity: '', assetSupply: null, note: '' });

describe('itensDestinaveis', () => {
  it('preserva o índice na lista original', () => {
    // O índice é o endereço da escrita: a tarefa edita `apreensaoItens` no
    // sítio, e uma lista filtrada e reindexada escreveria no item errado.
    const destinaveis = itensDestinaveis([vazio, item(), vazio, item({ designation: 'Óleo' })]);
    expect(destinaveis.map((d) => d.index)).toEqual([1, 3]);
  });

  it('ignora linhas nunca preenchidas', () => {
    expect(itensDestinaveis([vazio])).toEqual([]);
  });
});

describe('progressoDestinos', () => {
  it('conta como por fazer o que ainda não tem destino', () => {
    const progresso = progressoDestinos([item(), item({ custody: 'drcae' })]);
    expect(progresso).toEqual({ total: 2, definidos: 1 });
  });

  it('fecha quando todos os itens têm destino', () => {
    const progresso = progressoDestinos([
      item({ custody: 'drcae' }),
      item({ custody: 'trustee' }),
    ]);
    expect(progresso).toEqual({ total: 2, definidos: 2 });
  });

  it('não conta linhas vazias', () => {
    // Senão a tarefa nascia com uma pendência que não se resolve em lado nenhum.
    expect(progressoDestinos([vazio])).toEqual({ total: 0, definidos: 0 });
  });
});
