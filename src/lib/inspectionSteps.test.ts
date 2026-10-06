import { describe, expect, it } from 'vitest';
import { inspectionStepOrder } from './inspectionSteps';

describe('inspectionStepOrder', () => {
  it('mantém apenas o fluxo iterativo na nova fiscalização', () => {
    expect(inspectionStepOrder()).toEqual(['operador', 'equipa', 'tela', 'revisao']);
  });

  it('insere a averiguação da denúncia antes da revisão', () => {
    expect(inspectionStepOrder(true)).toEqual([
      'operador',
      'equipa',
      'tela',
      'denuncia',
      'revisao',
    ]);
  });
});
